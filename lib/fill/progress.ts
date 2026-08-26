import type { FormModel } from './form'

/**
 * How far through the form somebody is, section by section.
 *
 * The screen had no answer to "where am I and how much is left". The flow line
 * that used to sit in the header named three beats and never said which one
 * you were on, which is worse than saying nothing — it looks like a stepper
 * and is a caption.
 *
 * Computed here rather than in the rail that renders it. Nothing is computed
 * in a component. Invariant 15.
 */

export type SectionProgress = {
  /** Matches the `id` of the section it counts, so the rail can link to it. */
  readonly id: string
  readonly numeral: string
  readonly filled: number
  readonly total: number
  readonly complete: boolean
}

const filledCount = (fields: FormModel['profile']): number =>
  fields.filter((field) => field.value.trim() !== '').length

/**
 * Standalone boxes are deliberately not counted.
 *
 * A single-select group has to end with exactly one mark, so it is answerable
 * and worth counting. A lone checkbox is an option somebody may leave alone
 * for good reason, and counting it would show a section as incomplete forever
 * for the person whose form is correctly filled without it. Invariant 6, and
 * invariant 8: nothing here refuses to let a document be produced.
 */
export function sectionProgress(
  model: FormModel,
  direktoratChosen: boolean,
): ReadonlyArray<SectionProgress> {
  const chosenGroups = model.groups.filter((group) => group.chosen !== null).length

  const sections: ReadonlyArray<Omit<SectionProgress, 'complete'>> = [
    { id: 'sec-I', numeral: 'I', filled: direktoratChosen ? 1 : 0, total: 1 },
    { id: 'sec-II', numeral: 'II', filled: filledCount(model.profile), total: model.profile.length },
    { id: 'sec-III', numeral: 'III', filled: chosenGroups, total: model.groups.length },
    { id: 'sec-IV', numeral: 'IV', filled: filledCount(model.request), total: model.request.length },
  ]

  // A section with nothing in it is complete, not stuck at 0/0 forever.
  return sections.map((section) => ({ ...section, complete: section.filled >= section.total }))
}
