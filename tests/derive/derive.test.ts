import { describe, expect, it } from 'vitest'
import {
  calendarDaysInclusive,
  compareIso,
  formatDayName,
  formatLongDate,
  fromDayNumber,
  isLeapYear,
  isWeekend,
  lastDateWithinWorkingDays,
  parseIsoDate,
  toDayNumber,
  workingDaysInclusive,
} from '@/lib/derive/date'
import { terbilang } from '@/lib/derive/terbilang'
import {
  computeDerived,
  EMPTY_PROFILE,
  EMPTY_REQUEST,
  type DerivationInputs,
} from '@/lib/derive/compute'

describe('Indonesian long dates', () => {
  it('formats from an explicit month table, not the environment locale', () => {
    expect(formatLongDate('2026-07-20')).toBe('20 Juli 2026')
    expect(formatLongDate('2026-01-01')).toBe('1 Januari 2026')
    expect(formatLongDate('2026-12-31')).toBe('31 Desember 2026')
  })

  it('refuses a date that is not a date', () => {
    expect(formatLongDate('2026-13-01')).toBeNull()
    expect(formatLongDate('2026-02-30')).toBeNull()
    expect(formatLongDate('20 Juli 2026')).toBeNull()
    expect(parseIsoDate('')).toBeNull()
  })

  it('knows February in a leap year', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2100)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(formatLongDate('2024-02-29')).toBe('29 Februari 2024')
    expect(formatLongDate('2025-02-29')).toBeNull()
  })

  it('names the day of the week', () => {
    expect(formatDayName('2026-07-20')).toBe('Senin')
    expect(formatDayName('2026-07-25')).toBe('Sabtu')
    expect(formatDayName('2026-07-26')).toBe('Minggu')
  })

  it('converts to a day number and back', () => {
    for (const iso of ['1970-01-01', '2000-02-29', '2026-07-20', '2100-03-01']) {
      const date = parseIsoDate(iso)!
      expect(fromDayNumber(toDayNumber(date))).toEqual(date)
    }
    expect(toDayNumber(parseIsoDate('1970-01-01')!)).toBe(0)
  })
})

describe('day counts', () => {
  it('counts calendar days inclusively, the way the form reads', () => {
    expect(calendarDaysInclusive('2026-07-20', '2026-07-22')).toEqual({ type: 'counted', days: 3 })
    expect(calendarDaysInclusive('2026-07-20', '2026-07-20')).toEqual({ type: 'counted', days: 1 })
  })

  it('counts working days, excluding weekends', () => {
    // Monday to Friday.
    expect(workingDaysInclusive('2026-07-20', '2026-07-24')).toEqual({ type: 'counted', days: 5 })
    // Monday to the following Monday — one weekend in the middle.
    expect(workingDaysInclusive('2026-07-20', '2026-07-27')).toEqual({ type: 'counted', days: 6 })
    // A weekend on its own.
    expect(workingDaysInclusive('2026-07-25', '2026-07-26')).toEqual({ type: 'counted', days: 0 })
  })

  it('counts across a month boundary', () => {
    expect(workingDaysInclusive('2026-07-29', '2026-08-04')).toEqual({ type: 'counted', days: 5 })
  })

  it('counts across a year boundary', () => {
    expect(calendarDaysInclusive('2026-12-30', '2027-01-02')).toEqual({ type: 'counted', days: 4 })
  })

  it('counts across a leap day', () => {
    expect(calendarDaysInclusive('2024-02-28', '2024-03-01')).toEqual({ type: 'counted', days: 3 })
    expect(calendarDaysInclusive('2025-02-28', '2025-03-01')).toEqual({ type: 'counted', days: 2 })
  })

  it('says so rather than guessing when the dates are backwards', () => {
    const result = calendarDaysInclusive('2026-07-22', '2026-07-20')
    expect(result.type).toBe('unavailable')
  })

  it('says so rather than guessing when a date is missing', () => {
    expect(workingDaysInclusive('', '2026-07-20').type).toBe('unavailable')
  })

  it('compares two dates', () => {
    expect(compareIso('2025-07-17', '2026-07-20')).toBeLessThan(0)
    expect(compareIso('2026-07-20', '2026-07-20')).toBe(0)
    expect(compareIso('bukan tanggal', '2026-07-20')).toBeNull()
  })
})

describe('terbilang', () => {
  it('writes the counts a leave request actually produces', () => {
    expect(terbilang(0)).toBe('nol')
    expect(terbilang(1)).toBe('satu')
    expect(terbilang(3)).toBe('tiga')
    expect(terbilang(11)).toBe('sebelas')
    expect(terbilang(12)).toBe('dua belas')
    expect(terbilang(20)).toBe('dua puluh')
    expect(terbilang(21)).toBe('dua puluh satu')
    expect(terbilang(90)).toBe('sembilan puluh')
    expect(terbilang(100)).toBe('seratus')
    expect(terbilang(112)).toBe('seratus dua belas')
    expect(terbilang(365)).toBe('tiga ratus enam puluh lima')
    expect(terbilang(1000)).toBe('seribu')
  })

  it('produces nothing for a value that is not a whole count', () => {
    expect(terbilang(-1)).toBe('')
    expect(terbilang(1.5)).toBe('')
  })
})

