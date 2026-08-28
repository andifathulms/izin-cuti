import { describe, expect, it } from 'vitest'

import { readDocx, documentXml } from '@/lib/docx/unzip'
import { parseDocument } from '@/lib/docx/parse'
import { serialiseDocx } from '@/lib/docx/serialise'
import { applyMapping } from '@/lib/mapping/apply'
import { finaliseDraft } from '@/lib/mapping/draft'
import {
  MAX_WIDTH_MM,
  MIN_WIDTH_MM,
  clampWidthMm,
  heightMm,
  placeSignature,
  readSignature,
  restoreSignature,
  storeSignature,
  type Signature,
} from '@/lib/signature/signature'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'
import { syntheticDocx } from '../fixtures/synthetic-template'
import { checkWellFormed } from '../fixtures/well-formed'

function png(width = 4, height = 2): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0, 0, 0, 13], 8)
  bytes.set([73, 72, 68, 82], 12)
  bytes[19] = width
  bytes[23] = height
  return bytes
}

function open(bytes: Uint8Array) {
  const result = readDocx(bytes)
  if (result.type !== 'read') throw new Error(result.type)
  return result.package
}

function parse(xml: string) {
  const result = parseDocument(xml)
  if (result.type !== 'parsed') throw new Error(result.reason)
  return result.document
}

const image = (): Signature => {
  const read = readSignature(png(), 'drawn', '2026-08-28T00:00:00.000Z')
  if (read.type !== 'signature') throw new Error(read.reason)
  return read.signature
}

describe('reading a signature', () => {
  it('refuses anything that is not a PNG, with the reason', () => {
    const result = readSignature(new Uint8Array([1, 2, 3]), 'uploaded', '')
    expect(result.type).toBe('rejected')
  })

  it('refuses an image too large to keep, rather than throwing on write', () => {
    // A quota exception on write loses the profiles saved alongside it.
    const huge = new Uint8Array(600 * 1024)
    huge.set(png(), 0)
    const result = readSignature(huge, 'uploaded', '')
    expect(result.type).toBe('rejected')
    if (result.type !== 'rejected') return
    expect(result.reason).toContain('kB')
  })
})

describe('width', () => {
  it('clamps to what fits the cell rather than trusting a stored number', () => {
    expect(clampWidthMm(0)).toBe(MIN_WIDTH_MM)
    expect(clampWidthMm(1000)).toBe(MAX_WIDTH_MM)
    expect(clampWidthMm(Number.NaN)).toBe(MIN_WIDTH_MM)
    expect(clampWidthMm(40)).toBe(40)
  })

  it('reports the height that width implies, so nothing has to be guessed', () => {
    expect(heightMm({ widthPx: 4, heightPx: 2 }, 40)).toBe(20)
  })
})

describe('storing a signature', () => {
  it('round-trips through the stored shape byte-for-byte', () => {
    const restored = restoreSignature(storeSignature(image()))
    expect(restored).not.toBeNull()
    expect(Array.from(restored!.bytes)).toEqual(Array.from(png()))
    expect(restored!.info).toEqual({ widthPx: 4, heightPx: 2 })
    expect(restored!.source).toBe('drawn')
  })

  it('returns null for anything it does not recognise, since storage is editable by hand', () => {
    expect(restoreSignature(null)).toBeNull()
    expect(restoreSignature({})).toBeNull()
    expect(restoreSignature({ version: 2, png: 'x' })).toBeNull()
    expect(restoreSignature({ version: 1, png: 'not base64 of a png' })).toBeNull()
  })
})

describe('placing a signature in a package', () => {
  it('makes the relationship target relative to word/, not to the package root', () => {
    // "word/media/x.png" here resolves to "word/word/media/x.png" and the
    // image silently does not render — a document that looks signed and is not.
    const placed = placeSignature(open(syntheticDocx()), image(), 40, 'Tanda tangan')
    expect(placed.type).toBe('placed')
    if (placed.type !== 'placed') return
    const rels = new TextDecoder().decode(placed.placement.changes.replaced![0]!.data)
    expect(rels).toContain('Target="media/tanda-tangan.png"')
    expect(rels).not.toContain('Target="word/media')
  })

  it('refuses a package with no relationships part, rather than inventing one', () => {
    const pkg = open(syntheticDocx())
    const stripped = { parts: pkg.parts.filter((p) => p.path !== 'word/_rels/document.xml.rels') }
    expect(placeSignature(stripped, image(), 40, 'x').type).toBe('refused')
  })
})

