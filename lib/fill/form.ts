import {
  computeDerived,
  type DerivationInputs,
  type ProfileValues,
  type RequestValues,
} from '../derive/compute'
import { derivation, EMPTY_PROFILE, EMPTY_REQUEST } from '../derive/compute'
import { checkboxGroups, textTargets, type CheckboxTarget, type Mapping } from '../mapping/schema'
import { annualLimitApplies, MAX_CUTI_TAHUNAN_DAYS, type Warning } from '../validate/checks'
import { lastDateWithinWorkingDays } from '../derive/date'

/**
 * The form, generated from the mapping.
 *
 * Only the fields this mapping actually uses appear. That is the point of the
 * whole exercise: the reference cuti form has around thirty fields, fourteen of
 * them profile and most of the rest computed, so a request costs six.
 *
 * Built here rather than in a component. Nothing is computed in a component.
 */

export type InputKind = 'text' | 'date' | 'number' | 'textarea' | 'nip'

export type FormField = {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly input: InputKind
  /**
   * Width in a six-column row, so short fields share a line.
   *
   * A date is a third, an ordinary field a half, anything with prose in it the
   * whole width. Three date pickers stacked down a page is three rows spent on
   * something the eye reads as one thing.
   */
  readonly span: 2 | 3 | 6
  /** Whether a spellchecker belongs on it. `PROSE_KEYS` is the whole rule. */
  readonly prose: boolean
  /**
   * Bounds for a date input, so the picker greys out what cannot be chosen.
   *
   * An end date cannot precede its start, and cuti tahunan cannot run past its
   * twelfth working day. A date you cannot reach is a kinder limit than a
   * warning after the fact — though the warning stays, because a request typed
   * before the type was chosen can still land outside the range.
   */
  readonly min?: string
  readonly max?: string
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
 * The only field on this form a spellchecker should touch.
 *
 * Everything else is a name, a NIP, a jabatan, a unit kerja, a phone number
 * or an address — proper nouns and digits, every one of which the browser
 * underlines in red. The product has no red in it anywhere, including on
 * validation, and a person's own name is not a misspelling. DESIGN.md §3, §10.
 *
 * Alasan cuti is the exception because it is the one place somebody writes a
 * sentence, and a sentence going to an atasan is worth checking.
 */
const PROSE_KEYS: ReadonlySet<string> = new Set(['alasan'])

/**
 * Date fields get a date input, a balance gets a number, a reason and an
 * address get room to breathe. Everything else is a line of text.
 */
const INPUT_KIND: Readonly<Record<string, InputKind>> = {
  nip: 'nip',
  atasanNip: 'nip',
  pejabatNip: 'nip',
  tanggalSurat: 'date',
  mulai: 'date',
  sampai: 'date',
  sisaCutiSebelum: 'number',
  alasan: 'textarea',
  alamat: 'textarea',
  alamatCuti: 'textarea',
}

/**
 * How a field is entered and how wide it sits.
 *
 * Exported because the profile page lays out the same fourteen fields and had
 * been deciding both for itself — the width by hand, and whether a field was a
 * NIP by testing whether its key contained the substring "nip". One rule, one
 * definition, read by both screens rather than approximated by one of them.
 */
export function fieldLayout(key: string): {
  readonly input: InputKind
  readonly span: 2 | 3 | 6
  /** Whether a spellchecker belongs on it. */
  readonly prose: boolean
} {
  const input = INPUT_KIND[key] ?? 'text'
  return {
    input,
    span: input === 'textarea' ? 6 : input === 'date' ? 2 : 3,
    prose: PROSE_KEYS.has(key),
  }
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
        const computation = derivation(source.computation)
        const computed = computeDerived(source.computation, inputs)
        derived.push({
          targetId: target.id,
          label: target.label,
          explanation: computation.explanation,
          value: computed.type === 'value' ? computed.text : '',
          unavailable: computed.type === 'value' ? null : computed.reason,
        })
        // A derived field's inputs still have to be asked for somewhere. The
        // leave dates reach the document only through derived targets, so
        // without this the form would show a computed day count and no way to
        // give it any days.
        for (const key of computation.needs.profile) push(profileKeys, key, target.id)
        for (const key of computation.needs.request) push(requestKeys, key, target.id)
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
  ): FormField => {
    const { input, span, prose } = fieldLayout(key)
    return {
      key,
      label: labels[key] ?? key,
      value,
      input,
      span,
      prose,
      targetIds,
      warnings: warnings.filter((warning) => warning.field === key),
      ...dateBounds(key, inputs.request),
    }
  }

  return {
    // Ordered as the value types declare them rather than as the mapping
    // happens to mention them, so the form reads the same way every time and
    // the dates sit together.
    profile: ordered(profileKeys, Object.keys(EMPTY_PROFILE))
      .filter(([key]) => !managed.has(key))
      .map(([key, ids]) => field(key, inputs.profile[key as keyof ProfileValues] ?? '', ids)),
    request: ordered(requestKeys, Object.keys(EMPTY_REQUEST)).map(([key, ids]) =>
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

function dateBounds(
  key: string,
  request: RequestValues,
): { min?: string; max?: string } {
  if (key !== 'sampai') return {}
  if (request.mulai.trim() === '') return {}

  const limit = annualLimitApplies(request.jenisCuti)
    ? lastDateWithinWorkingDays(request.mulai, MAX_CUTI_TAHUNAN_DAYS)
    : null

  return limit === null ? { min: request.mulai } : { min: request.mulai, max: limit }
}

function ordered(
  map: Map<string, string[]>,
  canonical: ReadonlyArray<string>,
): Array<[string, string[]]> {
  return [...map].sort(
    ([a], [b]) => indexOrLast(canonical, a) - indexOrLast(canonical, b),
  )
}

function indexOrLast(canonical: ReadonlyArray<string>, key: string): number {
  const index = canonical.indexOf(key)
  return index === -1 ? canonical.length : index
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
