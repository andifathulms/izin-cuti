import { describe, expect, it } from 'vitest'

import {
  applyDirektorat,
  applyKedudukan,
  direktorat,
  direktoratOf,
  kedudukanOf,
  stripKedudukan,
  withKedudukan,
} from '../../lib/presets/kedeputian'
import { EMPTY_PROFILE } from '../../lib/derive/compute'

const dki = direktorat('data-dan-kecerdasan-buatan')!

describe('kedudukan', () => {
  it('writes the prefix the office actually uses', () => {
    expect(withKedudukan('Direktur Transformasi Hijau', 'definitif')).toBe(
      'Direktur Transformasi Hijau',
    )
    expect(withKedudukan('Direktur Transformasi Hijau', 'plt')).toBe(
      'Plt. Direktur Transformasi Hijau',
    )
    expect(withKedudukan('Direktur Transformasi Hijau', 'plh')).toBe(
      'Plh. Direktur Transformasi Hijau',
    )
  })

  it('never stacks a prefix on a prefix', () => {
    expect(withKedudukan('Plt. Direktur X', 'plh')).toBe('Plh. Direktur X')
    expect(withKedudukan('Plh. Direktur X', 'plt')).toBe('Plt. Direktur X')
    expect(withKedudukan('Plt. Direktur X', 'definitif')).toBe('Direktur X')
  })

  it('leaves an unfilled jabatan alone rather than writing a bare prefix', () => {
    // "Plt. " with no noun after it would reach the document as a fragment.
    expect(withKedudukan('', 'plt')).toBe('')
    expect(withKedudukan('   ', 'plt')).toBe('   ')
  })

  it('reads the standing back off the profile', () => {
    const plt = applyDirektorat(EMPTY_PROFILE, dki, 'plt')
    expect(kedudukanOf(plt)).toBe('plt')
    expect(kedudukanOf(applyDirektorat(EMPTY_PROFILE, dki, 'plh'))).toBe('plh')
    expect(kedudukanOf(applyDirektorat(EMPTY_PROFILE, dki, 'definitif'))).toBe('definitif')
  })

  it('applies one standing to both signing blocks, because one person signs both', () => {
    const plt = applyDirektorat(EMPTY_PROFILE, dki, 'plt')
    expect(plt.atasanJabatan).toBe('Plt. Direktur Data dan Kecerdasan Buatan')
    expect(plt.pejabatJabatan).toBe('Plt. Direktur Data dan Kecerdasan Buatan')
  })

  it('carries the standing over when the direktorat is re-picked', () => {
    const plt = applyDirektorat(EMPTY_PROFILE, dki, 'plt')
    const moved = applyDirektorat(plt, direktorat('transformasi-hijau')!)
    expect(moved.atasanJabatan).toBe('Plt. Direktur Transformasi Hijau')
  })

  it('still recognises the direktorat once a standing is marked', () => {
    // Otherwise marking an atasan as acting would silently unpick the
    // direktorat and clear four fields with it.
    const plt = applyDirektorat({ ...EMPTY_PROFILE, unitKerja: '' }, dki, 'plt')
    expect(direktoratOf({ ...plt, unitKerja: '' })?.id).toBe('data-dan-kecerdasan-buatan')
  })

  it('changes the standing for somebody whose unit is not in the list', () => {
    const typed = { ...EMPTY_PROFILE, atasanJabatan: 'Kepala Biro Umum', pejabatJabatan: 'Kepala Biro Umum' }
    const plh = applyKedudukan(typed, 'plh')
    expect(plh.atasanJabatan).toBe('Plh. Kepala Biro Umum')
    expect(plh.pejabatJabatan).toBe('Plh. Kepala Biro Umum')
    expect(kedudukanOf(plh)).toBe('plh')
  })

  it('strips only the vocabulary, not a jabatan that merely starts similarly', () => {
    expect(stripKedudukan('Pltx Direktur')).toBe('Pltx Direktur')
    expect(stripKedudukan('Plt Direktur')).toBe('Plt Direktur')
    expect(stripKedudukan('Plt. Direktur')).toBe('Direktur')
  })
})
