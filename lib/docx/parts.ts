/**
 * The three package parts an embedded image touches, and nothing else.
 *
 * This is where invariant 3 changed and it is worth being exact about how. An
 * image cannot live in `word/document.xml`: OOXML requires it to be a part of
 * its own, referenced by a relationship, with its content type declared. So
 * three parts beyond the document may now differ, and only these three:
 *
 *   word/_rels/document.xml.rels   gains one <Relationship>
 *   [Content_Types].xml            gains one <Default Extension="png">
 *   word/media/<name>.png          is added
 *
 * Everything else is still copied byte-for-byte, and `tests/package` asserts
 * that against the exact list rather than against "the document only". A
 * weaker assertion would have been the easy way to make this pass.
 *
 * Both edits are splices into the original text, in the same spirit as
 * `fill.ts`: an attribute nobody aimed at is an attribute nobody reordered.
 */

export const RELS_PART = 'word/_rels/document.xml.rels'
export const CONTENT_TYPES_PART = '[Content_Types].xml'
export const MEDIA_DIRECTORY = 'word/media/'

export const IMAGE_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'

export type PartsResult<T> =
  | { readonly type: 'ok'; readonly value: T }
  | { readonly type: 'refused'; readonly reason: string }

/**
 * An id no relationship in this part already uses.
 *
 * Reusing an id would silently re-point an existing relationship — the theme,
 * the styles — at a picture, so the number is one past the highest `rId` seen
 * rather than one past the count. A package whose ids are not sequential is
 * still handled correctly by taking the maximum.
 */
export function nextRelationshipId(relsXml: string): string {
  let highest = 0
  for (const match of relsXml.matchAll(/\bId\s*=\s*"rId(\d+)"/g)) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > highest) highest = value
  }
  return `rId${highest + 1}`
}

/** Add one image relationship, immediately before `</Relationships>`. */
export function addImageRelationship(
  relsXml: string,
  id: string,
  target: string,
): PartsResult<string> {
  const close = relsXml.lastIndexOf('</Relationships>')
  if (close === -1) {
    return { type: 'refused', reason: 'the relationships part has no </Relationships>' }
  }
  if (new RegExp(`\\bId\\s*=\\s*"${id}"`).test(relsXml)) {
    return { type: 'refused', reason: `the relationships part already uses ${id}` }
  }
  const relationship =
    `<Relationship Id="${id}" Type="${IMAGE_RELATIONSHIP_TYPE}" Target="${target}"/>`
  return { type: 'ok', value: relsXml.slice(0, close) + relationship + relsXml.slice(close) }
}

/**
 * Declare `png` if it is not declared already.
 *
 * Returning the input untouched when the declaration is there is the point:
 * a template that already embeds a PNG must come out of this byte-identical,
 * or the passthrough assertion would be reporting a change nobody made.
 */
export function ensurePngContentType(contentTypesXml: string): PartsResult<string> {
  if (/<Default\b[^>]*\bExtension\s*=\s*"png"/i.test(contentTypesXml)) {
    return { type: 'ok', value: contentTypesXml }
  }
  const open = contentTypesXml.indexOf('<Types')
  if (open === -1) return { type: 'refused', reason: 'the content types part has no <Types>' }
  const after = contentTypesXml.indexOf('>', open)
  if (after === -1) return { type: 'refused', reason: '<Types> is not closed' }
  const declaration = '<Default Extension="png" ContentType="image/png"/>'
  return {
    type: 'ok',
    value: contentTypesXml.slice(0, after + 1) + declaration + contentTypesXml.slice(after + 1),
  }
}

/**
 * A media path nothing in the package is using.
 *
 * Templates arrive with `image1.png`, `image2.png` already in `word/media`,
 * and overwriting one would replace a logo with somebody's signature — a
 * silent corruption of an official form, which is the thing this tool exists
 * not to do.
 */
export function freeMediaPath(existingPaths: ReadonlyArray<string>, stem: string): string {
  const taken = new Set(existingPaths.map((path) => path.toLowerCase()))
  let candidate = `${MEDIA_DIRECTORY}${stem}.png`
  let suffix = 2
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${MEDIA_DIRECTORY}${stem}-${suffix}.png`
    suffix++
  }
  return candidate
}
