import { calendarDaysInclusive, formatDayName, formatLongDate, workingDaysInclusive } from './date'
import { terbilang } from './terbilang'

/**
 * Derived fields.
 *
 * A derived field is never typed, never editable, and never stored as an input
 * — it is computed here, at fill time, from the profile and the request.
 * Invariant 7 is made unrepresentable rather than merely forbidden: a derived
 * field's mapping carries a *computation id*, and there is nowhere in the type
 * to put a value.
 *
 * That is also why computations are named rather than passed as functions. A
 * mapping is saved as JSON in local storage; a function does not survive that
 * trip, and a value would.
 */

export const DERIVATIONS = [
  'lama-cuti-hari-kerja',
  'lama-cuti-hari-kalender',
  'lama-cuti-terbilang',
  'satuan-waktu',
  'sisa-cuti-setelah',
  'tanggal-surat-panjang',
  'tanggal-mulai-panjang',
  'tanggal-selesai-panjang',
  'rentang-tanggal',
  'hari-mulai',
  'salinan-nama',
  'salinan-nip',
  'salinan-alamat-cuti',
] as const

export type DerivationId = (typeof DERIVATIONS)[number]

/** The request values a derivation may read. Per-request, typed each time. */
export type RequestValues = {
  readonly tanggalSurat: string
  readonly mulai: string
  readonly sampai: string
  readonly jenisCuti: string
  readonly alasan: string
  readonly sisaCutiSebelum: string
  readonly alamatCuti: string
}

/** The profile values a derivation may read. Typed once, reused. */
export type ProfileValues = {
  readonly nama: string
  readonly nip: string
  readonly jabatan: string
  readonly unitKerja: string
  readonly masaKerja: string
  readonly alamat: string
  readonly telepon: string
  readonly atasanNama: string
  readonly atasanNip: string
  readonly pejabatNama: string
  readonly pejabatNip: string
}

export type DerivationInputs = {
  readonly profile: ProfileValues
  readonly request: RequestValues
}

export type DerivedValue =
  | { readonly type: 'value'; readonly text: string }
  | { readonly type: 'unavailable'; readonly reason: string }

export type Derivation = {
  readonly id: DerivationId
  /** Shown beside the result, so nobody wonders where the number came from. */
  readonly label: string
  readonly explanation: string
  readonly compute: (inputs: DerivationInputs) => DerivedValue
}

const missing = (what: string): DerivedValue => ({
  type: 'unavailable',
  reason: `menunggu ${what}`,
})

