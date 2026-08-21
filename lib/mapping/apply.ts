import { checkFingerprint, type Difference } from '../docx/fingerprint'
import { fillDocument, type FillInstruction, type FillProblem } from '../docx/fill'
import type { ParsedDocument } from '../docx/parse'
import {
  computeDerived,
  type DerivationInputs,
  type ProfileValues,
  type RequestValues,
} from '../derive/compute'
import { checkboxGroups, textTargets, type Mapping, type TextTarget } from './schema'

/**
 * The one path from a mapping to a filled document — and the only place a fill
 * is authorised.
 *
 * The fingerprint is checked first, every time, and a mismatch refuses. There
 * is deliberately no best-effort mode and no override: a silently mis-filled
 * official form is the worst outcome this tool can produce, and an override is
 * how that outcome happens. Invariant 4.
 */

export type FillValues = {
  readonly profile: ProfileValues
  readonly request: RequestValues
  /** Target id per single-select group. A group with no choice stays empty. */
  readonly checkboxChoice: Readonly<Record<string, string | null>>
  /** Standalone boxes, by target id. */
  readonly checkboxState: Readonly<Record<string, boolean>>
}

export type FilledField = {
  readonly id: string
  readonly label: string
  readonly kind: 'profile' | 'request' | 'derived'
  readonly value: string
  /** Set when a derived field could not be computed yet. */
  readonly unavailable: string | null
}

export type ApplyResult =
  | {
      readonly type: 'filled'
      readonly xml: string
      /** What went in, for the summary shown before download. DESIGN.md §7. */
      readonly fields: ReadonlyArray<FilledField>
      readonly checkedLabels: ReadonlyArray<string>
    }
  | { readonly type: 'refused-drift'; readonly differences: ReadonlyArray<Difference> }
  | { readonly type: 'refused-fill'; readonly problems: ReadonlyArray<FillProblem> }

export function applyMapping(
  document: ParsedDocument,
  mapping: Mapping,
  values: FillValues,
): ApplyResult {
  const match = checkFingerprint(document, mapping.fingerprint)
  if (match.type === 'mismatch') {
    return { type: 'refused-drift', differences: match.differences }
  }

  const inputs: DerivationInputs = { profile: values.profile, request: values.request }
  const fields = textTargets(mapping).map((target) => resolveField(target, inputs))
  const { instructions, checkedLabels } = checkboxInstructions(mapping, values)

  const textInstructions: FillInstruction[] = textTargets(mapping).map((target, i) => ({
    type: 'text',
    nodeIndices: target.nodeIndices,
    value: fields[i]?.value ?? '',
  }))

  const result = fillDocument(document, [...textInstructions, ...instructions])
  if (result.type === 'refused') return { type: 'refused-fill', problems: result.problems }
  return { type: 'filled', xml: result.xml, fields, checkedLabels }
}

function resolveField(target: TextTarget, inputs: DerivationInputs): FilledField {
  const source = target.source
  switch (source.kind) {
    case 'profile':
      return {
        id: target.id,
        label: target.label,
        kind: 'profile',
        value: inputs.profile[source.key],
        unavailable: null,
      }
    case 'request':
      return {
        id: target.id,
        label: target.label,
        kind: 'request',
        value: inputs.request[source.key],
        unavailable: null,
      }
    case 'derived': {
      const derived = computeDerived(source.computation, inputs)
      // A derived field that cannot be computed writes nothing rather than
      // writing "menunggu tanggal cuti" into an official letter.
      return {
        id: target.id,
        label: target.label,
        kind: 'derived',
        value: derived.type === 'value' ? derived.text : '',
        unavailable: derived.type === 'value' ? null : derived.reason,
      }
    }
    default: {
      const unreachable: never = source
      throw new Error(`unhandled field source ${JSON.stringify(unreachable)}`)
    }
  }
}

/**
 * Every mapped box gets an instruction, checked or unchecked. Writing the
 * unchecked ones as well is what makes a re-fill of an already-filled template
 * land in the right state instead of accumulating marks.
 *
 * A single-select group yields exactly one checked box, because only the chosen
 * id can be true. It is not possible to express two.
 */
function checkboxInstructions(
  mapping: Mapping,
  values: FillValues,
): { instructions: FillInstruction[]; checkedLabels: string[] } {
  const instructions: FillInstruction[] = []
  const checkedLabels: string[] = []
  const grouped = new Set<string>()

  for (const { group, options } of checkboxGroups(mapping)) {
    const chosen = values.checkboxChoice[group] ?? null
    for (const option of options) {
      grouped.add(option.id)
      const checked = option.id === chosen
      instructions.push({ type: 'checkbox', cellIndex: option.cellIndex, checked })
      if (checked) checkedLabels.push(option.label)
    }
  }

  for (const target of mapping.targets) {
    if (target.type !== 'checkbox' || grouped.has(target.id)) continue
    const checked = values.checkboxState[target.id] === true
    instructions.push({ type: 'checkbox', cellIndex: target.cellIndex, checked })
    if (checked) checkedLabels.push(target.label)
  }

  return { instructions, checkedLabels }
}

/** Targets whose derived values are still waiting on something. */
export function pendingDerived(fields: ReadonlyArray<FilledField>): ReadonlyArray<FilledField> {
  return fields.filter((field) => field.unavailable !== null)
}
