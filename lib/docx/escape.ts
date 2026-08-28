/**
 * XML escaping. THE one definition — every substituted value passes through
 * here, no exceptions, no call site that bypasses it.
 *
 * This is not an edge case. Indonesian addresses and unit names contain
 * ampersands routinely ("Bagian Umum & Kepegawaian"), and a single unescaped
 * `&` produces a document Word refuses to open.
 */

/** Escape a value for insertion into XML character data. */
export function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escape a value for insertion into a double-quoted XML attribute. */
export function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const NAMED = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
])

/**
 * Reverse of {@link escapeXmlText}, for reading node text back out of the
 * package. Handles the five named entities and numeric character references;
 * an unrecognised reference is left verbatim rather than guessed at.
 */
export function unescapeXmlText(value: string): string {
  return value.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/g, (whole: string, ref: string) => {
    if (ref.startsWith('#x') || ref.startsWith('#X')) {
      const code = Number.parseInt(ref.slice(2), 16)
      return isCodePoint(code) ? String.fromCodePoint(code) : whole
    }
    if (ref.startsWith('#')) {
      const code = Number.parseInt(ref.slice(1), 10)
      return isCodePoint(code) ? String.fromCodePoint(code) : whole
    }
    return NAMED.get(ref) ?? whole
  })
}

function isCodePoint(code: number): boolean {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
}

/**
 * Characters XML 1.0 cannot represent at all. Control characters cannot be
 * escaped into validity — they have to go, or the package is malformed whatever
 * we do with `&`. Tab (09), newline (0A) and carriage return (0D) are legal and
 * are kept. Built from a source string so the file itself stays printable.
 */
const INVALID_XML_CHARS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]',
  'g',
)

export function stripInvalidXmlChars(value: string): string {
  return value.replace(INVALID_XML_CHARS, '')
}

/** The full path a value takes on its way into the document. */
export function escapeForDocument(value: string): string {
  return escapeXmlText(stripInvalidXmlChars(value))
}

/**
 * The same full path, for a value on its way into a double-quoted attribute.
 *
 * `escapeXmlAttribute` was here and `stripInvalidXmlChars` was here, and
 * nothing paired them — so the one call site that needed both (a signature's
 * name and description, which land in `wp:docPr`) would have had to compose
 * them itself, and composing the escape at the call site is exactly what this
 * module exists to prevent. An unescaped `"` in an attribute closes it early
 * and produces a document Word refuses to open, the same failure as a bare `&`
 * in character data.
 */
export function escapeForAttribute(value: string): string {
  return escapeXmlAttribute(stripInvalidXmlChars(value))
}
