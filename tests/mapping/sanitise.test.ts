import { describe, expect, it } from 'vitest'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import { blankCopy, blankedNodes, residualPersonalData } from '@/lib/mapping/sanitise'
import { finaliseDraft, type Draft } from '@/lib/mapping/draft'
import { applyMapping } from '@/lib/mapping/apply'
import { checkFingerprint } from '@/lib/docx/fingerprint'
import type { Target } from '@/lib/mapping/schema'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'
import { syntheticDocumentXml } from '../fixtures/synthetic-template'
import { checkWellFormed } from '../fixtures/well-formed'

function parsed(xml = syntheticDocumentXml()): ParsedDocument {
  const result = parseDocument(xml)
  if (result.type !== 'parsed') throw new Error(result.reason)
  return result.document
}

const doc = parsed()
const at = (text: string) => doc.textNodes.findIndex((node) => node.text === text)

const targets: Target[] = [
  {
    type: 'text',
    id: 'nama',
    label: 'Nama',
    nodeIndices: [at('Nama Pegawai Contoh')],
    source: { kind: 'profile', key: 'nama' },
  },
  {
    type: 'text',
    id: 'nip',
    label: 'NIP',
    nodeIndices: [at('199001012015011001')],
    source: { kind: 'profile', key: 'nip' },
  },
  {
    type: 'text',
    id: 'alamat',
    label: 'Alamat',
    nodeIndices: [at('Jl. Contoh No. 1, Balikpapan')],
    source: { kind: 'profile', key: 'alamat' },
  },
  { type: 'checkbox', id: 'c0', label: 'Cuti Tahunan', cellIndex: 0, group: 'Jenis cuti' },
]

function blanked(list: ReadonlyArray<Target> = targets): ParsedDocument {
  const result = blankCopy(doc, list)
  if (result.type !== 'filled') throw new Error('blank copy refused')
  expect(checkWellFormed(result.xml)).toEqual({ type: 'well-formed' })
  return parsed(result.xml)
}

describe('a blank copy', () => {
  it('replaces each mapped value with its field name', () => {
    const after = blanked()
    expect(after.textNodes[at('Nama Pegawai Contoh')]?.text).toBe('Nama')
    expect(after.textNodes[at('199001012015011001')]?.text).toBe('NIP')
    expect(after.textNodes[at('Jl. Contoh No. 1, Balikpapan')]?.text).toBe('Alamat')
  })

  it('never empties a value, which would turn its cell into a tick box', () => {
    // A cell holding nothing but whitespace is how a checkbox target is
    // identified. Emptying a value that sits alone in a cell would reclassify
    // the cell, drop its text node and shift every index after it.
    const unnamed: Target[] = [{ ...(targets[0] as Extract<Target, { type: 'text' }>), label: '  ' }]
    const after = blanked(unnamed)
    expect(after.textNodes[at('Nama Pegawai Contoh')]?.text).toBe('—')
    expect(after.textNodes.length).toBe(doc.textNodes.length)
    expect(after.checkboxCells.length).toBe(doc.checkboxCells.length)
  })

  it('leaves the document structure untouched, which Word would not', () => {
    const after = blanked()
    // Same node count, same checkbox count, same skeleton. A Word re-save
    // restructures runs and this is exactly what that would break.
    expect(after.textNodes.length).toBe(doc.textNodes.length)
    expect(after.checkboxCells.length).toBe(doc.checkboxCells.length)
    expect(after.structuralHash).toBe(doc.structuralHash)
  })

  it('leaves every label and heading alone', () => {
    const after = blanked()
    expect(after.textNodes[0]?.text).toBe('SURAT PERMINTAAN IZIN CUTI')
    expect(after.textNodes.map((node) => node.text)).toContain('Masa Kerja')
  })

  it('clears every mapped box, whatever state the original was in', () => {
    const ticked = parsed(
      (() => {
        const cell = doc.checkboxCells[0]!
        return (
          doc.xml.slice(0, cell.insertAt) +
          '<w:r><w:t>√</w:t></w:r>' +
          doc.xml.slice(cell.insertAt)
        )
      })(),
    )
    const result = blankCopy(ticked, targets)
    if (result.type !== 'filled') throw new Error('blank copy refused')
    expect(parsed(result.xml).checkboxCells[0]?.checked).toBe(false)
  })

  it('is still a template the mapping can fill', () => {
    const after = blanked()
    const draft: Draft = { name: 'Cuti', targets }
    const remade = finaliseDraft(draft, after, {
      id: 'cuti',
      createdAt: '2026-08-21T00:00:00.000Z',
    })
    if (remade.type !== 'ready') throw new Error('expected a mapping')

    const applied = applyMapping(after, remade.mapping, {
      profile: { ...EMPTY_PROFILE, nama: 'Siti Rahmawati', nip: '198705122010012003' },
      request: EMPTY_REQUEST,
      checkboxChoice: { 'Jenis cuti': 'c0' },
      checkboxState: {},
    })
    expect(applied.type).toBe('filled')
  })
})

