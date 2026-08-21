import { describe, expect, it } from 'vitest'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import {
  checkFingerprint,
  fingerprintDocument,
  fingerprintDigest,
  type FingerprintTarget,
} from '@/lib/docx/fingerprint'
import { fillDocument } from '@/lib/docx/fill'
import { syntheticDocumentXml, type SyntheticOptions } from '../fixtures/synthetic-template'

function parsed(options?: SyntheticOptions): ParsedDocument {
  const result = parseDocument(syntheticDocumentXml(options))
  if (result.type !== 'parsed') throw new Error(`parse failed: ${result.reason}`)
  return result.document
}

function targetsFor(doc: ParsedDocument): FingerprintTarget[] {
  const index = (text: string) => doc.textNodes.findIndex((node) => node.text === text)
  return [
    { id: 'nama', label: 'Nama', kind: 'text', index: index('Nama Pegawai Contoh') },
    { id: 'nip', label: 'NIP', kind: 'text', index: index('199001012015011001') },
    { id: 'jabatan', label: 'Jabatan', kind: 'text', index: index('Perekayasa Ahli Pertama') },
    { id: 'alasan', label: 'Alasan cuti', kind: 'text', index: index('Keperluan keluarga') },
    { id: 'cuti-tahunan', label: 'Cuti Tahunan', kind: 'checkbox', index: 0 },
  ]
}

describe('an unchanged template', () => {
  it('matches its own fingerprint', () => {
    const doc = parsed()
    const fingerprint = fingerprintDocument(doc, targetsFor(doc))
    expect(checkFingerprint(parsed(), fingerprint)).toEqual({ type: 'match' })
  })

  it('still matches after the values have been filled in', () => {
    const doc = parsed()
    const fingerprint = fingerprintDocument(doc, targetsFor(doc))
    const filled = fillDocument(doc, [
      {
        type: 'text',
        nodeIndices: [doc.textNodes.findIndex((n) => n.text === 'Nama Pegawai Contoh')],
        value: 'Siti Rahmawati',
      },
      { type: 'checkbox', cellIndex: 0, checked: true },
    ])
    if (filled.type !== 'filled') throw new Error('fill refused')
    const after = parseDocument(filled.xml)
    if (after.type !== 'parsed') throw new Error('re-parse failed')

    // A fingerprint that broke when the form was filled would be useless — the
    // second month you use the tool, you upload a template you already used.
    expect(checkFingerprint(after.document, fingerprint)).toEqual({ type: 'match' })
  })

  it('has a stable digest', () => {
    const a = fingerprintDocument(parsed(), targetsFor(parsed()))
    const b = fingerprintDocument(parsed(), targetsFor(parsed()))
    expect(fingerprintDigest(a)).toBe(fingerprintDigest(b))
  })
})

describe('a changed template is refused, with the differences named', () => {
  it('catches a row the office added', () => {
    const doc = parsed()
    const fingerprint = fingerprintDocument(doc, targetsFor(doc))
    const result = checkFingerprint(parsed({ variant: 'extra-node' }), fingerprint)

    expect(result.type).toBe('mismatch')
    if (result.type !== 'mismatch') return
    expect(result.differences).toContainEqual({
      type: 'text-node-count',
      expected: fingerprint.textNodeCount,
      found: fingerprint.textNodeCount + 3,
    })
    expect(result.differences).toContainEqual({ type: 'structure' })
  })

  it('catches a row the office removed', () => {
    const doc = parsed()
    const fingerprint = fingerprintDocument(doc, targetsFor(doc))
    const result = checkFingerprint(parsed({ variant: 'removed-node' }), fingerprint)
    expect(result.type).toBe('mismatch')
  })

  it('catches an edited label, which shifts nothing and changes everything', () => {
    const doc = parsed()
    const fingerprint = fingerprintDocument(doc, targetsFor(doc))
    const result = checkFingerprint(parsed({ variant: 'edited-label' }), fingerprint)

    expect(result.type).toBe('mismatch')
    if (result.type !== 'mismatch') return

    // Node counts and structure are identical here. Only the per-target context
    // catches it — which is why the fingerprint carries context at all.
    expect(result.differences.some((d) => d.type === 'text-node-count')).toBe(false)
    expect(result.differences.some((d) => d.type === 'structure')).toBe(false)

    const contextDifference = result.differences.find((d) => d.type === 'target-context')
    expect(contextDifference).toMatchObject({ id: 'jabatan', label: 'Jabatan' })
    expect(
      contextDifference?.type === 'target-context' && contextDifference.foundContext,
    ).toContain('Jabatan / Pangkat')
  })

  it('names a target that has gone off the end of the document', () => {
    const doc = parsed()
    const fingerprint = fingerprintDocument(doc, [
      ...targetsFor(doc),
      { id: 'hantu', label: 'Tidak ada', kind: 'text', index: 9999 },
    ])
    const result = checkFingerprint(parsed(), fingerprint)
    expect(result.type).toBe('mismatch')
    if (result.type !== 'mismatch') return
    expect(result.differences).toContainEqual({
      type: 'target-missing',
      id: 'hantu',
      label: 'Tidak ada',
      kind: 'text',
      index: 9999,
    })
  })

  it('collects every difference rather than stopping at the first', () => {
    const doc = parsed()
    const fingerprint = fingerprintDocument(doc, targetsFor(doc))
    const result = checkFingerprint(parsed({ variant: 'extra-node' }), fingerprint)
    expect(result.type === 'mismatch' && result.differences.length).toBeGreaterThan(1)
  })

  it('gives a different digest for a different template', () => {
    const doc = parsed()
    const a = fingerprintDocument(doc, targetsFor(doc))
    const b = fingerprintDocument(parsed({ variant: 'extra-node' }), targetsFor(doc))
    expect(fingerprintDigest(a)).not.toBe(fingerprintDigest(b))
  })
})
