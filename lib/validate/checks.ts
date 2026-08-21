import { compareIso, formatLongDate, isWeekend, listDates, parseIsoDate, workingDaysInclusive } from '../derive/date'
import type { ProfileValues, RequestValues } from '../derive/compute'

/**
 * The checks Word cannot run.
 *
 * Every one of them warns. None of them blocks. Offices have exceptions, and a
 * tool that refuses to produce a document because it disagrees with a human is
 * a tool that gets abandoned — so there is no `blocking` field here to set,
 * and no severity above `warning`. Invariant 8, PRD §6.
 */

export type Warning = {
  /** Stable id, so a warning can be attached to its field and dismissed. */
  readonly id: string
  /** The field this is about, for the inline association. */
  readonly field: keyof RequestValues | keyof ProfileValues
  /** In words, in Indonesian, saying what is odd and why. */
  readonly message: string
}

export type ValidationInput = {
  readonly profile: ProfileValues
  readonly request: RequestValues
  /** How many leave types are ticked. Sections VII and VIII are not checked. */
  readonly jenisCutiTerpilih: number
}

/**
 * Cuti tahunan is twelve working days a year.
 *
 * Applied to cuti tahunan and to a request with no type chosen yet, and not to
 * the others: cuti besar, sakit and melahirkan have their own entitlements and
 * are measured in months. Warning that a three-month cuti besar is too long
 * would be wrong, and a warning that is wrong is one people learn to ignore.
 */
export const MAX_CUTI_TAHUNAN_DAYS = 12

/** Whether the twelve-day allowance applies to the type chosen. */
export function annualLimitApplies(jenisCuti: string): boolean {
  const chosen = jenisCuti.trim()
  return chosen === '' || /tahunan/i.test(chosen)
}

export function validate(input: ValidationInput): ReadonlyArray<Warning> {
  return [
    ...checkNip(input),
    ...checkAnnualLimit(input),
    ...checkLetterDate(input),
    ...checkRange(input),
    ...checkWorkingDays(input),
    ...checkBalance(input),
    ...checkLeaveType(input),
    ...checkReasonRequired(input),
  ]
}

/**
 * Two shapes of wrong letter date.
 *
 * The obvious one is a letter dated after the leave it asks for. The one that
 * actually happens is subtler: the reference document is dated 17 Juli 2025 for
 * leave starting 20 Juli 2026 — a template reused with last year's date still
 * in it. That passes an "is it before?" check comfortably, so the gap is
 * checked too.
 */
const FAR_AHEAD_DAYS = 120

function checkLetterDate({ request }: ValidationInput): Warning[] {
  const order = compareIso(request.tanggalSurat, request.mulai)
  if (order === null) return []

  if (order > 0) {
    return [
      {
        id: 'tanggal-surat-setelah-mulai',
        field: 'tanggalSurat',
        message: `Tanggal surat (${formatLongDate(request.tanggalSurat)}) jatuh setelah cuti dimulai (${formatLongDate(request.mulai)}).`,
      },
    ]
  }

  if (-order > FAR_AHEAD_DAYS) {
    return [
      {
        id: 'tanggal-surat-jauh-sebelum',
        field: 'tanggalSurat',
        message: `Tanggal surat (${formatLongDate(request.tanggalSurat)}) berjarak ${-order} hari sebelum cuti dimulai (${formatLongDate(request.mulai)}). Periksa tahunnya — ini yang paling sering terbawa dari surat sebelumnya.`,
      },
    ]
  }
  return []
}

function checkRange({ request }: ValidationInput): Warning[] {
  const order = compareIso(request.mulai, request.sampai)
  if (order === null || order <= 0) return []
  return [
    {
      id: 'rentang-terbalik',
      field: 'sampai',
      message: 'Tanggal selesai mendahului tanggal mulai.',
    },
  ]
}

