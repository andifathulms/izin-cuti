/**
 * Dates, in the form the office writes them.
 *
 * Everything here works on plain `YYYY-MM-DD` strings and a day count, never
 * on a `Date` in a local timezone. A leave request that starts on the 20th
 * starts on the 20th in Balikpapan, in Jakarta, and in a browser whose clock is
 * set wrong.
 */

export type IsoDate = string

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const

export type ParsedDate = { readonly year: number; readonly month: number; readonly day: number }

export function parseIsoDate(value: string): ParsedDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[month - 1] ?? 0
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * "20 Juli 2026". Built from an explicit month table rather than
 * `toLocaleDateString`, whose output varies with the environment's locale data
 * — and an official letter is not the place to find that out.
 */
export function formatLongDate(value: string): string | null {
  const date = parseIsoDate(value)
  if (date === null) return null
  return `${date.day} ${MONTHS[date.month - 1]} ${date.year}`
}

/** "Senin". */
export function formatDayName(value: string): string | null {
  const date = parseIsoDate(value)
  if (date === null) return null
  return DAYS[dayOfWeek(date)] ?? null
}

/** Days since 1970-01-01, by arithmetic. No Date, no timezone. */
export function toDayNumber(date: ParsedDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const mp = (date.month + 9) % 12
  const doy = Math.floor((153 * mp + 2) / 5) + date.day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

export function fromDayNumber(dayNumber: number): ParsedDate {
  let z = dayNumber + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  z = 0
  return { year: month <= 2 ? y + 1 : y, month, day }
}

/** 0 is Sunday. */
export function dayOfWeek(date: ParsedDate): number {
  return ((toDayNumber(date) % 7) + 11) % 7
}

export function isWeekend(date: ParsedDate): boolean {
  const day = dayOfWeek(date)
  return day === 0 || day === 6
}

export type DayCount =
  | { readonly type: 'counted'; readonly days: number }
  | { readonly type: 'unavailable'; readonly reason: string }

/**
 * Calendar days from start to end, inclusive — which is how a leave request is
 * counted and how the form reads.
 */
export function calendarDaysInclusive(start: string, end: string): DayCount {
  const from = parseIsoDate(start)
  const to = parseIsoDate(end)
  if (from === null || to === null) return { type: 'unavailable', reason: 'tanggal belum lengkap' }
  const days = toDayNumber(to) - toDayNumber(from) + 1
  if (days < 1) return { type: 'unavailable', reason: 'tanggal selesai mendahului tanggal mulai' }
  return { type: 'counted', days }
}

/**
 * Working days, weekends excluded.
 *
 * National and joint holidays are *not* excluded. There is no holiday table
 * here, because one would be wrong the year it went stale and this app fetches
 * nothing at runtime. The count says what it counts, and the UI says so too.
 */
export function workingDaysInclusive(start: string, end: string): DayCount {
  const from = parseIsoDate(start)
  const to = parseIsoDate(end)
  if (from === null || to === null) return { type: 'unavailable', reason: 'tanggal belum lengkap' }
  const first = toDayNumber(from)
  const last = toDayNumber(to)
  if (last < first) return { type: 'unavailable', reason: 'tanggal selesai mendahului tanggal mulai' }

  let days = 0
  for (let d = first; d <= last; d++) {
    if (!isWeekend(fromDayNumber(d))) days++
  }
  return { type: 'counted', days }
}

/** `YYYY-MM-DD`, which is what a date input speaks. */
export function formatIso(date: ParsedDate): string {
  return [
    String(date.year).padStart(4, '0'),
    String(date.month).padStart(2, '0'),
    String(date.day).padStart(2, '0'),
  ].join('-')
}

/**
 * The last date a leave can run to without exceeding a number of working days.
 *
 * Used to bound the end-date picker: pick a start, and everything past the
 * twelfth working day is simply not offered. A limit you cannot reach is
 * kinder than a warning after the fact, and this one is arithmetic rather than
 * a guess — it counts the same working days the day count does.
 *
 * Null when the start is not a date, or when the allowance is not a positive
 * number of days.
 */
export function lastDateWithinWorkingDays(start: string, maxWorkingDays: number): string | null {
  const from = parseIsoDate(start)
  if (from === null || maxWorkingDays < 1) return null

  let day = toDayNumber(from)
  let counted = 0
  let last = day

  // A start on a weekend has no working days behind it yet, so walk until the
  // allowance is used up rather than assuming the first day counts.
  for (let step = 0; step < 366 * 2; step++) {
    const date = fromDayNumber(day)
    if (!isWeekend(date)) {
      counted++
      last = day
      if (counted >= maxWorkingDays) return formatIso(fromDayNumber(last))
    }
    day++
  }
  return formatIso(fromDayNumber(last))
}

export function listDates(start: string, end: string): ReadonlyArray<ParsedDate> {
  const from = parseIsoDate(start)
  const to = parseIsoDate(end)
  if (from === null || to === null) return []
  const dates: ParsedDate[] = []
  for (let d = toDayNumber(from); d <= toDayNumber(to); d++) dates.push(fromDayNumber(d))
  return dates
}

export function compareIso(a: string, b: string): number | null {
  const left = parseIsoDate(a)
  const right = parseIsoDate(b)
  if (left === null || right === null) return null
  return toDayNumber(left) - toDayNumber(right)
}

export { MONTHS, DAYS }
