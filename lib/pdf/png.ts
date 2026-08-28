import { unzlibSync } from 'fflate'

/**
 * Decode a PNG far enough to draw it in a PDF.
 *
 * A PDF image is raw samples with a filter declared on the stream. PNG's IDAT
 * is zlib-compressed *and* per-scanline filtered, so its bytes cannot be
 * handed to a PDF as they are — the zlib layer comes off, the scanline filters
 * are undone, and what is left is the raw grid a PDF understands.
 *
 * Only what this app's own pipeline produces is supported: 8 bits per sample,
 * non-interlaced, greyscale or truecolour with or without alpha. A canvas
 * always hands back that, and both the drawing pad and the file picker go
 * through a canvas. Anything else is refused with a reason rather than decoded
 * approximately — a half-decoded signature is a smear on an official letter.
 */

export type DecodedPng = {
  readonly width: number
  readonly height: number
  /** Three bytes per pixel, row-major. */
  readonly rgb: Uint8Array
  /** One byte per pixel, or null when the image is fully opaque. */
  readonly alpha: Uint8Array | null
}

export type DecodeResult =
  | { readonly type: 'decoded'; readonly image: DecodedPng }
  | { readonly type: 'unsupported'; readonly reason: string }

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 }

export function decodePng(bytes: Uint8Array): DecodeResult {
  if (bytes.length < 8) return { type: 'unsupported', reason: 'file is too short to be a PNG' }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colourType = -1
  let interlace = 0
  const idat: Uint8Array[] = []

  while (offset + 8 <= bytes.length) {
    const length = view(bytes, offset)
    const tag = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    )
    const start = offset + 8
    const end = start + length
    if (end > bytes.length) return { type: 'unsupported', reason: `chunk ${tag} runs past the end` }

    if (tag === 'IHDR') {
      width = view(bytes, start)
      height = view(bytes, start + 4)
      bitDepth = bytes[start + 8]!
      colourType = bytes[start + 9]!
      interlace = bytes[start + 12]!
    } else if (tag === 'IDAT') {
      idat.push(bytes.subarray(start, end))
    } else if (tag === 'IEND') {
      break
    }
    // Four more for the CRC, which is not checked: a corrupt PNG fails at the
    // inflate below with a reason, and re-implementing CRC32 to say so one
    // step earlier buys nothing.
    offset = end + 4
  }

  if (width === 0 || height === 0) return { type: 'unsupported', reason: 'PNG has no dimensions' }
  if (bitDepth !== 8) {
    return { type: 'unsupported', reason: `${bitDepth}-bit PNG; only 8-bit is supported` }
  }
  if (interlace !== 0) return { type: 'unsupported', reason: 'interlaced PNG' }
  const channels = CHANNELS[colourType]
  if (channels === undefined) {
    return {
      type: 'unsupported',
      reason: colourType === 3 ? 'palette PNG' : `PNG colour type ${colourType}`,
    }
  }
  if (idat.length === 0) return { type: 'unsupported', reason: 'PNG carries no image data' }

  let raw: Uint8Array
  try {
    raw = unzlibSync(concat(idat))
  } catch {
    return { type: 'unsupported', reason: 'PNG image data could not be decompressed' }
  }

  const stride = width * channels
  if (raw.length < (stride + 1) * height) {
    return { type: 'unsupported', reason: 'PNG image data is shorter than its dimensions' }
  }

  const flat = unfilter(raw, width, height, channels)
  if (flat === null) return { type: 'unsupported', reason: 'PNG uses an unknown scanline filter' }

  const rgb = new Uint8Array(width * height * 3)
  const hasAlpha = colourType === 4 || colourType === 6
  const alpha = hasAlpha ? new Uint8Array(width * height) : null
  const grey = colourType === 0 || colourType === 4

  for (let i = 0; i < width * height; i++) {
    const at = i * channels
    const r = flat[at]!
    const g = grey ? r : flat[at + 1]!
    const b = grey ? r : flat[at + 2]!
    rgb[i * 3] = r
    rgb[i * 3 + 1] = g
    rgb[i * 3 + 2] = b
    if (alpha !== null) alpha[i] = flat[at + (grey ? 1 : 3)]!
  }

  // A fully opaque alpha channel is a soft mask that does nothing, and every
  // byte of it lands in the file. Dropped when it is not carrying anything.
  const opaque = alpha === null || alpha.every((value) => value === 255)
  return { type: 'decoded', image: { width, height, rgb, alpha: opaque ? null : alpha } }
}

function view(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
  )
}

function concat(chunks: ReadonlyArray<Uint8Array>): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/**
 * Undo the five PNG scanline filters, in place, into a flat sample grid.
 *
 * Each row is prefixed by its filter type and is decoded against the row above
 * it, so this cannot be done row-independently and cannot be done backwards.
 * The spec's names for the neighbours are kept — a, b, c — because the Paeth
 * predictor is only readable in those terms.
 */
function unfilter(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array | null {
  const stride = width * channels
  const out = new Uint8Array(stride * height)

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const line = (y * (stride + 1)) + 1
    const target = y * stride
    const above = target - stride

    for (let x = 0; x < stride; x++) {
      const value = raw[line + x]!
      const a = x >= channels ? out[target + x - channels]! : 0
      const b = y > 0 ? out[above + x]! : 0
      const c = x >= channels && y > 0 ? out[above + x - channels]! : 0
      let restored: number
      switch (filter) {
        case 0:
          restored = value
          break
        case 1:
          restored = value + a
          break
        case 2:
          restored = value + b
          break
        case 3:
          restored = value + ((a + b) >> 1)
          break
        case 4:
          restored = value + paeth(a, b, c)
          break
        default:
          return null
      }
      out[target + x] = restored & 0xff
    }
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}
