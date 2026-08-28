import { escapeForAttribute } from './escape'

/**
 * An image as a package part, and the OOXML that places it.
 *
 * PNG only, deliberately. A signature arrives either drawn on a canvas or
 * uploaded, and the browser can hand back a PNG in both cases — so the engine
 * reads one header format rather than four, and there is one content type to
 * declare. A pure function that cannot decode a file is a function that
 * returns a reason, so `readPng` never throws.
 *
 * Nothing here touches a DOM, a clock or a network. Invariant 1.
 */

/** English Metric Units. 914400 to the inch, and 96 pixels to the inch. */
export const EMU_PER_INCH = 914400
export const PX_PER_INCH = 96
export const EMU_PER_PX = EMU_PER_INCH / PX_PER_INCH

export type PngInfo = {
  readonly widthPx: number
  readonly heightPx: number
}

export type PngResult =
  | { readonly type: 'png'; readonly info: PngInfo }
  | { readonly type: 'not-a-png'; readonly reason: string }

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Width and height out of the IHDR chunk.
 *
 * IHDR is required by the PNG spec to be the first chunk, so this reads a
 * fixed offset rather than walking the file: bytes 16–23, big-endian, right
 * after the 8-byte signature and the 8-byte chunk header.
 */
export function readPng(bytes: Uint8Array): PngResult {
  if (bytes.length < 24) return { type: 'not-a-png', reason: 'file is too short to be a PNG' }
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) {
      return { type: 'not-a-png', reason: 'file does not begin with the PNG signature' }
    }
  }
  const tag = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!)
  if (tag !== 'IHDR') {
    return { type: 'not-a-png', reason: `first chunk is ${tag}, not IHDR` }
  }
  const widthPx = readUint32(bytes, 16)
  const heightPx = readUint32(bytes, 20)
  if (widthPx === 0 || heightPx === 0) {
    return { type: 'not-a-png', reason: 'PNG declares a zero dimension' }
  }
  return { type: 'png', info: { widthPx, heightPx } }
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
  )
}

/**
 * How big the image is on the page, in EMU, given a width in millimetres.
 *
 * The height follows from the aspect ratio rather than being given separately.
 * A signature stretched out of proportion is a signature that does not look
 * like the person's — so the resize control offers one number, and this turns
 * it into two.
 */
export function sizeFromWidthMm(info: PngInfo, widthMm: number): {
  readonly cx: number
  readonly cy: number
} {
  const cx = Math.max(1, Math.round((widthMm / 25.4) * EMU_PER_INCH))
  const cy = Math.max(1, Math.round((cx * info.heightPx) / info.widthPx))
  return { cx, cy }
}

/**
 * An inline drawing, which is a run like any other.
 *
 * Inline rather than floating: a floating image is anchored to a position on
 * the page and moves when the text above it reflows, which on a form whose
 * length depends on how long somebody's address is means a signature that
 * drifts off its line. Inline sits in the paragraph it was put in and stays
 * there.
 *
 * `docPr` needs an id unique within the document. It is derived from the
 * relationship id, which is itself allocated against what the package already
 * holds, so two signatures cannot collide.
 */
export function inlineDrawingRun({
  relationshipId,
  drawingId,
  name,
  description,
  cx,
  cy,
}: {
  readonly relationshipId: string
  readonly drawingId: number
  readonly name: string
  readonly description: string
  readonly cx: number
  readonly cy: number
}): string {
  // Every namespace this run uses is declared on the run itself rather than
  // assumed from `<w:document>`. The bundled form happens to declare all four
  // at the root; a template produced by something other than Word may not, and
  // an undeclared prefix is a file Word refuses to open.
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const safeName = escapeForAttribute(name)
  const safeDescription = escapeForAttribute(description)
  return (
    `<w:r><w:drawing>` +
    `<wp:inline xmlns:wp="${WP}" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${drawingId}" name="${safeName}" descr="${safeDescription}"/>` +
    `<wp:cNvGraphicFramePr>` +
    `<a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/>` +
    `</wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${A}">` +
    `<a:graphicData uri="${PIC}">` +
    `<pic:pic xmlns:pic="${PIC}">` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="${drawingId}" name="${safeName}" descr="${safeDescription}"/>` +
    `<pic:cNvPicPr/>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip xmlns:r="${R}" r:embed="${relationshipId}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing></w:r>`
  )
}
