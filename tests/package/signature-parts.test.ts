import { describe, expect, it } from 'vitest'

import { readDocx, untouchedParts, DOCUMENT_PART } from '@/lib/docx/unzip'
import { serialiseDocx } from '@/lib/docx/serialise'
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

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="…/theme" Target="theme/theme1.xml"/>' +
  '<Relationship Id="rId5" Type="…/styles" Target="styles.xml"/>' +
  '</Relationships>'

const TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default ContentType="application/xml" Extension="xml"/>' +
  '</Types>'

function open(bytes: Uint8Array) {
  const result = readDocx(bytes)
  if (result.type !== 'read') throw new Error(`expected a readable package, got ${result.type}`)
  return result.package
}

describe('relationship ids', () => {
  it('takes one past the highest id, not one past the count', () => {
    // Two relationships, numbered 1 and 5. "rId3" would collide with nothing
    // here but does the moment a package numbers its parts sparsely, and a
    // collision re-points the styles relationship at a picture.
    expect(nextRelationshipId(RELS)).toBe('rId6')
  })

  it('starts at rId1 for a package with no relationships', () => {
    expect(nextRelationshipId('<Relationships></Relationships>')).toBe('rId1')
  })

  it('adds the relationship immediately before the closing tag', () => {
    const result = addImageRelationship(RELS, 'rId6', 'media/tanda-tangan.png')
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.value).toContain('Id="rId6"')
    expect(result.value).toContain('Target="media/tanda-tangan.png"')
    expect(result.value.endsWith('</Relationships>')).toBe(true)
    expect(checkWellFormed(result.value).type).toBe('well-formed')
    // Everything that was there is still there, in the order it was in.
    expect(result.value.indexOf('rId1')).toBeLessThan(result.value.indexOf('rId5'))
  })

  it('refuses an id the part already uses rather than writing a duplicate', () => {
    expect(addImageRelationship(RELS, 'rId5', 'media/x.png')).toEqual({
      type: 'refused',
      reason: 'the relationships part already uses rId5',
    })
  })

  it('refuses a relationships part it does not recognise', () => {
    expect(addImageRelationship('<nope/>', 'rId2', 'media/x.png').type).toBe('refused')
  })
})

describe('content types', () => {
  it('declares png when it is missing', () => {
    const result = ensurePngContentType(TYPES)
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.value).toContain('<Default Extension="png" ContentType="image/png"/>')
    expect(checkWellFormed(result.value).type).toBe('well-formed')
  })

  it('returns a part that already declares png byte-identically', () => {
    // A template that already embeds a picture must come out unchanged, or the
    // passthrough assertion would report a change nobody made.
    const already = TYPES.replace(
      '<Default ContentType="application/xml" Extension="xml"/>',
      '<Default ContentType="application/xml" Extension="xml"/><Default Extension="png" ContentType="image/png"/>',
    )
    expect(ensurePngContentType(already)).toEqual({ type: 'ok', value: already })
  })

  it('recognises the declaration whatever order the attributes are in', () => {
    // Word writes ContentType first; the spec does not care and neither may we,
    // or a template that already declares png gains a second declaration.
    const other = TYPES.replace(
      '</Types>',
      '<Default ContentType="image/png" Extension="png"/></Types>',
    )
    const result = ensurePngContentType(other)
    expect(result).toEqual({ type: 'ok', value: other })
  })
})

describe('media paths', () => {
  it('never overwrites an image the template already carries', () => {
    // Overwriting word/media/image1.png would replace somebody's letterhead
    // with a signature — a silent corruption of an official form.
    const taken = ['word/media/image1.png', 'word/media/tanda-tangan.png']
    expect(freeMediaPath(taken, 'tanda-tangan')).toBe('word/media/tanda-tangan-2.png')
    expect(freeMediaPath([...taken, 'word/media/tanda-tangan-2.png'], 'tanda-tangan')).toBe(
      'word/media/tanda-tangan-3.png',
    )
  })

  it('compares case-insensitively, because zip readers and Windows do', () => {
    expect(freeMediaPath(['word/media/TANDA-TANGAN.PNG'], 'tanda-tangan')).toBe(
      'word/media/tanda-tangan-2.png',
    )
  })
})

describe('serialising with an embedded image', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8])

  it('changes only the document, the rels, the content types and the added media', () => {
    const pkg = open(syntheticDocx({ withBinaryPart: true }))
    const rels = pkg.parts.find((part) => part.path === RELS_PART)
    const types = pkg.parts.find((part) => part.path === CONTENT_TYPES_PART)
    expect(rels, 'the fixture needs a rels part').toBeDefined()
    expect(types, 'the fixture needs a content types part').toBeDefined()

    const out = open(
      serialiseDocx(pkg, '<w:document/>', {
        replaced: [
          { path: RELS_PART, data: new TextEncoder().encode('<Relationships/>') },
          { path: CONTENT_TYPES_PART, data: new TextEncoder().encode('<Types/>') },
        ],
        added: [{ path: 'word/media/tanda-tangan.png', data: png }],
      }),
    )

    // The named three, and nothing else. Asserted against the list rather than
    // against "the document only", which is what invariant 3 now says.
    const mayDiffer = new Set([DOCUMENT_PART, RELS_PART, CONTENT_TYPES_PART])
    for (const before of untouchedParts(pkg)) {
      if (mayDiffer.has(before.path)) continue
      const after = out.parts.find((part) => part.path === before.path)
      expect(after, `part ${before.path} is missing from the output`).toBeDefined()
      expect(Array.from(after!.data), `part ${before.path} changed`).toEqual(
        Array.from(before.data),
      )
    }

    const media = out.parts.find((part) => part.path === 'word/media/tanda-tangan.png')
    expect(media, 'the image was not added').toBeDefined()
    expect(Array.from(media!.data)).toEqual(Array.from(png))
  })

  it('produces the package it always did when there is no signature', () => {
    const pkg = open(syntheticDocx({ withBinaryPart: true }))
    const without = serialiseDocx(pkg, '<w:document/>')
    const empty = serialiseDocx(pkg, '<w:document/>', {})
    expect(Array.from(empty)).toEqual(Array.from(without))
  })

  it('is deterministic with an image in it', () => {
    const pkg = open(syntheticDocx({ withBinaryPart: true }))
    const once = serialiseDocx(pkg, '<w:document/>', {
      added: [{ path: 'word/media/tanda-tangan.png', data: png }],
    })
    const twice = serialiseDocx(pkg, '<w:document/>', {
      added: [{ path: 'word/media/tanda-tangan.png', data: png }],
    })
    expect(Array.from(once)).toEqual(Array.from(twice))
  })
})
