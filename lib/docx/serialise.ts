import { zipSync, strToU8 } from 'fflate'
import { DOCUMENT_PART, type DocxPackage, type PackagePart } from './unzip'

/**
 * Re-zip a package with a new `word/document.xml`, and — only when there is a
 * signature to embed — a small, named set of other changes.
 *
 * Invariant 3 used to say `word/document.xml` and nothing else. An image
 * cannot live in the document part: OOXML requires it to be a part of its own,
 * with a relationship pointing at it and its content type declared. So the
 * invariant now names exactly what may differ — `parts.ts` lists the three —
 * and everything not named is still the exact bytes that were read, fonts and
 * existing images included.
 *
 * `changes` is optional and empty by default, so a fill with no signature
 * produces precisely the package it produced before.
 *
 * The timestamp is fixed rather than taken from a clock. `lib/docx` has no
 * clock (invariant 1), and determinism is asserted: the same template and the
 * same values must produce byte-identical output.
 */

export type PackageChanges = {
  /** Parts to add. Refused by `applyChanges` if one is already in the package. */
  readonly added?: ReadonlyArray<PackagePart>
  /** Parts to rewrite whole. Refused if one is not already in the package. */
  readonly replaced?: ReadonlyArray<PackagePart>
}

/** 1980-01-01, the earliest a zip can express. Any constant would do. */
const FIXED_MTIME = new Date(Date.UTC(1980, 0, 1)).getTime()

export function serialiseDocx(
  pkg: DocxPackage,
  newDocumentXml: string,
  changes: PackageChanges = {},
): Uint8Array {
  const replaced = new Map((changes.replaced ?? []).map((part) => [part.path, part.data]))
  const files: Record<string, [Uint8Array, { level: 0 | 6; mtime: number }]> = {}

  for (const part of pkg.parts) {
    const data =
      part.path === DOCUMENT_PART ? strToU8(newDocumentXml) : (replaced.get(part.path) ?? part.data)
    files[part.path] = [data, { level: compressionFor(part.path), mtime: FIXED_MTIME }]
  }

  // Added parts go last, so a package that gains one keeps the order it had
  // for everything else. Zip readers do not care; a byte-comparison of two
  // outputs does.
  for (const part of changes.added ?? []) {
    files[part.path] = [part.data, { level: compressionFor(part.path), mtime: FIXED_MTIME }]
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
