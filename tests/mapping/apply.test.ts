import { describe, expect, it } from 'vitest'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import { fingerprintDocument } from '@/lib/docx/fingerprint'
import { applyMapping, type FillValues } from '@/lib/mapping/apply'
import { type Mapping, type Target, targetIndex } from '@/lib/mapping/schema'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'
import { syntheticDocumentXml, type SyntheticOptions } from '../fixtures/synthetic-template'

function parsed(options?: SyntheticOptions): ParsedDocument {
  const result = parseDocument(syntheticDocumentXml(options))
  if (result.type !== 'parsed') throw new Error(`parse failed: ${result.reason}`)
  return result.document
}

function mappingFor(doc: ParsedDocument, extra: Target[] = []): Mapping {
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
      id: 'alasan',
      label: 'Alasan cuti',
      nodeIndices: [at('Keperluan keluarga')],
      source: { kind: 'request', key: 'alasan' },
    },
    {
      type: 'text',
      id: 'lama',
      label: 'Lama cuti',
      nodeIndices: [at('3')],
      source: { kind: 'derived', computation: 'lama-cuti-hari-kerja' },
    },
    {
      type: 'text',
      id: 'nama-ulang',
      label: 'Nama (tanda tangan)',
      nodeIndices: [doc.textNodes.map((n) => n.text).lastIndexOf('Nama Pegawai Contoh')],
      source: { kind: 'derived', computation: 'salinan-nama' },
    },
    { type: 'checkbox', id: 'tahunan', label: 'Cuti Tahunan', cellIndex: 0, group: 'jenis-cuti' },
    { type: 'checkbox', id: 'besar', label: 'Cuti Besar', cellIndex: 1, group: 'jenis-cuti' },
    { type: 'checkbox', id: 'sakit', label: 'Cuti Sakit', cellIndex: 2, group: 'jenis-cuti' },
    { type: 'checkbox', id: 'disetujui', label: 'DISETUJUI', cellIndex: 6, group: null },
    ...extra,
  ]
  return {
    version: 1,
    id: 'cuti',
    name: 'Surat Permintaan Izin Cuti',
    createdAt: '2026-07-15T00:00:00.000Z',
    fingerprint: fingerprintDocument(
      doc,
      targets.map((target) => ({
        id: target.id,
        label: target.label,
        kind: target.type,
        index: targetIndex(target),
      })),
    ),
    targets,
  }
}

function values(overrides: Partial<FillValues> = {}): FillValues {
  return {
    profile: { ...EMPTY_PROFILE, nama: 'Siti Rahmawati', nip: '198705122010012003' },
    request: { ...EMPTY_REQUEST, alasan: 'Umrah', mulai: '2026-07-20', sampai: '2026-07-24' },
    checkboxChoice: { 'jenis-cuti': 'tahunan' },
    checkboxState: {},
    ...overrides,
  }
}

describe('applying a mapping', () => {
  it('fills profile, request and derived fields in one pass', () => {
    const doc = parsed()
    const result = applyMapping(doc, mappingFor(doc), values())
    expect(result.type).toBe('filled')
    if (result.type !== 'filled') return

    const after = parseDocument(result.xml)
    if (after.type !== 'parsed') throw new Error('re-parse failed')
    const texts = after.document.textNodes.map((node) => node.text)
    expect(texts).toContain('Siti Rahmawati')
    expect(texts).toContain('198705122010012003')
    expect(texts).toContain('Umrah')
    // Monday to Friday, weekends excluded.
    expect(texts).toContain('5')
  })

  it('repeats the name into section VI without it being typed twice', () => {
    const doc = parsed()
    const result = applyMapping(doc, mappingFor(doc), values())
    if (result.type !== 'filled') throw new Error('expected a fill')
    const namaFields = result.fields.filter((field) => field.value === 'Siti Rahmawati')
    expect(namaFields.map((field) => field.kind)).toEqual(['profile', 'derived'])
  })

  it('reports what each field was filled from, for the summary', () => {
    const doc = parsed()
    const result = applyMapping(doc, mappingFor(doc), values())
    if (result.type !== 'filled') throw new Error('expected a fill')
    expect(result.fields.map((field) => `${field.label}:${field.kind}`)).toEqual([
      'Nama:profile',
      'NIP:profile',
      'Alasan cuti:request',
      'Lama cuti:derived',
      'Nama (tanda tangan):derived',
    ])
  })

  it('writes nothing for a derived field it cannot compute yet, and says so', () => {
    const doc = parsed()
    const result = applyMapping(
      doc,
      mappingFor(doc),
      values({ request: { ...EMPTY_REQUEST, alasan: 'Umrah' } }),
    )
    if (result.type !== 'filled') throw new Error('expected a fill')
    const lama = result.fields.find((field) => field.id === 'lama')
    expect(lama?.value).toBe('')
    expect(lama?.unavailable).toBe('tanggal belum lengkap')
  })
})

