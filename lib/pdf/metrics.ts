/**
 * Glyph widths for the fonts a PDF reader is required to have.
 *
 * Helvetica, Helvetica-Bold and Symbol are three of the fourteen standard
 * fonts, which means nothing has to be embedded and the file stays a few
 * kilobytes. Widths are in thousandths of the font size, as PDF counts them.
 *
 * They are here because text has to be wrapped, and wrapping needs to know how
 * wide a line is. Guessing an average width produces lines that overflow their
 * column, which on a ruled form is immediately visible.
 */

const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/** The radical sign, which is the character this form ticks its boxes with. */
export const SYMBOL_RADICAL_WIDTH = 549

export type PdfFont = 'regular' | 'bold' | 'symbol'

/** Width of one character, in thousandths of the font size. */
function glyphWidth(code: number, font: PdfFont): number {
  if (font === 'symbol') return SYMBOL_RADICAL_WIDTH
  const table = font === 'bold' ? HELVETICA_BOLD : HELVETICA
  if (code >= 32 && code <= 126) return table[code - 32] ?? 556
  // Anything outside ASCII is drawn from the Latin-1 range, whose widths are
  // close enough to a lowercase letter for wrapping purposes.
  return font === 'bold' ? 611 : 556
}

export function measure(text: string, size: number, font: PdfFont): number {
  let total = 0
  for (const character of text) {
    total += glyphWidth(character.codePointAt(0) ?? 32, font)
  }
  return (total * size) / 1000
}

/**
 * Break text to fit a width, at word boundaries where it can and mid-word
 * where a single word is longer than the column.
 */
export function wrap(text: string, width: number, size: number, font: PdfFont): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter((part) => part !== '')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (measure(candidate, size, font) <= width || line === '') {
        line = candidate
        continue
      }
      lines.push(line)
      line = word
    }
    lines.push(line)
  }
  return lines.flatMap((line) => breakLongWord(line, width, size, font))
}

function breakLongWord(line: string, width: number, size: number, font: PdfFont): string[] {
  if (measure(line, size, font) <= width) return [line]
  const parts: string[] = []
  let current = ''
  for (const character of line) {
    if (measure(current + character, size, font) > width && current !== '') {
      parts.push(current)
      current = character
      continue
    }
    current += character
  }
  if (current !== '') parts.push(current)
  return parts
}
