import type { PreviewBlock, PreviewModel, PreviewSignature } from '../preview/model'
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

  return writePdf(pages, options.title ?? 'Surat', collectImages(model))
}

/**
 * Every signature in the model, by the key its op refers to.
 *
 * Collected from the model rather than passed in, so the PDF and the on-screen
 * preview are drawing the same thing from the same place — the two disagreeing
 * about whether a letter is signed is exactly the failure a preview exists to
 * prevent.
 */
function collectImages(model: PreviewModel): Record<string, Uint8Array> {
  const images: Record<string, Uint8Array> = {}
  const walk = (blocks: ReadonlyArray<PreviewBlock>): void => {
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        if (block.signature !== null) images[block.signature.targetId] = block.signature.png
        continue
      }
      for (const row of block.rows) for (const cell of row.cells) walk(cell.blocks)
    }
  }
  walk(model.blocks)
  return images
}

/** Millimetres to points, which is what a PDF measures in. */
const MM = 72 / 25.4

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

  // The signature first, if this paragraph carries one. It takes the vertical
  // room the image needs rather than a line, so the block below it moves down
  // by the same amount here as it does in Word.
  if (block.signature !== null) {
    const w = block.signature.widthMm * MM
    const h = block.signature.heightMm * MM
    needRoom(cursor, h)
    cursor.y -= h
    // Centred in the column, which is where a signature sits above a name in
    // this form. Left-aligning it would put it against the cell edge.
    cursor.ops.push({
      type: 'image',
      key: block.signature.targetId,
      x: x + Math.max(0, (width - w) / 2),
      y: cursor.y,
      w,
      h,
    })
  }

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
              cellLines(cell.blocks).flatMap((line) => {
                // A signature line has no text to wrap and must survive the
                // wrap intact — rebuilding it from `text` alone is how the
                // picture was lost between `cellLines` and the page.
                if (line.signature !== undefined) return [line]
                return wrap(
                  line.text,
                  Math.max(8, (widths[i] ?? width) - CELL_PAD * 2),
                  cursor.size,
                  'regular',
                ).map((text, part) => ({
                  text,
                  alignment: line.alignment,
                  // Only the first line of a wrapped paragraph is indented.
                  indent: part === 0 ? line.indent : 0,
                }))
              }),
            ),
    }))

    // A signature never makes the block shorter than the space the form leaves
    // for one, and never taller unless the image genuinely needs the room.
    const reservedFor = (line: CellLine): number =>
      Math.max(line.reservedLines ?? MIN_SIGNATURE_LINES, MIN_SIGNATURE_LINES) * lineHeight
    const lineHeightOf = (line: CellLine): number =>
      line.signature === undefined
        ? lineHeight
        : Math.max(reservedFor(line), line.signature.heightMm * MM)
    const height = Math.max(
      lineHeight + CELL_PAD * 2,
      ...cells.map(
        (cell) => cell.lines.reduce((sum, line) => sum + lineHeightOf(line), 0) + CELL_PAD * 2,
      ),
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
        // Walked rather than indexed, because a signature line is taller than
        // a line of type and everything under it has to move by that much.
        let lineTop = top - CELL_PAD
        for (const line of cell.lines) {
          if (line.signature !== undefined) {
            const w = line.signature.widthMm * MM
            const h = line.signature.heightMm * MM
            const band = Math.max(reservedFor(line), h)
            cursor.ops.push({
              type: 'image',
              key: line.signature.targetId,
              x: cellX + CELL_PAD + Math.max(0, (cellWidth - CELL_PAD * 2 - w) / 2),
              // Sat on the bottom of the band it was given, the way a pen sits
              // on the line rather than floating above it.
              y: lineTop - band,
              w,
              h,
            })
            lineTop -= band
            continue
          }
          // Alignment comes from the paragraph, so a centred signature block
          // is centred here too rather than pinned to the left edge of a cell
          // that is three times wider than the name in it.
          const indent =
            line.alignment === 'left' ? measure(' '.repeat(line.indent), cursor.size, 'regular') : 0
          drawLine(
            cursor,
            line.text,
            cellX + CELL_PAD + indent,
            lineTop - lineHeight + lineHeight * 0.25,
            cellWidth - CELL_PAD * 2 - indent,
            line.alignment,
            'regular',
          )
          lineTop -= lineHeight
        }
      }
      cellX += cellWidth
    })

    cursor.y = bottom
  }

  cursor.y -= lineHeight * 0.3
}

