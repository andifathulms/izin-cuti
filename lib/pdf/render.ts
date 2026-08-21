import type { PreviewBlock, PreviewModel } from '../preview/model'
import { measure, wrap, type PdfFont } from './metrics'
import { A4, SYMBOL_RADICAL, writePdf, type DrawOp, type PdfPage } from './write'

/**
 * Lay the filled document out as a PDF.
 *
 * Drawn from the same block model the preview renders, so the PDF and the pane
 * beside the form are the same document rather than two guesses at it.
 *
 * It remains **approximate**. Word decides the real line breaks, the real
 * column widths and the real font; this reproduces the content, the table
 * structure and the reading order. Where the two disagree, the DOCX is right —
 * that is stated beside the button, and it is why this is the convenience copy.
 *
 * The form is one page in Word, so this tries to be one page too: it lays the
 * document out and, if it overflows, does it again a little smaller, down to a
 * floor where shrinking further would stop being readable. Shrinking is
 * preferred to spilling because a signature block on its own second page is
 * the failure people actually notice.
 */

const MARGIN = 34 // 12mm
const BASE_SIZE = 9
const MIN_SIZE = 6.5
const LINE_GAP = 1.22
const CELL_PAD = 2.5
const BORDER = 0.6

export type RenderOptions = {
  readonly title?: string
  /** Shrink to fit a single page where possible. */
  readonly fitOnePage?: boolean
}

export function renderPdf(model: PreviewModel, options: RenderOptions = {}): Uint8Array {
  const fit = options.fitOnePage ?? true
  let size = BASE_SIZE
  let pages = layout(model, size)

  while (fit && pages.length > 1 && size > MIN_SIZE) {
    size = Math.max(MIN_SIZE, size - 0.5)
    pages = layout(model, size)
  }

  return writePdf(pages, options.title ?? 'Surat')
}

/** How many pages this comes to at a given size. Useful to the caller and to tests. */
export function pageCount(model: PreviewModel, size = BASE_SIZE): number {
  return layout(model, size).length
}

type Cursor = {
  y: number
  ops: DrawOp[]
  pages: PdfPage[]
  readonly size: number
}

function layout(model: PreviewModel, size: number): PdfPage[] {
  const cursor: Cursor = { y: A4.height - MARGIN, ops: [], pages: [], size }
  const width = A4.width - MARGIN * 2

  for (const block of model.blocks) {
    drawBlock(block, cursor, MARGIN, width)
  }
  flush(cursor)
  return cursor.pages
}

function flush(cursor: Cursor): void {
  cursor.pages.push({ width: A4.width, height: A4.height, ops: cursor.ops })
  cursor.ops = []
  cursor.y = A4.height - MARGIN
}

function needRoom(cursor: Cursor, height: number): void {
  if (cursor.y - height >= MARGIN) return
  flush(cursor)
}

function drawBlock(block: PreviewBlock, cursor: Cursor, x: number, width: number): void {
  if (block.type === 'paragraph') drawParagraph(block, cursor, x, width)
  else drawTable(block, cursor, x, width)
}

function drawParagraph(
  block: Extract<PreviewBlock, { type: 'paragraph' }>,
  cursor: Cursor,
  x: number,
  width: number,
): void {
  const text = block.runs.map((run) => run.text).join('')
  const font: PdfFont = block.bold ? 'bold' : 'regular'
  const lineHeight = cursor.size * LINE_GAP

  if (text.trim() === '') {
    // An empty paragraph is spacing in the document and spacing here too.
    cursor.y -= lineHeight * 0.5
    return
  }

  for (const line of wrap(text, width, cursor.size, font)) {
    needRoom(cursor, lineHeight)
    cursor.y -= lineHeight
    drawLine(cursor, line, x, cursor.y, width, block.alignment, font)
  }
}

/**
 * One line of text, honouring its alignment, with the tick character drawn
 * from Symbol because Helvetica has no radical sign and a missing glyph in
 * "tanda centang (√)" would read as a mistake.
 */
function drawLine(
  cursor: Cursor,
  line: string,
  x: number,
  y: number,
  width: number,
  alignment: 'left' | 'center' | 'right' | 'both',
  font: PdfFont,
): void {
  const segments = splitTicks(line)
  const total = segments.reduce(
    (sum, segment) => sum + measure(segment.text, cursor.size, segment.font ?? font),
    0,
  )

  let cursorX = x
  if (alignment === 'center') cursorX = x + (width - total) / 2
  else if (alignment === 'right') cursorX = x + width - total

  for (const segment of segments) {
    const segmentFont = segment.font ?? font
    cursor.ops.push({
      type: 'text',
      x: cursorX,
      y,
      size: cursor.size,
      font: segmentFont,
      text: segment.text,
    })
    cursorX += measure(segment.text, cursor.size, segmentFont)
  }
}

