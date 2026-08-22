'use client'

import type { FilledField } from '@/lib/mapping/apply'
import type { Warning } from '@/lib/validate/checks'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * The download moment. A person has just produced an official document.
 *
 * What was once a three-column summary of every filled, computed and ticked
 * value is gone: the preview beside the form already shows all of it, in the
 * document's own layout, which is a better last look than a list of the same
 * values in a different order.
 *
 * What survives is the part the preview cannot do — **the warnings**. That is
 * the "last chance to notice the wrong year" DESIGN.md §7 asks for, and it is
 * the only reason a summary was there. Amber marks it, ink explains it, and
 * nothing here can stop a download.
 *
 * Three actions, clearly unequal, with the approximation note beside the two
 * that produce a PDF. No confetti, no toast. The file downloads.
 */
export function DownloadPanel({
  locale,
  fields,
  warnings,
  disabled,
  onDownload,
  onPreviewPdf,
  onPrint,
}: {
  locale: Locale
  fields: ReadonlyArray<FilledField>
  warnings: ReadonlyArray<Warning>
  disabled: boolean
  onDownload: () => void
  onPreviewPdf: () => void
  onPrint: () => void
}) {
  const t = strings(locale)
  // A derived field still waiting on an input means a blank space in the
  // document. Worth saying once, here, rather than letting it be discovered.
  const pending = fields.filter((field) => field.unavailable !== null)

  return (
    <section aria-label={t.downloadSection} className="no-print border-t border-rule px-6 py-4">
      {/*
       * The last chance to notice the wrong year was silent: warnings appear
       * and vanish while somebody types, and nothing announced them. WCAG
       * 4.1.3.
       *
       * role="status" rather than a native element because there is no native
       * live region — <output> names a form calculation, which these are not.
       * Polite and aggregated here rather than on each field: the per-field
       * list is already tied to its input by aria-describedby, and making
       * every one of them live would talk over every keystroke.
       */}
      {(warnings.length > 0 || pending.length > 0) && (
        <ul role="status" className="mb-4 space-y-1">
          {warnings.map((warning) => (
            <li key={warning.id} className="flex items-baseline gap-2 text-sm">
              <span aria-hidden className="text-attention">
                ▲
              </span>
              <span>{warning.message}</span>
            </li>
          ))}
          {pending.map((field) => (
            <li key={field.id} className="flex items-baseline gap-2 text-sm">
              <span aria-hidden className="text-attention">
                ▲
              </span>
              <span>
                {field.label} — {field.unavailable}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          className="rounded border border-typed bg-typed px-6 py-2 text-base font-medium text-white disabled:opacity-40"
        >
          {t.downloadDocx}
        </button>

        <div className="flex max-w-[46ch] flex-col gap-1">
          <div className="flex gap-2">
            {/* Look at it, then download from there. Downloading a PDF
                unseen is how the wrong year reaches an atasan. */}
            <button
              type="button"
              onClick={onPreviewPdf}
              disabled={disabled}
              className="rounded border border-rule px-4 py-2 text-base disabled:opacity-40"
            >
              {t.previewPdf}
            </button>
            <button
              type="button"
              onClick={onPrint}
              disabled={disabled}
              className="rounded border border-rule px-4 py-2 text-base disabled:opacity-40"
            >
              {t.printPdf}
            </button>
          </div>
          {/* Beside the buttons, not hidden behind them. */}
          <p className="text-sm text-ink-muted">{t.pdfApproximate}</p>
        </div>

        <p className="font-mono text-sm text-ink-muted">{t.docxAuthoritative}</p>
      </div>
    </section>
  )
}