/** Widen the largest run of blank lines to leave room for a signature. */
function openSignatureGap(lines: ReadonlyArray<CellLine>): CellLine[] {
  // A real signature fills the gap rather than sitting inside it.
  //
  // The blank paragraphs around it are the space the document left *for* a
  // signature. Keeping them and then adding the image put the picture between
  // them, so the applicant's block came out half as tall again as the atasan's
  // and the pejabat's and the form spilled onto a second page. The image takes
  // the gap it was left; `lineHeightOf` gives it a floor of the same three
  // lines the other blocks reserve, so it is never shorter either.
  if (lines.some((line) => line.signature !== undefined)) return collapseAroundSignature(lines)

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
  /** Small leading indents the document put there, kept as written. */
  readonly indent: number
  /**
   * A signature that lands on this line rather than text.
   *
   * The signature block of this form is inside a table cell, and a cell is
   * flattened to lines here rather than drawn through `drawParagraph` — so
   * without this the picture reached the DOCX and the on-screen preview and
   * silently did not reach the PDF. A line carries it, and the row's height
   * is measured from the image instead of from the type.
   */
  readonly signature?: PreviewSignature
  /**
   * How many blank lines this signature replaced.
   *
   * Its band is at least that tall, so signing never changes the height of the
   * block: the picture fills the space the document already left rather than
   * being added to it or shrinking it.
   */
  readonly reservedLines?: number
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
/**
 * A long run of leading spaces inside a table cell is centring, done by hand.
 *
 * The three signature blocks in this form are written three different ways:
 * section VIII centres its paragraphs, VII centres the jabatan and pushes the
 * name across with nineteen spaces, VI uses twenty-four spaces and no
 * alignment at all. All three are meant to look the same.
 *
 * Reproducing the spaces only works at the exact font size and column width
 * Word used, which is not the one here — so they came out at three different
 * positions. Reading them as what they are gets all three centred, which is
 * both what the document means and what a signature block should look like.
 *
 * Four spaces is the threshold. Nobody types four spaces to nudge something.
 */
const MANUAL_CENTRING_SPACES = 4

function lineOf(raw: string, alignment: CellLine['alignment']): CellLine {
  const withoutTabs = raw.replace(/\t/g, ' ')
  const leading = /^ */.exec(withoutTabs)?.[0].length ?? 0
  const text = withoutTabs.replace(/ {2,}/g, ' ').trim()

  if (alignment === 'left' && leading >= MANUAL_CENTRING_SPACES && text !== '') {
    return { text, alignment: 'center', indent: 0 }
  }
  return { text, alignment, indent: leading }
}

/** Drop the blank lines a signature is standing in; it occupies them itself. */
function collapseAroundSignature(lines: ReadonlyArray<CellLine>): CellLine[] {
  const blank = (line: CellLine | undefined): boolean =>
    line !== undefined && line.text === '' && line.signature === undefined

  // The blank run the signature stands in, counted so its band is exactly as
  // tall as the space it takes over.
  const signatureAt = lines.findIndex((line) => line.signature !== undefined)
  if (signatureAt === -1) return [...lines]

  let first = signatureAt
  while (first > 0 && blank(lines[first - 1])) first--
  let last = signatureAt
  while (last < lines.length - 1 && blank(lines[last + 1])) last++

  return [
    ...lines.slice(0, first),
    { ...lines[signatureAt]!, reservedLines: last - first + 1 },
    ...lines.slice(last + 1),
  ]
}

function cellLines(blocks: ReadonlyArray<PreviewBlock>): CellLine[] {
  const lines = blocks.flatMap((block): CellLine[] => {
    if (block.type !== 'paragraph') {
      return block.rows.flatMap((row) => row.cells.flatMap((cell) => cellLines(cell.blocks)))
    }
    const line = lineOf(block.runs.map((run) => run.text).join(''), block.alignment)
    return [block.signature === null ? line : { ...line, signature: block.signature }]
  })

  // A signature line is empty of text and is not blank. Trimming it away is
  // how the picture disappeared from the PDF the first time.
  const blank = (line: CellLine | undefined): boolean =>
    line !== undefined && line.text === '' && line.signature === undefined

  let first = 0
  let last = lines.length - 1
  while (first <= last && blank(lines[first])) first++
  while (last >= first && blank(lines[last])) last--
  return lines.slice(first, last + 1)
}
