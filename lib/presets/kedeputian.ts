import type { ProfileValues } from '../derive/compute'

/**
 * The direktorat in this kedeputian, and who signs for each.
 *
 * Choosing a direktorat fills the unit kerja, the atasan's jabatan, and the
 * direktur's name and NIP — so nobody retypes a colleague's NIP, and nobody
 * gets it wrong. In this form the same direktur signs both section VII
 * (pertimbangan atasan langsung) and section VIII (keputusan pejabat yang
 * berwenang), so both blocks are filled from one choice.
 *
 * A NIP that is not known is `null`, never a guess. The form then asks for it
 * once and remembers it in the profile. A wrong NIP on a signed letter is
 * precisely the silent failure this tool exists to prevent, and a plausible
 * invented one is worse than an empty box.
 */

export type Direktorat = {
  readonly id: string
  /** The unit as it is written on the form. */
  readonly nama: string
  /** The jabatan of whoever signs — "Direktur ...". */
  readonly jabatanDirektur: string
  readonly direkturNama: string
  /** Null when it is not known here. Asked for once, then saved. */
  readonly direkturNip: string | null
}

export const DIREKTORAT: ReadonlyArray<Direktorat> = [
  {
    id: 'data-dan-kecerdasan-buatan',
    nama: 'Direktorat Data dan Kecerdasan Buatan',
    jabatanDirektur: 'Direktur Data dan Kecerdasan Buatan',
    direkturNama: 'Ambar Tri Bawono',
    direkturNip: '198112082009011008',
  },
  {
    id: 'pengembangan-ekosistem-digital',
    nama: 'Direktorat Pengembangan Ekosistem Digital',
    jabatanDirektur: 'Direktur Pengembangan Ekosistem Digital',
    direkturNama: 'Tony Agus Setiono',
    direkturNip: null,
  },
  {
    id: 'transformasi-hijau',
    nama: 'Direktorat Transformasi Hijau',
    jabatanDirektur: 'Direktur Transformasi Hijau',
    direkturNama: 'Agus Setiawan',
    direkturNip: null,
  },
]

export function direktorat(id: string): Direktorat | null {
  return DIREKTORAT.find((candidate) => candidate.id === id) ?? null
}

/**
 * Whether the person signing holds the post or is standing in for it.
 *
 * A letter addressed to "Direktur X" when X is away and Y is acting names the
 * wrong office. The office is the same; the person's standing in it is not,
 * and the form writes that standing into the jabatan as a prefix — "Plt.
 * Direktur X" for a pelaksana tugas, "Plh. Direktur X" for a pelaksana harian.
 *
 * Both are Indonesian office vocabulary and neither is translated: an English
 * "Acting Director" is not what goes on the letter.
 */
export type Kedudukan = 'definitif' | 'plt' | 'plh'

export const KEDUDUKAN: ReadonlyArray<Kedudukan> = ['definitif', 'plt', 'plh']

const PREFIX: Readonly<Record<Kedudukan, string>> = {
  definitif: '',
  plt: 'Plt. ',
  plh: 'Plh. ',
}

/**
 * The prefix is stored in the jabatan rather than in a field of its own.
 *
 * It travels to the document that way with nothing else changed — the jabatan
 * reaches four targets and none of them has to learn about this — and reading
 * it back off the string is exact, because the two prefixes are fixed
 * vocabulary rather than something anybody types.
 */
export function withKedudukan(jabatan: string, kedudukan: Kedudukan): string {
  const bare = stripKedudukan(jabatan)
  // Nothing to stand in for. A jabatan nobody has filled in yet comes back
  // exactly as it was rather than as a bare "Plt. " waiting for a noun.
  if (bare.trim() === '') return jabatan
  return `${PREFIX[kedudukan]}${bare}`
}

export function stripKedudukan(jabatan: string): string {
  return jabatan.replace(/^\s*(?:Plt|Plh)\.\s*/i, '')
}

export function kedudukanOf(profile: ProfileValues): Kedudukan {
  const match = /^\s*(Plt|Plh)\./i.exec(profile.atasanJabatan)
  if (match === null) return 'definitif'
  return match[1]!.toLowerCase() === 'plt' ? 'plt' : 'plh'
}

/** The letters are written here, always. Nobody should have to type it. */
export const TEMPAT_SURAT = 'Nusantara'

/** Values every profile starts with, before anybody types anything. */
export const PROFILE_DEFAULTS: Partial<ProfileValues> = { tempatSurat: TEMPAT_SURAT }

/**
 * Apply a direktorat to a profile.
 *
 * An unknown NIP is left exactly as it was rather than cleared: somebody who
 * typed it last month should not have to type it again because they re-picked
 * their direktorat.
 */
export function applyDirektorat(
  profile: ProfileValues,
  chosen: Direktorat,
  /** Carried over from the profile unless the caller is changing it. */
  kedudukan: Kedudukan = kedudukanOf(profile),
): ProfileValues {
  const jabatan = withKedudukan(chosen.jabatanDirektur, kedudukan)
  return {
    ...profile,
    unitKerja: chosen.nama,
    tempatSurat: TEMPAT_SURAT,
    atasanJabatan: jabatan,
    atasanNama: chosen.direkturNama,
    atasanNip: chosen.direkturNip ?? profile.atasanNip,
    // One person signs section VII and section VIII in this form, so their
    // standing in the post is the same in both.
    pejabatJabatan: jabatan,
    pejabatNama: chosen.direkturNama,
    pejabatNip: chosen.direkturNip ?? profile.pejabatNip,
  }
}

/**
 * Change the standing without re-picking the direktorat.
 *
 * Works off whatever jabatan the profile holds rather than off a direktorat,
 * so it is still right for somebody whose unit is not in the list above and
 * who typed their atasan's jabatan by hand.
 */
export function applyKedudukan(profile: ProfileValues, kedudukan: Kedudukan): ProfileValues {
  return {
    ...profile,
    atasanJabatan: withKedudukan(profile.atasanJabatan, kedudukan),
    pejabatJabatan: withKedudukan(profile.pejabatJabatan, kedudukan),
  }
}

/** Which direktorat a profile currently matches, if any. */
export function direktoratOf(profile: ProfileValues): Direktorat | null {
  // Matched against the bare jabatan: "Plt. Direktur X" is still direktorat X,
  // and a profile that lost its direktorat the moment somebody marked their
  // atasan as acting would clear four fields for no reason.
  const jabatan = stripKedudukan(profile.atasanJabatan)
  return (
    DIREKTORAT.find(
      (candidate) => candidate.nama === profile.unitKerja || candidate.jabatanDirektur === jabatan,
    ) ?? null
  )
}

/**
 * Profile fields the direktorat choice owns, so the form does not also ask for
 * them. The NIPs are only managed when they are actually known — otherwise the
 * field has to stay visible, or there would be no way to supply it.
 */
export function managedKeys(chosen: Direktorat | null): ReadonlySet<keyof ProfileValues> {
  const managed = new Set<keyof ProfileValues>(['tempatSurat'])
  if (chosen === null) return managed
  managed.add('atasanJabatan')
  managed.add('atasanNama')
  managed.add('pejabatJabatan')
  managed.add('pejabatNama')
  if (chosen.direkturNip !== null) {
    managed.add('atasanNip')
    managed.add('pejabatNip')
  }
  return managed
}
