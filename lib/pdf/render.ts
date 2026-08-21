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

/**
 * A blank line inside a table cell is somebody's signature space.
 *
 * The document does not give every block the same amount: section VI leaves
 * two empty paragraphs above the applicant's name, sections VII and VIII leave
 * one above the direktur's. On paper that is the difference between room to
 * sign and a line to sign on top of.
 *
 * So a gap, wherever it is deliberate, gets at least this many lines. Applied
 * to the largest gap in the cell rather than to each one, because the space
 * belongs above the name, not scattered through the block.
 */
const MIN_SIGNATURE_LINES = 3

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
          : openSignatureGap(
              cellLines(cell.blocks).flatMap((line) =>
                wrap(
                  line.text,
                  Math.max(8, (widths[i] ?? width) - CELL_PAD * 2),
                  cursor.size,
                  'regular',
                ).map((text, part) => ({
                  text,
                  alignment: line.alignment,
                  // Only the first line of a wrapped paragraph is indented.
                  indent: part === 0 ? line.indent : 0,
                })),
              ),
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
          // Alignment comes from the paragraph, so a centred signature block
          // is centred here too rather than pinned to the left edge of a cell
          // that is three times wider than the name in it.
          const indent =
            line.alignment === 'left' ? measure(' '.repeat(line.indent), cursor.size, 'regular') : 0
          drawLine(
            cursor,
            line.text,
            cellX + CELL_PAD + indent,
            top - CELL_PAD - lineHeight * (lineIndex + 1) + lineHeight * 0.25,
            cellWidth - CELL_PAD * 2 - indent,
            line.alignment,
            'regular',
          )
        })
      }
      cellX += cellWidth
    })

    cursor.y = bottom
  }

  cursor.y -= lineHeight * 0.3
}

/** Widen the largest run of blank lines to leave room for a signature. */
function openSignatureGap(lines: ReadonlyArray<CellLine>): CellLine[] {
  let bestStart = -1
  let bestLength = 0
  let start = -1

  for (let i = 0; i <= lines.length; i++) {
    if (i < lines.length && lines[i]?.text === '') {
      if (start === -1) start = i
      continue
    }
    if (start !== -1 && i - start > bestLength) {
      bestStart = start
      bestLength = i - start
    }
    start = -1
  }

  if (bestStart === -1 || bestLength >= MIN_SIGNATURE_LINES) return [...lines]
  const extra: CellLine[] = Array.from({ length: MIN_SIGNATURE_LINES - bestLength }, () => ({
    text: '',
    alignment: 'left' as const,
    indent: 0,
  }))
  return [...lines.slice(0, bestStart), ...extra, ...lines.slice(bestStart)]
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

type CellLine = {
  readonly text: string
  readonly alignment: 'left' | 'center' | 'right' | 'both'
  /**
   * Leading spaces the document put there.
   *
   * Section VII positions the direktur's name with a run of spaces rather than
   * by centring the paragraph, as section VIII does. Trimming them left the
   * name hard against the cell edge in one block and centred in the other, for
   * two blocks that are meant to look identical. Arial and Helvetica share
   * their metrics, so the same count of spaces reproduces the same indent.
   */
  readonly indent: number
}

/**
 * A cell's lines, with its paragraphs kept apart — blank ones included.
 *
 * Two things depend on this. A signature block is three paragraphs — jabatan,
 * name, NIP — and running them onto one line turns them into a sentence nobody
 * wrote. And the room to actually sign is *two empty paragraphs* that Word puts
 * between the jabatan and the name: dropping them as "blank" removed the space
 * the signature goes in.
 *
 * Blank lines at the top and bottom of a cell are trimmed, since those are
 * padding rather than room for anything.
 */
function lineOf(raw: string, alignment: CellLine['alignment']): CellLine {
  const withoutTabs = raw.replace(/\t/g, ' ')
  const leading = /^ */.exec(withoutTabs)?.[0].length ?? 0
  return {
    text: withoutTabs.replace(/ {2,}/g, ' ').trim(),
    alignment,
    indent: leading,
  }
}

function cellLines(blocks: ReadonlyArray<PreviewBlock>): CellLine[] {
  const lines = blocks.flatMap((block): CellLine[] =>
    block.type === 'paragraph'
      ? [lineOf(block.runs.map((run) => run.text).join(''), block.alignment)]
      : block.rows.flatMap((row) => row.cells.flatMap((cell) => cellLines(cell.blocks))),
  )

  let first = 0
  let last = lines.length - 1
  while (first <= last && lines[first]?.text === '') first++
  while (last >= first && lines[last]?.text === '') last--
  return lines.slice(first, last + 1)
}