const REGISTRY: Record<DerivationId, Derivation> = {
  'lama-cuti-hari-kerja': {
    id: 'lama-cuti-hari-kerja',
    label: 'Lama cuti (hari kerja)',
    explanation:
      'Dihitung dari tanggal mulai sampai tanggal selesai, Sabtu dan Minggu tidak dihitung. Hari libur nasional tidak diketahui aplikasi ini.',
    compute: ({ request }) => count(workingDaysInclusive(request.mulai, request.sampai)),
  },
  'lama-cuti-hari-kalender': {
    id: 'lama-cuti-hari-kalender',
    label: 'Lama cuti (hari kalender)',
    explanation: 'Jumlah hari dari tanggal mulai sampai tanggal selesai, termasuk keduanya.',
    compute: ({ request }) => count(calendarDaysInclusive(request.mulai, request.sampai)),
  },
  'lama-cuti-terbilang': {
    id: 'lama-cuti-terbilang',
    label: 'Lama cuti terbilang',
    explanation: 'Jumlah hari kerja, ditulis dengan huruf.',
    compute: ({ request }) => {
      const days = workingDaysInclusive(request.mulai, request.sampai)
      if (days.type !== 'counted') return missing('tanggal cuti')
      return { type: 'value', text: terbilang(days.days) }
    },
  },
  'satuan-waktu': {
    id: 'satuan-waktu',
    label: 'Satuan waktu',
    explanation:
      'Formulir menyediakan hari / bulan / tahun. Yang terpilih ditentukan dari panjang cuti.',
    compute: ({ request }) => {
      const days = calendarDaysInclusive(request.mulai, request.sampai)
      if (days.type !== 'counted') return missing('tanggal cuti')
      if (days.days >= 365) return { type: 'value', text: 'tahun' }
      if (days.days >= 30) return { type: 'value', text: 'bulan' }
      return { type: 'value', text: 'hari' }
    },
  },
  'sisa-cuti-setelah': {
    id: 'sisa-cuti-setelah',
    label: 'Sisa cuti setelah pengajuan',
    explanation: 'Sisa cuti sebelum pengajuan dikurangi lama cuti yang diambil.',
    compute: ({ request }) => {
      const before = Number.parseInt(request.sisaCutiSebelum.trim(), 10)
      if (!Number.isFinite(before)) return missing('sisa cuti')
      const days = workingDaysInclusive(request.mulai, request.sampai)
      if (days.type !== 'counted') return missing('tanggal cuti')
      // A negative result is shown, not hidden. Validation says something about
      // it; it does not silently become zero.
      return { type: 'value', text: String(before - days.days) }
    },
  },
  'tanggal-surat-panjang': {
    id: 'tanggal-surat-panjang',
    label: 'Tanggal surat',
    explanation: 'Tanggal surat dalam format panjang, misalnya 20 Juli 2026.',
    compute: ({ request }) => longDate(request.tanggalSurat, 'tanggal surat'),
  },
  'tanggal-mulai-panjang': {
    id: 'tanggal-mulai-panjang',
    label: 'Tanggal mulai',
    explanation: 'Tanggal mulai cuti dalam format panjang.',
    compute: ({ request }) => longDate(request.mulai, 'tanggal mulai'),
  },
  'tanggal-selesai-panjang': {
    id: 'tanggal-selesai-panjang',
    label: 'Tanggal selesai',
    explanation: 'Tanggal selesai cuti dalam format panjang.',
    compute: ({ request }) => longDate(request.sampai, 'tanggal selesai'),
  },
  'rentang-tanggal': {
    id: 'rentang-tanggal',
    label: 'Rentang tanggal',
    explanation: 'Tanggal mulai sampai dengan tanggal selesai, keduanya format panjang.',
    compute: ({ request }) => {
      const from = formatLongDate(request.mulai)
      const to = formatLongDate(request.sampai)
      if (from === null || to === null) return missing('tanggal cuti')
      return { type: 'value', text: `${from} s/d ${to}` }
    },
  },
  'hari-mulai': {
    id: 'hari-mulai',
    label: 'Hari mulai',
    explanation: 'Nama hari dari tanggal mulai cuti.',
    compute: ({ request }) => {
      const name = formatDayName(request.mulai)
      return name === null ? missing('tanggal mulai') : { type: 'value', text: name }
    },
  },
  'salinan-nama': {
    id: 'salinan-nama',
    label: 'Nama (salinan)',
    explanation: 'Nama yang sama, diulang di bagian lain formulir.',
    compute: ({ profile }) => copy(profile.nama, 'nama'),
  },
  'salinan-nip': {
    id: 'salinan-nip',
    label: 'NIP (salinan)',
    explanation: 'NIP yang sama, diulang di bagian lain formulir.',
    compute: ({ profile }) => copy(profile.nip, 'NIP'),
  },
  'salinan-alamat-cuti': {
    id: 'salinan-alamat-cuti',
    label: 'Alamat selama cuti (salinan)',
    explanation: 'Alamat selama menjalankan cuti, atau alamat rumah bila dikosongkan.',
    compute: ({ profile, request }) => {
      const value = request.alamatCuti.trim() === '' ? profile.alamat : request.alamatCuti
      return copy(value, 'alamat')
    },
  },
}

function count(result: ReturnType<typeof workingDaysInclusive>): DerivedValue {
  return result.type === 'counted'
    ? { type: 'value', text: String(result.days) }
    : { type: 'unavailable', reason: result.reason }
}

function longDate(value: string, what: string): DerivedValue {
  const formatted = formatLongDate(value)
  return formatted === null ? missing(what) : { type: 'value', text: formatted }
}

function copy(value: string, what: string): DerivedValue {
  return value.trim() === '' ? missing(what) : { type: 'value', text: value }
}

export function derivation(id: DerivationId): Derivation {
  return REGISTRY[id]
}

export function allDerivations(): ReadonlyArray<Derivation> {
  return DERIVATIONS.map((id) => REGISTRY[id])
}

export function computeDerived(id: DerivationId, inputs: DerivationInputs): DerivedValue {
  return REGISTRY[id].compute(inputs)
}

export const EMPTY_PROFILE: ProfileValues = {
  nama: '',
  nip: '',
  jabatan: '',
  unitKerja: '',
  masaKerja: '',
  alamat: '',
  telepon: '',
  atasanNama: '',
  atasanNip: '',
  pejabatNama: '',
  pejabatNip: '',
}

export const EMPTY_REQUEST: RequestValues = {
  tanggalSurat: '',
  mulai: '',
  sampai: '',
  jenisCuti: '',
  alasan: '',
  sisaCutiSebelum: '',
  alamatCuti: '',
}