describe('applyMapping with a signature', () => {
  const setup = () => {
    const pkg = open(syntheticDocx())
    const document = parse(documentXml(pkg))
    const draft = finaliseDraft(
      {
        name: 'Synthetic',
        targets: [
          { type: 'signature', id: 'ttd', label: 'Tanda tangan', paragraphIndex: 0, widthMm: 40 },
        ],
      },
      document,
      { id: 'synthetic', createdAt: '2026-08-28T00:00:00.000Z' },
    )
    if (draft.type !== 'ready') throw new Error(draft.problems.join('; '))
    return { pkg, document, mapping: draft.mapping }
  }

  const values = (signature: ReturnType<typeof image> | null, pkg = open(syntheticDocx())) => ({
    profile: EMPTY_PROFILE,
    request: EMPTY_REQUEST,
    checkboxChoice: {},
    checkboxState: {},
    signature:
      signature === null
        ? null
        : { image: signature, widthMm: 40, name: 'Tanda tangan pemohon', package: pkg },
  })

  it('places the drawing and hands back the parts the package needs', () => {
    const { pkg, document, mapping } = setup()
    const result = applyMapping(document, mapping, values(image(), pkg))
    expect(result.type).toBe('filled')
    if (result.type !== 'filled') return

    expect(result.xml).toContain('<w:drawing>')
    expect(checkWellFormed(result.xml).type).toBe('well-formed')
    expect(result.changes.added).toHaveLength(1)
    expect(result.changes.replaced).toHaveLength(2)

    const out = open(serialiseDocx(pkg, result.xml, result.changes))
    expect(out.parts.some((part) => part.path === 'word/media/tanda-tangan.png')).toBe(true)
  })

  it('writes the empty state too, so removing a signature actually removes it', () => {
    // The same argument the checkboxes make: a re-fill must land in the state
    // asked for, not accumulate what was there before.
    const { pkg, document, mapping } = setup()
    const signed = applyMapping(document, mapping, values(image(), pkg))
    if (signed.type !== 'filled') throw new Error('expected a fill')

    const cleared = applyMapping(parse(signed.xml), mapping, values(null))
    expect(cleared.type).toBe('filled')
    if (cleared.type !== 'filled') return
    expect(cleared.xml).not.toContain('<w:drawing>')
    expect(cleared.xml).toBe(documentXml(pkg))
    expect(cleared.changes).toEqual({})
  })

  it('is deterministic', () => {
    const a = setup()
    const b = setup()
    const one = applyMapping(a.document, a.mapping, values(image(), a.pkg))
    const two = applyMapping(b.document, b.mapping, values(image(), b.pkg))
    if (one.type !== 'filled' || two.type !== 'filled') throw new Error('expected fills')
    expect(one.xml).toBe(two.xml)
  })

  it('produces the document it always did when no signature target is mapped', () => {
    const pkg = open(syntheticDocx())
    const document = parse(documentXml(pkg))
    // A mapping with targets but no signature target — the ordinary case for
    // every mapping made before this feature existed.
    const draft = finaliseDraft(
      {
        name: 'Synthetic',
        targets: [
          { type: 'text', id: 'nama', label: 'Nama', nodeIndices: [0], source: { kind: 'profile', key: 'nama' } },
        ],
      },
      document,
      { id: 'synthetic', createdAt: '2026-08-28T00:00:00.000Z' },
    )
    if (draft.type !== 'ready') throw new Error('expected a draft')
    const result = applyMapping(document, draft.mapping, values(image(), pkg))
    expect(result.type).toBe('filled')
    if (result.type !== 'filled') return
    // The text target wrote an empty profile value, so the document changed —
    // what matters is that no drawing and no package change came with it.
    expect(result.xml).not.toContain('<w:drawing>')
    expect(result.changes).toEqual({})
  })
})
