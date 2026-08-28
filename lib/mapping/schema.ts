import type { Fingerprint } from '../docx/fingerprint'
import type { DerivationId, ProfileValues, RequestValues } from '../derive/compute'

/**
 * What a mapping is: a list of targets in a specific document, each named and
 * given a kind, plus the fingerprint that says which document.
 *
 * A field value is `{ kind: 'profile' | 'request', key }` or
 * `{ kind: 'derived', computation }`. A derived field has nowhere to put a
 * stored value, which is invariant 7 made unrepresentable rather than forbidden.
 */

export type FieldSource =
  | { readonly kind: 'profile'; readonly key: keyof ProfileValues }
  | { readonly kind: 'request'; readonly key: keyof RequestValues }
  | { readonly kind: 'derived'; readonly computation: DerivationId }

export type TextTarget = {
  readonly type: 'text'
  readonly id: string
  /** What a person calls this — "NIP", "Nama atasan langsung". */
  readonly label: string
  /**
   * A contiguous span. More than one node when the mapper merged runs Word had
   * split; the fill writes the span whole or refuses it.
   */
  readonly nodeIndices: ReadonlyArray<number>
  readonly source: FieldSource
}

export type CheckboxTarget = {
  readonly type: 'checkbox'
  readonly id: string
  readonly label: string
  readonly cellIndex: number
  /**
   * Boxes sharing a group are a single-select set — section II allows exactly
   * one of six. Null for a box that stands alone.
   */
  readonly group: string | null
}

/**
 * Where a signature is placed.
 *
 * A paragraph rather than a node or a cell, because a signature is not a value
 * written over something that is already there — it is a drawing added to a
 * space the document deliberately leaves empty. In this form that is the four
 * blank paragraphs between "Hormat Saya," and the applicant's name.
 *
 * There is at most one per mapping and the app enforces that, but the schema
 * does not: a form with two signature blocks is a form somebody will meet.
 */
export type SignatureTarget = {
  readonly type: 'signature'
  readonly id: string
  readonly label: string
  readonly paragraphIndex: number
  /** How wide the image is drawn, in millimetres. The height follows. */
  readonly widthMm: number
}

export type Target = TextTarget | CheckboxTarget | SignatureTarget

export type Mapping = {
  readonly version: 1
  readonly id: string
  /** "Surat Permintaan Izin Cuti", "Nota Dinas". Named by whoever mapped it. */
  readonly name: string
  /** ISO timestamp supplied by the caller — this module has no clock. */
  readonly createdAt: string
  readonly fingerprint: Fingerprint
  readonly targets: ReadonlyArray<Target>
}

/** A saved profile. Typed once, reused across every document. */
export type Profile = {
  readonly version: 1
  readonly id: string
  readonly name: string
  readonly values: ProfileValues
}

export function textTargets(mapping: Mapping): ReadonlyArray<TextTarget> {
  return mapping.targets.filter((target): target is TextTarget => target.type === 'text')
}

export function checkboxTargets(mapping: Mapping): ReadonlyArray<CheckboxTarget> {
  return mapping.targets.filter((target): target is CheckboxTarget => target.type === 'checkbox')
}

export function signatureTargets(mapping: Mapping): ReadonlyArray<SignatureTarget> {
  return mapping.targets.filter((target): target is SignatureTarget => target.type === 'signature')
}

/**
 * The index a target is pinned by, whatever kind it is.
 *
 * Three call sites were computing this as "text ? first node : cellIndex",
 * which quietly meant "not text is a checkbox" — true until it was not. One
 * definition, exhaustive over the union, so adding a fourth kind is a type
 * error here rather than a signature fingerprinted against a cell index.
 */
export function targetIndex(target: Target): number {
  switch (target.type) {
    case 'text':
      return target.nodeIndices[0] ?? -1
    case 'checkbox':
      return target.cellIndex
    case 'signature':
      return target.paragraphIndex
    default: {
      const unreachable: never = target
      throw new Error(`unhandled target ${JSON.stringify(unreachable)}`)
    }
  }
}

/** Takes targets rather than a mapping, so a draft can ask the same question. */
export function claimedNodes(targets: ReadonlyArray<Target>): ReadonlySet<number> {
  const claimed = new Set<number>()
  for (const target of targets) {
    if (target.type !== 'text') continue
    for (const index of target.nodeIndices) claimed.add(index)
  }
  return claimed
}

export function claimedCells(targets: ReadonlyArray<Target>): ReadonlySet<number> {
  const claimed = new Set<number>()
  for (const target of targets) {
    if (target.type === 'checkbox') claimed.add(target.cellIndex)
  }
  return claimed
}

/** The single-select groups, in the order their first box appears. */
export function checkboxGroups(mapping: Mapping): ReadonlyArray<{
  readonly group: string
  readonly options: ReadonlyArray<CheckboxTarget>
}> {
  const groups = new Map<string, CheckboxTarget[]>()
  for (const target of checkboxTargets(mapping)) {
    if (target.group === null) continue
    const existing = groups.get(target.group)
    if (existing) existing.push(target)
    else groups.set(target.group, [target])
  }
  return [...groups].map(([group, options]) => ({ group, options }))
}
