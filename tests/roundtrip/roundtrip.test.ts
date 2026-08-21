import { describe, expect, it } from 'vitest'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import { fillDocument, type FillInstruction } from '@/lib/docx/fill'
import { readDocx, documentXml } from '@/lib/docx/unzip'
import { serialiseDocx } from '@/lib/docx/serialise'
import { syntheticDocx, syntheticDocumentXml } from '../fixtures/synthetic-template'
import { HOSTILE_VALUES } from '../fixtures/hostile-values'
import { checkWellFormed } from '../fixtures/well-formed'

/**
 * The backbone. Fill with known values, re-parse the output, assert the mapped
 * nodes contain exactly those values. Everything else rests on this.
 */

function parsed(xml = syntheticDocumentXml()): ParsedDocument {
  const result = parseDocument(xml)
  if (result.type !== 'parsed') throw new Error(`parse failed: ${result.reason}`)
  return result.document
}

function fill(doc: ParsedDocument, instructions: FillInstruction[]): ParsedDocument {
  const result = fillDocument(doc, instructions)
  if (result.type !== 'filled') {
    throw new Error(`fill refused: ${result.problems.map((p) => p.reason).join('; ')}`)
  }
  expect(checkWellFormed(result.xml)).toEqual({ type: 'well-formed' })
  return parsed(result.xml)
}

function nodeAt(doc: ParsedDocument, text: string): number {
  const index = doc.textNodes.findIndex((node) => node.text === text)
  if (index === -1) throw new Error(`no text node reads "${text}"`)
  return index
}

describe('text round-trip', () => {
  it('writes a value and reads exactly it back', () => {
    const doc = parsed()
    const target = nodeAt(doc, 'Nama Pegawai Contoh')
    const after = fill(doc, [
      { type: 'text', nodeIndices: [target], value: 'Andi Fathul Mukminin Salahuddin' },
    ])
    expect(after.textNodes[target]?.text).toBe('Andi Fathul Mukminin Salahuddin')
  })

  it('round-trips every mapped field in one pass', () => {
    const doc = parsed()
    const values: ReadonlyArray<readonly [string, string]> = [
      ['Nama Pegawai Contoh', 'Siti Rahmawati'],
      ['199001012015011001', '198705122010012003'],
      ['Perekayasa Ahli Pertama', 'Analis Kebijakan Ahli Muda'],
      ['10 tahun 6 bulan', '15 tahun 2 bulan'],
      ['Direktorat Contoh', 'Bagian Umum & Kepegawaian'],
      ['Keperluan keluarga', 'Menghadiri wisuda anak'],
      ['Jl. Contoh No. 1, Balikpapan', "Jl. Ma'ruf No. 17 RT 004"],
      ['Nama Atasan Contoh', 'Budi Santoso'],
    ]
    const instructions: FillInstruction[] = values.map(([before, value]) => ({
      type: 'text',
      nodeIndices: [nodeAt(doc, before)],
      value,
    }))

    const after = fill(doc, instructions)
    for (const [before, value] of values) {
      expect(after.textNodes[nodeAt(doc, before)]?.text).toBe(value)
    }
  })

  it.each(HOSTILE_VALUES)('round-trips $label exactly', ({ value }) => {
    const doc = parsed()
    const target = nodeAt(doc, 'Keperluan keluarga')
    const after = fill(doc, [{ type: 'text', nodeIndices: [target], value }])
    expect(after.textNodes[target]?.text).toBe(value)
  })

  it('leaves every unmapped node untouched', () => {
    const doc = parsed()
    const target = nodeAt(doc, 'Keperluan keluarga')
    const after = fill(doc, [{ type: 'text', nodeIndices: [target], value: 'Sakit' }])
    for (const node of doc.textNodes) {
      if (node.index === target) continue
      expect(after.textNodes[node.index]?.text).toBe(node.text)
    }
  })

  it('keeps xml:space="preserve" where the document had it', () => {
    const doc = parsed()
    const colon = doc.textNodes.findIndex((node) => node.text === ':')
    const after = fill(doc, [{ type: 'text', nodeIndices: [colon], value: ':' }])
    expect(after.textNodes[colon]?.preserveSpace).toBe(true)
  })

  it('adds xml:space="preserve" when a value needs it, rather than losing spaces', () => {
    const doc = parsed()
    const target = nodeAt(doc, 'Keperluan keluarga')
    expect(doc.textNodes[target]?.preserveSpace).toBe(false)
    const after = fill(doc, [{ type: 'text', nodeIndices: [target], value: '  berjarak  ' }])
    expect(after.textNodes[target]?.preserveSpace).toBe(true)
    expect(after.textNodes[target]?.text).toBe('  berjarak  ')
  })

  it('is idempotent — filling the same values twice changes nothing further', () => {
    const doc = parsed()
    const target = nodeAt(doc, 'Keperluan keluarga')
    const once = fill(doc, [{ type: 'text', nodeIndices: [target], value: 'Cuti sakit' }])
    const twice = fill(once, [{ type: 'text', nodeIndices: [target], value: 'Cuti sakit' }])
    expect(twice.xml).toBe(once.xml)
  })

  it('is deterministic — same document, same values, same bytes', () => {
    const doc = parsed()
    const instructions: FillInstruction[] = [
      { type: 'text', nodeIndices: [nodeAt(doc, 'Keperluan keluarga')], value: 'Umrah' },
      { type: 'checkbox', cellIndex: 0, checked: true },
    ]
    const a = fillDocument(doc, instructions)
    const b = fillDocument(doc, [...instructions].reverse())
    expect(a.type).toBe('filled')
    expect(a.type === 'filled' && b.type === 'filled' && a.xml === b.xml).toBe(true)
  })
})