function checkWorkingDays({ request }: ValidationInput): Warning[] {
  const start = parseIsoDate(request.mulai)
  const end = parseIsoDate(request.sampai)
  const warnings: Warning[] = []

  if (start !== null && isWeekend(start)) {
    warnings.push({
      id: 'mulai-akhir-pekan',
      field: 'mulai',
      message: 'Cuti dimulai pada akhir pekan. Biasanya cuti dihitung dari hari kerja.',
    })
  }
  if (end !== null && isWeekend(end)) {
    warnings.push({
      id: 'selesai-akhir-pekan',
      field: 'sampai',
      message: 'Cuti berakhir pada akhir pekan.',
    })
  }

  const dates = listDates(request.mulai, request.sampai)
  if (dates.length > 0 && dates.every(isWeekend)) {
    warnings.push({
      id: 'seluruhnya-akhir-pekan',
      field: 'mulai',
      message: 'Seluruh rentang cuti jatuh pada akhir pekan, sehingga tidak ada hari kerja yang diambil.',
    })
  }
  return warnings
}

function checkAnnualLimit({ request }: ValidationInput): Warning[] {
  if (!annualLimitApplies(request.jenisCuti)) return []
  const days = workingDaysInclusive(request.mulai, request.sampai)
  if (days.type !== 'counted' || days.days <= MAX_CUTI_TAHUNAN_DAYS) return []
  return [
    {
      id: 'melebihi-jatah-tahunan',
      field: 'sampai',
      message: `Cuti yang diambil ${days.days} hari kerja. Cuti tahunan paling banyak ${MAX_CUTI_TAHUNAN_DAYS} hari kerja dalam setahun.`,
    },
  ]
}

function checkBalance({ request }: ValidationInput): Warning[] {
  const before = Number.parseInt(request.sisaCutiSebelum.trim(), 10)
  if (!Number.isFinite(before)) return []
  const days = workingDaysInclusive(request.mulai, request.sampai)
  if (days.type !== 'counted' || days.days <= before) return []
  return [
    {
      id: 'melebihi-sisa-cuti',
      field: 'sisaCutiSebelum',
      message: `Cuti yang diambil ${days.days} hari kerja, sedangkan sisa cuti tercatat ${before} hari. Selisihnya ${days.days - before} hari.`,
    },
  ]
}

/** NIP is eighteen digits. Written as four groups on a card, typed as one run. */
function checkNip({ profile }: ValidationInput): Warning[] {
  const warnings: Warning[] = []
  const check = (value: string, field: keyof ProfileValues, whose: string) => {
    const digits = value.replace(/\D/g, '')
    if (value.trim() === '') return
    if (digits.length !== 18) {
      warnings.push({
        id: `nip-${field}`,
        field,
        message: `NIP ${whose} berisi ${digits.length} digit. NIP terdiri dari 18 digit.`,
      })
    }
  }
  check(profile.nip, 'nip', 'pegawai')
  check(profile.atasanNip, 'atasanNip', 'atasan langsung')
  check(profile.pejabatNip, 'pejabatNip', 'pejabat yang berwenang')
  return warnings
}

function checkLeaveType({ jenisCutiTerpilih }: ValidationInput): Warning[] {
  if (jenisCutiTerpilih === 1) return []
  return [
    {
      id: 'jenis-cuti',
      field: 'jenisCuti',
      message:
        jenisCutiTerpilih === 0
          ? 'Belum ada jenis cuti yang dipilih. Formulir meminta tepat satu.'
          : `Ada ${jenisCutiTerpilih} jenis cuti terpilih. Formulir meminta tepat satu.`,
    },
  ]
}

function checkReasonRequired({ request }: ValidationInput): Warning[] {
  if (request.alasan.trim() !== '') return []
  const needsReason = /penting|besar|luar tanggungan/i.test(request.jenisCuti)
  if (!needsReason) return []
  return [
    {
      id: 'alasan-kosong',
      field: 'alasan',
      message: `Jenis cuti ini biasanya memerlukan alasan, dan kolom alasan masih kosong.`,
    },
  ]
}
