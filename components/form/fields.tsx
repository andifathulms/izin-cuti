'use client'

import type { ChoiceGroup, DerivedRow, FormField } from '@/lib/fill/form'
import { formatNip, normaliseNip } from '@/lib/derive/nip'
import type { CheckboxTarget } from '@/lib/mapping/schema'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * The three field states, which are the semantic core of this app.
 *
 * A typed field is an input. A derived field is a *result* — never an input
 * styled as disabled, because a person who sees a greyed-out box wonders what
 * they did wrong, and a screen reader skips a disabled field whose value is in
 * the document. The colour already said it is computed. DESIGN.md §3, §9.
 */

export function TextField({
  field,
  onChange,
  onFocus,
}: {
  field: FormField
  onChange: (value: string) => void
  onFocus: (targetId: string | null) => void
}) {
  const id = `field-${field.key}`
  const warningId = `${id}-warning`
  const hasWarning = field.warnings.length > 0

  // A NIP is shown in its four groups and stored as eighteen digits. Grouped
  // is how it appears on the card somebody is copying from, and eighteen
  // digits in an unbroken run have to be counted with a finger.
  const isNip = field.input === 'nip'
  const shown = isNip ? formatNip(field.value) : field.value

  const shared = {
    id,
    value: shown,
    'aria-describedby': hasWarning ? warningId : undefined,
    onChange: (event: { target: { value: string } }) =>
      onChange(isNip ? normaliseNip(event.target.value) : event.target.value),
    onFocus: () => onFocus(field.targetIds[0] ?? null),
    onBlur: () => onFocus(null),
    className: [
      'mt-1 w-full rounded border bg-white px-2 py-1 text-base text-typed',
      hasWarning ? 'border-attention' : 'border-rule',
      field.input === 'number' || field.input === 'date' || isNip ? 'font-mono' : '',
    ].join(' '),
  }

  return (
    <div>
      {/* A real label, never a placeholder. Placeholders vanish on focus and
          are unusable in a form this long. DESIGN.md §9. */}
      <label htmlFor={id} className="block text-sm font-medium">
        {field.label}
      </label>

      {field.input === 'textarea' ? (
        <textarea {...shared} rows={2} />
      ) : (
        <input
          {...shared}
          type={field.input === 'number' ? 'number' : isNip ? 'text' : field.input}
          inputMode={isNip ? 'numeric' : undefined}
          min={field.min}
          max={field.max}
        />
      )}

      {hasWarning && (
        <ul id={warningId} className="mt-1 space-y-1">
          {field.warnings.map((warning) => (
            <li key={warning.id} className="flex items-baseline gap-2 text-sm">
              {/* Amber warns; ink explains. Nothing here is red and nothing
                  here blocks a download. DESIGN.md §3, invariant 8. */}
              <span aria-hidden className="text-attention">
                ▲
              </span>
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DerivedField({
  locale,
  row,
  onFocus,
}: {
  locale: Locale
  row: DerivedRow
  onFocus: (targetId: string | null) => void
}) {
  const t = strings(locale)
  return (
    <div
      className="border-l-2 border-derived pl-3"
      onMouseEnter={() => onFocus(row.targetId)}
      onMouseLeave={() => onFocus(null)}
    >
      <p className="text-sm font-medium">{row.label}</p>
      <p className="font-mono text-lg text-derived">
        {row.unavailable === null ? (
          row.value
        ) : (
          <span className="text-base text-ink-subtle">
            {t.fillWaiting} — {row.unavailable}
          </span>
        )}
      </p>
      <p className="max-w-[60ch] text-sm text-ink-muted">{row.explanation}</p>
    </div>
  )
}

export function ChoiceGroupField({
  locale,
  group,
  hideLegend = false,
  onChoose,
  onFocus,
}: {
  locale: Locale
  group: ChoiceGroup
  /**
   * The section heading is already this group's name. Hidden from sight, kept
   * for the accessibility tree — a fieldset without a legend is a fieldset
   * nobody can hear.
   */
  hideLegend?: boolean
  onChoose: (targetId: string | null) => void
  onFocus: (targetId: string | null) => void
}) {
  return (
    <fieldset>
      <legend className={hideLegend ? 'sr-only' : 'text-sm font-medium'}>{group.group}</legend>
      <div className="mt-1 space-y-1">
        {group.options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-base">
            <input
              type="radio"
              name={group.group}
              checked={group.chosen === option.id}
              onChange={() => onChoose(option.id)}
              onFocus={() => onFocus(option.id)}
              onBlur={() => onFocus(null)}
              className="accent-[color:var(--typed)]"
            />
            {option.label}
          </label>
        ))}
        {group.chosen !== null && (
          // Was a bare `×`, announced as "times, button" and sitting under a
          // list of radios where it is the only way back to none chosen.
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="text-sm text-ink-muted underline"
          >
            {strings(locale).clearChoice}
          </button>
        )}
      </div>
    </fieldset>
  )
}

export function StandaloneBox({
  target,
  checked,
  onToggle,
  onFocus,
}: {
  target: CheckboxTarget
  checked: boolean
  onToggle: (checked: boolean) => void
  onFocus: (targetId: string | null) => void
}) {
  return (
    <label className="flex items-center gap-2 text-base">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(event.target.checked)}
        onFocus={() => onFocus(target.id)}
        onBlur={() => onFocus(null)}
        className="accent-[color:var(--typed)]"
      />
      {target.label}
    </label>
  )
}
