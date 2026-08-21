import { describe, expect, it } from 'vitest'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import { syntheticDocumentXml } from '../fixtures/synthetic-template'

function parsed(xml = syntheticDocumentXml()): ParsedDocument {
  const result = parseDocument(xml)
  if (result.type !== 'parsed') throw new Error(`parse failed: ${result.reason}`)
  return result.document
}

describe('text nodes', () => {
  it('finds them in document order', () => {
    const doc = parsed()
    expect(doc.textNodes[0]?.text).toBe('SURAT PERMINTAAN IZIN CUTI')
    expect(doc.textNodes.map((node) => node.index)).toEqual(
      doc.textNodes.map((_node, i) => i),
    )
  })

  it('records offsets that point at the value in the original xml', () => {
    const doc = parsed()
    const nip = doc.textNodes.find((node) => node.text === '199001012015011001')
    expect(nip).toBeDefined()
    expect(doc.xml.slice(nip!.contentStart, nip!.contentEnd)).toBe('199001012015011001')
  })

  it('notices xml:space="preserve", which the document relies on', () => {
    const doc = parsed()
    const colon = doc.textNodes.find((node) => node.text === ':')
    expect(colon?.preserveSpace).toBe(true)
  })

  it('carries context, which is what makes a list of 97 strings usable', () => {
    const doc = parsed()
    const jabatan = doc.textNodes.find((node) => node.text === 'Perekayasa Ahli Pertama')
    expect(jabatan?.context.rowLabel).toBe('Jabatan')
    expect(jabatan?.context.section).toBe('I. DATA PEGAWAI')
  })

  it('identifies a node by index and context, never by its text', () => {
    const before = parsed()
    const filled = syntheticDocumentXml().replace(
      'Perekayasa Ahli Pertama',
      'Analis Kebijakan Ahli Muda',
    )
    const after = parsed(filled)
    const i = before.textNodes.findIndex((node) => node.text === 'Perekayasa Ahli Pertama')
    expect(after.textNodes[i]?.contextHash).toBe(before.textNodes[i]?.contextHash)
  })

  it('flags adjacent same-formatting runs as possibly one split value', () => {
    const doc = parsed()
    const selama = doc.textNodes.find((node) => node.text === 'Selama ')
    expect(selama?.mergeableWithNext).toBe(true)
  })

  it('does not flag a node whose neighbour is in another paragraph', () => {
    const doc = parsed()
    const last = doc.textNodes.find((node) => node.text === 'SURAT PERMINTAAN IZIN CUTI')
    expect(last?.mergeableWithNext).toBe(false)
  })
})

describe('checkbox cells', () => {
  it('finds every one — they carry no w:t, so text nodes miss them entirely', () => {
    const doc = parsed()
    // Six leave types in section II, four each in VII and VIII.
    expect(doc.checkboxCells.length).toBe(14)
    expect(doc.textNodes.some((node) => node.text.trim() === '')).toBe(false)
  })

  it('labels each one from its row, so the mapper can name them', () => {
    const doc = parsed()
    expect(doc.checkboxCells.map((cell) => cell.context.rowLabel)).toEqual([
      'Cuti Tahunan',
      'Cuti Besar',
      'Cuti Sakit',
      'Cuti Melahirkan',
      'Cuti Karena Alasan Penting',
      'Cuti di Luar Tanggungan Negara',
      'DISETUJUI',
      'PERUBAHAN',
      'DITANGGUHKAN',
      'TIDAK DISETUJUI',
      'DISETUJUI',
      'PERUBAHAN',
      'DITANGGUHKAN',
      'TIDAK DISETUJUI',
    ])
  })

  it('groups them by section, which is what a single-select group is', () => {
    const doc = parsed()
    const sections = new Set(doc.checkboxCells.map((cell) => cell.context.section))
    expect(sections).toEqual(
      new Set([
        'II. JENIS CUTI YANG DIAMBIL',
        'VII. PERTIMBANGAN ATASAN LANGSUNG',
        'VIII. KEPUTUSAN PEJABAT YANG BERWENANG',
      ]),
    )
  })

  it('reports every cell unchecked in a blank template', () => {
    expect(parsed().checkboxCells.every((cell) => !cell.checked)).toBe(true)
  })

  it('still recognises a cell as a checkbox once it carries a mark', () => {
    const doc = parsed()
    const cell = doc.checkboxCells[0]!
    const ticked =
      doc.xml.slice(0, cell.insertAt) +
      '<w:r><w:t>√</w:t></w:r>' +
      doc.xml.slice(cell.insertAt)
    const after = parsed(ticked)
    expect(after.checkboxCells.length).toBe(doc.checkboxCells.length)
    expect(after.checkboxCells[0]?.checked).toBe(true)
  })

  it('does not offer a cell that holds real content', () => {
    const doc = parsed()
    const labelCells = doc.checkboxCells.filter((cell) => cell.columnIndex !== 0)
    expect(labelCells).toEqual([])
  })
})

describe('the block model the preview renders from', () => {
  it('keeps paragraphs and tables in document order', () => {
    const doc = parsed()
    expect(doc.blocks[0]).toMatchObject({ type: 'paragraph' })
    expect(doc.blocks.some((block) => block.type === 'table')).toBe(true)
  })

  it('links each run back to its text node, so the preview can mark it', () => {
    const doc = parsed()
    const first = doc.blocks[0]
    if (first?.type !== 'paragraph') throw new Error('expected a paragraph')
    expect(first.runs[0]?.textNodeIndex).toBe(0)
  })
})

describe('refusal', () => {
  it('reports malformed xml as a value rather than throwing', () => {
    const result = parseDocument('<w:document><w:body></w:document>')
    expect(result.type).toBe('invalid')
  })
})
