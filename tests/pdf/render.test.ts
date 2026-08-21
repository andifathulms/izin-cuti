import { describe, expect, it } from 'vitest'
import { measure, wrap } from '@/lib/pdf/metrics'
import { renderPdf, pageCount } from '@/lib/pdf/render'
import { writePdf, A4 } from '@/lib/pdf/write'
import { buildPreview, resolutionFromFill, NOTHING } from '@/lib/preview/model'
import { readDocx, documentXml } from '@/lib/docx/unzip'
import { parseDocument } from '@/lib/docx/parse'
import { applyMapping } from '@/lib/mapping/apply'
import {
  FORMULIR_CUTI_DOCX_BASE64,
  FORMULIR_CUTI_MAPPING,
} from '@/lib/presets/formulir-cuti.generated'
import { JENIS_CUTI_GROUP } from '@/lib/presets/formulir-cuti'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')

function filledModel() {
  const read = readDocx(Uint8Array.from(Buffer.from(FORMULIR_CUTI_DOCX_BASE64, 'base64')))
  if (read.type !== 'read') throw new Error(read.type)
  const parsed = parseDocument(documentXml(read.package))
  if (parsed.type !== 'parsed') throw new Error(parsed.reason)

  const applied = applyMapping(parsed.document, FORMULIR_CUTI_MAPPING, {
    profile: {
      ...EMPTY_PROFILE,
      nama: 'Siti Rahmawati',
      nip: '198705122010012003',
      jabatan: 'Analis Kebijakan Ahli Muda',
      unitKerja: 'Direktorat Contoh',
      alamat: 'Rusun ASN 3 Tower 3',
      telepon: '081355000000',
      tempatSurat: 'Nusantara',
      atasanNama: 'Budi Santoso',
      atasanNip: '197001011995031001',
      atasanJabatan: 'Direktur Contoh',
      pejabatNama: 'Budi Santoso',
      pejabatNip: '197001011995031001',
      pejabatJabatan: 'Direktur Contoh',
    },
    request: {
      ...EMPTY_REQUEST,
      tanggalSurat: '2026-08-21',
      mulai: '2026-08-24',
      sampai: '2026-08-26',
      alasan: 'Istirahat',
      sisaCutiSebelum: '12',
    },
    checkboxChoice: { [JENIS_CUTI_GROUP]: 'cuti-tahunan' },
    checkboxState: {},
  })
  if (applied.type !== 'filled') throw new Error('fill refused')

  const filled = parseDocument(applied.xml)
  if (filled.type !== 'parsed') throw new Error(filled.reason)
  return buildPreview(
    filled.document,
    resolutionFromFill(
      FORMULIR_CUTI_MAPPING,
      applied.fields,
      new Set(['cuti-tahunan']),
      null,
    ),
  )
}

describe('the file itself', () => {
  it('is a PDF a reader will open', () => {
    const pdf = text(renderPdf(filledModel()))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf).toContain('/Type /Catalog')
    expect(pdf).toContain('/Type /Pages')
  })

  it('records a byte offset for every object', () => {
    // The cross-reference table is byte offsets. One wrong number and the file
    // opens as a blank page or not at all.
    const pdf = text(renderPdf(filledModel()))
    const declared = /\/Size (\d+)/.exec(pdf)
    const entries = pdf.slice(pdf.indexOf('xref')).match(/^\d{10} \d{5} [nf] $/gm) ?? []
    expect(entries.length).toBe(Number(declared?.[1]))

    for (const entry of entries.slice(1)) {
      const offset = Number(entry.slice(0, 10))
      expect(pdf.slice(offset)).toMatch(/^\d+ 0 obj/)
    }
  })

  it('embeds nothing — the three fonts are ones every reader has', () => {
    const pdf = text(renderPdf(filledModel()))
    expect(pdf).toContain('/BaseFont /Helvetica')
    expect(pdf).toContain('/BaseFont /Helvetica-Bold')
    expect(pdf).toContain('/BaseFont /Symbol')
    expect(pdf).not.toContain('/FontFile')
  })

  it('is small, because it holds text rather than a picture of text', () => {
    expect(renderPdf(filledModel()).length).toBeLessThan(60_000)
  })

  it('is deterministic — same document, same values, same bytes', () => {
    const model = filledModel()
    expect(Array.from(renderPdf(model))).toEqual(Array.from(renderPdf(model)))
  })
})

