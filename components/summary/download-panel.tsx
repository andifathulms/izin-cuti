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
 *
 * This is the foot of the form column and it does not scroll with it, so it
 * has a height budget it did not have before. The warnings keep their place
 * immediately above the buttons — §7 is specific about that, and it is the
 * last chance to notice the wrong year — but they scroll within their own
 * box past three or so, rather than pushing the buttons off the screen the
 * moment somebody has a lot of them. On a phone, where the column is the
 * whole viewport, that cap is tighter still — two warnings and a scrollbar,
 * because a panel taking half the screen leaves too little of it to type in.
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
    <section aria-label={t.downloadSection} className="no-print border-t border-rule bg-paper px-6 py-3">
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
        <ul role="status" className="mb-3 max-h-16 space-y-1 overflow-auto sm:max-h-24">
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

      {/*
       * Two outcomes, equal weight, and one utility action beside them.
       *
       * This was one primary and two secondaries, on the argument that the
       * DOCX is the safer file. It is — its layout is the office's form by
       * construction, where the PDF's is composed here — but "safer" is not
       * the same as "the one you want", and a PDF is what most offices are
       * actually sent. Ranking one above the other made the app's answer to
       * "what do I do with this" quietly wrong for the common case.
       *
       * `Pratinjau PDF` keeps its verb rather than becoming `Unduh PDF`. It
       * opens the file and the download sits inside it: looking before
       * sending is how the wrong year gets caught, and a button that says
       * download and does not download would be a lie told for symmetry.
       */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          className="rounded border border-typed bg-typed px-6 py-2 text-base font-medium text-white disabled:opacity-40"
        >
          {t.downloadDocx}
        </button>

        <button
          type="button"
          onClick={onPreviewPdf}
          disabled={disabled}
          className="rounded border border-typed bg-typed px-6 py-2 text-base font-medium text-white disabled:opacity-40"
        >
          {t.previewPdf}
        </button>

        {/* Printing is neither outcome — it is the browser's own path to
            paper, and it stays quieter than the two files. */}
        <button
          type="button"
          onClick={onPrint}
          disabled={disabled}
          className="rounded border border-rule px-4 py-2 text-base disabled:opacity-40"
        >
          {t.printPdf}
        </button>
      </div>

      {/*
       * The difference, stated between the two rather than hung off one of
       * them. With equal buttons there is no hierarchy left to imply it, so
       * the words have to carry it — and the second line is the one somebody
       * whose office wants an exact PDF actually needs.
       */}
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        <p className="max-w-[58ch] text-sm text-ink-muted">{t.pdfApproximate}</p>
        <p className="max-w-[58ch] text-sm text-ink-muted">{t.pdfExact}</p>
      </div>

      {/* The citation line: small, monospace, where the claim is made. */}
      <p className="mt-1 max-w-[72ch] font-mono text-sm text-ink-muted">
        {t.docxAuthoritative}
      </p>
    </section>
  )
}
