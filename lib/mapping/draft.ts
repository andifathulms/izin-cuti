import { fingerprintDocument, type FingerprintTarget } from '../docx/fingerprint'
import type { ParsedDocument } from '../docx/parse'
import { type CheckboxTarget, type FieldSource, type Mapping, type Target, type TextTarget, targetIndex } from './schema'

/**
 * A mapping under construction.
 *
 * Every operation is a pure function from one draft to the next, so the map
 * screen holds a value rather than a pile of mutations, and the merge rules
 * that keep invariant 5 true are testable without a browser.
 */

export type Draft = {
  readonly name: string
  readonly targets: ReadonlyArray<Target>
}

export const EMPTY_DRAFT: Draft = { name: '', targets: [] }

export function draftFromMapping(mapping: Mapping): Draft {
  return { name: mapping.name, targets: mapping.targets }
}

export function renameDraft(draft: Draft, name: string): Draft {
  return { ...draft, name }
}

/** Ids come from the node the target sits on, so they are stable across edits. */
export function textTargetId(nodeIndex: number): string {
  return `t${nodeIndex}`
}

export function checkboxTargetId(cellIndex: number): string {
  return `c${cellIndex}`
}

export function addTextTarget(draft: Draft, nodeIndex: number, label: string): Draft {
  if (draft.targets.some((target) => claimsNode(target, nodeIndex))) return draft
  const target: TextTarget = {
    type: 'text',
    id: textTargetId(nodeIndex),
    label,
    nodeIndices: [nodeIndex],
    source: { kind: 'request', key: 'alasan' },
  }
  return { ...draft, targets: [...draft.targets, target] }
}

export function addCheckboxTarget(draft: Draft, cellIndex: number, label: string): Draft {
  if (draft.targets.some((target) => target.type === 'checkbox' && target.cellIndex === cellIndex)) {
    return draft
  }
  const target: CheckboxTarget = {
    type: 'checkbox',
    id: checkboxTargetId(cellIndex),
    label,
    cellIndex,
    group: null,
  }
  return { ...draft, targets: [...draft.targets, target] }
}

export function removeTarget(draft: Draft, id: string): Draft {
  return { ...draft, targets: draft.targets.filter((target) => target.id !== id) }
}

export function relabelTarget(draft: Draft, id: string, label: string): Draft {
  return { ...draft, targets: draft.targets.map((t) => (t.id === id ? { ...t, label } : t)) }
}

export function retypeTarget(draft: Draft, id: string, source: FieldSource): Draft {
  return {
    ...draft,
    targets: draft.targets.map((target) =>
      target.id === id && target.type === 'text' ? { ...target, source } : target,
    ),
  }
}

export function regroupTarget(draft: Draft, id: string, group: string | null): Draft {
  return {
    ...draft,
    targets: draft.targets.map((target) =>
      target.id === id && target.type === 'checkbox' ? { ...target, group } : target,
    ),
  }
}

export type MergeResult =
  | { readonly type: 'merged'; readonly draft: Draft }
  | { readonly type: 'refused'; readonly reason: string }

/**
 * Extend a text target onto the following node.
 *
 * This is the merge half of invariant 5. Word may split one value across
 * several runs; a target that covers the whole span is filled whole, and the
 * fill refuses anything that is not contiguous. The other half — flagging a
 * target as unmappable — is what happens when a person does not merge: the
 * target simply covers one node, and one node is what gets written.
 *
 * The next node has to be free. Stealing it from another target would leave
 * that target pointing at half a value, which is precisely what this is for.
 */
export function mergeWithNext(draft: Draft, id: string, document: ParsedDocument): MergeResult {
  const target = draft.targets.find((candidate) => candidate.id === id)
  if (target === undefined || target.type !== 'text') {
    return { type: 'refused', reason: 'target tidak ditemukan' }
  }

  const last = target.nodeIndices[target.nodeIndices.length - 1]
  if (last === undefined) return { type: 'refused', reason: 'target kosong' }

  const next = document.textNodes[last + 1]
  const current = document.textNodes[last]
  if (next === undefined || current === undefined) {
    return { type: 'refused', reason: 'tidak ada simpul berikutnya' }
  }
  if (next.paragraphIndex !== current.paragraphIndex) {
    return { type: 'refused', reason: 'simpul berikutnya berada di paragraf lain' }
  }
  if (draft.targets.some((other) => other.id !== id && claimsNode(other, next.index))) {
    return { type: 'refused', reason: 'simpul berikutnya sudah dipetakan ke kolom lain' }
  }

  return {
    type: 'merged',
    draft: {
      ...draft,
      targets: draft.targets.map((candidate) =>
        candidate.id === id && candidate.type === 'text'
          ? { ...candidate, nodeIndices: [...candidate.nodeIndices, next.index] }
          : candidate,
      ),
    },
  }
}

/** Drop the last node from a merged span, back towards a single node. */
export function unmergeLast(draft: Draft, id: string): Draft {
  return {
    ...draft,
    targets: draft.targets.map((target) =>
      target.id === id && target.type === 'text' && target.nodeIndices.length > 1
        ? { ...target, nodeIndices: target.nodeIndices.slice(0, -1) }
        : target,
    ),
  }
}

export type FinaliseResult =
  | { readonly type: 'ready'; readonly mapping: Mapping }
  | { readonly type: 'incomplete'; readonly problems: ReadonlyArray<string> }

/**
 * Turn a draft into a mapping, taking the document's fingerprint as it does.
 *
 * `id` and `createdAt` are supplied rather than generated. This module has no
 * clock and no randomness — the same draft and the same document produce the
 * same mapping, which is what makes it testable.
 */
export function finaliseDraft(
  draft: Draft,
  document: ParsedDocument,
  identity: { readonly id: string; readonly createdAt: string },
): FinaliseResult {
  const problems: string[] = []
  if (draft.name.trim() === '') problems.push('Pemetaan belum diberi nama.')
  if (draft.targets.length === 0) problems.push('Belum ada satu pun kolom yang dipetakan.')
  for (const target of draft.targets) {
    if (target.label.trim() === '') {
      problems.push(`Ada kolom yang belum diberi nama (${target.id}).`)
    }
  }
  if (problems.length > 0) return { type: 'incomplete', problems }

  const fingerprintTargets: FingerprintTarget[] = draft.targets.map((target) => ({
    id: target.id,
    label: target.label,
    kind: target.type,
    index: targetIndex(target),
  }))

  return {
    type: 'ready',
    mapping: {
      version: 1,
      id: identity.id,
      name: draft.name.trim(),
      createdAt: identity.createdAt,
      fingerprint: fingerprintDocument(document, fingerprintTargets),
      targets: draft.targets,
    },
  }
}

function claimsNode(target: Target, nodeIndex: number): boolean {
  return target.type === 'text' && target.nodeIndices.includes(nodeIndex)
}

/** The groups a draft already uses, so the map screen can offer them again. */
export function draftGroups(draft: Draft): ReadonlyArray<string> {
  const groups = new Set<string>()
  for (const target of draft.targets) {
    if (target.type === 'checkbox' && target.group !== null) groups.add(target.group)
  }
  return [...groups]
}
