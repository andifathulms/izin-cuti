import { describe, expect, it } from 'vitest'

import { loadMappings, memoryStore, saveMapping } from '@/lib/mapping/storage'
import { signatureTargets, type Mapping } from '@/lib/mapping/schema'
import { FORMULIR_CUTI_MAPPING } from '@/lib/presets/formulir-cuti.generated'

describe('a signature target through storage', () => {
  it('survives being saved and read back', () => {
    // It did not. The validator knew two target types, returned null for
    // anything else, and the target was dropped on the way out — so the app
    // loaded the bundled form, saved it, read it back, and reported that this
    // form has no place for a signature.
    const store = memoryStore()
    saveMapping(store, FORMULIR_CUTI_MAPPING)
    const loaded = loadMappings(store).find((m) => m.id === FORMULIR_CUTI_MAPPING.id)
    expect(loaded, 'the mapping did not come back').toBeDefined()
    expect(signatureTargets(loaded!)).toEqual(signatureTargets(FORMULIR_CUTI_MAPPING))
  })

  it('round-trips the whole mapping unchanged, not only its signature', () => {
    const store = memoryStore()
    saveMapping(store, FORMULIR_CUTI_MAPPING)
    expect(loadMappings(store)[0]).toEqual(FORMULIR_CUTI_MAPPING)
  })

  it('keeps the signature in the fingerprint, so drift is still checked for it', () => {
    // The fingerprint validator dropped it too, which is the worse of the two
    // failures: the mapping still loaded and still filled, and the paragraph
    // the image lands in silently stopped being checked against the template.
    const store = memoryStore()
    saveMapping(store, FORMULIR_CUTI_MAPPING)
    const loaded = loadMappings(store)[0]!
    expect(loaded.fingerprint.targets.filter((t) => t.kind === 'signature')).toEqual(
      FORMULIR_CUTI_MAPPING.fingerprint.targets.filter((t) => t.kind === 'signature'),
    )
  })

  it('still drops a target it cannot make sense of', () => {
    const store = memoryStore()
    const broken = {
      ...FORMULIR_CUTI_MAPPING,
      targets: [
        ...FORMULIR_CUTI_MAPPING.targets,
        { type: 'signature', id: 'x', label: 'x' },
        { type: 'signature', id: 'y', label: 'y', paragraphIndex: 'not a number' },
      ],
    } as unknown as Mapping
    saveMapping(store, broken)
    expect(signatureTargets(loadMappings(store)[0]!)).toHaveLength(1)
  })
})
