import { describe, expect, it } from 'vitest'
import {
  applyDirektorat,
  DIREKTORAT,
  direktorat,
  direktoratOf,
  managedKeys,
  PROFILE_DEFAULTS,
  TEMPAT_SURAT,
} from '@/lib/presets/kedeputian'
import { buildForm } from '@/lib/fill/form'
import { FORMULIR_CUTI_MAPPING } from '@/lib/presets/formulir-cuti.generated'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'
import { strings } from '@/lib/i18n/strings'

const base = { ...EMPTY_PROFILE, ...PROFILE_DEFAULTS }

describe('choosing a direktorat', () => {
  it('fills the unit kerja, the jabatan and the direktur in one choice', () => {
    const chosen = direktorat('data-dan-kecerdasan-buatan')!
    const profile = applyDirektorat(base, chosen)

    expect(profile.unitKerja).toBe('Direktorat Data dan Kecerdasan Buatan')
    expect(profile.atasanJabatan).toBe('Direktur Data dan Kecerdasan Buatan')
    expect(profile.atasanNama).toBe('Ambar Tri Bawono')
    // The same direktur signs both VII and VIII on this form.
    expect(profile.pejabatNama).toBe(profile.atasanNama)
    expect(profile.pejabatJabatan).toBe(profile.atasanJabatan)
  })

  it('fills the NIP when it is known', () => {
    const profile = applyDirektorat(base, direktorat('data-dan-kecerdasan-buatan')!)
    expect(profile.atasanNip).toBe('198112082009011008')
    expect(profile.pejabatNip).toBe(profile.atasanNip)
  })

  it('leaves an unknown NIP empty rather than inventing one', () => {
    // A plausible wrong NIP on a signed letter is worse than an empty box.
    for (const id of ['pengembangan-ekosistem-digital', 'transformasi-hijau']) {
      const profile = applyDirektorat(base, direktorat(id)!)
      expect(profile.atasanNama).not.toBe('')
      expect(profile.atasanNip).toBe('')
    }
  })

  it('keeps a NIP somebody already typed when they re-pick their direktorat', () => {
    const typed = { ...base, atasanNip: '197001011995031001', pejabatNip: '197001011995031001' }
    const profile = applyDirektorat(typed, direktorat('transformasi-hijau')!)
    expect(profile.atasanNip).toBe('197001011995031001')
  })

  it('recognises which direktorat a saved profile belongs to', () => {
    const profile = applyDirektorat(base, direktorat('transformasi-hijau')!)
    expect(direktoratOf(profile)?.id).toBe('transformasi-hijau')
    expect(direktoratOf(base)).toBeNull()
  })

  it('sets the place, which is always the same and never asked for', () => {
    expect(PROFILE_DEFAULTS.tempatSurat).toBe(TEMPAT_SURAT)
    expect(applyDirektorat({ ...EMPTY_PROFILE }, DIREKTORAT[0]!).tempatSurat).toBe('Nusantara')
  })

  it('covers the three direktorat in this kedeputian', () => {
    expect(DIREKTORAT.map((one) => one.nama)).toEqual([
      'Direktorat Data dan Kecerdasan Buatan',
      'Direktorat Pengembangan Ekosistem Digital',
      'Direktorat Transformasi Hijau',
    ])
  })
})

describe('what the form then stops asking for', () => {
  const form = (profile: typeof EMPTY_PROFILE, managed: ReadonlySet<string>) =>
    buildForm(
      FORMULIR_CUTI_MAPPING,
      { profile, request: EMPTY_REQUEST },
      strings('id').fieldLabels,
      [],
      {},
      {},
      managed,
    )

  it('drops the direktur fields once a direktorat is chosen', () => {
    const chosen = direktorat('data-dan-kecerdasan-buatan')!
    const profile = applyDirektorat(base, chosen)
    const keys = form(profile, managedKeys(chosen)).profile.map((field) => field.key)

    for (const gone of [
      'tempatSurat',
      'atasanNama',
      'atasanNip',
      'atasanJabatan',
      'pejabatNama',
      'pejabatNip',
      'pejabatJabatan',
    ]) {
      expect(keys, `${gone} should not be asked for`).not.toContain(gone)
    }
  })

  it('does not claim to manage a NIP it does not have', () => {
    const known = managedKeys(direktorat('data-dan-kecerdasan-buatan')!)
    const unknown = managedKeys(direktorat('transformasi-hijau')!)

    expect(known.has('atasanNip')).toBe(true)
    expect(known.has('pejabatNip')).toBe(true)
    // Unmanaged means the screen has to ask for it. The NIPs reach the
    // document through derived fields, so there is no generated input to fall
    // back on and the direktorat block asks inline.
    expect(unknown.has('atasanNip')).toBe(false)
    expect(unknown.has('pejabatNip')).toBe(false)
    // The name is known either way, so it is never asked for.
    expect(unknown.has('atasanNama')).toBe(true)
  })

  it('never asks for the place', () => {
    expect(form(base, managedKeys(null)).profile.map((field) => field.key)).not.toContain(
      'tempatSurat',
    )
  })

  it('leaves what is genuinely personal to be typed', () => {
    const chosen = direktorat('data-dan-kecerdasan-buatan')!
    const keys = form(applyDirektorat(base, chosen), managedKeys(chosen)).profile.map(
      (field) => field.key,
    )
    expect(keys).toEqual(expect.arrayContaining(['nama', 'nip', 'jabatan', 'telepon']))
  })
})