function splitTicks(line: string): Array<{ text: string; font?: PdfFont }> {
  if (!line.includes('√')) return [{ text: line }]
  const segments: Array<{ text: string; font?: PdfFont }> = []
  for (const [i, part] of line.split('√').entries()) {
    if (i > 0) segments.push({ text: SYMBOL_RADICAL, font: 'symbol' })
    if (part !== '') segments.push({ text: part })
  }
  return segments
}

function drawTable(
  block: Extract<PreviewBlock, { type: 'table' }>,
  cursor: Cursor,
  x: number,
  width: number,
): void {
  const lineHeight = cursor.size * LINE_GAP
  cursor.y -= lineHeight * 0.3

  for (const row of block.rows) {
    const widths = columnWidths(row.cells.map((cell) => cell.widthTwips), width)
    const cells = row.cells.map((cell, i) => ({
      box: cell.box,
      lines:
        cell.box !== null
          ? []
          : wrap(
              cellText(cell.blocks),
              Math.max(8, (widths[i] ?? width) - CELL_PAD * 2),
              cursor.size,
              'regular',
            ),
    }))

    const height = Math.max(
      lineHeight + CELL_PAD * 2,
      ...cells.map((cell) => cell.lines.length * lineHeight + CELL_PAD * 2),
    )
    needRoom(cursor, height)

    const top = cursor.y
    const bottom = top - height
    let cellX = x

    cells.forEach((cell, i) => {
      const cellWidth = widths[i] ?? 0
      rectangle(cursor, cellX, bottom, cellWidth, height)

      if (cell.box !== null) {
        if (cell.box.checked) {
          const size = cursor.size
          cursor.ops.push({
            type: 'text',
            x: cellX + cellWidth / 2 - measure(SYMBOL_RADICAL, size, 'symbol') / 2,
            y: bottom + (height - size) / 2 + size * 0.15,
            size,
            font: 'symbol',
            text: SYMBOL_RADICAL,
          })
        }
      } else {
        cell.lines.forEach((line, lineIndex) => {
          cursor.ops.push({
            type: 'text',
            x: cellX + CELL_PAD,
            y: top - CELL_PAD - lineHeight * (lineIndex + 1) + lineHeight * 0.25,
            size: cursor.size,
            font: 'regular',
            text: line,
          })
        })
      }
      cellX += cellWidth
    })

    cursor.y = bottom
  }

  cursor.y -= lineHeight * 0.3
}

function rectangle(cursor: Cursor, x: number, y: number, w: number, h: number): void {
  cursor.ops.push(
    { type: 'line', x1: x, y1: y, x2: x + w, y2: y, width: BORDER },
    { type: 'line', x1: x, y1: y + h, x2: x + w, y2: y + h, width: BORDER },
    { type: 'line', x1: x, y1: y, x2: x, y2: y + h, width: BORDER },
    { type: 'line', x1: x + w, y1: y, x2: x + w, y2: y + h, width: BORDER },
  )
}

/**
 * Column widths from the document's own twips, scaled to the page.
 *
 * A cell with no width recorded takes an equal share of what is left, and a row
 * that declares nothing is divided evenly — better a plain grid than one column
 * holding nine tenths of the page.
 */
function columnWidths(
  twips: ReadonlyArray<number | null>,
  available: number,
): ReadonlyArray<number> {
  const known = twips.filter((value): value is number => value !== null && value > 0)
  if (known.length === 0) return twips.map(() => available / Math.max(1, twips.length))

  const declared = known.reduce((sum, value) => sum + value, 0)
  const perUnknown = declared / known.length
  const totals = twips.map((value) => (value !== null && value > 0 ? value : perUnknown))
  const sum = totals.reduce((a, b) => a + b, 0)
  return totals.map((value) => (value / sum) * available)
}

/**
 * A cell's text, with its paragraphs kept apart.
 *
 * Joined with newlines rather than spaces: a signature block is three
 * paragraphs — jabatan, name, NIP — and running them onto one line turns
 * "Direktur ... Budi Santoso NIP. ..." into a sentence nobody wrote. `wrap`
 * breaks on newlines, so this is all it takes to stack them.
 */
function cellText(blocks: ReadonlyArray<PreviewBlock>): string {
  return blocks
    .flatMap((block) =>
      block.type === 'paragraph'
        ? [block.runs.map((run) => run.text).join('').replace(/[ \t]+/g, ' ').trim()]
        : block.rows.flatMap((row) => row.cells.map((cell) => cellText(cell.blocks))),
    )
    .filter((line) => line !== '')
    .join('\n')
    .trim()
}
