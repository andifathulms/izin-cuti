import { describe, expect, it } from 'vitest'

import { readDocx, documentXml, untouchedParts, DOCUMENT_PART } from '@/lib/docx/unzip'
import { parseDocument } from '@/lib/docx/parse'
import { fillDocument } from '@/lib/docx/fill'
import { serialiseDocx } from '@/lib/docx/serialise'
import { inlineDrawingRun, readPng, sizeFromWidthMm } from '@/lib/docx/image'
import {
  CONTENT_TYPES_PART,
  RELS_PART,
  addImageRelationship,
  ensurePngContentType,
  freeMediaPath,
  nextRelationshipId,
} from '@/lib/docx/parts'
import { syntheticDocx } from '../fixtures/synthetic-template'
import { checkWellFormed } from '../fixtures/well-formed'

/** A 4x2 PNG header. Only the dimensions are read; the pixels never are. */
function png(width = 4, height = 2): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0, 0, 0, 13], 8)
  bytes.set([73, 72, 68, 82], 12) // IHDR
  bytes[19] = width
  bytes[23] = height
  bytes.set([9, 9, 9, 9, 9, 9], 24)
  return bytes
}

function open(bytes: Uint8Array) {
  const result = readDocx(bytes)
  if (result.type !== 'read') throw new Error(`expected a readable package, got ${result.type}`)
  return result.package
}

function parse(xml: string) {
  const result = parseDocument(xml)
  if (result.type !== 'parsed') throw new Error(`expected a parse, got ${result.reason}`)
  return result.document
}

/**
 * Everything a signature does to a package, in one place — the same sequence
 * the app performs, so the round-trip exercises the real path rather than a
 * simplified one.
 */
