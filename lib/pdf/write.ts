/**
 * A minimal PDF writer. Pure: text and numbers in, bytes out.
 *
 * Written here rather than pulled in because what this needs is small — one
 * page size, three standard fonts, lines and text — and because a library that
 * rasterises the page would turn an official letter into a picture of one.
 * Vector text stays selectable, searchable and sharp at any zoom.
 *
 * PDF 1.4, no compression. The file is a few kilobytes either way, and an
 * uncompressed content stream is one a person can read when something looks
 * wrong.
 */

import { zlibSync } from 'fflate'

import { decodePng, type DecodedPng } from './png'

export type Rgb = { readonly r: number; readonly g: number; readonly b: number }

export const BLACK: Rgb = { r: 0, g: 0, b: 0 }

export type DrawOp =
  | {
      readonly type: 'text'
      readonly x: number
      readonly y: number
      readonly size: number
      readonly font: 'regular' | 'bold' | 'symbol'
      readonly text: string
      readonly colour?: Rgb
    }
  | {
      readonly type: 'line'
      readonly x1: number
      readonly y1: number
      readonly x2: number
      readonly y2: number
      readonly width: number
    }
  | {
      /**
       * A raster image, placed by its bottom-left corner.
       *
       * `key` names the XObject, so the same signature drawn on two pages is
       * embedded once. PDF images are drawn into a unit square and scaled by
       * the current transform, which is what `w` and `h` become.
       */
      readonly type: 'image'
      readonly key: string
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
    }

export type PdfPage = {
  readonly width: number
  readonly height: number
  readonly ops: ReadonlyArray<DrawOp>
}

/** The images the pages refer to by key, as the PNG bytes they came from. */
export type PdfImages = Readonly<Record<string, Uint8Array>>

/** A4 in points, which is what PDF measures in. */
export const A4 = { width: 595.28, height: 841.89 } as const

const FONT_NAME = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  symbol: 'Symbol',
} as const

const FONT_KEY = { regular: 'F1', bold: 'F2', symbol: 'F3' } as const

/**
 * An object is a head and, when it carries a stream, raw bytes.
 *
 * The body used to be assembled as one string and encoded at the end, which
 * works exactly as long as nothing in it is binary. An image stream is: its
 * bytes are deflated samples and passing them through a JavaScript string
 * mangles every one above 0x7F. So objects are byte chunks now and the
 * cross-reference offsets are counted over those.
 */
type PdfObject = { readonly head: string; readonly stream?: Uint8Array }

