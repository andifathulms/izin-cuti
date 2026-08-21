// Produces a filled sample .docx so the output can be opened in a real reader.
// Zip and XML validity are necessary but not sufficient — open it.
import { writeFileSync } from 'node:fs'
import { syntheticDocx } from '../tests/fixtures/synthetic-template'
import { readDocx, documentXml } from '../lib/docx/unzip'
import { serialiseDocx } from '../lib/docx/serialise'
import { parseDocument } from '../lib/docx/parse'
import { fillDocument } from '../lib/docx/fill'

const read = readDocx(syntheticDocx())
if (read.type !== 'read') throw new Error(read.type)
const parsedResult = parseDocument(documentXml(read.package))
if (parsedResult.type !== 'parsed') throw new Error(parsedResult.reason)
const doc = parsedResult.document
const at = (text: string) => doc.textNodes.findIndex((node) => node.text === text)

const filled = fillDocument(doc, [
  { type: 'text', nodeIndices: [at('Nama Pegawai Contoh')], value: 'Siti Rahmawati & Rekan' },
  { type: 'text', nodeIndices: [at('199001012015011001')], value: '198705122010012003' },
  { type: 'text', nodeIndices: [at('Direktorat Contoh')], value: 'Bagian Umum & Kepegawaian' },
  { type: 'text', nodeIndices: [at('Keperluan keluarga')], value: 'Alasan: "keperluan keluarga" <penting>' },
  { type: 'text', nodeIndices: [at("Jl. Contoh No. 1, Balikpapan")], value: "Jl. Ma'ruf No. 17 RT 004" },
  { type: 'checkbox', cellIndex: 0, checked: true },
  { type: 'checkbox', cellIndex: 6, checked: true },
])
if (filled.type !== 'filled') throw new Error(JSON.stringify(filled.problems, null, 2))

const out = process.argv[2] ?? 'sample-filled.docx'
writeFileSync(out, serialiseDocx(read.package, filled.xml))
console.log(`wrote ${out}`)
