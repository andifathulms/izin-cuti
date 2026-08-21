import { describe, expect, it } from 'vitest'
import { readDocx, documentXml, untouchedParts, DOCUMENT_PART } from '@/lib/docx/unzip'
import { serialiseDocx } from '@/lib/docx/serialise'
import { zipSync, strToU8 } from 'fflate'
import { syntheticDocx } from '../fixtures/synthetic-template'
import { checkWellFormed } from '../fixtures/well-formed'

function open(bytes: Uint8Array) {
  const result = readDocx(bytes)
  if (result.type !== 'read') throw new Error(`expected a readable package, got ${result.type}`)
  return result.package
}

describe('readDocx', () => {
  it('reads a package and finds the main document part', () => {
    const pkg = open(syntheticDocx())
    expect(pkg.parts.map((part) => part.path)).toContain(DOCUMENT_PART)
    expect(documentXml(pkg)).toContain('SURAT PERMINTAAN IZIN CUTI')
  })

  it('refuses bytes that are not a zip, as a value rather than a throw', () => {
    const result = readDocx(new TextEncoder().encode('this is not a docx'))
    expect(result.type).toBe('not-a-zip')
  })

  it('refuses a zip that carries no word/document.xml', () => {
    const notADocx = zipSync({ 'hello.txt': strToU8('hi') })
    const result = readDocx(notADocx)
    expect(result).toEqual({
      type: 'not-a-docx',
      reason: 'package has no word/document.xml',
    })
  })
})

describe('serialiseDocx', () => {
  it('produces an archive that unzips again', () => {
    const pkg = open(syntheticDocx())
    const out = open(serialiseDocx(pkg, documentXml(pkg)))
    expect(out.parts.length).toBe(pkg.parts.length)
  })

  it('keeps every original part', () => {
    const pkg = open(syntheticDocx())
    const out = open(serialiseDocx(pkg, '<a/>'))
    expect(new Set(out.parts.map((p) => p.path))).toEqual(
      new Set(pkg.parts.map((p) => p.path)),
    )
  })

  it('passes unmodified parts through byte-for-byte, fonts included', () => {
    const pkg = open(syntheticDocx({ withBinaryPart: true }))
    const out = open(serialiseDocx(pkg, '<w:document/>'))

    for (const before of untouchedParts(pkg)) {
      const after = out.parts.find((part) => part.path === before.path)
      expect(after, `part ${before.path} is missing from the output`).toBeDefined()
      expect(Array.from(after!.data), `part ${before.path} changed`).toEqual(
        Array.from(before.data),
      )
    }
  })

  it('writes exactly the document.xml it was given', () => {
    const pkg = open(syntheticDocx())
    const replacement = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body/></w:document>'
    const out = open(serialiseDocx(pkg, replacement))
    expect(documentXml(out)).toBe(replacement)
  })

  it('leaves document.xml well-formed on a straight passthrough', () => {
    const pkg = open(syntheticDocx())
    const out = open(serialiseDocx(pkg, documentXml(pkg)))
    expect(checkWellFormed(documentXml(out))).toEqual({ type: 'well-formed' })
  })

  it('is deterministic — same package and same values, byte-identical archive', () => {
    const pkg = open(syntheticDocx())
    const xml = documentXml(pkg)
    const first = serialiseDocx(pkg, xml)
    const second = serialiseDocx(pkg, xml)
    expect(Array.from(first)).toEqual(Array.from(second))
  })

  it('survives a full read, write, read, write cycle unchanged', () => {
    const pkg = open(syntheticDocx())
    const once = serialiseDocx(pkg, documentXml(pkg))
    const twice = serialiseDocx(open(once), documentXml(open(once)))
    expect(Array.from(twice)).toEqual(Array.from(once))
  })
})
