import { hashString } from './hash'
import type { ParsedDocument } from './parse'

/**
 * Template identity, and drift detection.
 *
 * A saved mapping points at nodes in a specific document. If the template
 * changes — a row added, a section re-ordered, a label edited — the mapping may
 * point at the wrong place, and a silently mis-filled official form is the
 * worst thing this tool can produce.
 *
 * So a mapping carries a fingerprint, and on load a changed template is
 * refused with the differences named. Refuse rather than guess. PRD §9,
 * invariant 4.
 */

export type FingerprintTarget = {
  /** The mapping's own id for this target, so a mismatch can be named. */
  readonly id: string
  /** What a person calls it — "NIP", "Nama Atasan". */
  readonly label: string
  readonly kind: 'text' | 'checkbox'
  /** Document-order index within its kind. */
  readonly index: number
}

export type Fingerprint = {
  readonly version: 1
  readonly textNodeCount: number
  readonly checkboxCellCount: number
  /** Tag structure with all text removed. */
  readonly structuralHash: string
  /** Per-target surrounding context, so a local edit is caught too. */
  readonly targets: ReadonlyArray<{
    readonly id: string
    readonly label: string
    readonly kind: 'text' | 'checkbox'
    readonly index: number
    readonly contextHash: string
  }>
}

export type Difference =
  | { readonly type: 'text-node-count'; readonly expected: number; readonly found: number }
  | { readonly type: 'checkbox-count'; readonly expected: number; readonly found: number }
  | { readonly type: 'structure' }
  | {
      readonly type: 'target-missing'
      readonly id: string
      readonly label: string
      readonly kind: 'text' | 'checkbox'
      readonly index: number
    }
  | {
      readonly type: 'target-context'
      readonly id: string
      readonly label: string
      readonly kind: 'text' | 'checkbox'
      readonly index: number
      /** What surrounds the node now — the sentence shown to the user. */
      readonly foundContext: string
    }

export type FingerprintMatch =
  | { readonly type: 'match' }
  | { readonly type: 'mismatch'; readonly differences: ReadonlyArray<Difference> }

export function fingerprintDocument(
  document: ParsedDocument,
  targets: ReadonlyArray<FingerprintTarget>,
): Fingerprint {
  return {
    version: 1,
    textNodeCount: document.textNodes.length,
    checkboxCellCount: document.checkboxCells.length,
    structuralHash: document.structuralHash,
    targets: targets.map((target) => ({
      id: target.id,
      label: target.label,
      kind: target.kind,
      index: target.index,
      contextHash: contextHashOf(document, target.kind, target.index) ?? '',
    })),
  }
}

/**
 * Compare a document against a stored fingerprint. Every difference is
 * collected rather than the first one reported — a person re-mapping wants the
 * whole picture, not one line at a time.
 */
export function checkFingerprint(
  document: ParsedDocument,
  fingerprint: Fingerprint,
): FingerprintMatch {
  const differences: Difference[] = []

  if (document.textNodes.length !== fingerprint.textNodeCount) {
    differences.push({
      type: 'text-node-count',
      expected: fingerprint.textNodeCount,
      found: document.textNodes.length,
    })
  }
  if (document.checkboxCells.length !== fingerprint.checkboxCellCount) {
    differences.push({
      type: 'checkbox-count',
      expected: fingerprint.checkboxCellCount,
      found: document.checkboxCells.length,
    })
  }
  if (document.structuralHash !== fingerprint.structuralHash) {
    differences.push({ type: 'structure' })
  }

  for (const target of fingerprint.targets) {
    const found = contextHashOf(document, target.kind, target.index)
    if (found === null) {
      differences.push({
        type: 'target-missing',
        id: target.id,
        label: target.label,
        kind: target.kind,
        index: target.index,
      })
      continue
    }
    if (found !== target.contextHash) {
      differences.push({
        type: 'target-context',
        id: target.id,
        label: target.label,
        kind: target.kind,
        index: target.index,
        foundContext: describeContext(document, target.kind, target.index),
      })
    }
  }

  return differences.length === 0 ? { type: 'match' } : { type: 'mismatch', differences }
}

function contextHashOf(
  document: ParsedDocument,
  kind: 'text' | 'checkbox',
  index: number,
): string | null {
  switch (kind) {
    case 'text':
      return document.textNodes[index]?.contextHash ?? null
    case 'checkbox':
      return document.checkboxCells[index]?.contextHash ?? null
    default: {
      const unreachable: never = kind
      throw new Error(`unhandled target kind ${String(unreachable)}`)
    }
  }
}

/** The surroundings, in words, for the refusal message. */
function describeContext(
  document: ParsedDocument,
  kind: 'text' | 'checkbox',
  index: number,
): string {
  const context =
    kind === 'text'
      ? document.textNodes[index]?.context
      : document.checkboxCells[index]?.context
  if (context === undefined) return ''
  return [context.section, context.rowLabel, context.paragraph]
    .filter((part) => part.trim() !== '')
    .join(' | ')
}

/** A short, stable identifier for a fingerprint, for showing in the UI. */
export function fingerprintDigest(fingerprint: Fingerprint): string {
  return hashString(
    [
      fingerprint.version,
      fingerprint.textNodeCount,
      fingerprint.checkboxCellCount,
      fingerprint.structuralHash,
      ...fingerprint.targets.map((t) => `${t.kind}:${t.index}:${t.contextHash}`),
    ].join('|'),
  )
}