describe('re-pointing the mapping at the blank copy', () => {
  it('is necessary — a blank copy can move the context of its neighbours', () => {
    // Where a value shares a paragraph with other runs, blanking it changes
    // what sits either side of them, so the fingerprint from the original does
    // not necessarily fit the copy. Making both in one step is the point.
    // Two targets in one paragraph: blanking each changes what sits either
    // side of the other, so both context hashes move.
    const spanTargets: Target[] = [
      {
        type: 'text',
        id: 'hari',
        label: 'Jumlah hari',
        nodeIndices: [at('Selama ') + 1],
        source: { kind: 'request', key: 'alasan' },
      },
      {
        type: 'text',
        id: 'satuan',
        label: 'Satuan',
        nodeIndices: [at('Selama ') + 3],
        source: { kind: 'request', key: 'alasan' },
      },
    ]
    const original = finaliseDraft({ name: 'X', targets: spanTargets }, doc, {
      id: 'x',
      createdAt: '2026-08-21T00:00:00.000Z',
    })
    if (original.type !== 'ready') throw new Error('expected a mapping')

    const result = blankCopy(doc, spanTargets)
    if (result.type !== 'filled') throw new Error('blank copy refused')
    const copy = parsed(result.xml)

    const stale = checkFingerprint(copy, original.mapping.fingerprint)
    const remade = finaliseDraft({ name: 'X', targets: spanTargets }, copy, {
      id: 'x',
      createdAt: '2026-08-21T00:00:00.000Z',
    })
    if (remade.type !== 'ready') throw new Error('expected a mapping')

    expect(stale.type).toBe('mismatch')
    expect(checkFingerprint(copy, remade.mapping.fingerprint)).toEqual({ type: 'match' })
  })

  it('leaves a value in its own cell matching either way', () => {
    const after = blanked()
    const original = finaliseDraft({ name: 'Cuti', targets }, doc, {
      id: 'cuti',
      createdAt: '2026-08-21T00:00:00.000Z',
    })
    if (original.type !== 'ready') throw new Error('expected a mapping')
    // Nama, NIP and Alamat each sit alone in a cell, so nothing around them
    // moved. This is the common case and it survives untouched.
    expect(checkFingerprint(after, original.mapping.fingerprint)).toEqual({ type: 'match' })
  })
})

describe('what a blank copy did not blank', () => {
  const profile = {
    ...EMPTY_PROFILE,
    nama: 'Nama Pegawai Contoh',
    nip: '199001012015011001',
    telepon: '0800-0000-0000',
  }

  it('finds personal data still sitting in nodes nobody mapped', () => {
    const after = blanked()
    const residue = residualPersonalData(after, profile, blankedNodes(targets))
    // The name appears again in section VI and the phone number twice — none
    // of which this mapping touched.
    expect(residue.map((item) => item.field)).toContain('nama')
    expect(residue.map((item) => item.field)).toContain('telepon')
  })

  it('says where each one is, in words a person can act on', () => {
    const residue = residualPersonalData(blanked(), profile, blankedNodes(targets))
    const nama = residue.find((item) => item.field === 'nama')
    expect(nama?.context).toContain('VI.')
  })

  it('does not report a node the blank copy already cleared', () => {
    const residue = residualPersonalData(blanked(), profile, blankedNodes(targets))
    expect(residue.some((item) => item.nodeIndex === at('Nama Pegawai Contoh'))).toBe(false)
  })

  it('ignores values too short to mean anything', () => {
    // A two-letter unit name would match half the document. Silence beats noise.
    const residue = residualPersonalData(blanked(), { ...EMPTY_PROFILE, jabatan: 'ah' }, new Set())
    expect(residue).toEqual([])
  })

  it('finds nothing once everything personal has been mapped', () => {
    const everything: Target[] = [
      ...targets,
      {
        type: 'text',
        id: 'nama-vi',
        label: 'Nama',
        nodeIndices: [doc.textNodes.map((n) => n.text).lastIndexOf('Nama Pegawai Contoh')],
        source: { kind: 'derived', computation: 'salinan-nama' },
      },
      {
        type: 'text',
        id: 'telp1',
        label: 'Telepon',
        nodeIndices: [at('0800-0000-0000')],
        source: { kind: 'profile', key: 'telepon' },
      },
      {
        type: 'text',
        id: 'telp2',
        label: 'Telepon',
        nodeIndices: [at('Telp. 0800-0000-0000')],
        source: { kind: 'profile', key: 'telepon' },
      },
    ]
    const result = blankCopy(doc, everything)
    if (result.type !== 'filled') throw new Error('blank copy refused')
    expect(
      residualPersonalData(parsed(result.xml), profile, blankedNodes(everything)),
    ).toEqual([])
  })
})