function sign(bytes: Uint8Array, image: Uint8Array, paragraphIndex: number, widthMm = 40) {
  const pkg = open(bytes)
  const document = parse(documentXml(pkg))

  const info = readPng(image)
  if (info.type !== 'png') throw new Error(info.reason)

  const mediaPath = freeMediaPath(pkg.parts.map((part) => part.path), 'tanda-tangan')
  const relsPart = pkg.parts.find((part) => part.path === RELS_PART)!
  const typesPart = pkg.parts.find((part) => part.path === CONTENT_TYPES_PART)!
  const relsXml = new TextDecoder().decode(relsPart.data)
  const typesXml = new TextDecoder().decode(typesPart.data)

  const id = nextRelationshipId(relsXml)
  const rels = addImageRelationship(relsXml, id, mediaPath.replace(/^word\//, ''))
  const types = ensurePngContentType(typesXml)
  if (rels.type !== 'ok') throw new Error(rels.reason)
  if (types.type !== 'ok') throw new Error(types.reason)

  const { cx, cy } = sizeFromWidthMm(info.info, widthMm)
  const run = inlineDrawingRun({
    relationshipId: id,
    drawingId: Number(id.replace('rId', '')),
    name: 'Tanda tangan',
    description: 'Tanda tangan pemohon',
    cx,
    cy,
  })

  const filled = fillDocument(document, [{ type: 'signature', paragraphIndex, run }])
  if (filled.type !== 'filled') throw new Error(filled.problems.map((p) => p.reason).join('; '))

  const encode = (text: string) => new TextEncoder().encode(text)
  return {
    pkg,
    id,
    mediaPath,
    bytes: serialiseDocx(pkg, filled.xml, {
      replaced: [
        { path: RELS_PART, data: encode(rels.value) },
        { path: CONTENT_TYPES_PART, data: encode(types.value) },
      ],
      added: [{ path: mediaPath, data: image }],
    }),
  }
}

describe('signing a document', () => {
  it('produces a package that reads back, with the image where it was put', () => {
    const signed = sign(syntheticDocx(), png(), 0)
    const out = open(signed.bytes)

    const media = out.parts.find((part) => part.path === signed.mediaPath)
    expect(media, 'the image is not in the package').toBeDefined()
    expect(Array.from(media!.data)).toEqual(Array.from(png()))

    const xml = documentXml(out)
    expect(checkWellFormed(xml).type).toBe('well-formed')
    expect(xml).toContain(`r:embed="${signed.id}"`)

    // The relationship the drawing points at exists, and points at the image.
    const rels = new TextDecoder().decode(
      out.parts.find((part) => part.path === RELS_PART)!.data,
    )
    expect(rels).toContain(`Id="${signed.id}"`)
    expect(rels).toContain('Target="media/tanda-tangan.png"')

    // A png content type is declared, or Word will not open it.
    const types = new TextDecoder().decode(
      out.parts.find((part) => part.path === CONTENT_TYPES_PART)!.data,
    )
    expect(types).toMatch(/<Default\b[^>]*Extension="png"/)
  })

  it('re-parses to the same text nodes it had, so a signature moves no target', () => {
    // A drawing run inside a paragraph must not shift a single node index, or
    // every mapping made against the unsigned document points one node off.
    const before = parse(documentXml(open(syntheticDocx())))
    const after = parse(documentXml(open(sign(syntheticDocx(), png(), 0).bytes)))
    expect(after.textNodes.map((node) => node.text)).toEqual(
      before.textNodes.map((node) => node.text),
    )
    expect(after.checkboxCells.length).toBe(before.checkboxCells.length)
    expect(after.paragraphs.length).toBe(before.paragraphs.length)
  })

  it('changes only the four parts a signature is allowed to change', () => {
    const source = syntheticDocx({ withBinaryPart: true })
    const signed = sign(source, png(), 0)
    const out = open(signed.bytes)
    const mayDiffer = new Set([DOCUMENT_PART, RELS_PART, CONTENT_TYPES_PART, signed.mediaPath])

    for (const before of untouchedParts(signed.pkg)) {
      if (mayDiffer.has(before.path)) continue
      const after = out.parts.find((part) => part.path === before.path)
      expect(Array.from(after!.data), `part ${before.path} changed`).toEqual(
        Array.from(before.data),
      )
    }
  })

  it('is deterministic', () => {
    const once = sign(syntheticDocx(), png(), 0).bytes
    const twice = sign(syntheticDocx(), png(), 0).bytes
    expect(Array.from(once)).toEqual(Array.from(twice))
  })

  it('removes a signature back to the bytes the document had', () => {
    const pkg = open(syntheticDocx())
    const original = documentXml(pkg)
    const signed = sign(syntheticDocx(), png(), 0)
    const signedXml = documentXml(open(signed.bytes))
    expect(signedXml).not.toBe(original)

    const cleared = fillDocument(parse(signedXml), [
      { type: 'signature', paragraphIndex: 0, run: null },
    ])
    expect(cleared.type).toBe('filled')
    if (cleared.type !== 'filled') return
    expect(cleared.xml).toBe(original)
  })

  it('replaces rather than accumulates when a paragraph is signed twice', () => {
    // Two signatures in one paragraph is the previous one still sitting under
    // the new one — a wrong document that looks right at a glance.
    const first = sign(syntheticDocx(), png(), 0)
    const second = sign(first.bytes, png(6, 3), 0)
    const xml = documentXml(open(second.bytes))
    expect(xml.match(/<w:drawing>/g)).toHaveLength(1)
  })

  it('refuses a paragraph the document does not have, rather than guessing', () => {
    const document = parse(documentXml(open(syntheticDocx())))
    const result = fillDocument(document, [
      { type: 'signature', paragraphIndex: 9999, run: '<w:r/>' },
    ])
    expect(result.type).toBe('refused')
    if (result.type !== 'refused') return
    expect(result.problems[0]!.reason).toContain('no paragraph 9999')
  })

  it('scales the drawing from the image it was given, not from a fixed size', () => {
    const wide = sign(syntheticDocx(), png(8, 2), 0)
    const tall = sign(syntheticDocx(), png(2, 8), 0)
    const extent = (bytes: Uint8Array) => {
      const match = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(documentXml(open(bytes)))!
      return { cx: Number(match[1]), cy: Number(match[2]) }
    }
    expect(extent(wide.bytes).cy).toBeLessThan(extent(wide.bytes).cx)
    expect(extent(tall.bytes).cy).toBeGreaterThan(extent(tall.bytes).cx)
    // Same requested width, so the same cx whatever the aspect ratio.
    expect(extent(wide.bytes).cx).toBe(extent(tall.bytes).cx)
  })
})
