'use client'

import type { FilledField } from '@/lib/mapping/apply'
import type { Warning } from '@/lib/validate/checks'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * The download moment. A person has just produced an official document, so:
 *
 * a summary first — what was filled, what was computed, what warnings stand,
 * a last chance to notice the wrong year; two buttons, clearly unequal, with
 * the PDF's approximation note beside it rather than behind a tooltip; and no
 * confetti, no toast, no celebration. The file downloads. That is the event.
 * DESIGN.md §7.
 */
export function DownloadPanel({
  locale,
  fields,
  checkedLabels,
  warnings,
  disabled,
  onDownload,
  onPrint,
}: {
  locale: Locale
  fields: ReadonlyArray<FilledField>
  checkedLabels: ReadonlyArray<string>
  warnings: ReadonlyArray<Warning>
  disabled: boolean
  onDownload: () => void
  onPrint: () => void
}) {
  const t = strings(locale)
  const typed = fields.filter((field) => field.kind !== 'derived')
  const derived = fields.filter((field) => field.kind === 'derived')

  return (
    <section aria-label={t.summary} className="no-print border-t border-rule px-4 py-4">
      <h2 className="text-base font-semibold">{t.summary}</h2>

      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <SummaryList title={`${t.summaryFilled} (${typed.length})`}>
          {typed.map((field) => (
            <li key={field.id} className="flex justify-between gap-3">
              <span className="text-ink/70">{field.label}</span>
              <span className="text-right font-medium text-typed">{field.value || '—'}</span>
            </li>
          ))}
        </SummaryList>

        <SummaryList title={`${t.summaryDerived} (${derived.length})`}>
          {derived.map((field) => (
            <li key={field.id} className="flex justify-between gap-3">
              <span className="text-ink/70">{field.label}</span>
              <span className="text-right font-mono font-medium text-derived">
                {field.unavailable === null ? field.value || '—' : `— ${field.unavailable}`}
              </span>
            </li>
          ))}
        </SummaryList>

        <SummaryList title={`${t.summaryChecked} (${checkedLabels.length})`}>
          {checkedLabels.map((label) => (
            <li key={label} className="text-typed">
              √ {label}
            </li>
          ))}
        </SummaryList>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-medium">{t.summaryWarnings}</h3>
        {warnings.length === 0 ? (
          <p className="text-sm text-ink/60">{t.summaryNoWarnings}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {warnings.map((warning) => (
              <li key={warning.id} className="flex items-baseline gap-2 text-sm">
                <span aria-hidden className="text-attention">
                  ▲
                </span>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          className="rounded border border-typed bg-typed px-6 py-2 text-base font-medium text-white disabled:opacity-40"
        >
          {t.downloadDocx}
        </button>

        <div className="flex max-w-[46ch] flex-col gap-1">
          <button
            type="button"
            onClick={onPrint}
            disabled={disabled}
            className="self-start rounded border border-rule px-4 py-2 text-base disabled:opacity-40"
          >
            {t.printPdf}
          </button>
          {/* Beside the button, not hidden behind it. */}
          <p className="text-sm text-ink/70">{t.pdfApproximate}</p>
        </div>

        <p className="font-mono text-sm text-ink/60">{t.docxAuthoritative}</p>
      </div>
    </section>
  )
}

function SummaryList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-1 space-y-1 text-sm">{children}</ul>
    </div>
  )
}
