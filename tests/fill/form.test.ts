import { describe, expect, it } from 'vitest'
import { parseDocument } from '@/lib/docx/parse'
import { fingerprintDocument } from '@/lib/docx/fingerprint'
import { buildForm, checkedTargetIds, leaveTypeSelection } from '@/lib/fill/form'
import type { Mapping, Target } from '@/lib/mapping/schema'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'
import { strings } from '@/lib/i18n/strings'
import { syntheticDocumentXml } from '../fixtures/synthetic-template'

const result = parseDocument(syntheticDocumentXml())
if (result.type !== 'parsed') throw new Error(result.reason)
const doc = result.document
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
    id: 'nama-vi',
    label: 'Nama (tanda tangan)',
    nodeIndices: [doc.textNodes.map((n) => n.text).lastIndexOf('Nama Pegawai Contoh')],
    // The same profile field, written in two places. One input, two targets.
    source: { kind: 'profile', key: 'nama' },
  },
  {
    type: 'text',
    id: 'mulai',
    label: 'Mulai',
    nodeIndices: [at('Mulai tanggal 20 Juli 2026 s/d 22 Juli 2026')],
    source: { kind: 'request', key: 'mulai' },
  },
  {
    type: 'text',
    id: 'lama',
    label: 'Lama cuti',
    nodeIndices: [at('3')],
    source: { kind: 'derived', computation: 'lama-cuti-hari-kerja' },
  },
  { type: 'checkbox', id: 'c0', label: 'Cuti Tahunan', cellIndex: 0, group: 'Jenis cuti' },
  { type: 'checkbox', id: 'c1', label: 'Cuti Besar', cellIndex: 1, group: 'Jenis cuti' },
  { type: 'checkbox', id: 'c6', label: 'DISETUJUI', cellIndex: 6, group: null },
]

const mapping: Mapping = {
  version: 1,
  id: 'cuti',
  name: 'Cuti',
  createdAt: '2026-07-15T00:00:00.000Z',
  fingerprint: fingerprintDocument(doc, []),
  targets,
}

const t = strings('id')

const form = (
  request = EMPTY_REQUEST,
  choice: Record<string, string | null> = {},
  state: Record<string, boolean> = {},
) =>
  buildForm(
    mapping,
    { profile: EMPTY_PROFILE, request },
    t.fieldLabels,
    [],
    choice,
    state,
  )

describe('the generated form', () => {
  it('asks only for what the mapping actually uses', () => {
    const model = form()
    expect(model.profile.map((field) => field.key)).toEqual(['nama'])
  })

  it('asks for what a derived field needs, or it could never be computed', () => {
    // 'lama-cuti-hari-kerja' reads both dates. Only 'mulai' is written into the
    // document directly; without this the form would show a day count and offer
    // no way to give it an end date.
    const model = form()
    expect(model.request.map((field) => field.key)).toEqual(['mulai', 'sampai'])
    expect(model.request.every((field) => field.input === 'date')).toBe(true)
  })

  it('orders fields as the value types declare them, not as the mapping mentions them', () => {
    // So the dates sit together and the form reads the same way every time,
    // whatever order somebody happened to map the nodes in.
    const model = form()
    expect(model.request.map((field) => field.key)).toEqual(['mulai', 'sampai'])
  })

  it('asks once for a value the document repeats', () => {
    // Two targets, one input. This is the whole point: a request costs six
    // fields rather than thirty.
    const nama = form().profile.find((field) => field.key === 'nama')
    expect(nama?.targetIds).toEqual(['nama', 'nama-vi'])
  })

  it('gives dates a date input and a balance a number input', () => {
    expect(form().request[0]?.input).toBe('date')
  })

  it('shows derived rows with their explanation, never as an input', () => {
    const model = form({ ...EMPTY_REQUEST, mulai: '2026-07-20', sampai: '2026-07-24' })
    expect(model.derived[0]).toMatchObject({ label: 'Lama cuti', value: '5' })
    expect(model.derived[0]?.explanation).toContain('Sabtu dan Minggu')
  })

  it('says what a derived row is waiting for rather than showing a wrong number', () => {
    expect(form().derived[0]).toMatchObject({ value: '', unavailable: 'tanggal belum lengkap' })
  })

  it('separates single-select groups from standalone boxes', () => {
    const model = form()
    expect(model.groups.map((group) => group.group)).toEqual(['Jenis cuti'])
    expect(model.standalone.map(({ target }) => target.id)).toEqual(['c6'])
  })

  it('attaches a warning to its own field', () => {
    const model = buildForm(
      mapping,
      { profile: EMPTY_PROFILE, request: EMPTY_REQUEST },
      t.fieldLabels,
      [{ id: 'w', field: 'mulai', message: 'Cuti dimulai pada akhir pekan.' }],
      {},
      {},
    )
    expect(model.request[0]?.warnings).toHaveLength(1)
    expect(model.profile[0]?.warnings).toHaveLength(0)
  })
})

describe('which boxes the fill will tick', () => {
  it('collects the group choice and the standalone switches', () => {
    const model = form(EMPTY_REQUEST, { 'Jenis cuti': 'c1' }, { c6: true })
    expect(checkedTargetIds(model)).toEqual(new Set(['c1', 'c6']))
  })

  it('collects nothing when nothing is chosen', () => {
    expect(checkedTargetIds(form())).toEqual(new Set())
  })
})

describe('the leave-type selection that feeds validation', () => {
  it('reports the chosen option, by label', () => {
    expect(leaveTypeSelection(mapping, { 'Jenis cuti': 'c0' })).toEqual({
      group: 'Jenis cuti',
      chosenLabel: 'Cuti Tahunan',
      count: 1,
    })
  })

  it('reports none chosen', () => {
    expect(leaveTypeSelection(mapping, {}).count).toBe(0)
  })

  it('stays quiet for a mapping with no choice groups at all', () => {
    // Nothing to choose, so warning about a choice would be noise.
    const noGroups: Mapping = { ...mapping, targets: targets.filter((x) => x.type === 'text') }
    expect(leaveTypeSelection(noGroups, {})).toEqual({ group: null, chosenLabel: '', count: 1 })
  })
})
