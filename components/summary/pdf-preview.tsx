'use client'

import { useEffect, useRef } from 'react'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * The PDF, before it is downloaded.
 *
 * The pane beside the form shows what will be *filled*; this shows what will
 * be *produced* — the real file, in the browser's own PDF reader, at the size
 * it will print. They are not the same question, and the second one is the one
 * asked immediately before handing a letter to an atasan.
 *
 * Rendered from a blob in this tab. Nothing is uploaded to be previewed, which
 * is the whole reason a PDF preview can be offered at all.
 */
export function PdfPreview({
  locale,
  url,
  onDownload,
  onClose,
}: {
  locale: Locale
  url: string
  onDownload: () => void
  onClose: () => void
}) {
  const t = strings(locale)
  const closeButton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  /*
   * `aria-modal` asserts that the rest of the page is unavailable, and it was
   * not: Tab ran from the close button into the iframe and straight out into
   * the form behind, which stayed fully interactive. Focus was also never
   * given back on close, so shutting the dialog returned somebody to the top
   * of the document. WCAG 2.4.3.
   *
   * Tab is wrapped inside the panel and the previously focused element is
   * restored on close, which makes the assertion true for our own controls.
   * What it cannot cover is the inside of the PDF iframe: once focus is in
   * another document, its keystrokes are its own. Escape still closes.
   */
  useEffect(() => {
    const previous = window.document.activeElement
    closeButton.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || panel.current === null) return
      const stops = panel.current.querySelectorAll<HTMLElement>(
        'button, iframe, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (first === undefined || last === undefined) return
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-preview-heading"
      className="no-print fixed inset-0 z-50 flex flex-col bg-ink/40 p-4"
    >
      <div
        ref={panel}
        className="mx-auto flex h-full w-full max-w-[1000px] flex-col border border-rule bg-paper"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
          {/* Named by its heading rather than by an aria-label holding the
              identical string. */}
          <h2 id="pdf-preview-heading" className="text-base font-semibold">
            {t.previewPdf}
          </h2>
          {/* Both sentences, here of all places: this is the moment somebody
              is deciding whether to send this file. */}
          <p className="flex-1 text-sm text-ink-muted">
            {t.pdfApproximate} <span className="text-ink">{t.pdfExact}</span>
          </p>
          <button
            type="button"
            onClick={onDownload}
            className="rounded border border-typed bg-typed px-4 py-2 text-base font-medium text-white"
          >
            {t.downloadPdf}
          </button>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="rounded border border-rule px-4 py-2 text-base"
          >
            {t.close}
          </button>
        </div>

        {/* The header wraps to three or four lines at 320px or at 200% zoom
            and took its space from here, shrinking the document somebody is
            about to sign towards nothing. A floor, so it cannot. */}
        <iframe
          src={url}
          title={t.previewPdf}
          className="min-h-[16rem] flex-1 bg-white"
        />
      </div>
    </div>
  )
}
