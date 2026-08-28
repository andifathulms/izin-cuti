'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * A pad to sign on.
 *
 * Pointer events rather than mouse and touch separately: one code path covers
 * a mouse, a finger and a stylus, and `setPointerCapture` is what keeps a
 * stroke attached when somebody's hand runs off the edge of the pad mid-word.
 *
 * Strokes are kept as points, not as pixels. The canvas is redrawn from them
 * whenever it is resized or a stroke is undone, so an undo is exact and a
 * change of window width does not turn the signature into a blur.
 *
 * The ink is `--ink` at full opacity, because this is a picture of handwriting
 * rather than a field state — the three-state palette says nothing about it.
 */

type Point = { readonly x: number; readonly y: number }
type Stroke = ReadonlyArray<Point>

export type SignaturePadHandle = {
  /** The canvas as it stands, for the caller to trim and encode. */
  readonly canvas: HTMLCanvasElement | null
  readonly isEmpty: boolean
}

export function SignaturePad({
  locale,
  onChange,
  onReady,
}: {
  locale: Locale
  /** Fired whenever the drawing changes, so the caller can enable its actions. */
  onChange: (isEmpty: boolean) => void
  onReady: (handle: SignaturePadHandle) => void
}) {
  const t = strings(locale)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const current = useRef<Point[]>([])
  const [isEmpty, setIsEmpty] = useState(true)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas === null || context === null || context === undefined) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = getComputedStyle(canvas).getPropertyValue('--ink').trim() || '#211E19'
    // Scaled with the pad so a signature drawn on a phone is not hairline on a
    // desktop, and so the exported image has a stroke thick enough to survive
    // being printed at 40mm.
    context.lineWidth = Math.max(2, canvas.width / 240)

    for (const stroke of [...strokes.current, current.current]) {
      if (stroke.length === 0) continue
      context.beginPath()
      if (stroke.length === 1) {
        // A tap is a dot. Without this, the full stop somebody puts after
        // their initials simply does not appear.
        const only = stroke[0]!
        context.arc(only.x, only.y, context.lineWidth / 2, 0, Math.PI * 2)
        context.fillStyle = context.strokeStyle
        context.fill()
        continue
      }
      context.moveTo(stroke[0]!.x, stroke[0]!.y)
      for (let i = 1; i < stroke.length; i++) context.lineTo(stroke[i]!.x, stroke[i]!.y)
      context.stroke()
    }
  }, [])

  // The backing store is sized to the device's pixels, or a signature drawn on
  // a retina screen is exported at half the resolution it was drawn at.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 3)
      const rect = canvas.getBoundingClientRect()
      const width = Math.round(rect.width * ratio)
      const height = Math.round(rect.height * ratio)
      if (width === 0 || height === 0) return
      if (canvas.width === width && canvas.height === height) return
      const scale = canvas.width === 0 ? 1 : width / canvas.width
      // The strokes are in backing-store coordinates, so they move with it.
      if (scale !== 1 && Number.isFinite(scale)) {
        strokes.current = strokes.current.map((stroke) =>
          stroke.map((point) => ({ x: point.x * scale, y: point.y * scale })),
        )
      }
      canvas.width = width
      canvas.height = height
      redraw()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [redraw])

  const announce = useCallback(() => {
    const empty = strokes.current.length === 0
    setIsEmpty(empty)
    onChange(empty)
    onReady({ canvas: canvasRef.current, isEmpty: empty })
  }, [onChange, onReady])

  useEffect(() => {
    onReady({ canvas: canvasRef.current, isEmpty: strokes.current.length === 0 })
  }, [onReady])

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const undo = () => {
    strokes.current = strokes.current.slice(0, -1)
    redraw()
    announce()
  }

  const clear = () => {
    strokes.current = []
    current.current = []
    redraw()
    announce()
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        // A pad has to be a real target, and `touch-none` is what stops a
        // finger stroke scrolling the page instead of drawing on it.
        className="h-32 w-full touch-none rounded border border-rule bg-page"
        aria-label={t.signatureDrawLabel}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          current.current = [pointAt(event)]
          redraw()
        }}
        onPointerMove={(event) => {
          if (current.current.length === 0) return
          current.current = [...current.current, pointAt(event)]
          redraw()
        }}
        onPointerUp={(event) => {
          if (current.current.length === 0) return
          event.currentTarget.releasePointerCapture(event.pointerId)
          strokes.current = [...strokes.current, current.current]
          current.current = []
          redraw()
          announce()
        }}
        onPointerCancel={() => {
          current.current = []
          redraw()
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={isEmpty}
          className="rounded border border-rule px-3 py-1 text-sm disabled:opacity-40"
        >
          {t.signatureUndo}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          className="rounded border border-rule px-3 py-1 text-sm disabled:opacity-40"
        >
          {t.signatureClear}
        </button>
        <p className="text-sm text-ink-muted">{t.signatureDrawHint}</p>
      </div>
    </div>
  )
}