describe('what is on the page', () => {
  const pdf = () => text(renderPdf(filledModel()))

  it('carries the filled values as selectable text', () => {
    expect(pdf()).toContain('(Siti Rahmawati) Tj')
    expect(pdf()).toContain('(Istirahat) Tj')
  })

  it('writes the NIP in its groups', () => {
    expect(pdf()).toContain('19870512 201001 2 003')
  })

  it('writes the computed day count', () => {
    // The cell reads "3 hari)*" — the closing bracket belongs to the form's own
    // footnote marker, and it comes out escaped, which is the point.
    expect(pdf()).toContain('(3 hari\\)*) Tj')
  })

  it('ticks the chosen box with the radical from Symbol', () => {
    // Helvetica has no radical sign, and a missing glyph in a tick box is a
    // form that reads as unticked.
    expect(pdf()).toMatch(/\/F3 [\d.]+ Tf/)
  })

  it('draws the table rules', () => {
    expect(pdf()).toMatch(/[\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S/)
  })

  it('escapes the characters that would break a PDF string', () => {
    // The same class of defect as the unescaped ampersand in the docx.
    const model = filledModel()
    const rendered = text(renderPdf(model))
    const suspicious = rendered.match(/\([^)\\]*\)[^\s]/g) ?? []
    expect(suspicious.filter((part) => !part.endsWith(' ')).length).toBe(0)
  })
})

describe('fitting the page', () => {
  it('comes out as one page', () => {
    // The form is one page in Word. A signature block alone on a second page
    // is the failure people notice.
    const pdf = text(renderPdf(filledModel()))
    expect((pdf.match(/\/Type \/Page[^s]/g) ?? []).length).toBe(1)
  })

  it('would need more than one page without shrinking, which is why it shrinks', () => {
    expect(pageCount(filledModel())).toBeGreaterThan(1)
  })

  it('leaves the page count alone when asked not to fit', () => {
    const pdf = text(renderPdf(filledModel(), { fitOnePage: false }))
    expect((pdf.match(/\/Type \/Page[^s]/g) ?? []).length).toBeGreaterThan(1)
  })

  it('uses A4', () => {
    expect(text(renderPdf(filledModel()))).toContain('/MediaBox [0 0 595.28 841.89]')
  })
})

describe('measuring and wrapping', () => {
  it('measures a string from real glyph widths', () => {
    // Not an average: 'i' and 'W' are wildly different, and a guess overflows
    // the column on a ruled form where it shows.
    expect(measure('W', 10, 'regular')).toBeGreaterThan(measure('i', 10, 'regular'))
    expect(measure('', 10, 'regular')).toBe(0)
  })

  it('wraps at word boundaries', () => {
    const lines = wrap('Direktorat Data dan Kecerdasan Buatan', 60, 9, 'regular')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe('Direktorat Data dan Kecerdasan Buatan')
  })

  it('breaks a single word too long for its column rather than overflowing', () => {
    const lines = wrap('198705122010012003198705122010012003', 30, 9, 'regular')
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(measure(line, 9, 'regular')).toBeLessThanOrEqual(30)
  })

  it('keeps an explicit line break, which is how a signature block stacks', () => {
    expect(wrap('Direktur\nBudi Santoso', 500, 9, 'regular')).toEqual([
      'Direktur',
      'Budi Santoso',
    ])
  })
})

describe('an empty document', () => {
  it('still produces a valid file rather than throwing', () => {
    const pdf = text(writePdf([{ width: A4.width, height: A4.height, ops: [] }], 'Kosong'))
    expect(pdf.startsWith('%PDF')).toBe(true)
  })

  it('renders a model with nothing in it', () => {
    expect(renderPdf({ blocks: [] }).length).toBeGreaterThan(0)
    expect(pageCount(buildPreview({ xml: '', textNodes: [], checkboxCells: [], blocks: [], structuralHash: '' }, NOTHING))).toBe(1)
  })
})
