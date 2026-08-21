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
export function applyDirektorat(profile: ProfileValues, chosen: Direktorat): ProfileValues {
  return {
    ...profile,
    unitKerja: chosen.nama,
    tempatSurat: TEMPAT_SURAT,
    atasanJabatan: chosen.jabatanDirektur,
    atasanNama: chosen.direkturNama,
    atasanNip: chosen.direkturNip ?? profile.atasanNip,
    pejabatJabatan: chosen.jabatanDirektur,
    pejabatNama: chosen.direkturNama,
    pejabatNip: chosen.direkturNip ?? profile.pejabatNip,
  }
}

/** Which direktorat a profile currently matches, if any. */
export function direktoratOf(profile: ProfileValues): Direktorat | null {
  return (
    DIREKTORAT.find(
      (candidate) =>
        candidate.nama === profile.unitKerja ||
        candidate.jabatanDirektur === profile.atasanJabatan,
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
