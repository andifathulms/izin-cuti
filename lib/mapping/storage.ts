import {
  DERIVATIONS,
  EMPTY_PROFILE,
  EMPTY_REQUEST,
  type DerivationId,
  type ProfileValues,
  type RequestValues,
} from '../derive/compute'
import type { Fingerprint } from '../docx/fingerprint'
import type { FieldSource, Mapping, Profile, Target } from './schema'

/**
 * Local storage, and nothing else.
 *
 * Nothing is transmitted, stored remotely, or measured. There is no server, so
 * this is structural rather than a policy — what persists is a mapping and a
 * profile, on this device, with an explicit export and clear-all. PRD §7.
 *
 * Everything read back is validated. Local storage is editable by hand and
 * survives across versions of this app, so anything in it is untrusted input:
 * a malformed mapping is discarded rather than half-believed, because a
 * half-believed mapping points at the wrong nodes.
 */

/*
 * The app is called Izin Cuti; this key prefix is not, and must not be.
 * It names data already written to real devices — rename it and every saved
 * profile and mapping is orphaned in place, with no way to find it again.
 * Same for the export `format` marker below and the IndexedDB name in
 * template-store.ts: they are identifiers, not branding.
 */
const PREFIX = 'isi-surat'
const MAPPINGS_KEY = `${PREFIX}.mappings.v1`
const PROFILES_KEY = `${PREFIX}.profiles.v1`
const ACTIVE_PROFILE_KEY = `${PREFIX}.active-profile.v1`

export type Store = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/** Null when there is no storage — a private window, or storage turned off. */
export function browserStore(): Store | null {
  try {
    const store = globalThis.localStorage
    if (store === undefined || store === null) return null
    const probe = `${PREFIX}.probe`
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch {
    // Storage denied. The app still works; nothing is remembered between
    // visits, and the profile panel says so rather than failing silently.
    return null
  }
}

export function loadMappings(store: Store | null): ReadonlyArray<Mapping> {
  return readArray(store, MAPPINGS_KEY, asMapping)
}

export function saveMapping(store: Store | null, mapping: Mapping): ReadonlyArray<Mapping> {
  const existing = loadMappings(store).filter((candidate) => candidate.id !== mapping.id)
  const next = [...existing, mapping]
  write(store, MAPPINGS_KEY, next)
  return next
}

export function deleteMapping(store: Store | null, id: string): ReadonlyArray<Mapping> {
  const next = loadMappings(store).filter((mapping) => mapping.id !== id)
  write(store, MAPPINGS_KEY, next)
  return next
}

export function loadProfiles(store: Store | null): ReadonlyArray<Profile> {
  return readArray(store, PROFILES_KEY, asProfile)
}

export function saveProfile(store: Store | null, profile: Profile): ReadonlyArray<Profile> {
  const existing = loadProfiles(store).filter((candidate) => candidate.id !== profile.id)
  const next = [...existing, profile]
  write(store, PROFILES_KEY, next)
  return next
}

export function deleteProfile(store: Store | null, id: string): ReadonlyArray<Profile> {
  const next = loadProfiles(store).filter((profile) => profile.id !== id)
  write(store, PROFILES_KEY, next)
  return next
}

export function loadActiveProfileId(store: Store | null): string | null {
  try {
    return store?.getItem(ACTIVE_PROFILE_KEY) ?? null
  } catch {
    return null
  }
}

export function saveActiveProfileId(store: Store | null, id: string | null): void {
  try {
    if (id === null) store?.removeItem(ACTIVE_PROFILE_KEY)
    else store?.setItem(ACTIVE_PROFILE_KEY, id)
  } catch {
    /* storage denied; the choice simply does not persist */
  }
}

/** Everything this app holds, as one file. */
export function exportAll(store: Store | null): string {
  return JSON.stringify(
    {
      format: 'isi-surat-export',
      version: 1,
      mappings: loadMappings(store),
      profiles: loadProfiles(store),
    },
    null,
    2,
  )
}

export type ImportResult =
  | { readonly type: 'imported'; readonly mappings: number; readonly profiles: number }
  | { readonly type: 'rejected'; readonly reason: string }

export function importAll(store: Store | null, text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { type: 'rejected', reason: 'Berkas ini bukan JSON yang bisa dibaca.' }
  }
  if (!isRecord(data) || data['format'] !== 'isi-surat-export') {
    return { type: 'rejected', reason: 'Berkas ini bukan hasil ekspor Izin Cuti.' }
  }

  const mappings = asArray(data['mappings'], asMapping)
  const profiles = asArray(data['profiles'], asProfile)
  write(store, MAPPINGS_KEY, [...loadMappings(store).filter((m) => !mappings.some((n) => n.id === m.id)), ...mappings])
  write(store, PROFILES_KEY, [...loadProfiles(store).filter((p) => !profiles.some((n) => n.id === p.id)), ...profiles])
  return { type: 'imported', mappings: mappings.length, profiles: profiles.length }
}

