import { describe, expect, it } from 'vitest'
import { readDocx, documentXml } from '@/lib/docx/unzip'
import { serialiseDocx } from '@/lib/docx/serialise'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import { checkFingerprint } from '@/lib/docx/fingerprint'
import { applyMapping } from '@/lib/mapping/apply'
import {
  FORMULIR_CUTI_DOCX_BASE64,
  FORMULIR_CUTI_MAPPING,
} from '@/lib/presets/formulir-cuti.generated'
import { JENIS_CUTI_GROUP } from '@/lib/presets/formulir-cuti'
import { EMPTY_PROFILE, EMPTY_REQUEST, type ProfileValues } from '@/lib/derive/compute'
import { checkWellFormed } from '../fixtures/well-formed'

/**
 * The bundled blank form, end to end.
 *
 * This is the one test that touches a real office document rather than a
 * synthetic one — and it is a *blank* one, which is the only kind that belongs
 * in a repository.
 */

function bytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(FORMULIR_CUTI_DOCX_BASE64, 'base64'))
}

function open(source: Uint8Array = bytes()): ParsedDocument {
  const read = readDocx(source)
  if (read.type !== 'read') throw new Error(read.type)
  const parsed = parseDocument(documentXml(read.package))
  if (parsed.type !== 'parsed') throw new Error(parsed.reason)
  return parsed.document
}

const profile: ProfileValues = {
  ...EMPTY_PROFILE,
  nama: 'Siti Rahmawati',
  nip: '198705122010012003',
  jabatan: 'Analis Kebijakan Ahli Muda',
  unitKerja: 'Bagian Umum & Kepegawaian',
  alamat: 'Kota Samarinda, Provinsi Kalimantan Timur',
  telepon: '+628000000000',
  tempatSurat: 'Nusantara',
  atasanNama: 'Budi Santoso',
  atasanNip: '197001011995031001',
  atasanJabatan: 'Direktur Contoh',
  pejabatNama: 'Budi Santoso',
  pejabatNip: '197001011995031001',
  pejabatJabatan: 'Direktur Contoh',
}

const request = {
  ...EMPTY_REQUEST,
  tanggalSurat: '2026-08-21',
  mulai: '2026-08-24',
  sampai: '2026-08-26',
  alasan: 'Istirahat',
  sisaCutiSebelum: '12',
}

function fill() {
  const document = open()
  const result = applyMapping(document, FORMULIR_CUTI_MAPPING, {
    profile,
    request,
    checkboxChoice: { [JENIS_CUTI_GROUP]: 'cuti-tahunan' },
    checkboxState: {},
  })
  if (result.type !== 'filled') {
    throw new Error(
      result.type === 'refused-drift'
        ? JSON.stringify(result.differences)
        : result.problems.map((problem) => problem.reason).join('; '),
    )
  }
  return result
}

const textOf = (document: ParsedDocument) => document.textNodes.map((node) => node.text)

describe('the bundled blank form', () => {
  it('is a readable docx', () => {
    const document = open()
    expect(document.textNodes.length).toBeGreaterThan(50)
    expect(textOf(document)).toContain('FORMULIR PERMINTAAN DAN PEMBERIAN CUTI')
  })

  it('carries no personal data, asserted by shape rather than by naming it', () => {
    // The obvious test would list the values the original was filled with —
    // and would thereby put every one of them in a public repository, which is
    // the exact thing being prevented. So this looks for the *shapes* instead:
    // an 18-digit NIP, a phone number, an email address.
    const document = open()
    for (const node of document.textNodes) {
      expect(node.text, `NIP-shaped value in T${node.index}`).not.toMatch(/\d{18}/)
      expect(node.text, `NIP-shaped value in T${node.index}`).not.toMatch(
        /\d{8}\s\d{6}\s\d\s\d{3}/,
      )
      expect(node.text, `phone-shaped value in T${node.index}`).not.toMatch(/\+?62\d{8,}/)
      expect(node.text, `email in T${node.index}`).not.toMatch(/@\w+\.\w+/)
    }
  })

  it('reads as its own field names, so every mapped value really was replaced', () => {
    const document = open()
    for (const target of FORMULIR_CUTI_MAPPING.targets) {
      if (target.type !== 'text') continue
      const first = target.nodeIndices[0]
      if (first === undefined) continue
      // A node still holding somebody's data would not equal its label.
      expect(document.textNodes[first]?.text, `T${first}`).toBe(target.label)
    }
  })

  it('has no box already ticked', () => {
    expect(open().checkboxCells.every((cell) => !cell.checked)).toBe(true)
  })

  it('matches the mapping shipped beside it', () => {
    expect(checkFingerprint(open(), FORMULIR_CUTI_MAPPING.fingerprint)).toEqual({
      type: 'match',
    })
  })
})

