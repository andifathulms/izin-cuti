import {
  computeDerived,
  type DerivationInputs,
  type ProfileValues,
  type RequestValues,
} from '../derive/compute'
import { derivation } from '../derive/compute'
import { checkboxGroups, textTargets, type CheckboxTarget, type Mapping } from '../mapping/schema'
import type { Warning } from '../validate/checks'

/**
 * The form, generated from the mapping.
 *
 * Only the fields this mapping actually uses appear. That is the point of the
 * whole exercise: the reference cuti form has around thirty fields, fourteen of
 * them profile and most of the rest computed, so a request costs six.
 *
 * Built here rather than in a component. Nothing is computed in a component.
 */

export type InputKind = 'text' | 'date' | 'number' | 'textarea'

export type FormField = {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly input: InputKind
  /** Target ids that write this value, so focusing the field marks the preview. */
  readonly targetIds: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<Warning>
}

export type DerivedRow = {
  readonly targetId: string
  readonly label: string
  readonly explanation: string
  readonly value: string
  readonly unavailable: string | null
}

export type ChoiceGroup = {
  readonly group: string
  readonly options: ReadonlyArray<CheckboxTarget>
  readonly chosen: string | null
}

export type FormModel = {
  readonly profile: ReadonlyArray<FormField>
  readonly request: ReadonlyArray<FormField>
  readonly derived: ReadonlyArray<DerivedRow>
  readonly groups: ReadonlyArray<ChoiceGroup>
  readonly standalone: ReadonlyArray<{ readonly target: CheckboxTarget; readonly checked: boolean }>
}

/**
 * Date fields get a date input, a balance gets a number, a reason and an
 * address get room to breathe. Everything else is a line of text.
 */
const INPUT_KIND: Readonly<Record<string, InputKind>> = {
  tanggalSurat: 'date',
  mulai: 'date',
  sampai: 'date',
  sisaCutiSebelum: 'number',
  alasan: 'textarea',
  alamat: 'textarea',
  alamatCuti: 'textarea',
}

export function buildForm(
  mapping: Mapping,
  inputs: DerivationInputs,
  labels: Readonly<Record<string, string>>,
  warnings: ReadonlyArray<Warning>,
  checkboxChoice: Readonly<Record<string, string | null>>,
  checkboxState: Readonly<Record<string, boolean>>,
  /**
   * Profile keys some other control already owns — the direktorat selector
   * fills the direktur's name and NIP, so the form must not also ask for them.
   * They are still written into the document; they are just not asked twice.
   */
  managed: ReadonlySet<string> = new Set(),
): FormModel {
  const profileKeys = new Map<string, string[]>()
  const requestKeys = new Map<string, string[]>()
  const derived: DerivedRow[] = []

  for (const target of textTargets(mapping)) {
    const source = target.source
    switch (source.kind) {
      case 'profile':
        push(profileKeys, source.key, target.id)
        break
      case 'request':
        push(requestKeys, source.key, target.id)
        break
      case 'derived': {
        const computed = computeDerived(source.computation, inputs)
        derived.push({
          targetId: target.id,
          label: target.label,
          explanation: derivation(source.computation).explanation,
          value: computed.type === 'value' ? computed.text : '',
          unavailable: computed.type === 'value' ? null : computed.reason,
        })
        break
      }
      default: {
        const unreachable: never = source
        throw new Error(`unhandled field source ${JSON.stringify(unreachable)}`)
      }
    }
  }

  const field = (
    key: string,
    value: string,
    targetIds: ReadonlyArray<string>,
  ): FormField => ({
    key,
    label: labels[key] ?? key,
    value,
    input: INPUT_KIND[key] ?? 'text',
    targetIds,
    warnings: warnings.filter((warning) => warning.field === key),
  })

  return {
    profile: [...profileKeys]
      .filter(([key]) => !managed.has(key))
      .map(([key, ids]) => field(key, inputs.profile[key as keyof ProfileValues] ?? '', ids)),
    request: [...requestKeys].map(([key, ids]) =>
      field(key, inputs.request[key as keyof RequestValues] ?? '', ids),
    ),
    derived,
    groups: checkboxGroups(mapping).map(({ group, options }) => ({
      group,
      options,
      chosen: checkboxChoice[group] ?? null,
    })),
    standalone: mapping.targets
      .filter((target): target is CheckboxTarget => target.type === 'checkbox' && target.group === null)
      .map((target) => ({ target, checked: checkboxState[target.id] === true })),
  }
}

function push(map: Map<string, string[]>, key: string, targetId: string): void {
  const existing = map.get(key)
  if (existing) existing.push(targetId)
  else map.set(key, [targetId])
}

/** Every box the fill will tick, by target id. */
export function checkedTargetIds(
  model: FormModel,
): ReadonlySet<string> {
  const checked = new Set<string>()
  for (const group of model.groups) {
    if (group.chosen !== null) checked.add(group.chosen)
  }
  for (const box of model.standalone) {
    if (box.checked) checked.add(box.target.id)
  }
  return checked
}

/**
 * The leave-type group, for validation.
 *
 * The mapping records groups but does not label one of them "the leave type",
 * so the first is taken. In the reference form that is section II — the only
 * single-select set the person filling it makes a choice in; VII and VIII are
 * for other people to tick.
 *
 * Taken straight from the mapping rather than from the form model, so warnings
 * do not depend on a form that depends on warnings.
 *
 * A mapping with no groups at all reports one selection, not zero: there is no
 * leave-type choice to make, and warning about a choice the form does not offer
 * is noise.
 */
export function leaveTypeSelection(
  mapping: Mapping,
  checkboxChoice: Readonly<Record<string, string | null>>,
): {
  readonly group: string | null
  readonly chosenLabel: string
  readonly count: number
} {
  const first = checkboxGroups(mapping)[0]
  if (first === undefined) return { group: null, chosenLabel: '', count: 1 }
  const chosenId = checkboxChoice[first.group] ?? null
  const chosen = first.options.find((option) => option.id === chosenId)
  return {
    group: first.group,
    chosenLabel: chosen?.label ?? '',
    count: chosen === undefined ? 0 : 1,
  }
}
