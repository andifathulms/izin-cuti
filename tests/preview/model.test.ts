import { describe, expect, it } from 'vitest'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import {
  buildPreview,
  NOTHING,
  previewAsText,
  resolutionForMapping,
  resolutionFromFill,
  type PreviewBlock,
} from '@/lib/preview/model'
import { fingerprintDocument } from '@/lib/docx/fingerprint'
import type { Mapping } from '@/lib/mapping/schema'
import type { FilledField } from '@/lib/mapping/apply'
import { syntheticDocumentXml } from '../fixtures/synthetic-template'

function parsed(): ParsedDocument {
  const result = parseDocument(syntheticDocumentXml())
  if (result.type !== 'parsed') throw new Error(result.reason)
  return result.document
}

function runsOf(blocks: ReadonlyArray<PreviewBlock>): string[] {
  const texts: string[] = []
  const visit = (list: ReadonlyArray<PreviewBlock>) => {
    for (const block of list) {
      if (block.type === 'paragraph') {
        texts.push(block.runs.map((run) => run.text).join(''))
        continue
      }
      for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks)
    }
  }
  visit(blocks)
  return texts
}

describe('the preview of an untouched document', () => {
  it('shows the document in order', () => {
    const model = buildPreview(parsed(), NOTHING)
    expect(runsOf(model.blocks)[0]).toBe('SURAT PERMINTAAN IZIN CUTI')
    expect(runsOf(model.blocks)).toContain('Perekayasa Ahli Pertama')
  })

  it('marks nothing when nothing is mapped or filled', () => {
    const model = buildPreview(parsed(), NOTHING)
    const first = model.blocks[0]
    if (first?.type !== 'paragraph') throw new Error('expected a paragraph')
    expect(first.runs.every((run) => run.state === 'plain')).toBe(true)
  })
})

describe('the preview of a fill', () => {
  const doc = parsed()
  const at = (text: string) => doc.textNodes.findIndex((node) => node.text === text)

  const mapping: Mapping = {
    version: 1,
    id: 'cuti',
    name: 'Cuti',
    createdAt: '2026-07-15T00:00:00.000Z',
    fingerprint: fingerprintDocument(doc, []),
    targets: [
      {
        type: 'text',
        id: 'nama',
        label: 'Nama',
        nodeIndices: [at('Nama Pegawai Contoh')],
        source: { kind: 'profile', key: 'nama' },
      },
      {
        type: 'text',
        id: 'lama',
        label: 'Lama cuti',
        nodeIndices: [at('Selama '), at('Selama ') + 1, at('Selama ') + 2],
        source: { kind: 'derived', computation: 'lama-cuti-hari-kerja' },
      },
      { type: 'checkbox', id: 'tahunan', label: 'Cuti Tahunan', cellIndex: 0, group: 'jenis' },
    ],
  }

  const fields: FilledField[] = [
    { id: 'nama', label: 'Nama', kind: 'profile', value: 'Siti Rahmawati', unavailable: null },
    { id: 'lama', label: 'Lama cuti', kind: 'derived', value: 'Selama 5 (lima) ', unavailable: null },
  ]

  it('shows typed and derived values in visibly different states', () => {
    const model = buildPreview(
      doc,
      resolutionFromFill(mapping, fields, new Set(['tahunan']), null),
    )
    const states = new Map<string, string>()
    const visit = (blocks: ReadonlyArray<PreviewBlock>) => {
      for (const block of blocks) {
        if (block.type === 'paragraph') {
          for (const run of block.runs) if (run.targetId) states.set(run.targetId, run.state)
          continue
        }
        for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks)
      }
    }
    visit(model.blocks)
    expect(states.get('nama')).toBe('typed')
    expect(states.get('lama')).toBe('derived')
  })

  it('shows exactly what the fill will write, span emptying included', () => {
    const model = buildPreview(doc, resolutionFromFill(mapping, fields, new Set(), null))
    expect(runsOf(model.blocks)).toContain('Selama 5 (lima) hari kerja')
  })

  it('ticks the box that the fill will tick', () => {
    const model = buildPreview(doc, resolutionFromFill(mapping, fields, new Set(['tahunan']), null))
    const table = model.blocks.find(
      (block): block is Extract<PreviewBlock, { type: 'table' }> =>
        block.type === 'table' && block.rows[0]?.cells[0]?.box !== null,
    )
    expect(table?.rows[0]?.cells[0]?.box?.checked).toBe(true)
    expect(table?.rows[1]?.cells[0]?.box?.checked).toBe(false)
  })

  it('marks the focused target, so you see where what you are typing lands', () => {
    const model = buildPreview(doc, resolutionFromFill(mapping, fields, new Set(), 'nama'))
    const focused: string[] = []
    const visit = (blocks: ReadonlyArray<PreviewBlock>) => {
      for (const block of blocks) {
        if (block.type === 'paragraph') {
          for (const run of block.runs) if (run.focused) focused.push(run.text)
          continue
        }
        for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks)
      }
    }
    visit(model.blocks)
    expect(focused).toEqual(['Siti Rahmawati'])
  })
})

describe('the preview in map mode', () => {
  it('marks what is not yet mapped with a pattern state, not a colour', () => {
    const doc = parsed()
    const model = buildPreview(doc, resolutionForMapping(new Set([0]), new Set(), null))
    const first = model.blocks[0]
    if (first?.type !== 'paragraph') throw new Error('expected a paragraph')
    expect(first.runs[0]?.state).toBe('plain')

    const anyUnmapped = JSON.stringify(model.blocks).includes('"unmapped"')
    expect(anyUnmapped).toBe(true)
  })
})

describe('the text alternative', () => {
  it('reads as the document does, and is what someone would paste', () => {
    const text = previewAsText(buildPreview(parsed(), NOTHING))
    expect(text).toContain('SURAT PERMINTAAN IZIN CUTI')
    expect(text).toContain('Nama  |  :  |  Nama Pegawai Contoh')
    expect(text).toContain('[ ]  |  Cuti Tahunan')
  })

  it('shows a ticked box as ticked', () => {
    const doc = parsed()
    const mapping: Mapping = {
      version: 1,
      id: 'm',
      name: 'M',
      createdAt: '2026-07-15T00:00:00.000Z',
      fingerprint: fingerprintDocument(doc, []),
      targets: [{ type: 'checkbox', id: 'tahunan', label: 'Cuti Tahunan', cellIndex: 0, group: null }],
    }
    const model = buildPreview(doc, resolutionFromFill(mapping, [], new Set(['tahunan']), null))
    expect(previewAsText(model)).toContain('[√]  |  Cuti Tahunan')
  })
})