/** Every key this app owns. Visible, not buried in settings. DESIGN.md §8. */
export function clearAll(store: Store | null): void {
  for (const key of [MAPPINGS_KEY, PROFILES_KEY, ACTIVE_PROFILE_KEY]) {
    try {
      store?.removeItem(key)
    } catch {
      /* nothing to do; the value was not written either */
    }
  }
}

function write(store: Store | null, key: string, value: unknown): void {
  try {
    store?.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or denial. Nothing persists; the session still works. */
  }
}

function readArray<T>(store: Store | null, key: string, cast: (value: unknown) => T | null): T[] {
  try {
    const raw = store?.getItem(key)
    if (raw === null || raw === undefined) return []
    return asArray(JSON.parse(raw), cast)
  } catch {
    return []
  }
}

function asArray<T>(value: unknown, cast: (value: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return []
  const result: T[] = []
  for (const item of value) {
    const cast_ = cast(item)
    // A malformed entry is dropped, not repaired. A repaired mapping is a
    // mapping that points somewhere nobody chose.
    if (cast_ !== null) result.push(cast_)
  }
  return result
}

function asMapping(value: unknown): Mapping | null {
  if (!isRecord(value)) return null
  if (value['version'] !== 1) return null
  const id = asString(value['id'])
  const name = asString(value['name'])
  const createdAt = asString(value['createdAt'])
  const fingerprint = asFingerprint(value['fingerprint'])
  if (id === null || name === null || createdAt === null || fingerprint === null) return null

  const targets = asArray(value['targets'], asTarget)
  if (targets.length === 0) return null
  return { version: 1, id, name, createdAt, fingerprint, targets }
}

function asTarget(value: unknown): Target | null {
  if (!isRecord(value)) return null
  const id = asString(value['id'])
  const label = asString(value['label'])
  if (id === null || label === null) return null

  if (value['type'] === 'text') {
    const nodeIndices = asIndices(value['nodeIndices'])
    const source = asSource(value['source'])
    if (nodeIndices === null || source === null) return null
    return { type: 'text', id, label, nodeIndices, source }
  }
  if (value['type'] === 'checkbox') {
    const cellIndex = asIndex(value['cellIndex'])
    if (cellIndex === null) return null
    const group = value['group']
    return {
      type: 'checkbox',
      id,
      label,
      cellIndex,
      group: typeof group === 'string' ? group : null,
    }
  }
  return null
}

function asSource(value: unknown): FieldSource | null {
  if (!isRecord(value)) return null
  if (value['kind'] === 'profile') {
    const key = asString(value['key'])
    return key !== null && key in EMPTY_PROFILE
      ? { kind: 'profile', key: key as keyof ProfileValues }
      : null
  }
  if (value['kind'] === 'request') {
    const key = asString(value['key'])
    return key !== null && key in EMPTY_REQUEST
      ? { kind: 'request', key: key as keyof RequestValues }
      : null
  }
  if (value['kind'] === 'derived') {
    const computation = asString(value['computation'])
    return computation !== null && (DERIVATIONS as ReadonlyArray<string>).includes(computation)
      ? { kind: 'derived', computation: computation as DerivationId }
      : null
  }
  return null
}

function asFingerprint(value: unknown): Fingerprint | null {
  if (!isRecord(value) || value['version'] !== 1) return null
  const textNodeCount = asIndex(value['textNodeCount'])
  const checkboxCellCount = asIndex(value['checkboxCellCount'])
  const structuralHash = asString(value['structuralHash'])
  if (textNodeCount === null || checkboxCellCount === null || structuralHash === null) return null

  const targets = asArray(value['targets'], (target): Fingerprint['targets'][number] | null => {
    if (!isRecord(target)) return null
    const id = asString(target['id'])
    const label = asString(target['label'])
    const index = asIndex(target['index'])
    const contextHash = asString(target['contextHash'])
    const kind = target['kind']
    if (id === null || label === null || index === null || contextHash === null) return null
    if (kind !== 'text' && kind !== 'checkbox') return null
    return { id, label, kind, index, contextHash }
  })

  return { version: 1, textNodeCount, checkboxCellCount, structuralHash, targets }
}

function asProfile(value: unknown): Profile | null {
  if (!isRecord(value) || value['version'] !== 1) return null
  const id = asString(value['id'])
  const name = asString(value['name'])
  if (id === null || name === null) return null

  const stored = isRecord(value['values']) ? value['values'] : {}
  const values = { ...EMPTY_PROFILE }
  for (const key of Object.keys(EMPTY_PROFILE) as Array<keyof ProfileValues>) {
    const candidate = stored[key]
    if (typeof candidate === 'string') values[key] = candidate
  }
  return { version: 1, id, name, values }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function asIndices(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const indices: number[] = []
  for (const item of value) {
    const index = asIndex(item)
    if (index === null) return null
    indices.push(index)
  }
  return indices
}

/** An in-memory store, for tests and for a browser that denies storage. */
export function memoryStore(): Store {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}