describe('filling it', () => {
  it('writes every profile field into the form', () => {
    const after = open(Uint8Array.from(Buffer.from(FORMULIR_CUTI_DOCX_BASE64, 'base64')))
    const filled = parseDocument(fill().xml)
    if (filled.type !== 'parsed') throw new Error('re-parse failed')
    const texts = textOf(filled.document)

    expect(texts).toContain('Siti Rahmawati')
    expect(texts).toContain('19870512 201001 2 003')
    expect(texts).toContain('Analis Kebijakan Ahli Muda')
    expect(texts).toContain('Bagian Umum & Kepegawaian')
    expect(after.textNodes.length).toBe(filled.document.textNodes.length)
  })

  it('computes masa kerja from the NIP, never from an input', () => {
    // TMT 201001 to a letter dated 21 Agustus 2026.
    const masaKerja = fill().fields.find((field) => field.id === 'masa-kerja')
    expect(masaKerja).toMatchObject({ kind: 'derived', value: '16 Tahun 7 Bulan' })
  })

  it('composes the letterhead from the place and the date', () => {
    expect(fill().fields.find((field) => field.id === 'tempat-tanggal')?.value).toBe(
      'Nusantara, 21 Agustus 2026',
    )
  })

  it('writes the dates in Indonesian long form', () => {
    const fields = fill().fields
    expect(fields.find((field) => field.id === 'mulai')?.value).toBe('24 Agustus 2026')
    expect(fields.find((field) => field.id === 'sampai')?.value).toBe('26 Agustus 2026')
  })

  it('writes the leave length over the coret-yang-tidak-perlu pair', () => {
    // Nodes 31 and 32 were "1 hari/" and "bulan/tahun". The span is written
    // whole, so nothing is left to strike through.
    const filled = parseDocument(fill().xml)
    if (filled.type !== 'parsed') throw new Error('re-parse failed')
    expect(filled.document.textNodes[31]?.text).toBe('3 hari')
    expect(filled.document.textNodes[32]?.text).toBe('')
  })

  it('writes the balance sentence with the arithmetic done', () => {
    expect(fill().fields.find((field) => field.id === 'sisa-cuti-kalimat')?.value).toBe(
      'Sisa cuti selanjutnya 9 hari kerja',
    )
  })

  it('prefixes the NIPs in the signature blocks', () => {
    const fields = fill().fields
    expect(fields.find((field) => field.id === 'nip-ttd')?.value).toBe(
      'NIP. 19870512 201001 2 003',
    )
    expect(fields.find((field) => field.id === 'atasan-nip')?.value).toBe(
      'NIP. 19700101 199503 1 001',
    )
  })

  it('ticks exactly one leave type', () => {
    const filled = parseDocument(fill().xml)
    if (filled.type !== 'parsed') throw new Error('re-parse failed')
    expect(filled.document.checkboxCells.filter((cell) => cell.checked).map((c) => c.index)).toEqual(
      [0],
    )
  })

  it('leaves sections VII and VIII unticked — that is somebody else’s decision', () => {
    const filled = parseDocument(fill().xml)
    if (filled.type !== 'parsed') throw new Error('re-parse failed')
    const decisionBoxes = filled.document.checkboxCells.slice(16)
    expect(decisionBoxes.every((cell) => !cell.checked)).toBe(true)
  })

  it('produces a well-formed package that unzips again', () => {
    const source = bytes()
    const read = readDocx(source)
    if (read.type !== 'read') throw new Error(read.type)
    const out = serialiseDocx(read.package, fill().xml)
    const reread = readDocx(out)
    expect(reread.type).toBe('read')
    if (reread.type !== 'read') return
    expect(checkWellFormed(documentXml(reread.package))).toEqual({ type: 'well-formed' })
  })

  it('costs six per-request answers', () => {
    // Letter date, start, end, reason, balance, and which leave type. Everything
    // else is profile or computed.
    const perRequest = new Set(
      FORMULIR_CUTI_MAPPING.targets
        .filter((target) => target.type === 'text' && target.source.kind === 'request')
        .map((target) => (target.type === 'text' && target.source.kind === 'request' ? target.source.key : '')),
    )
    expect(perRequest).toEqual(new Set(['alasan', 'sisaCutiSebelum']))
    // The dates feed derived fields rather than being written directly, so the
    // form asks for them once each and the document gets them in four places.
    const derivedCount = FORMULIR_CUTI_MAPPING.targets.filter(
      (target) => target.type === 'text' && target.source.kind === 'derived',
    ).length
    expect(derivedCount).toBeGreaterThanOrEqual(10)
  })
})