export function writePdf(
  pages: ReadonlyArray<PdfPage>,
  title: string,
  images: PdfImages = {},
): Uint8Array {
  const objects: PdfObject[] = []
  const add = (head: string, stream?: Uint8Array): number => {
    objects.push(stream === undefined ? { head } : { head, stream })
    return objects.length
  }

  // Only the images the pages actually name, decoded once each. An image that
  // will not decode is left out and its op draws nothing, rather than the
  // whole PDF failing — the DOCX is the authoritative output and a preview
  // that refuses to open helps nobody. DESIGN.md §7.
  const used = new Set<string>()
  for (const page of pages) {
    for (const op of page.ops) if (op.type === 'image') used.add(op.key)
  }
  const decoded = new Map<string, DecodedPng>()
  for (const key of used) {
    const bytes = images[key]
    if (bytes === undefined) continue
    const result = decodePng(bytes)
    if (result.type === 'decoded') decoded.set(key, result.image)
  }

  // Object numbers are allocated up front so the page tree can name its kids.
  const catalogId = 1
  const pagesId = 2
  const fontIds = { regular: 3, bold: 4, symbol: 5 }
  // Two objects per image — the image itself and its soft mask — allocated
  // before the pages so a page's /Resources can name them.
  const firstImageId = 6
  const imageKeys = [...decoded.keys()]
  const imageIds = new Map<string, { image: number; mask: number }>()
  imageKeys.forEach((key, i) => {
    imageIds.set(key, { image: firstImageId + i * 2, mask: firstImageId + i * 2 + 1 })
  })
  const firstPageId = firstImageId + imageKeys.length * 2
  const pageIds = pages.map((_page, i) => firstPageId + i * 2)
  const contentIds = pages.map((_page, i) => firstPageId + i * 2 + 1)

  add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  add(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`)
  for (const font of ['regular', 'bold', 'symbol'] as const) {
    add(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAME[font]}` +
        (font === 'symbol' ? ' >>' : ' /Encoding /WinAnsiEncoding >>'),
    )
  }

  for (const key of imageKeys) {
    const image = decoded.get(key)!
    const ids = imageIds.get(key)!
    const rgb = zlibSync(image.rgb)
    add(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}` +
        ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode` +
        (image.alpha === null ? '' : ` /SMask ${ids.mask} 0 R`) +
        ` /Length ${rgb.length} >>`,
      rgb,
    )
    // The mask object is allocated whether or not it is used, so the numbering
    // stays predictable; an opaque image simply never refers to it.
    const alpha = zlibSync(image.alpha ?? new Uint8Array(0))
    add(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}` +
        ` /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alpha.length} >>`,
      alpha,
    )
  }

  pages.forEach((page, i) => {
    const named = [...new Set(page.ops.filter((op) => op.type === 'image').map((op) => op.key))]
      .filter((key) => imageIds.has(key))
      .map((key) => `/${xobjectName(key)} ${imageIds.get(key)!.image} 0 R`)
    add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${round(page.width)} ${round(page.height)}]` +
        ` /Resources << /Font << /F1 ${fontIds.regular} 0 R /F2 ${fontIds.bold} 0 R /F3 ${fontIds.symbol} 0 R >>` +
        (named.length === 0 ? '' : ` /XObject << ${named.join(' ')} >>`) +
        ` >>` +
        ` /Contents ${contentIds[i]} 0 R >>`,
    )
    const stream = contentStream(page, decoded)
    add(`<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  })

  const infoId = add(`<< /Title (${escapeString(title)}) /Producer (Izin Cuti) >>`)

  // Assemble, recording where each object starts — the cross-reference table
  // is byte offsets, so this is counted over the bytes and not the characters.
  const chunks: Uint8Array[] = [encode('%PDF-1.4\n')]
  let at = chunks[0]!.length
  const offsets: number[] = []
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    at += bytes.length
  }

  objects.forEach((object, i) => {
    offsets.push(at)
    push(encode(`${i + 1} 0 obj\n${object.head}\n`))
    if (object.stream !== undefined) {
      push(encode('stream\n'))
      push(object.stream)
      push(encode('\nendstream\n'))
    }
    push(encode('endobj\n'))
  })

  const xrefOffset = at
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  push(encode(xref))

  const out = new Uint8Array(at)
  let cursor = 0
  for (const chunk of chunks) {
    out.set(chunk, cursor)
    cursor += chunk.length
  }
  return out
}

/**
 * A PDF name, from a key somebody chose.
 *
 * Names are bytes with a small forbidden set; rather than escape them, the key
 * is reduced to letters and digits and prefixed. Keys are internal, so nothing
 * is lost, and an image whose key contains a space cannot silently break the
 * resource dictionary that refers to it.
 */
function xobjectName(key: string): string {
  return `Im${key.replace(/[^A-Za-z0-9]/g, '')}`
}

function contentStream(page: PdfPage, decoded: ReadonlyMap<string, DecodedPng>): string {
  const parts: string[] = []
  let colour: Rgb | null = null

  for (const op of page.ops) {
    if (op.type === 'image') {
      // An image whose bytes would not decode draws nothing at all. The DOCX
      // is the authoritative output; an approximate preview that refuses to
      // open would be worse than one missing a picture.
      if (!decoded.has(op.key)) continue
      // A PDF image fills the unit square, so the transform is the placement:
      // width, 0, 0, height, x, y. `q`/`Q` keep it off everything after it.
      parts.push(
        `q ${round(op.w)} 0 0 ${round(op.h)} ${round(op.x)} ${round(op.y)} cm /${xobjectName(op.key)} Do Q`,
      )
      continue
    }
    if (op.type === 'line') {
      parts.push(
        `${round(op.width)} w ${round(op.x1)} ${round(op.y1)} m ${round(op.x2)} ${round(op.y2)} l S`,
      )
      continue
    }
    if (op.text === '') continue
    const wanted = op.colour ?? BLACK
    if (colour === null || wanted.r !== colour.r || wanted.g !== colour.g || wanted.b !== colour.b) {
      parts.push(`${wanted.r} ${wanted.g} ${wanted.b} rg`)
      colour = wanted
    }
    parts.push(
      `BT /${FONT_KEY[op.font]} ${round(op.size)} Tf ${round(op.x)} ${round(op.y)} Td (${escapeString(op.text)}) Tj ET`,
    )
  }
  return parts.join('\n')
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

/**
 * PDF strings are bytes, and this file declares WinAnsiEncoding — which is
 * Latin-1 with a handful of typographic characters in the 0x80 range. Anything
 * outside it is transliterated rather than dropped, so a stray character never
 * silently removes a word from an official letter.
 */
const WINANSI: ReadonlyMap<string, number> = new Map([
  ['€', 0x80],
  ['‘', 0x91],
  ['’', 0x92],
  ['“', 0x93],
  ['”', 0x94],
  ['•', 0x95],
  ['–', 0x96],
  ['—', 0x97],
])

/** The radical sign lives at 0xD6 in Symbol, which is how a box gets ticked. */
export const SYMBOL_RADICAL = 'Ö'

function escapeString(text: string): string {
  let out = ''
  for (const character of text) {
    if (character === '(' || character === ')' || character === '\\') {
      out += `\\${character}`
      continue
    }
    if (character === '\n' || character === '\r' || character === '\t') {
      out += ' '
      continue
    }
    const code = character.codePointAt(0) ?? 32
    if (code < 128) {
      out += character
      continue
    }
    const mapped = WINANSI.get(character) ?? (code <= 0xff ? code : null)
    out += mapped === null ? '?' : `\\${mapped.toString(8).padStart(3, '0')}`
  }
  return out
}

function encode(text: string): Uint8Array {
  // Latin-1: every character in the assembled file is already a byte, because
  // escapeString put anything else into an octal escape.
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff
  return bytes
}

function byteLength(text: string): number {
  return text.length
}
