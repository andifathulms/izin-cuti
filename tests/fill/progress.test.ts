import { describe, expect, it } from 'vitest'

import { sectionProgress } from '../../lib/fill/progress'
import type { FormModel } from '../../lib/fill/form'

const field = (key: string, value: string) => ({
  key,
  label: key,
  value,
  input: 'text' as const,
  span: 3 as const,
  targetIds: [],
  warnings: [],
})

const model = (over: Partial<FormModel> = {}): FormModel => ({
  profile: [],
  request: [],
  derived: [],
  groups: [],
  standalone: [],
  ...over,
})

describe('sectionProgress', () => {
  it('counts a field as filled only when it holds something other than whitespace', () => {
    const [, profile] = sectionProgress(
      model({ profile: [field('nama', 'Andi'), field('nip', '   '), field('jabatan', '')] }),
      false,
    )
    expect(profile).toMatchObject({ numeral: 'II', filled: 1, total: 3, complete: false })
  })

  it('reports the direktorat section from the choice, not from a field', () => {
    expect(sectionProgress(model(), false)[0]).toMatchObject({ filled: 0, complete: false })
    expect(sectionProgress(model(), true)[0]).toMatchObject({ filled: 1, complete: true })
  })

  it('counts a single-select group only once it has been answered', () => {
    const groups = [{ group: 'Jenis Cuti', options: [], chosen: null }]
    expect(sectionProgress(model({ groups }), true)[2]).toMatchObject({ filled: 0, complete: false })

    const chosen = [{ group: 'Jenis Cuti', options: [], chosen: 'box-3' }]
    expect(sectionProgress(model({ groups: chosen }), true)[2]).toMatchObject({
      filled: 1,
      complete: true,
    })
  })

  it('leaves standalone boxes out of the count, so an untouched option never blocks', () => {
    const standalone = [
      { target: { id: 'box-9', kind: 'checkbox' as const, label: 'Lainnya' }, checked: false },
    ] as unknown as FormModel['standalone']
    expect(sectionProgress(model({ standalone }), true)[2]).toMatchObject({
      total: 0,
      complete: true,
    })
  })

  it('calls an empty section complete rather than leaving it at nought of nought', () => {
    expect(sectionProgress(model(), true).every((section) => section.id.startsWith('sec-'))).toBe(
      true,
    )
    expect(sectionProgress(model(), true)[3]).toMatchObject({ total: 0, complete: true })
  })
})
