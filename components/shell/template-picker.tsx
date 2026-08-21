'use client'

import { useRef } from 'react'
import { useApp } from '@/components/app-state'
import { PrivacyLine } from '@/components/shell/chrome'
import { strings, type Locale } from '@/lib/i18n/strings'
import { formatLongDate } from '@/lib/derive/date'

/**
 * Choosing the document. The file is read into memory and never sent anywhere,
 * and that is said right here rather than in a footer — this is the moment a
 * person hands over a letter with their address in it.
 */
export function TemplatePicker({ locale }: { locale: Locale }) {
  const t = strings(locale)
  const { template, openTemplate, clearTemplate, setRemembered } = useApp()
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="no-print border-b border-rule px-6 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded border border-typed bg-typed/10 px-4 py-2 text-base font-medium text-typed transition-colors duration-state ease-house hover:bg-typed/15"
        >
          {t.chooseTemplate}
        </button>
        <input
          ref={input}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void openTemplate(file)
            event.target.value = ''
          }}
        />

        {template.type === 'loaded' && (
          <p className="text-base">
            <span className="font-medium">{template.fileName}</span>{' '}
            <span className="font-mono text-sm text-ink/60">
              {template.document.textNodes.length} {t.textNodes} ·{' '}
              {template.document.checkboxCells.length} {t.checkboxCells}
            </span>{' '}
            <button
              type="button"
              onClick={clearTemplate}
              className="ml-2 text-sm text-ink/60 underline"
            >
              ×
            </button>
          </p>
        )}

        {template.type === 'unreadable' && (
          // Not an error state and not red. A refusal, in ink, with the reason.
          <p className="flex items-baseline gap-2 text-base">
            <span aria-hidden className="text-attention">
              ▲
            </span>
            <span>
              {t.notADocx}{' '}
              <span className="font-mono text-sm text-ink/60">{template.reason}</span>
            </span>
          </p>
        )}
      </div>

      {template.type === 'loaded' && (
        <div className="mt-3 max-w-[80ch]">
          <label className="flex items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={template.rememberedAt !== null}
              onChange={(event) => void setRemembered(event.target.checked)}
              className="accent-[color:var(--typed)]"
            />
            {t.remember}
          </label>
          <p className="mt-1 text-sm text-ink/70">{t.rememberWhy}</p>

          {template.rememberedAt !== null && (
            <p className="mt-1 flex items-baseline gap-2 text-sm">
              <span aria-hidden className="text-attention">
                ▲
              </span>
              <span>
                {/* The date stays on screen, because a remembered template
                    never changes and nothing else can tell you that. */}
                <span className="font-mono">
                  {t.rememberedOn} {formatLongDate(template.rememberedAt) ?? template.rememberedAt}
                </span>{' '}
                {t.rememberStale}
              </span>
            </p>
          )}
        </div>
      )}

      <PrivacyLine locale={locale} className="mt-3 max-w-[80ch]" />
    </div>
  )
}
