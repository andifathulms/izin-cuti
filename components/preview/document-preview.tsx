'use client'

import { useEffect, useRef } from 'react'
import type { PreviewBlock, PreviewModel, PreviewRun, RunState } from '@/lib/preview/model'
import { StateLegend } from '@/components/shell/chrome'
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

  /**
   * Bring the focused value into view — inside this pane and nowhere else.
   *
   * Not `scrollIntoView`: that scrolls every scrollable ancestor, the window
   * included. Focusing a field near the bottom of the form therefore dragged
   * the whole page back to the top, which is a strange thing for a preview to
   * do to somebody who is typing.
   *
   * Scrolling this one container by hand keeps the effect where it belongs.
   */
  useEffect(() => {
    if (focusKey === null) return
    const pane = container.current
    const target = pane?.querySelector('[data-focused="true"]')
    if (!pane || !(target instanceof HTMLElement)) return

    const offset =
      target.getBoundingClientRect().top -
      pane.getBoundingClientRect().top +
      pane.scrollTop -
      pane.clientHeight / 2

    pane.scrollTo({
      top: Math.max(0, offset),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }, [focusKey])

  return (
    // Named by its own heading rather than by a second, vaguer name: the
    // aria-label said "Pratinjau" while the heading said "Pratinjau surat",
    // so the region announced the less informative of the two.
    <section
      aria-labelledby="preview-heading"
      className="print-area flex h-full min-h-0 flex-col"
    >
      <div className="no-print space-y-2 border-b border-rule px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="preview-heading" className="text-base font-semibold">
            {t.previewHeading}
          </h2>
          {/* The legend contract: what this shows, and what it cannot. */}
          <p className="max-w-[46ch] text-right font-mono text-sm leading-5 text-ink-muted">
            {t.previewApproximate}
          </p>
        </div>
        {/* The three field states, next to the three field states. */}
        {model !== null && <StateLegend locale={locale} showUnmapped={model.hasUnmapped} />}
      </div>

      <div ref={container} className="print-area min-h-0 flex-1 overflow-auto px-4 py-6">
        {model === null ? (
          <p className="text-base text-ink-muted">{t.previewEmpty}</p>
        ) : (
          <article className="preview-page mx-auto max-w-[80ch] border border-rule bg-white px-8 py-12 text-base leading-6">
            <Blocks blocks={model.blocks} locale={locale} />
          </article>
        )}
      </div>
    </section>
  )
}

function Blocks({
  blocks,
  locale,
}: {
  blocks: ReadonlyArray<PreviewBlock>
  locale: Locale
}) {
  return (
    <>
      {blocks.map((block) =>
        block.type === 'paragraph' ? (
          <Paragraph key={block.key} block={block} />
        ) : (
          <Table key={block.key} block={block} locale={locale} />
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
  // Tabs and breaks come through as real characters; HTML would collapse them,
  // so the run that carries them keeps its whitespace.
  const whitespace = /[\t\n]/.test(run.text) ? 'whitespace-pre-wrap' : ''
  if (run.state === 'plain') return <span className={whitespace}>{run.text}</span>
  return (
    <span
      data-focused={run.focused ? 'true' : undefined}
      className={[
        RUN_STATE[run.state],
        whitespace,
        // The orchestrated moment. Reduced motion skips it entirely and loses
        // nothing — the value is already there.
        run.focused ? 'mark-changed' : '',
      ].join(' ')}
    >
      {run.text}
    </span>
  )
}

function Table({
  block,
  locale,
}: {
  block: Extract<PreviewBlock, { type: 'table' }>
  locale: Locale
}) {
  return (
    /*
     * role="presentation", and the justification the rule asks for: these are
     * the Word form's layout grid, not data. There are no header cells to mark
     * up because the source document has none, so a screen reader was entering
     * table navigation and announcing "table, 14 rows, 4 columns" over what is
     * a page layout. WCAG 1.3.1.
     *
     * The alternative — guessing which cell in a row is the label and marking
     * it <th scope="row"> — would be a heuristic over somebody's official
     * form, and the parse has no way to know. The other alternative, divs,
     * would break the print path, which relies on real table semantics.
     */
    <table role="presentation" className="my-4 w-full border-collapse text-base">
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
                  <Blocks blocks={cell.blocks} locale={locale} />
                ) : (
                  /*
                   * An unchecked box was aria-hidden — invisible to a screen
                   * reader entirely — and a checked one announced the bare
                   * character √. So a reader could not learn that six leave
                   * types exist, which is ticked, or what the stray √ they
                   * just heard belonged to. Verifying the tick is the one
                   * thing the preview exists for. WCAG 1.1.1, 1.3.1.
                   *
                   * The glyph is decoration now and the state is a word, read
                   * in document order right beside the label in the next cell.
                   */
                  <span
                    data-focused={cell.box.focused ? 'true' : undefined}
                    className={[
                      // 24px, which is --control-min: the same square as the
                      // form's own checkbox, so the box you tick and the box
                      // you check it in are the same size. It was h-5 w-5 —
                      // 20px is not on the 4px scale, `spacing` is replaced
                      // rather than extended, and the class was never emitted.
                      'flex h-6 w-6 items-center justify-center border border-rule font-mono',
                      cell.box.state === 'unmapped' ? 'unmapped' : '',
                      cell.box.focused ? 'mark-changed' : '',
                      cell.box.checked ? 'text-typed' : 'text-transparent',
                    ].join(' ')}
                  >
                    <span aria-hidden>√</span>
                    <span className="sr-only">
                      {cell.box.checked
                        ? strings(locale).previewChecked
                        : strings(locale).previewUnchecked}
                    </span>
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
