import { describe, expect, it } from 'vitest'
import { formatMasaKerja, formatNip, masaKerja, normaliseNip, parseNip } from '@/lib/derive/nip'
import { computeDerived, EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'

/**
 * A NIP is not an opaque serial: 8 digits of birth date, 6 of TMT, a gender
 * digit and a serial. Masa kerja falls out of it, so it never has to be typed.
 *
 * Every NIP below is invented. A real one identifies a real person and has no
 * business in a public repository, fixture or not.
 */

describe('reading a NIP', () => {
  it('splits it into its four fields', () => {
    expect(parseNip('199001012025061003')).toEqual({
      birth: { year: 1990, month: 1, day: 1 },
      tmtYear: 2025,
      tmtMonth: 6,
      gender: 'L',
      serial: '003',
    })
  })

  it('reads the gender digit', () => {
    expect(parseNip('198705122010012003')?.gender).toBe('P')
    expect(parseNip('197001011995031001')?.gender).toBe('L')
  })

  it('ignores the spaces a NIP is often written with', () => {
    expect(parseNip('19900101 202506 1 003')?.tmtYear).toBe(2025)
  })

  it('refuses anything that is not eighteen digits', () => {
    expect(parseNip('1990010120250610')).toBeNull()
    expect(parseNip('')).toBeNull()
    expect(parseNip('bukan nip sama sekali')).toBeNull()
  })

  it('refuses digits that do not spell a date', () => {
    expect(parseNip('199013012025061003')).toBeNull() // month 13
    expect(parseNip('199001012025131003')).toBeNull() // TMT month 13
    expect(parseNip('199002302025061003')).toBeNull() // 30 February
  })
})

describe('masa kerja', () => {
  it('counts from the TMT to the date of the letter', () => {
    // TMT June 2025, letter dated 21 Agustus 2026 — fourteen months.
    expect(masaKerja('199001012025061003', '2026-08-21')).toEqual({ years: 1, months: 2 })
  })

  it('is measured against the letter, not against a clock', () => {
    // The same NIP, two different letters. A letter written in July states the
    // masa kerja in July however long afterwards it is reprinted.
    expect(masaKerja('199001012025061003', '2025-07-01')).toEqual({ years: 0, months: 1 })
    expect(masaKerja('199001012025061003', '2030-06-30')).toEqual({ years: 5, months: 0 })
  })

  it('handles the month it started', () => {
    expect(masaKerja('199001012025061003', '2025-06-15')).toEqual({ years: 0, months: 0 })
  })

  it('refuses a letter dated before the TMT rather than counting backwards', () => {
    expect(masaKerja('199001012025061003', '2024-01-01')).toBeNull()
  })

  it('crosses a year boundary correctly', () => {
    expect(masaKerja('199001012025121003', '2026-01-15')).toEqual({ years: 0, months: 1 })
  })

  it('writes itself the way the form does', () => {
    expect(formatMasaKerja({ years: 1, months: 2 })).toBe('1 Tahun 2 Bulan')
    expect(formatMasaKerja({ years: 5, months: 0 })).toBe('5 Tahun')
    expect(formatMasaKerja({ years: 0, months: 7 })).toBe('7 Bulan')
    // Somebody in their first month has served zero, and the box still needs
    // something in it.
    expect(formatMasaKerja({ years: 0, months: 0 })).toBe('0 Bulan')
  })
})

describe('as a derived field', () => {
  const inputs = (nip: string, tanggalSurat: string) => ({
    profile: { ...EMPTY_PROFILE, nip },
    request: { ...EMPTY_REQUEST, tanggalSurat },
  })

  it('computes masa kerja without it ever being typed', () => {
    expect(
      computeDerived('masa-kerja-dari-nip', inputs('199001012025061003', '2026-08-21')),
    ).toEqual({ type: 'value', text: '1 Tahun 2 Bulan' })
  })

  it('says which input it is waiting for', () => {
    expect(computeDerived('masa-kerja-dari-nip', inputs('', '2026-08-21'))).toEqual({
      type: 'unavailable',
      reason: 'menunggu NIP',
    })
    expect(computeDerived('masa-kerja-dari-nip', inputs('199001012025061003', ''))).toEqual({
      type: 'unavailable',
      reason: 'menunggu tanggal surat',
    })
  })

  it('writes the NIP with the prefix the signature block uses', () => {
    expect(
      computeDerived('nip-berawalan', inputs('199001012025061003', '2026-08-21')),
    ).toEqual({ type: 'value', text: 'NIP. 19900101 202506 1 003' })
  })

  it('does the same for the atasan', () => {
    expect(
      computeDerived('salinan-nip-atasan', {
        profile: { ...EMPTY_PROFILE, atasanNip: '198001012009011008' },
        request: EMPTY_REQUEST,
      }),
    ).toEqual({ type: 'value', text: 'NIP. 19800101 200901 1 008' })
  })
})

describe('writing a NIP', () => {
  it('groups it the way it is written on a card', () => {
    expect(formatNip('199001012025061003')).toBe('19900101 202506 1 003')
  })

  it('regroups one that was typed with the wrong spacing', () => {
    expect(formatNip('1990 0101 2025 0610 03')).toBe('19900101 202506 1 003')
  })

  it('leaves a half-typed value looking half-typed', () => {
    // Forcing an incomplete value into the shape of a NIP would suggest it is
    // one. It is not, and the NIP-length warning has something to say about it.
    expect(formatNip('19900101')).toBe('19900101')
    expect(formatNip('')).toBe('')
  })

  it('stores digits only, however it was typed', () => {
    expect(normaliseNip('19900101 202506 1 003')).toBe('199001012025061003')
    expect(normaliseNip('1990-0101/2025 06 1 003')).toBe('199001012025061003')
  })

  it('does not let a NIP grow past eighteen digits', () => {
    expect(normaliseNip('1990010120250610039999')).toBe('199001012025061003')
  })

  it('round-trips through the form and back', () => {
    const typed = '19900101 202506 1 003'
    expect(formatNip(normaliseNip(typed))).toBe(typed)
  })

  it('writes the grouped form into the document', () => {
    expect(
      computeDerived('nip-berformat', {
        profile: { ...EMPTY_PROFILE, nip: '199001012025061003' },
        request: EMPTY_REQUEST,
      }),
    ).toEqual({ type: 'value', text: '19900101 202506 1 003' })
  })

  it('groups the prefixed signature-block form too', () => {
    expect(
      computeDerived('nip-berawalan', {
        profile: { ...EMPTY_PROFILE, nip: '199001012025061003' },
        request: EMPTY_REQUEST,
      }),
    ).toEqual({ type: 'value', text: 'NIP. 19900101 202506 1 003' })
  })
})
