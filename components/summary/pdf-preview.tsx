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

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.previewPdf}
      className="no-print fixed inset-0 z-50 flex flex-col bg-ink/40 p-4"
    >
      <div className="mx-auto flex h-full w-full max-w-[1000px] flex-col border border-rule bg-paper">
        <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
          <h2 className="text-base font-semibold">{t.previewPdf}</h2>
          <p className="flex-1 text-sm text-ink/70">{t.pdfApproximate}</p>
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

        <iframe src={url} title={t.previewPdf} className="min-h-0 flex-1 bg-white" />
      </div>
    </div>
  )
}
