import { describe, expect, it } from 'vitest'

import { EMU_PER_INCH, inlineDrawingRun, readPng, sizeFromWidthMm } from '@/lib/docx/image'
import { checkWellFormed } from '../fixtures/well-formed'

/** A minimal but real PNG header: signature, then an IHDR declaring w x h. */
function pngHeader(width: number, height: number, tag = 'IHDR'): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0, 0, 0, 13], 8)
  for (let i = 0; i < 4; i++) bytes[12 + i] = tag.charCodeAt(i)
  const write = (value: number, at: number) => {
    bytes[at] = (value >>> 24) & 0xff
    bytes[at + 1] = (value >>> 16) & 0xff
    bytes[at + 2] = (value >>> 8) & 0xff
    bytes[at + 3] = value & 0xff
  }
  write(width, 16)
  write(height, 20)
  return bytes
}

describe('readPng', () => {
  it('reads the dimensions out of IHDR', () => {
    expect(readPng(pngHeader(600, 200))).toEqual({
      type: 'png',
      info: { widthPx: 600, heightPx: 200 },
    })
  })

  it('reads dimensions past the signed-integer boundary', () => {
    // A width with the top bit set comes back negative under `<<` without the
    // unsigned shift, and a negative extent is a file Word will not open.
    expect(readPng(pngHeader(3000000000, 1))).toEqual({
      type: 'png',
      info: { widthPx: 3000000000, heightPx: 1 },
    })
  })

  it('refuses bytes that are not a PNG, as a value rather than a throw', () => {
    const jpeg = new Uint8Array(24)
    jpeg.set([0xff, 0xd8, 0xff, 0xe0], 0)
    expect(readPng(jpeg).type).toBe('not-a-png')
    expect(readPng(new Uint8Array(4)).type).toBe('not-a-png')
  })

  it('refuses a PNG whose first chunk is not IHDR', () => {
    const result = readPng(pngHeader(10, 10, 'IDAT'))
    expect(result).toEqual({ type: 'not-a-png', reason: 'first chunk is IDAT, not IHDR' })
  })

  it('refuses a zero dimension, which would divide by zero downstream', () => {
    expect(readPng(pngHeader(0, 10)).type).toBe('not-a-png')
    expect(readPng(pngHeader(10, 0)).type).toBe('not-a-png')
  })
})

describe('sizeFromWidthMm', () => {
  const wide = { widthPx: 600, heightPx: 200 }

  it('converts millimetres to EMU at 914400 to the inch', () => {
    expect(sizeFromWidthMm(wide, 25.4).cx).toBe(EMU_PER_INCH)
  })

  it('takes the height from the aspect ratio, never from a second number', () => {
    // A signature stretched out of proportion is not the person's signature.
    const { cx, cy } = sizeFromWidthMm(wide, 60)
    expect(cy / cx).toBeCloseTo(200 / 600, 5)
  })

  it('keeps a tall image tall', () => {
    const { cx, cy } = sizeFromWidthMm({ widthPx: 100, heightPx: 400 }, 20)
    expect(cy).toBeGreaterThan(cx)
  })

  it('never produces a zero extent, whatever the width asked for', () => {
    const { cx, cy } = sizeFromWidthMm(wide, 0)
    expect(cx).toBeGreaterThan(0)
    expect(cy).toBeGreaterThan(0)
  })
})

describe('inlineDrawingRun', () => {
  const run = (name = 'Tanda tangan') =>
    inlineDrawingRun({
      relationshipId: 'rId6',
      drawingId: 6,
      name,
      description: 'Tanda tangan pemohon',
      cx: 1000000,
      cy: 400000,
    })

  it('is a well-formed run', () => {
    expect(checkWellFormed(run()).type).toBe('well-formed')
  })

  it('declares every namespace it uses, rather than trusting the template root', () => {
    // A template not produced by Word may not declare wp/a/pic at the root,
    // and an undeclared prefix is a file Word refuses to open.
    for (const prefix of ['xmlns:wp=', 'xmlns:a=', 'xmlns:pic=', 'xmlns:r=']) {
      expect(run()).toContain(prefix)
    }
  })

  it('points at its relationship and carries the extent twice, as the schema wants', () => {
    expect(run()).toContain('r:embed="rId6"')
    expect(run().match(/cx="1000000"/g)).toHaveLength(2)
    expect(run().match(/cy="400000"/g)).toHaveLength(2)
  })

  it('escapes the name, because a name reaches an attribute', () => {
    const nasty = run('Tanda tangan "Budi" & Co <hal>')
    expect(checkWellFormed(nasty).type).toBe('well-formed')
    expect(nasty).not.toContain('"Budi"')
    expect(nasty).toContain('&amp;')
  })

  it('locks the aspect ratio, so a drag in Word cannot distort it either', () => {
    expect(run()).toContain('noChangeAspect="1"')
  })
})