describe('derived fields', () => {
  const inputs = (
    request: Partial<DerivationInputs['request']> = {},
    profile: Partial<DerivationInputs['profile']> = {},
  ): DerivationInputs => ({
    profile: { ...EMPTY_PROFILE, ...profile },
    request: { ...EMPTY_REQUEST, ...request },
  })

  it('computes the day count and its words together', () => {
    const given = inputs({ mulai: '2026-07-20', sampai: '2026-07-22' })
    expect(computeDerived('lama-cuti-hari-kerja', given)).toEqual({ type: 'value', text: '3' })
    expect(computeDerived('lama-cuti-terbilang', given)).toEqual({ type: 'value', text: 'tiga' })
  })

  it('picks hari, bulan or tahun from the length of the leave', () => {
    const unit = (mulai: string, sampai: string) =>
      computeDerived('satuan-waktu', inputs({ mulai, sampai }))
    expect(unit('2026-07-20', '2026-07-22')).toEqual({ type: 'value', text: 'hari' })
    expect(unit('2026-07-01', '2026-08-15')).toEqual({ type: 'value', text: 'bulan' })
    expect(unit('2026-01-01', '2027-01-01')).toEqual({ type: 'value', text: 'tahun' })
  })

  it('subtracts the leave taken from the balance', () => {
    const given = inputs({ mulai: '2026-07-20', sampai: '2026-07-22', sisaCutiSebelum: '12' })
    expect(computeDerived('sisa-cuti-setelah', given)).toEqual({ type: 'value', text: '9' })
  })

  it('shows a negative balance rather than quietly flooring it at zero', () => {
    const given = inputs({ mulai: '2026-07-20', sampai: '2026-07-31', sisaCutiSebelum: '2' })
    expect(computeDerived('sisa-cuti-setelah', given)).toEqual({ type: 'value', text: '-8' })
  })

  it('reports what it is waiting for instead of computing on half the inputs', () => {
    expect(computeDerived('lama-cuti-hari-kerja', inputs({ mulai: '2026-07-20' }))).toMatchObject({
      type: 'unavailable',
    })
    expect(
      computeDerived('sisa-cuti-setelah', inputs({ mulai: '2026-07-20', sampai: '2026-07-22' })),
    ).toEqual({ type: 'unavailable', reason: 'menunggu sisa cuti' })
  })

  it('repeats the name into section VI without it being typed twice', () => {
    const given = inputs({}, { nama: 'Siti Rahmawati' })
    expect(computeDerived('salinan-nama', given)).toEqual({
      type: 'value',
      text: 'Siti Rahmawati',
    })
  })

  it('falls back to the home address when no leave address was given', () => {
    expect(computeDerived('salinan-alamat-cuti', inputs({}, { alamat: 'Jl. Contoh 1' }))).toEqual({
      type: 'value',
      text: 'Jl. Contoh 1',
    })
    expect(
      computeDerived(
        'salinan-alamat-cuti',
        inputs({ alamatCuti: 'Jl. Lain 2' }, { alamat: 'Jl. Contoh 1' }),
      ),
    ).toEqual({ type: 'value', text: 'Jl. Lain 2' })
  })

  it('formats the date range the way the letter writes it', () => {
    const given = inputs({ mulai: '2026-07-20', sampai: '2026-07-22' })
    expect(computeDerived('rentang-tanggal', given)).toEqual({
      type: 'value',
      text: '20 Juli 2026 s/d 22 Juli 2026',
    })
  })
})

describe('the last date a leave can run to', () => {
  it('gives the twelfth working day from a Monday', () => {
    // Mon 24 Aug 2026 + 12 working days lands on Wed 9 Sep — two weekends in.
    expect(lastDateWithinWorkingDays('2026-08-24', 12)).toBe('2026-09-08')
  })

  it('gives the same day when only one day is allowed', () => {
    expect(lastDateWithinWorkingDays('2026-08-24', 1)).toBe('2026-08-24')
  })

  it('skips forward when the start is a weekend', () => {
    // Saturday has no working day in it, so one day of leave from a Saturday
    // ends on the Monday.
    expect(lastDateWithinWorkingDays('2026-08-22', 1)).toBe('2026-08-24')
  })

  it('never lands on a weekend, because the last day counted is a working one', () => {
    for (const start of ['2026-08-24', '2026-08-22', '2026-12-28']) {
      const last = lastDateWithinWorkingDays(start, 12)!
      expect(isWeekend(parseIsoDate(last)!), `${start} → ${last}`).toBe(false)
    }
  })

  it('agrees with the working-day count it bounds', () => {
    const last = lastDateWithinWorkingDays('2026-08-24', 12)!
    expect(workingDaysInclusive('2026-08-24', last)).toEqual({ type: 'counted', days: 12 })
  })

  it('refuses a start that is not a date, or an allowance of nothing', () => {
    expect(lastDateWithinWorkingDays('', 12)).toBeNull()
    expect(lastDateWithinWorkingDays('2026-08-24', 0)).toBeNull()
  })
})