describe('single-select groups', () => {
  it('ticks exactly one box in the group', () => {
    const doc = parsed()
    const result = applyMapping(doc, mappingFor(doc), values())
    if (result.type !== 'filled') throw new Error('expected a fill')
    const after = parseDocument(result.xml)
    if (after.type !== 'parsed') throw new Error('re-parse failed')
    expect(after.document.checkboxCells.filter((cell) => cell.checked).map((c) => c.index)).toEqual([0])
    expect(result.checkedLabels).toEqual(['Cuti Tahunan'])
  })

  it('moves the mark when the choice changes, rather than adding a second', () => {
    const doc = parsed()
    const mapping = mappingFor(doc)
    const first = applyMapping(doc, mapping, values())
    if (first.type !== 'filled') throw new Error('expected a fill')
    const filled = parseDocument(first.xml)
    if (filled.type !== 'parsed') throw new Error('re-parse failed')

    const second = applyMapping(
      filled.document,
      mapping,
      values({ checkboxChoice: { 'jenis-cuti': 'sakit' } }),
    )
    if (second.type !== 'filled') throw new Error('expected a fill')
    const after = parseDocument(second.xml)
    if (after.type !== 'parsed') throw new Error('re-parse failed')
    expect(after.document.checkboxCells.filter((cell) => cell.checked).map((c) => c.index)).toEqual([2])
  })

  it('leaves the group empty when nothing is chosen, rather than picking one', () => {
    const doc = parsed()
    const result = applyMapping(doc, mappingFor(doc), values({ checkboxChoice: {} }))
    if (result.type !== 'filled') throw new Error('expected a fill')
    expect(result.checkedLabels).toEqual([])
  })

  it('handles a standalone box on its own switch', () => {
    const doc = parsed()
    const result = applyMapping(
      doc,
      mappingFor(doc),
      values({ checkboxState: { disetujui: true } }),
    )
    if (result.type !== 'filled') throw new Error('expected a fill')
    expect(result.checkedLabels).toContain('DISETUJUI')
  })
})

describe('the fingerprint guard', () => {
  it('refuses a template that has changed, and names the differences', () => {
    const doc = parsed()
    const mapping = mappingFor(doc)
    const result = applyMapping(parsed({ variant: 'extra-node' }), mapping, values())
    expect(result.type).toBe('refused-drift')
    if (result.type !== 'refused-drift') return
    expect(result.differences.length).toBeGreaterThan(0)
  })

  it('refuses before filling anything — there is no partial output', () => {
    const doc = parsed()
    const result = applyMapping(parsed({ variant: 'extra-node' }), mappingFor(doc), values())
    expect(result.type).toBe('refused-drift')
    expect('xml' in result).toBe(false)
  })

  it('refuses when a label beside a mapped target has been edited', () => {
    const doc = parsed()
    const jabatan: Target = {
      type: 'text',
      id: 'jabatan',
      label: 'Jabatan',
      nodeIndices: [doc.textNodes.findIndex((n) => n.text === 'Perekayasa Ahli Pertama')],
      source: { kind: 'profile', key: 'jabatan' },
    }
    const result = applyMapping(
      parsed({ variant: 'edited-label' }),
      mappingFor(doc, [jabatan]),
      values(),
    )
    expect(result.type).toBe('refused-drift')
    if (result.type !== 'refused-drift') return
    expect(result.differences).toContainEqual(
      expect.objectContaining({ type: 'target-context', label: 'Jabatan' }),
    )
  })

  it('says nothing about an edit far from anything mapped', () => {
    // The fingerprint checks context per *mapped* target. A label nobody
    // mapped, edited without shifting a node, cannot mis-fill anything — and
    // refusing there would train people to ignore the refusal that matters.
    const doc = parsed()
    expect(applyMapping(parsed({ variant: 'edited-label' }), mappingFor(doc), values()).type).toBe(
      'filled',
    )
  })

  it('fills a template that still matches', () => {
    const doc = parsed()
    expect(applyMapping(parsed(), mappingFor(doc), values()).type).toBe('filled')
  })
})
