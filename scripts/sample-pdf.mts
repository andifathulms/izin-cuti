// Renders the bundled form, filled, to a PDF so it can actually be looked at.
import { writeFileSync } from 'node:fs'
import { readDocx, documentXml } from '../lib/docx/unzip'
import { parseDocument } from '../lib/docx/parse'
import { applyMapping } from '../lib/mapping/apply'
import { buildPreview, resolutionFromFill } from '../lib/preview/model'
import { renderPdf, pageCount } from '../lib/pdf/render'
import { FORMULIR_CUTI_DOCX_BASE64, FORMULIR_CUTI_MAPPING } from '../lib/presets/formulir-cuti.generated'
import { JENIS_CUTI_GROUP } from '../lib/presets/formulir-cuti'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '../lib/derive/compute'

const bytes = Uint8Array.from(Buffer.from(FORMULIR_CUTI_DOCX_BASE64, 'base64'))
const read = readDocx(bytes)
if (read.type !== 'read') throw new Error(read.type)
const parsed = parseDocument(documentXml(read.package))
if (parsed.type !== 'parsed') throw new Error(parsed.reason)

const profile = {
  ...EMPTY_PROFILE,
  nama: 'Siti Rahmawati',
  nip: '198705122010012003',
  jabatan: 'Analis Kebijakan Ahli Muda',
  unitKerja: 'Direktorat Data dan Kecerdasan Buatan',
  alamat: 'Rusun ASN 3 Tower 3',
  telepon: '081355000000',
  tempatSurat: 'Nusantara',
  atasanNama: 'Budi Santoso',
  atasanNip: '197001011995031001',
  atasanJabatan: 'Direktur Data dan Kecerdasan Buatan',
  pejabatNama: 'Budi Santoso',
  pejabatNip: '197001011995031001',
  pejabatJabatan: 'Direktur Data dan Kecerdasan Buatan',
}
const request = {
  ...EMPTY_REQUEST,
  tanggalSurat: '2026-08-21',
  mulai: '2026-08-24',
  sampai: '2026-08-26',
  alasan: 'Istirahat',
  sisaCutiSebelum: '12',
}

const applied = applyMapping(parsed.document, FORMULIR_CUTI_MAPPING, {
  profile,
  request,
  checkboxChoice: { [JENIS_CUTI_GROUP]: 'cuti-tahunan' },
  checkboxState: {},
})
if (applied.type !== 'filled') throw new Error(JSON.stringify(applied, null, 2))

const filled = parseDocument(applied.xml)
if (filled.type !== 'parsed') throw new Error(filled.reason)
const model = buildPreview(
  filled.document,
  resolutionFromFill(FORMULIR_CUTI_MAPPING, applied.fields, new Set(['cuti-tahunan']), null),
)

const out = process.argv[2] ?? 'sample.pdf'
writeFileSync(out, renderPdf(model, { title: 'Formulir Cuti' }))
console.log(`wrote ${out}, ${pageCount(model)} page(s) at base size`)
