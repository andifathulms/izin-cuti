/**
 * The two ways a signature gets made, both ending at the same place.
 *
 * This is the only file in the signature path that needs a browser: a canvas
 * to draw on and a canvas to decode an uploaded file with. Everything below it
 * takes PNG bytes and does not know which route they came by.
 *
 * Not under `lib/docx`, which is pure and runs in Node — invariant 1 stands.
 */

/**
 * How large an image is kept, in pixels across.
 *
 * A signature is drawn at about 40mm wide, which at print resolution is a few
 * hundred pixels. A photograph off a phone is four thousand, and keeping it
 * would put several megabytes into local storage to render a picture the width
 * of a thumb. Downscaled on the way in, once, rather than every time it is
 * used.
 */
export const MAX_IMAGE_WIDTH_PX = 1200

export type CaptureResult =
  | { readonly type: 'captured'; readonly png: Uint8Array }
  | { readonly type: 'failed'; readonly reason: string }

/** PNG bytes out of a canvas, without going through a data URI. */
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<CaptureResult> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/png')
  })
  if (blob === null) return { type: 'failed', reason: 'canvas produced no image' }
  return { type: 'captured', png: new Uint8Array(await blob.arrayBuffer()) }
}

/**
 * An uploaded file, decoded and re-encoded as a PNG the engine can read.
 *
 * Going through a canvas is not a formality. It gives one input format to the
 * decoder rather than four, it drops EXIF and every other thing a camera
 * writes into a file alongside the picture — including, on a photograph, the
 * place it was taken — and it is where the downscale happens.
 */
export async function fileToPng(
  file: File,
  options: { readonly removeWhite?: boolean } = {},
): Promise<CaptureResult> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { type: 'failed', reason: 'this file is not an image the browser can read' }
  }

  const scale = Math.min(1, MAX_IMAGE_WIDTH_PX / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) {
    bitmap.close()
    return { type: 'failed', reason: 'this browser gave no 2D canvas' }
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  if (options.removeWhite === true) whiteToTransparent(context, width, height)
  return canvasToPng(canvas)
}

/**
 * Turn a photographed page white into transparency.
 *
 * A signature photographed on paper arrives as dark strokes on a white
 * rectangle, and pasting that rectangle over a form covers the ruled line
 * underneath it. This is offered explicitly and is off by default, because it
 * is a guess about which pixels are paper — on a signature written in a pale
 * blue ink it will eat the stroke as well, and somebody has to be able to see
 * that happen and say no.
 *
 * The threshold is deliberately generous: a photograph's "white" is grey, and
 * anything above it fades rather than cutting, so a stroke's soft edge is not
 * left with a hard halo.
 */
const WHITE_FLOOR = 180
const WHITE_CEILING = 245

function whiteToTransparent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const image = context.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    // Perceptual luminance rather than a plain average: a mid blue and a mid
    // yellow are nothing alike to an eye and identical to an average.
    const luminance = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!
    if (luminance >= WHITE_CEILING) {
      data[i + 3] = 0
    } else if (luminance > WHITE_FLOOR) {
      const fade = (WHITE_CEILING - luminance) / (WHITE_CEILING - WHITE_FLOOR)
      data[i + 3] = Math.round(data[i + 3]! * fade)
    }
  }
  context.putImageData(image, 0, 0)
}

/**
 * Crop to what was actually drawn.
 *
 * A pad is wider than the signature somebody writes in it, and the empty
 * margin is part of the image — so the picture placed on the form is mostly
 * nothing, and the visible mark ends up smaller and off-centre. Trimming to
 * the ink means the width somebody chooses is the width of the signature.
 *
 * Returns null when there is nothing at all, which is how "you have not drawn
 * anything yet" is answered without a second flag to keep in step.
 */
export function trimToInk(
  canvas: HTMLCanvasElement,
  padding = 8,
): HTMLCanvasElement | null {
  const context = canvas.getContext('2d')
  if (context === null) return null
  const { width, height } = canvas
  if (width === 0 || height === 0) return null

  const data = context.getImageData(0, 0, width, height).data
  let top = height
  let left = width
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! === 0) continue
      if (y < top) top = y
      if (y > bottom) bottom = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  if (right < 0) return null

  left = Math.max(0, left - padding)
  top = Math.max(0, top - padding)
  right = Math.min(width - 1, right + padding)
  bottom = Math.min(height - 1, bottom + padding)

  const out = document.createElement('canvas')
  out.width = right - left + 1
  out.height = bottom - top + 1
  const target = out.getContext('2d')
  if (target === null) return null
  target.drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height)
  return out
}
