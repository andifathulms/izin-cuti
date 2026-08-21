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

export type PdfPage = {
  readonly width: number
  readonly height: number
  readonly ops: ReadonlyArray<DrawOp>
}

/** A4 in points, which is what PDF measures in. */
export const A4 = { width: 595.28, height: 841.89 } as const

const FONT_NAME = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  symbol: 'Symbol',
} as const

const FONT_KEY = { regular: 'F1', bold: 'F2', symbol: 'F3' } as const

export function writePdf(pages: ReadonlyArray<PdfPage>, title: string): Uint8Array {
  const objects: string[] = []
  const add = (body: string): number => {
    objects.push(body)
    return objects.length
  }

  // Object numbers are allocated up front so the page tree can name its kids.
  const catalogId = 1
  const pagesId = 2
  const fontIds = { regular: 3, bold: 4, symbol: 5 }
  const firstPageId = 6
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

  pages.forEach((page, i) => {
    add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${round(page.width)} ${round(page.height)}]` +
        ` /Resources << /Font << /F1 ${fontIds.regular} 0 R /F2 ${fontIds.bold} 0 R /F3 ${fontIds.symbol} 0 R >> >>` +
        ` /Contents ${contentIds[i]} 0 R >>`,
    )
    const stream = contentStream(page)
    add(`<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  })

  const infoId = add(`<< /Title (${escapeString(title)}) /Producer (Isi Surat) >>`)

  // Assemble, recording where each object starts — the cross-reference table
  // is byte offsets, so this has to be counted as bytes and not as characters.
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(byteLength(body))
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = byteLength(body)
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return encode(body + xref)
}

function contentStream(page: PdfPage): string {
  const parts: string[] = []
  let colour: Rgb | null = null

  for (const op of page.ops) {
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
