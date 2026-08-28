'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  PreviewBlock,
  PreviewModel,
  PreviewRun,
  PreviewSignature,
  RunState,
} from '@/lib/preview/model'
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

      {/*
       * `relative` is not decoration and nothing here is positioned against
       * it. `overflow: auto` does not make a containing block for absolutely
       * positioned descendants — only position, transform, filter and contain
       * do — so every .sr-only inside this pane was escaping the scroller and
       * landing against the initial containing block instead.
       *
       * Tailwind's .sr-only is `position: absolute` with `height: 1px`. This
       * pane renders one in every checkbox cell, at whatever depth the
       * document puts it, and each of them was extending the *page's* scroll
       * area rather than this pane's. The window then scrolled hundreds of
       * pixels past the shell into nothing, with both panes correctly clipped
       * at the shell's bottom edge and empty paper below them.
       *
       * Making the scroller the containing block puts them back inside it.
       */}
      <div
        ref={container}
        className="preview-frame print-area relative min-h-0 flex-1 overflow-auto px-4 py-8"
      >
        {/* No max-width in ch: the sheet is a page, and its width is the pane
            it is shown in — which is what --doc-unit is measured against. */}
        {model === null ? (
          <p className="text-base text-ink-muted">{t.previewEmpty}</p>
        ) : (
          <article className="preview-page border border-rule bg-page">
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
  const empty = block.runs.every((run) => run.text.trim() === '') && block.signature === null
  return (
    /*
     * No margin, and an empty paragraph is half a line.
     *
     * The margins here were an interface's idea of paragraph spacing — mt-6
     * before a bold line, mt-2 otherwise — on top of the document's own empty
     * paragraphs, which is why the preview ran so much longer than the page it
     * was previewing. `drawParagraph` in the PDF renderer gives a blank
     * paragraph half a line and everything else nothing at all; this is the
     * same rule, and the height lives in CSS where the rest of the document
     * scale does.
     */
    <p
      data-empty={empty ? 'true' : undefined}
      className={[ALIGNMENT[block.alignment], block.bold ? 'font-semibold' : ''].join(' ')}
    >
      {block.signature !== null && <SignatureImage signature={block.signature} />}
      {block.runs.map((run, i) => (
        <Run key={i} run={run} />
      ))}
    </p>
  )
}

/**
 * The signature, where it lands, at the size it lands at.
 *
 * Sized in millimetres against the document scale, so it is the same fraction
 * of the page here as it is in the DOCX — a preview that showed it at some
 * other size would answer the one question this pane exists for incorrectly.
 *
 * The object URL is made here and revoked when the bytes change or the block
 * unmounts. A blob URL keeps its bytes alive, and these are somebody's
 * handwriting.
 */
function SignatureImage({ signature }: { signature: PreviewSignature }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(
      new Blob([signature.png.slice().buffer as ArrayBuffer], { type: 'image/png' }),
    )
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [signature.png])

  if (url === null) return null
  return (
    // A blob URL for bytes that exist only in this tab: nothing for
    // next/image to fetch or optimise, and nothing that may leave the device.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      data-focused={signature.focused ? 'true' : undefined}
      className={`block ${signature.focused ? 'mark-changed' : ''}`}
      style={{
        // `--doc-unit` is one PDF point scaled to the pane. A millimetre is
        // 72/25.4 of those, so the picture is the same fraction of the page
        // here as it is on paper.
        width: `calc(${(signature.widthMm * 72) / 25.4} * var(--doc-unit))`,
        height: `calc(${(signature.heightMm * 72) / 25.4} * var(--doc-unit))`,
        marginInline: 'auto',
      }}
    />
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
    <table role="presentation" className="w-full border-collapse">
      <tbody>
        {block.rows.map((row, r) => (
          <tr key={r}>
            {row.cells.map((cell, c) => (
              <td
                key={c}
                className="border border-rule align-top"
                /*
                 * The document gives this cell a width in twips; the PDF draws
                 * it in points on a 595pt page, and --doc-unit is that same
                 * point scaled to the pane. So the columns on screen and the
                 * columns in the PDF are the same columns, rather than one
                 * being pt and the other whatever the pane happened to be.
                 */
                style={
                  cell.widthTwips === null
                    ? undefined
                    : { width: `calc(${cell.widthTwips / 20} * var(--doc-unit))` }
                }
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
                      // Sized in em, so it scales with the page.
                      //
                      // It was 24px — --control-min, on the argument that the
                      // box you tick and the box you check it in should be the
                      // same size. That held while the preview was set at
                      // interface scale. It is a facsimile of a printed cell
                      // now, and nothing here is interactive, so the target
                      // floor does not apply and a fixed 24px square would
                      // simply burst the row it sits in.
                      'flex h-[1.6em] w-[1.6em] items-center justify-center border border-rule font-mono',
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
