'use client'

import { useEffect, useRef } from 'react'
import type { PreviewBlock, PreviewModel, PreviewRun, RunState } from '@/lib/preview/model'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * The preview renders the model and does nothing else — no substitution, no
 * counting, no formatting decisions. It is the one orchestrated moment in the
 * app: the changed region is marked briefly so the effect is seen to land.
 */

export function DocumentPreview({
  locale,
  model,
  focusKey,
}: {
  locale: Locale
  model: PreviewModel | null
  /** Changes when focus moves, so the preview scrolls and marks once. */
  focusKey: string | null
}) {
  const t = strings(locale)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusKey === null) return
    const target = container.current?.querySelector('[data-focused="true"]')
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusKey])

  return (
    <section aria-label={t.preview} className="flex h-full min-h-0 flex-col">
      <div className="no-print flex items-baseline justify-between gap-4 border-b border-rule px-4 py-3">
        <h2 className="text-base font-semibold">{t.preview}</h2>
        {/* The legend contract: what this shows, and what it cannot. */}
        <p className="max-w-[46ch] text-right font-mono text-sm leading-5 text-ink/60">
          {t.previewApproximate}
        </p>
      </div>

      <div ref={container} className="min-h-0 flex-1 overflow-auto px-4 py-6">
        {model === null ? (
          <p className="text-base text-ink/60">{t.previewEmpty}</p>
        ) : (
          <article className="preview-page mx-auto max-w-[80ch] border border-rule bg-white px-8 py-10 text-base leading-6">
            <Blocks blocks={model.blocks} />
          </article>
        )}
      </div>
    </section>
  )
}

function Blocks({ blocks }: { blocks: ReadonlyArray<PreviewBlock> }) {
  return (
    <>
      {blocks.map((block) =>
        block.type === 'paragraph' ? (
          <Paragraph key={block.key} block={block} />
        ) : (
          <Table key={block.key} block={block} />
        ),
      )}
    </>
  )
}

const ALIGNMENT: Record<'left' | 'center' | 'right' | 'both', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  both: 'text-justify',
}

function Paragraph({ block }: { block: Extract<PreviewBlock, { type: 'paragraph' }> }) {
  const empty = block.runs.every((run) => run.text.trim() === '')
  return (
    <p
      className={[
        ALIGNMENT[block.alignment],
        block.bold ? 'mt-6 font-semibold' : 'mt-2',
        empty ? 'h-3' : '',
      ].join(' ')}
    >
      {block.runs.map((run, i) => (
        <Run key={i} run={run} />
      ))}
    </p>
  )
}

const RUN_STATE: Record<RunState, string> = {
  plain: '',
  typed: 'text-typed',
  derived: 'text-derived',
  unmapped: 'unmapped',
}

function Run({ run }: { run: PreviewRun }) {
  if (run.state === 'plain') return <>{run.text}</>
  return (
    <span
      data-focused={run.focused ? 'true' : undefined}
      className={[
        RUN_STATE[run.state],
        // The orchestrated moment. Reduced motion skips it entirely and loses
        // nothing — the value is already there.
        run.focused ? 'mark-changed' : '',
      ].join(' ')}
    >
      {run.text}
    </span>
  )
}

function Table({ block }: { block: Extract<PreviewBlock, { type: 'table' }> }) {
  return (
    <table className="my-4 w-full border-collapse text-base">
      <tbody>
        {block.rows.map((row, r) => (
          <tr key={r}>
            {row.cells.map((cell, c) => (
              <td
                key={c}
                className="border border-rule px-2 py-1 align-top"
                style={cell.widthTwips === null ? undefined : { width: `${cell.widthTwips / 20}pt` }}
              >
                {cell.box === null ? (
                  <Blocks blocks={cell.blocks} />
                ) : (
                  <span
                    data-focused={cell.box.focused ? 'true' : undefined}
                    className={[
                      'flex h-5 w-5 items-center justify-center border border-rule font-mono',
                      cell.box.state === 'unmapped' ? 'unmapped' : '',
                      cell.box.focused ? 'mark-changed' : '',
                      cell.box.checked ? 'text-typed' : 'text-transparent',
                    ].join(' ')}
                    aria-hidden={!cell.box.checked}
                  >
                    √
                  </span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
