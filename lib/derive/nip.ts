import { parseIsoDate, type ParsedDate } from './date'

/**
 * What a NIP encodes.
 *
 * An eighteen-digit NIP is not an opaque serial — it is four fields:
 *
 * ```
 * 19981029 202506 1 003
 * └──────┘ └────┘ │ └─┘
 *  lahir    TMT   │  urut
 *  YYYYMMDD YYYYMM│
 *                 └ 1 laki-laki, 2 perempuan
 * ```
 *
 * So masa kerja does not have to be typed: it is the distance from the TMT to
 * the date of the letter. Computed rather than typed means it cannot be a
 * year out of date, which is the failure this whole tool exists to prevent.
 *
 * Measured against the letter date, never against a clock — `lib/derive` has
 * no clock, and "masa kerja as of the letter" is the honest quantity anyway.
 * A letter written in July states the masa kerja in July, whenever it is
 * reprinted.
 */

export type Nip = {
  readonly birth: ParsedDate
  /** Terhitung Mulai Tanggal — year and month only, which is all a NIP carries. */
  readonly tmtYear: number
  readonly tmtMonth: number
  readonly gender: 'L' | 'P' | null
  readonly serial: string
}

/** Null unless the value really is a NIP. Formatting and spaces are ignored. */
export function parseNip(value: string): Nip | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 18) return null

  const birth = parseIsoDate(
    `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
  )
  if (birth === null) return null

  const tmtYear = Number(digits.slice(8, 12))
  const tmtMonth = Number(digits.slice(12, 14))
  if (tmtMonth < 1 || tmtMonth > 12) return null
  if (tmtYear < 1900 || tmtYear > 2200) return null

  const genderDigit = digits.slice(14, 15)
  return {
    birth,
    tmtYear,
    tmtMonth,
    gender: genderDigit === '1' ? 'L' : genderDigit === '2' ? 'P' : null,
    serial: digits.slice(15, 18),
  }
}

export type MasaKerja = { readonly years: number; readonly months: number }

/**
 * Whole years and months from the TMT to a reference date.
 *
 * Counted in months and then split, rather than by subtracting years and
 * fixing up: a TMT of June 2025 read on 21 Agustus 2026 is fourteen months,
 * which is one year and two months, and no branch has to know about it.
 */
export function masaKerja(nip: string, asOfIso: string): MasaKerja | null {
  const parsed = parseNip(nip)
  const asOf = parseIsoDate(asOfIso)
  if (parsed === null || asOf === null) return null

  const months = (asOf.year - parsed.tmtYear) * 12 + (asOf.month - parsed.tmtMonth)
  if (months < 0) return null
  return { years: Math.floor(months / 12), months: months % 12 }
}

/** "1 Tahun 2 Bulan", as the form writes it. */
export function formatMasaKerja(value: MasaKerja): string {
  const parts: string[] = []
  if (value.years > 0) parts.push(`${value.years} Tahun`)
  if (value.months > 0) parts.push(`${value.months} Bulan`)
  // Somebody in their first month has served zero months, and the form still
  // needs a value in the box.
  return parts.length === 0 ? '0 Bulan' : parts.join(' ')
}
