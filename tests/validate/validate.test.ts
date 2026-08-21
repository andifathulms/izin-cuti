import { describe, expect, it } from 'vitest'
import { validate, type ValidationInput } from '@/lib/validate/checks'
import { EMPTY_PROFILE, EMPTY_REQUEST } from '@/lib/derive/compute'

function input(
  request: Partial<ValidationInput['request']> = {},
  profile: Partial<ValidationInput['profile']> = {},
  jenisCutiTerpilih = 1,
): ValidationInput {
  return {
    profile: { ...EMPTY_PROFILE, ...profile },
    request: { ...EMPTY_REQUEST, ...request },
    jenisCutiTerpilih,
  }
}

const ids = (input: ValidationInput) => validate(input).map((warning) => warning.id)

/** A request with nothing wrong with it. */
const sound = input(
  {
    tanggalSurat: '2026-07-15',
    mulai: '2026-07-20',
    sampai: '2026-07-22',
    jenisCuti: 'Cuti Tahunan',
    sisaCutiSebelum: '12',
  },
  { nip: '199001012015011001' },
)

describe('a sound request', () => {
  it('produces no warnings at all', () => {
    expect(validate(sound)).toEqual([])
  })
})

describe('the check the reference document would have failed', () => {
  it('notices a letter dated a year before the leave it asks for', () => {
    // 17 Juli 2025 for leave starting 20 Juli 2026 — a template reused with
    // last year's date still in it, and exactly what gets bounced. It passes
    // an "is the letter before the leave?" check comfortably, which is why the
    // gap is checked as well.
    const warnings = validate(
      input({ tanggalSurat: '2025-07-17', mulai: '2026-07-20', sampai: '2026-07-22' }),
    )
    const warning = warnings.find((w) => w.id === 'tanggal-surat-jauh-sebelum')
    expect(warning?.message).toContain('368 hari')
    expect(warning?.message).toContain('17 Juli 2025')
  })

  it('notices a letter dated after the leave has started', () => {
    expect(ids(input({ tanggalSurat: '2026-07-25', mulai: '2026-07-20' }))).toContain(
      'tanggal-surat-setelah-mulai',
    )
  })

  it('says nothing about a letter written the week before', () => {
    expect(ids(sound)).toEqual([])
  })
})

describe('dates', () => {
  it('notices a range that runs backwards', () => {
    expect(ids(input({ mulai: '2026-07-22', sampai: '2026-07-20' }))).toContain('rentang-terbalik')
  })

  it('notices leave starting on a weekend', () => {
    expect(ids(input({ mulai: '2026-07-25', sampai: '2026-07-28' }))).toContain(
      'mulai-akhir-pekan',
    )
  })

  it('notices a range that is entirely weekend', () => {
    expect(ids(input({ mulai: '2026-07-25', sampai: '2026-07-26' }))).toContain(
      'seluruhnya-akhir-pekan',
    )
  })

  it('stays quiet while the dates are still being typed', () => {
    expect(validate(input({ mulai: '2026-07-20' }))).toEqual([])
  })
})

describe('balance', () => {
  it('notices leave that exceeds the remaining balance, and says by how much', () => {
    const warnings = validate(
      input({ mulai: '2026-07-20', sampai: '2026-07-31', sisaCutiSebelum: '2' }),
    )
    const warning = warnings.find((w) => w.id === 'melebihi-sisa-cuti')
    expect(warning?.message).toContain('2 hari')
    expect(warning?.message).toContain('Selisihnya 8 hari')
  })

  it('says nothing when the leave fits', () => {
    expect(ids(sound)).not.toContain('melebihi-sisa-cuti')
  })
})

describe('NIP', () => {
  it('notices a NIP that is not eighteen digits', () => {
    const warnings = validate(input({}, { nip: '19900101' }))
    expect(warnings[0]?.message).toContain('8 digit')
    expect(warnings[0]?.field).toBe('nip')
  })

  it('checks the atasan and the pejabat too, and names whose it is', () => {
    const warnings = validate(input({}, { atasanNip: '123', pejabatNip: '456' }))
    expect(warnings.map((w) => w.field)).toEqual(['atasanNip', 'pejabatNip'])
    expect(warnings[0]?.message).toContain('atasan langsung')
  })

  it('ignores formatting, since a NIP is often written in groups', () => {
    expect(ids(input({}, { nip: '19900101 201501 1 001' }))).toEqual([])
  })

  it('stays quiet on an empty field rather than nagging while it is blank', () => {
    expect(ids(input({}, { nip: '' }))).toEqual([])
  })
})

describe('leave type', () => {
  it('notices none selected', () => {
    const warnings = validate(input({}, {}, 0))
    expect(warnings[0]?.message).toContain('tepat satu')
  })

  it('notices more than one selected, and says how many', () => {
    const warnings = validate(input({}, {}, 3))
    expect(warnings[0]?.message).toContain('3 jenis cuti')
  })
})

describe('reason', () => {
  it('notices a missing reason on a type that usually needs one', () => {
    expect(ids(input({ jenisCuti: 'Cuti Karena Alasan Penting' }))).toContain('alasan-kosong')
  })

  it('does not ask for a reason on cuti tahunan', () => {
    expect(ids(input({ jenisCuti: 'Cuti Tahunan' }))).not.toContain('alasan-kosong')
  })
})

describe('the shape of validation itself', () => {
  it('has no way to express a blocking result', () => {
    const warnings = validate(
      input({ tanggalSurat: '2025-07-17', mulai: '2026-07-25', sampai: '2026-07-20' }, {}, 0),
    )
    // Several things are wrong at once. Every one is a warning; there is no
    // severity above it and nothing here can stop a download. Invariant 8.
    expect(warnings.length).toBeGreaterThan(1)
    for (const warning of warnings) {
      expect(Object.keys(warning).sort()).toEqual(['field', 'id', 'message'])
    }
  })

  it('attaches every warning to a field, so it can be announced inline', () => {
    const warnings = validate(
      input({ tanggalSurat: '2025-07-17', mulai: '2026-07-20', sampai: '2026-07-22' }, {}, 2),
    )
    expect(warnings.every((w) => w.field.length > 0)).toBe(true)
  })
})
