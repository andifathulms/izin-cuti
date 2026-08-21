import { describe, expect, it } from 'vitest'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import {
  addCheckboxTarget,
  addTextTarget,
  EMPTY_DRAFT,
  finaliseDraft,
  mergeWithNext,
  regroupTarget,
  relabelTarget,
  removeTarget,
  renameDraft,
  retypeTarget,
  textTargetId,
  unmergeLast,
  type Draft,
} from '@/lib/mapping/draft'
import { counts, filterNodes, nodeList } from '@/lib/mapping/nodelist'
import { applyMapping } from '@/lib/mapping/apply'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'
import { syntheticDocumentXml } from '../fixtures/synthetic-template'

function parsed(): ParsedDocument {
  const result = parseDocument(syntheticDocumentXml())
  if (result.type !== 'parsed') throw new Error(result.reason)
  return result.document
}

const doc = parsed()
const at = (text: string) => doc.textNodes.findIndex((node) => node.text === text)

describe('the node list', () => {
  it('interleaves text nodes and checkbox cells in document order', () => {
    const entries = nodeList(doc, [])
    const kinds = entries.map((entry) => entry.kind)
    // Section II's boxes fall between the section I values and the section III
    // ones, which is where they are in the document and where a person looks.
    expect(kinds.includes('checkbox')).toBe(true)
    expect(entries.map((entry) => entry.order)).toEqual(
      [...entries.map((entry) => entry.order)].sort((a, b) => a - b),
    )
  })

  it('carries the context that makes a node recognisable', () => {
    const entries = nodeList(doc, [])
    const jabatan = entries.find(
      (entry) => entry.kind === 'text' && entry.text === 'Perekayasa Ahli Pertama',
    )
    expect(jabatan).toMatchObject({ rowLabel: 'Jabatan', section: 'I. DATA PEGAWAI' })
  })

  it('counts both kinds', () => {
    expect(counts(nodeList(doc, []))).toMatchObject({ checkbox: 14 })
  })

  it('filters to what is still unmapped', () => {
    const draft = addTextTarget(EMPTY_DRAFT, at('Nama Pegawai Contoh'), 'Nama')
    const entries = nodeList(doc, draft.targets)
    expect(filterNodes(entries, 'mapped', '')).toHaveLength(1)
    expect(filterNodes(entries, 'unmapped', '').length).toBe(entries.length - 1)
  })

  it('searches by context, not only by the text itself', () => {
    const entries = nodeList(doc, [])
    const found = filterNodes(entries, 'all', 'jabatan')
    expect(found.some((entry) => entry.kind === 'text' && entry.text === 'Perekayasa Ahli Pertama')).toBe(true)
  })

  it('hides the tail of a merged span, which has no controls of its own', () => {
    let draft = addTextTarget(EMPTY_DRAFT, at('Selama '), 'Lama cuti')
    const merged = mergeWithNext(draft, textTargetId(at('Selama ')), doc)
    if (merged.type !== 'merged') throw new Error(merged.reason)
    draft = merged.draft
    const entries = nodeList(doc, draft.targets)
    expect(filterNodes(entries, 'all', '').some((entry) => entry.key === `t${at('Selama ') + 1}`)).toBe(false)
  })
})

describe('building a draft', () => {
  it('adds, renames, retypes and removes', () => {
    let draft = addTextTarget(EMPTY_DRAFT, at('199001012015011001'), 'NIP')
    const id = textTargetId(at('199001012015011001'))
    draft = relabelTarget(draft, id, 'NIP pegawai')
    draft = retypeTarget(draft, id, { kind: 'profile', key: 'nip' })
    expect(draft.targets[0]).toMatchObject({
      label: 'NIP pegawai',
      source: { kind: 'profile', key: 'nip' },
    })
    expect(removeTarget(draft, id).targets).toEqual([])
  })

  it('refuses to map the same node twice', () => {
    const once = addTextTarget(EMPTY_DRAFT, 4, 'A')
    expect(addTextTarget(once, 4, 'B')).toBe(once)
  })

  it('refuses to map the same cell twice', () => {
    const once = addCheckboxTarget(EMPTY_DRAFT, 0, 'Cuti Tahunan')
    expect(addCheckboxTarget(once, 0, 'Lagi')).toBe(once)
  })

  it('puts boxes into a single-select group', () => {
    let draft = addCheckboxTarget(EMPTY_DRAFT, 0, 'Cuti Tahunan')
    draft = addCheckboxTarget(draft, 1, 'Cuti Besar')
    draft = regroupTarget(draft, 'c0', 'jenis-cuti')
    draft = regroupTarget(draft, 'c1', 'jenis-cuti')
    expect(draft.targets.every((t) => t.type === 'checkbox' && t.group === 'jenis-cuti')).toBe(true)
  })
})

