import { inlineDrawingRun, readPng, sizeFromWidthMm, type PngInfo } from '../docx/image'
import {
  CONTENT_TYPES_PART,
  RELS_PART,
  addImageRelationship,
  ensurePngContentType,
  freeMediaPath,
  nextRelationshipId,
} from '../docx/parts'
import type { DocxPackage } from '../docx/unzip'
import type { PackageChanges } from '../docx/serialise'

/**
 * A signature: the image, and everything a package needs to carry it.
 *
 * Pure, and it runs in Node. Drawing on a canvas and reading a file both
 * happen in the browser and both end at the same place — PNG bytes — so
 * nothing above this line needs to know which one somebody used.
 *
 * The bytes are the person's handwritten signature, which is about as personal
 * as the data this app handles gets. They are stored where the profile is
 * stored, in this browser, and they are covered by the same clear-all. There
 * is no server for them to go to. PRD §8.
 */

/** What is kept between sessions. Base64 because local storage holds strings. */
export type StoredSignature = {
  readonly version: 1
  /** PNG bytes, base64, no data-URI prefix. */
  readonly png: string
  readonly widthPx: number
  readonly heightPx: number
  /** How it was made. Shown back, so nobody wonders which one is saved. */
  readonly source: 'drawn' | 'uploaded'
  /** ISO date, supplied by the caller — this module has no clock. */
  readonly savedAt: string
}

export type Signature = {
  readonly bytes: Uint8Array
  readonly info: PngInfo
  readonly source: 'drawn' | 'uploaded'
  readonly savedAt: string
}

export type SignatureResult =
  | { readonly type: 'signature'; readonly signature: Signature }
  | { readonly type: 'rejected'; readonly reason: string }

/**
 * A ceiling on what is kept.
 *
 * Local storage is a few megabytes for the whole origin, shared with every
 * profile and mapping, and a photographed signature straight off a phone is
 * several. The UI downscales before it gets here; this is the backstop that
 * makes a too-large image a refusal with a reason rather than a write that
 * throws and loses the profiles too.
 */
export const MAX_SIGNATURE_BYTES = 512 * 1024

export function readSignature(
  bytes: Uint8Array,
  source: 'drawn' | 'uploaded',
  savedAt: string,
): SignatureResult {
  const png = readPng(bytes)
  if (png.type !== 'png') return { type: 'rejected', reason: png.reason }
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    return {
      type: 'rejected',
      reason: `image is ${Math.round(bytes.length / 1024)} kB, over the ${Math.round(
        MAX_SIGNATURE_BYTES / 1024,
      )} kB kept in this browser`,
    }
  }
  return { type: 'signature', signature: { bytes, info: png.info, source, savedAt } }
}

/**
 * How wide a signature may be drawn on the page.
 *
 * Under 10mm it is a smudge nobody can read; over 90mm it is wider than the
 * cell it sits in and Word wraps the block. The bounds are here rather than on
 * the input, so a stored mapping with a silly width is clamped rather than
 * trusted.
 */
export const MIN_WIDTH_MM = 10
export const MAX_WIDTH_MM = 90

export function clampWidthMm(widthMm: number): number {
  if (!Number.isFinite(widthMm)) return MIN_WIDTH_MM
  return Math.min(MAX_WIDTH_MM, Math.max(MIN_WIDTH_MM, Math.round(widthMm)))
}

/** The height that width implies, in millimetres. For showing, not for the file. */
export function heightMm(info: PngInfo, widthMm: number): number {
  return (widthMm * info.heightPx) / info.widthPx
}

export type Placement = {
  /** The run to splice into the paragraph. */
  readonly run: string
  /** The parts the package gains or has rewritten. */
  readonly changes: PackageChanges
}

export type PlacementResult =
  | { readonly type: 'placed'; readonly placement: Placement }
  | { readonly type: 'refused'; readonly reason: string }

/**
 * Everything the package needs, worked out against the package itself.
 *
 * The relationship id and the media path are allocated against what this
 * document already holds rather than assumed, so a template that already
 * carries a letterhead keeps it.
 */
export function placeSignature(
  pkg: DocxPackage,
  signature: Signature,
  widthMm: number,
  name: string,
): PlacementResult {
  const relsPart = pkg.parts.find((part) => part.path === RELS_PART)
  const typesPart = pkg.parts.find((part) => part.path === CONTENT_TYPES_PART)
  if (relsPart === undefined) return { type: 'refused', reason: `package has no ${RELS_PART}` }
  if (typesPart === undefined) {
    return { type: 'refused', reason: `package has no ${CONTENT_TYPES_PART}` }
  }

  const decoder = new TextDecoder()
  const relsXml = decoder.decode(relsPart.data)
  const id = nextRelationshipId(relsXml)
  const mediaPath = freeMediaPath(
    pkg.parts.map((part) => part.path),
    'tanda-tangan',
  )

  // The relationship target is relative to word/, which is where the part that
  // declares it lives. "word/media/x.png" here would resolve to
  // "word/word/media/x.png" and the image would silently not render.
  const rels = addImageRelationship(relsXml, id, mediaPath.replace(/^word\//, ''))
  if (rels.type !== 'ok') return { type: 'refused', reason: rels.reason }

  const types = ensurePngContentType(decoder.decode(typesPart.data))
  if (types.type !== 'ok') return { type: 'refused', reason: types.reason }

  const { cx, cy } = sizeFromWidthMm(signature.info, clampWidthMm(widthMm))
  const encoder = new TextEncoder()

  return {
    type: 'placed',
    placement: {
      run: inlineDrawingRun({
        relationshipId: id,
        // Unique within the document: the relationship id is allocated against
        // what the package holds, so a number derived from it cannot collide.
        drawingId: Number(id.replace(/\D/g, '')) || 1,
        name,
        description: name,
        cx,
        cy,
      }),
      changes: {
        replaced: [
          { path: RELS_PART, data: encoder.encode(rels.value) },
          { path: CONTENT_TYPES_PART, data: encoder.encode(types.value) },
        ],
        added: [{ path: mediaPath, data: signature.bytes }],
      },
    },
  }
}

/** Base64 without a DOM. `btoa` is not in Node and this module runs in both. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64')
}

export function fromBase64(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

export function storeSignature(signature: Signature): StoredSignature {
  return {
    version: 1,
    png: toBase64(signature.bytes),
    widthPx: signature.info.widthPx,
    heightPx: signature.info.heightPx,
    source: signature.source,
    savedAt: signature.savedAt,
  }
}

/** Never trusts the stored shape: local storage is editable by hand. */
export function restoreSignature(stored: unknown): Signature | null {
  if (typeof stored !== 'object' || stored === null) return null
  const record = stored as Partial<StoredSignature>
  if (record.version !== 1 || typeof record.png !== 'string') return null
  let bytes: Uint8Array
  try {
    bytes = fromBase64(record.png)
  } catch {
    return null
  }
  const png = readPng(bytes)
  if (png.type !== 'png') return null
  return {
    bytes,
    info: png.info,
    source: record.source === 'drawn' ? 'drawn' : 'uploaded',
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : '',
  }
}
