/**
 * A small stable string hash. FNV-1a, 64-bit, hex.
 *
 * Not cryptographic and not trying to be — this identifies a template to
 * itself, it does not defend against anyone. What it must be is *stable*:
 * the same string hashes the same in this browser, that browser, and Node,
 * today and next year, so a mapping saved in July still recognises its
 * template in December. Nothing platform-supplied gives that guarantee
 * synchronously, so it is twelve lines here instead.
 */
export function hashString(value: string): string {
  let hi = 0xcbf2_9ce4
  let lo = 0x8422_2325
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    lo ^= code & 0xffff
    hi ^= (code >>> 16) & 0xffff

    // Multiply by the 64-bit FNV prime (2^40 + 2^8 + 0x b3), in 32-bit halves.
    const loMul = lo * 0x01b3
    const hiMul = hi * 0x01b3 + Math.floor(loMul / 0x1_0000_0000) + lo * 0x0100
    lo = loMul >>> 0
    hi = (hiMul + (lo << 8)) >>> 0
  }
  return toHex(hi) + toHex(lo)
}

function toHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0')
}