describe('merging runs Word split', () => {
  const first = at('Selama ')

  it('extends a target onto the next node', () => {
    const draft = addTextTarget(EMPTY_DRAFT, first, 'Lama cuti')
    const merged = mergeWithNext(draft, textTargetId(first), doc)
    expect(merged.type).toBe('merged')
    if (merged.type !== 'merged') return
    expect(merged.draft.targets[0]).toMatchObject({ nodeIndices: [first, first + 1] })
  })

  it('unmerges back towards a single node', () => {
    const draft = addTextTarget(EMPTY_DRAFT, first, 'Lama cuti')
    const merged = mergeWithNext(draft, textTargetId(first), doc)
    if (merged.type !== 'merged') throw new Error('expected a merge')
    expect(unmergeLast(merged.draft, textTargetId(first)).targets[0]).toMatchObject({
      nodeIndices: [first],
    })
  })

  it('refuses to cross a paragraph boundary', () => {
    const last = at('Nomor: 800/000/BKPSDM/2026')
    const draft = addTextTarget(EMPTY_DRAFT, last, 'Nomor')
    const merged = mergeWithNext(draft, textTargetId(last), doc)
    expect(merged.type).toBe('refused')
    if (merged.type !== 'refused') return
    expect(merged.reason).toMatch(/paragraf lain/)
  })

  it('refuses to steal a node another target already owns', () => {
    let draft = addTextTarget(EMPTY_DRAFT, first, 'Lama cuti')
    draft = addTextTarget(draft, first + 1, 'Jumlah hari')
    const merged = mergeWithNext(draft, textTargetId(first), doc)
    expect(merged.type).toBe('refused')
    if (merged.type !== 'refused') return
    // Stealing it would leave the other target pointing at half a value, which
    // is exactly the failure merging exists to prevent.
    expect(merged.reason).toMatch(/sudah dipetakan/)
  })
})

describe('finalising a draft', () => {
  const complete = (): Draft => {
    let draft = renameDraft(EMPTY_DRAFT, 'Surat Permintaan Izin Cuti')
    draft = addTextTarget(draft, at('Nama Pegawai Contoh'), 'Nama')
    draft = retypeTarget(draft, textTargetId(at('Nama Pegawai Contoh')), {
      kind: 'profile',
      key: 'nama',
    })
    draft = addCheckboxTarget(draft, 0, 'Cuti Tahunan')
    return draft
  }

  const identity = { id: 'cuti', createdAt: '2026-07-15T00:00:00.000Z' }

  it('takes the document fingerprint as it goes', () => {
    const result = finaliseDraft(complete(), doc, identity)
    expect(result.type).toBe('ready')
    if (result.type !== 'ready') return
    expect(result.mapping.fingerprint.textNodeCount).toBe(doc.textNodes.length)
    expect(result.mapping.fingerprint.targets.map((t) => t.label)).toEqual([
      'Nama',
      'Cuti Tahunan',
    ])
  })

  it('says what is missing rather than saving something half-made', () => {
    const result = finaliseDraft(EMPTY_DRAFT, doc, identity)
    expect(result.type).toBe('incomplete')
    if (result.type !== 'incomplete') return
    expect(result.problems).toHaveLength(2)
  })

  it('refuses a target nobody named', () => {
    const draft = addTextTarget(renameDraft(EMPTY_DRAFT, 'X'), 4, '   ')
    const result = finaliseDraft(draft, doc, identity)
    expect(result.type).toBe('incomplete')
  })

  it('produces a mapping that fills the document it was made from', () => {
    const result = finaliseDraft(complete(), doc, identity)
    if (result.type !== 'ready') throw new Error('expected a mapping')
    const applied = applyMapping(doc, result.mapping, {
      profile: { ...EMPTY_PROFILE, nama: 'Siti Rahmawati' },
      request: EMPTY_REQUEST,
      checkboxChoice: {},
      checkboxState: { c0: true },
    })
    expect(applied.type).toBe('filled')
    if (applied.type !== 'filled') return
    expect(applied.checkedLabels).toEqual(['Cuti Tahunan'])
  })

  it('is deterministic — same draft and document, same mapping', () => {
    const a = finaliseDraft(complete(), doc, identity)
    const b = finaliseDraft(complete(), doc, identity)
    expect(a).toEqual(b)
  })
})