describe('a value split across runs', () => {
  it('fills the whole span, writing the value into the first node', () => {
    const doc = parsed()
    const first = nodeAt(doc, 'Selama ')
    const span = [first, first + 1, first + 2]
    const after = fill(doc, [{ type: 'text', nodeIndices: span, value: 'Selama 5 (lima) ' }])
    expect(after.textNodes[first]?.text).toBe('Selama 5 (lima) ')
    expect(after.textNodes[first + 1]?.text).toBe('')
    expect(after.textNodes[first + 2]?.text).toBe('')
  })

  it('leaves the paragraph reading correctly after a span fill', () => {
    const doc = parsed()
    const first = nodeAt(doc, 'Selama ')
    const after = fill(doc, [
      { type: 'text', nodeIndices: [first, first + 1, first + 2], value: 'Selama 5 (lima) ' },
    ])
    expect(after.textNodes[first]?.context.paragraph).toBe('Selama 5 (lima) hari kerja')
  })

  it('refuses a span that is not contiguous — never a half-written value', () => {
    const doc = parsed()
    const first = nodeAt(doc, 'Selama ')
    const result = fillDocument(doc, [
      { type: 'text', nodeIndices: [first, first + 2], value: 'x' },
    ])
    expect(result.type).toBe('refused')
    expect(result.type === 'refused' && result.problems[0]?.reason).toMatch(/contiguous/)
  })

  it('refuses a span that crosses a paragraph boundary', () => {
    const doc = parsed()
    const last = nodeAt(doc, 'Nomor: 800/000/BKPSDM/2026')
    const result = fillDocument(doc, [
      { type: 'text', nodeIndices: [last, last + 1], value: 'x' },
    ])
    expect(result.type).toBe('refused')
  })

  it('refuses two instructions that would write the same node', () => {
    const doc = parsed()
    const target = nodeAt(doc, 'Keperluan keluarga')
    const result = fillDocument(doc, [
      { type: 'text', nodeIndices: [target], value: 'a' },
      { type: 'text', nodeIndices: [target], value: 'b' },
    ])
    expect(result.type).toBe('refused')
  })

  it('refuses a node index the document does not have', () => {
    const doc = parsed()
    const result = fillDocument(doc, [{ type: 'text', nodeIndices: [9999], value: 'x' }])
    expect(result.type).toBe('refused')
  })
})

describe('checkbox round-trip', () => {
  it('checks a cell and reads it back checked', () => {
    const after = fill(parsed(), [{ type: 'checkbox', cellIndex: 0, checked: true }])
    expect(after.checkboxCells[0]?.checked).toBe(true)
  })

  it('returns to the original document across check, uncheck and re-check', () => {
    const doc = parsed()
    const checked = fill(doc, [{ type: 'checkbox', cellIndex: 2, checked: true }])
    const unchecked = fill(checked, [{ type: 'checkbox', cellIndex: 2, checked: false }])
    expect(unchecked.xml).toBe(doc.xml)

    const rechecked = fill(unchecked, [{ type: 'checkbox', cellIndex: 2, checked: true }])
    expect(rechecked.xml).toBe(checked.xml)
  })

  it('checking an already-checked cell changes nothing', () => {
    const once = fill(parsed(), [{ type: 'checkbox', cellIndex: 1, checked: true }])
    const twice = fill(once, [{ type: 'checkbox', cellIndex: 1, checked: true }])
    expect(twice.xml).toBe(once.xml)
  })

  it('unchecking an unchecked cell changes nothing', () => {
    const doc = parsed()
    const after = fill(doc, [{ type: 'checkbox', cellIndex: 1, checked: false }])
    expect(after.xml).toBe(doc.xml)
  })

  it('leaves the other thirteen boxes alone', () => {
    const after = fill(parsed(), [{ type: 'checkbox', cellIndex: 5, checked: true }])
    expect(after.checkboxCells.filter((cell) => cell.checked).map((c) => c.index)).toEqual([5])
  })

  it('refuses a cell index the document does not have', () => {
    const result = fillDocument(parsed(), [{ type: 'checkbox', cellIndex: 99, checked: true }])
    expect(result.type).toBe('refused')
  })
})

describe('text and checkboxes together, through a real package', () => {
  it('round-trips through unzip, fill, re-zip and unzip again', () => {
    const source = syntheticDocx()
    const read = readDocx(source)
    if (read.type !== 'read') throw new Error(read.type)
    const doc = parsed(documentXml(read.package))

    const result = fillDocument(doc, [
      {
        type: 'text',
        nodeIndices: [nodeAt(doc, 'Nama Pegawai Contoh')],
        value: 'Siti & Rekan',
      },
      { type: 'text', nodeIndices: [nodeAt(doc, 'Keperluan keluarga')], value: 'Umrah' },
      { type: 'checkbox', cellIndex: 0, checked: true },
      { type: 'checkbox', cellIndex: 6, checked: true },
    ])
    if (result.type !== 'filled') throw new Error('fill refused')

    const rezipped = serialiseDocx(read.package, result.xml)
    const reread = readDocx(rezipped)
    if (reread.type !== 'read') throw new Error(reread.type)
    const after = parsed(documentXml(reread.package))

    expect(after.textNodes[nodeAt(doc, 'Nama Pegawai Contoh')]?.text).toBe('Siti & Rekan')
    expect(after.textNodes[nodeAt(doc, 'Keperluan keluarga')]?.text).toBe('Umrah')
    expect(after.checkboxCells.filter((cell) => cell.checked).map((c) => c.index)).toEqual([0, 6])
    expect(checkWellFormed(documentXml(reread.package))).toEqual({ type: 'well-formed' })
  })
})
