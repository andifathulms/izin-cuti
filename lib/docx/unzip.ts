import { unzipSync, strFromU8 } from 'fflate'

/**
 * A docx is a zip. This reads one into memory and nothing more — no
 * interpretation, no normalisation, no reordering. Every part is kept, in the
 * order the package listed it, because everything except `word/document.xml`
 * is going back out byte-for-byte. Invariant 3.
 */

export const DOCUMENT_PART = 'word/document.xml'

export type PackagePart = {
  readonly path: string
  readonly data: Uint8Array
}

export type DocxPackage = {
  /** Every part, in package order. */
  readonly parts: ReadonlyArray<PackagePart>
}

export type ReadResult =
  | { type: 'read'; package: DocxPackage }
  | { type: 'not-a-zip'; reason: string }
  | { type: 'not-a-docx'; reason: string }

/** Read a .docx from its bytes. Never throws — the failure is a value. */
export function readDocx(bytes: Uint8Array): ReadResult {
  let raw: Record<string, Uint8Array>
  try {
    raw = unzipSync(bytes)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unreadable archive'
    return { type: 'not-a-zip', reason }
  }

  const parts: PackagePart[] = Object.entries(raw)
    .filter(([path]) => !path.endsWith('/'))
    .map(([path, data]) => ({ path, data }))

  if (parts.length === 0) return { type: 'not-a-zip', reason: 'archive is empty' }
  if (!parts.some((part) => part.path === DOCUMENT_PART)) {
    return { type: 'not-a-docx', reason: `package has no ${DOCUMENT_PART}` }
  }
  return { type: 'read', package: { parts } }
}

/** The main document part as text. Present by construction once `readDocx` succeeds. */
export function documentXml(pkg: DocxPackage): string {
  const part = pkg.parts.find((candidate) => candidate.path === DOCUMENT_PART)
  if (part === undefined) {
    throw new Error(`package has no ${DOCUMENT_PART} — readDocx should have refused it`)
  }
  return strFromU8(part.data)
}

/** Every part except the one we modify. Used to assert passthrough. */
export function untouchedParts(pkg: DocxPackage): ReadonlyArray<PackagePart> {
  return pkg.parts.filter((part) => part.path !== DOCUMENT_PART)
}
