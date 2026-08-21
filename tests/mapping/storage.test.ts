import { describe, expect, it } from 'vitest'
import {
  clearAll,
  exportAll,
  importAll,
  loadMappings,
  loadProfiles,
  memoryStore,
  saveMapping,
  saveProfile,
  type Store,
} from '@/lib/mapping/storage'
import type { Mapping, Profile } from '@/lib/mapping/schema'
import { EMPTY_PROFILE } from '@/lib/derive/compute'

const mapping: Mapping = {
  version: 1,
  id: 'cuti',
  name: 'Surat Permintaan Izin Cuti',
  createdAt: '2026-07-15T00:00:00.000Z',
  fingerprint: {
    version: 1,
    textNodeCount: 97,
    checkboxCellCount: 14,
    structuralHash: 'abc123',
    targets: [
      { id: 'nama', label: 'Nama', kind: 'text', index: 4, contextHash: 'def456' },
    ],
  },
  targets: [
    {
      type: 'text',
      id: 'nama',
      label: 'Nama',
      nodeIndices: [4],
      source: { kind: 'profile', key: 'nama' },
    },
    { type: 'checkbox', id: 'tahunan', label: 'Cuti Tahunan', cellIndex: 0, group: 'jenis-cuti' },
  ],
}

const profile: Profile = {
  version: 1,
  id: 'saya',
  name: 'Saya',
  values: { ...EMPTY_PROFILE, nama: 'Siti Rahmawati', nip: '198705122010012003' },
}

describe('round-tripping through storage', () => {
  it('saves and loads a mapping unchanged', () => {
    const store = memoryStore()
    saveMapping(store, mapping)
    expect(loadMappings(store)).toEqual([mapping])
  })

  it('saves and loads a profile unchanged', () => {
    const store = memoryStore()
    saveProfile(store, profile)
    expect(loadProfiles(store)).toEqual([profile])
  })

  it('replaces rather than duplicates when the same id is saved again', () => {
    const store = memoryStore()
    saveMapping(store, mapping)
    saveMapping(store, { ...mapping, name: 'Nama baru' })
    expect(loadMappings(store).map((m) => m.name)).toEqual(['Nama baru'])
  })
})

describe('what comes back out is untrusted', () => {
  const withRaw = (raw: string): Store => {
    const store = memoryStore()
    store.setItem('isi-surat.mappings.v1', raw)
    return store
  }

  it('discards a mapping with no fingerprint rather than filling without one', () => {
    const { fingerprint: _fingerprint, ...withoutFingerprint } = mapping
    expect(loadMappings(withRaw(JSON.stringify([withoutFingerprint])))).toEqual([])
  })

  it('discards a target pointing at a node index that is not an index', () => {
    const broken = {
      ...mapping,
      targets: [{ ...mapping.targets[0], nodeIndices: ['empat'] }],
    }
    expect(loadMappings(withRaw(JSON.stringify([broken])))).toEqual([])
  })

  it('discards a derived target naming a computation that does not exist', () => {
    const broken = {
      ...mapping,
      targets: [
        {
          type: 'text',
          id: 'x',
          label: 'X',
          nodeIndices: [1],
          source: { kind: 'derived', computation: 'menghitung-sesuatu' },
        },
      ],
    }
    expect(loadMappings(withRaw(JSON.stringify([broken])))).toEqual([])
  })

  it('drops one malformed entry without losing the sound ones beside it', () => {
    const store = withRaw(JSON.stringify([mapping, { version: 1, id: 'rusak' }]))
    expect(loadMappings(store).map((m) => m.id)).toEqual(['cuti'])
  })

  it('survives storage holding something that is not JSON at all', () => {
    expect(loadMappings(withRaw('{{{'))).toEqual([])
  })

  it('survives a version it does not know', () => {
    expect(loadMappings(withRaw(JSON.stringify([{ ...mapping, version: 2 }])))).toEqual([])
  })

  it('fills a profile out with empty strings rather than undefined fields', () => {
    const store = memoryStore()
    store.setItem(
      'isi-surat.profiles.v1',
      JSON.stringify([{ version: 1, id: 'a', name: 'A', values: { nama: 'Budi' } }]),
    )
    expect(loadProfiles(store)[0]?.values).toEqual({ ...EMPTY_PROFILE, nama: 'Budi' })
  })
})

describe('export, import and clear all', () => {
  it('exports everything as one readable file', () => {
    const store = memoryStore()
    saveMapping(store, mapping)
    saveProfile(store, profile)
    const exported = JSON.parse(exportAll(store))
    expect(exported.format).toBe('isi-surat-export')
    expect(exported.mappings).toHaveLength(1)
    expect(exported.profiles).toHaveLength(1)
  })

  it('imports what it exported', () => {
    const from = memoryStore()
    saveMapping(from, mapping)
    saveProfile(from, profile)

    const to = memoryStore()
    expect(importAll(to, exportAll(from))).toEqual({ type: 'imported', mappings: 1, profiles: 1 })
    expect(loadMappings(to)).toEqual([mapping])
    expect(loadProfiles(to)).toEqual([profile])
  })

  it('rejects a file that is not an export of this app', () => {
    const result = importAll(memoryStore(), JSON.stringify({ hello: 'world' }))
    expect(result.type).toBe('rejected')
  })

  it('clears every key it owns', () => {
    const store = memoryStore()
    saveMapping(store, mapping)
    saveProfile(store, profile)
    clearAll(store)
    expect(loadMappings(store)).toEqual([])
    expect(loadProfiles(store)).toEqual([])
  })
})

describe('a browser that denies storage', () => {
  it('reads as empty and writes without throwing', () => {
    expect(loadMappings(null)).toEqual([])
    expect(() => saveMapping(null, mapping)).not.toThrow()
    expect(() => clearAll(null)).not.toThrow()
  })
})
