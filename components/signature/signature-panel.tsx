'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { SignaturePad, type SignaturePadHandle } from './signature-pad'
import { canvasToPng, fileToPng, trimToInk } from '@/lib/signature/browser'
import {
  DEFAULT_HEIGHT_MM,
  MAX_WIDTH_MM,
  MIN_WIDTH_MM,
  clampWidthMm,
  heightMm,
  readSignature,
  widthForHeight,
} from '@/lib/signature/signature'
import type { Signature } from '@/lib/signature/signature'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * Making a signature, in the order somebody actually does it.
 *
 * Three steps, numbered, because this genuinely is a sequence — you cannot
 * size a signature you have not made, and you cannot check where it lands
 * until it has a size. Numbering something that is not a sequence is
 * decoration; numbering this one is information. DESIGN.md §10.
 *
 * Step three has no control in it. It says where to look, because the answer
 * is already on screen in the preview and building a second, smaller preview
 * here would be a second thing to reconcile — the same argument that keeps
 * derived values out of the form.
 */

type Mode = 'drawn' | 'uploaded'

export function SignaturePanel({
  locale,
  signature,
  widthMm,
  onSet,
  onWidth,
  onRemove,
  onFocus,
  available,
}: {
  locale: Locale
  signature: Signature | null
  widthMm: number
  onSet: (signature: Signature, widthMm: number) => void
  onWidth: (widthMm: number) => void
  onRemove: () => void
  onFocus: (targetId: string | null) => void
  /** False when the mapping has no signature target to put one in. */
  available: boolean
}) {
  const t = strings(locale)
  const [mode, setMode] = useState<Mode>('drawn')
  const [editing, setEditing] = useState(signature === null)
  const [padEmpty, setPadEmpty] = useState(true)
  const [removeWhite, setRemoveWhite] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const pad = useRef<SignaturePadHandle>({ canvas: null, isEmpty: true })
  const fileInput = useRef<HTMLInputElement>(null)

  const onReady = useCallback((handle: SignaturePadHandle) => {
    pad.current = handle
  }, [])

  useEffect(() => {
    if (signature !== null) setEditing(false)
  }, [signature])

  // The URL is revoked when the bytes change or the panel goes away: a blob
  // URL holds its bytes alive, and these are somebody's handwriting.
  const previewUrl = useMemo(() => {
    if (signature === null) return null
    return URL.createObjectURL(new Blob([signature.bytes.slice().buffer as ArrayBuffer], { type: 'image/png' }))
  }, [signature])
  useEffect(() => () => {
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  if (!available) {
    return <p className="text-sm text-ink-muted">{t.signatureUnavailable}</p>
  }

  const accept = (png: Uint8Array, source: Mode) => {
    // The clock lives here, not in lib/signature — that module is pure.
    const read = readSignature(png, source, new Date().toISOString())
    if (read.type === 'rejected') {
      setProblem(read.reason)
      return
    }
    setProblem(null)
    // Sized from its height rather than kept at whatever width was last set.
    // The gap the form leaves for a signature is a height, and a fixed width
    // is a different height for every person — a square signature at 40mm wide
    // is three times too tall for the space and pushes the block open.
    onSet(read.signature, widthForHeight(read.signature.info, DEFAULT_HEIGHT_MM))
  }

  const acceptDrawing = async () => {
    const canvas = pad.current.canvas
    if (canvas === null) return
    // Trimmed to the ink, so the width chosen below is the width of the
    // signature rather than the width of the pad it was drawn in.
    const trimmed = trimToInk(canvas)
    if (trimmed === null) {
      setProblem(t.signatureNone)
      return
    }
    const result = await canvasToPng(trimmed)
    if (result.type === 'failed') {
      setProblem(result.reason)
      return
    }
    accept(result.png, 'drawn')
  }

  const acceptFile = async (file: File) => {
    const result = await fileToPng(file, { removeWhite })
    if (result.type === 'failed') {
      setProblem(result.reason)
      return
    }
    accept(result.png, 'uploaded')
  }

  const height = signature === null ? 0 : heightMm(signature.info, widthMm)

  return (
    <div className="space-y-4">
      <p className="max-w-[68ch] text-sm text-ink-muted">{t.signatureIntro}</p>

      <Step numeral="1" title={t.signatureStepMake}>
        {signature !== null && !editing ? (
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element --
                next/image optimises files it can fetch at build time. This is
                a blob URL for bytes that exist only in this tab and must never
                leave it, so there is nothing to optimise and an <img> is the
                honest element. */}
            <img
              src={previewUrl ?? ''}
              alt=""
              className="max-h-16 rounded border border-rule bg-page p-1"
            />
            <div className="text-sm">
              <p className="font-medium">
                {t.signatureSaved} ·{' '}
                <span className="text-ink-muted">
                  {signature.source === 'drawn' ? t.signatureSavedDrawn : t.signatureSavedUploaded}
                </span>
              </p>
              <p className="font-mono text-sm text-ink-muted">
                {signature.info.widthPx} × {signature.info.heightPx} px
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-rule px-3 py-1 text-sm"
            >
              {t.signatureReplace}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-rule px-3 py-1 text-sm"
            >
              {t.signatureRemove}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {(['drawn', 'uploaded'] as const).map((option) => (
                <label key={option} className="flex items-center gap-2 text-base">
                  <input
                    type="radio"
                    name="signature-mode"
                    className="box-mark"
                    checked={mode === option}
                    onChange={() => setMode(option)}
                  />
                  {option === 'drawn' ? t.signatureDraw : t.signatureUpload}
                </label>
              ))}
            </div>

            {mode === 'drawn' ? (
              <div className="space-y-2">
                <SignaturePad locale={locale} onChange={setPadEmpty} onReady={onReady} />
                <button
                  type="button"
                  onClick={() => void acceptDrawing()}
                  disabled={padEmpty}
                  className="rounded border border-typed bg-typed px-4 py-2 text-base font-medium text-white disabled:opacity-40"
                >
                  {t.signatureUse}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    className="box-mark"
                    checked={removeWhite}
                    onChange={(event) => setRemoveWhite(event.target.checked)}
                  />
                  {t.signatureRemoveWhite}
                </label>
                <p className="max-w-[64ch] text-sm text-ink-muted">{t.signatureRemoveWhiteHint}</p>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file !== undefined) void acceptFile(file)
                    // Cleared, so choosing the same file twice fires again —
                    // which is what somebody re-trying with the white-removal
                    // toggle flipped is doing.
                    event.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="rounded border border-rule px-4 py-2 text-base"
                >
                  {t.signatureChooseFile}
                </button>
              </div>
            )}
          </div>
        )}

        {problem !== null && (
          <p className="mt-2 flex max-w-[64ch] items-baseline gap-2 text-sm">
            <span aria-hidden className="text-attention">
              ▲
            </span>
            <span>{problem}</span>
          </p>
        )}
      </Step>

      <Step numeral="2" title={t.signatureStepSize} muted={signature === null}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <input
            type="range"
            min={MIN_WIDTH_MM}
            max={MAX_WIDTH_MM}
            step={1}
            value={widthMm}
            disabled={signature === null}
            aria-label={t.signatureWidth}
            onChange={(event) => onWidth(clampWidthMm(Number(event.target.value)))}
            onFocus={() => onFocus('tanda-tangan')}
            onBlur={() => onFocus(null)}
            className="w-[14rem] accent-[color:var(--typed)] disabled:opacity-40"
          />
          <p className="font-mono text-base text-typed">
            {widthMm} × {height === 0 ? '—' : height.toFixed(0)} mm
          </p>
        </div>
        <p className="mt-1 max-w-[64ch] text-sm text-ink-muted">{t.signatureWidthHint}</p>
      </Step>

      <Step numeral="3" title={t.signatureStepCheck} muted={signature === null}>
        <p className="max-w-[68ch] text-sm text-ink-muted">{t.signatureStepCheckHint}</p>
      </Step>

      <p className="max-w-[72ch] text-sm text-ink-subtle">{t.signaturePrivacy}</p>
    </div>
  )
}

/** A numbered step. The numeral is the order, which here is real. */
function Step({
  numeral,
  title,
  muted = false,
  children,
}: {
  numeral: string
  title: string
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={muted ? 'opacity-60' : ''}>
      <h3 className="flex items-baseline gap-3 border-b border-rule pb-1">
        <span aria-hidden className="font-mono text-sm text-ink-subtle">
          {numeral}
        </span>
        <span className="text-base font-medium">{title}</span>
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}
