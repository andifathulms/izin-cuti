// Lists every text node and checkbox cell in a .docx, with its context.
// Read-only: it never writes the document.
import { readFileSync } from 'node:fs'
import { readDocx, documentXml } from '../lib/docx/unzip'
import { parseDocument } from '../lib/docx/parse'
import { nodeList } from '../lib/mapping/nodelist'

const path = process.argv[2]
if (path === undefined) throw new Error('usage: inspect <file.docx>')

const read = readDocx(new Uint8Array(readFileSync(path)))
if (read.type !== 'read') throw new Error(`${read.type}: ${read.reason}`)
const parsed = parseDocument(documentXml(read.package))
if (parsed.type !== 'parsed') throw new Error(parsed.reason)
const doc = parsed.document

console.log(`${doc.textNodes.length} text nodes, ${doc.checkboxCells.length} checkbox cells\n`)
for (const entry of nodeList(doc, [])) {
  if (entry.kind === 'checkbox') {
    console.log(
      `□${String(entry.index).padStart(3, '0')}  [${entry.checked ? '√' : ' '}]  ${entry.section} | ${entry.rowLabel}`,
    )
    continue
  }
  const merge = entry.mergeableWithNext ? ' ~merge' : ''
  console.log(
    `T${String(entry.index).padStart(3, '0')}  ${JSON.stringify(entry.text)}${merge}` +
      `\n        ctx: ${entry.section} | ${entry.rowLabel}`,
  )
}
