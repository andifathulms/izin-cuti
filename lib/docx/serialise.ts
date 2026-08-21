import { zipSync, strToU8 } from 'fflate'
import { DOCUMENT_PART, type DocxPackage } from './unzip'

/**
 * Re-zip a package with a new `word/document.xml`. Every other part is passed
 * through as the exact bytes that were read, including embedded fonts and
 * images — invariant 3.
 *
 * The timestamp is fixed rather than taken from a clock. `lib/docx` has no
 * clock (invariant 1), and determinism is asserted: the same template and the
 * same values must produce byte-identical output.
 */

/** 1980-01-01, the earliest a zip can express. Any constant would do. */
const FIXED_MTIME = new Date(Date.UTC(1980, 0, 1)).getTime()

export function serialiseDocx(pkg: DocxPackage, newDocumentXml: string): Uint8Array {
  const files: Record<string, [Uint8Array, { level: 0 | 6; mtime: number }]> = {}

  for (const part of pkg.parts) {
    const data = part.path === DOCUMENT_PART ? strToU8(newDocumentXml) : part.data
    files[part.path] = [data, { level: compressionFor(part.path), mtime: FIXED_MTIME }]
  }

  return zipSync(files, { mtime: FIXED_MTIME })
}

/**
 * Fonts and images are already compressed; running deflate over them again
 * costs time and saves nothing. XML compresses well.
 */
function compressionFor(path: string): 0 | 6 {
  return /\.(png|jpe?g|gif|emf|wmf|ttf|otf|odttf|woff2?)$/i.test(path) ? 0 : 6
}
