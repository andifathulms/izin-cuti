/**
 * Numbers in words — "3 (tiga) hari". The form asks for both, and writing the
 * digits without the words is the kind of thing that gets a letter handed back.
 *
 * Whole non-negative numbers only; that is all a day count or a leave balance
 * ever is.
 */

const UNITS = [
  'nol',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
] as const

export function terbilang(value: number): string {
  if (!Number.isInteger(value) || value < 0) return ''
  return words(value).replace(/\s+/g, ' ').trim()
}

function words(n: number): string {
  if (n < 12) return UNITS[n] ?? ''
  if (n < 20) return `${words(n - 10)} belas`
  if (n < 100) return `${words(Math.floor(n / 10))} puluh ${words(n % 10)}`.replace(/ nol$/, '')
  if (n < 200) return `seratus ${words(n - 100)}`.replace(/ nol$/, '')
  if (n < 1000) return `${words(Math.floor(n / 100))} ratus ${words(n % 100)}`.replace(/ nol$/, '')
  if (n < 2000) return `seribu ${words(n - 1000)}`.replace(/ nol$/, '')
  if (n < 1_000_000) return `${words(Math.floor(n / 1000))} ribu ${words(n % 1000)}`.replace(/ nol$/, '')
  if (n < 1_000_000_000)
    return `${words(Math.floor(n / 1_000_000))} juta ${words(n % 1_000_000)}`.replace(/ nol$/, '')
  return `${words(Math.floor(n / 1_000_000_000))} miliar ${words(n % 1_000_000_000)}`.replace(
    / nol$/,
    '',
  )
}
