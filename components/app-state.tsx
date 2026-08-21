'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { readDocx, documentXml, type DocxPackage } from '@/lib/docx/unzip'
import { parseDocument, type ParsedDocument } from '@/lib/docx/parse'
import type { Mapping, Profile } from '@/lib/mapping/schema'
import {
  browserStore,
  deleteMapping,
  deleteProfile,
  loadActiveProfileId,
  loadMappings,
  loadProfiles,
  saveActiveProfileId,
  saveMapping,
  saveProfile,
  type Store,
} from '@/lib/mapping/storage'
import {
  EMPTY_PROFILE,
  EMPTY_REQUEST,
  type ProfileValues,
  type RequestValues,
} from '@/lib/derive/compute'

/**
 * One place holds the document, the mapping and the values, so map mode and
 * fill mode are two views of the same session rather than two apps.
 *
 * The document itself is never persisted. Bytes of somebody's letter have no
 * business in local storage; what persists is a mapping and a profile, and
 * only because a person asked for them to.
 */

export type TemplateState =
  | { readonly type: 'none' }
  | { readonly type: 'unreadable'; readonly fileName: string; readonly reason: string }
  | {
      readonly type: 'loaded'
      readonly fileName: string
      readonly package: DocxPackage
      readonly document: ParsedDocument
    }

type State = {
  readonly template: TemplateState
  readonly mappings: ReadonlyArray<Mapping>
  readonly activeMappingId: string | null
  readonly profiles: ReadonlyArray<Profile>
  readonly activeProfileId: string | null
  readonly profileValues: ProfileValues
  readonly request: RequestValues
  readonly checkboxChoice: Readonly<Record<string, string | null>>
  readonly checkboxState: Readonly<Record<string, boolean>>
  readonly focusedTargetId: string | null
  readonly storageAvailable: boolean
}

type Action =
  | { type: 'template-loaded'; fileName: string; package: DocxPackage; document: ParsedDocument }
  | { type: 'template-unreadable'; fileName: string; reason: string }
  | { type: 'template-cleared' }
  | { type: 'hydrated'; mappings: ReadonlyArray<Mapping>; profiles: ReadonlyArray<Profile>; activeProfileId: string | null; storageAvailable: boolean }
  | { type: 'mappings-changed'; mappings: ReadonlyArray<Mapping>; activeMappingId?: string | null }
  | { type: 'mapping-selected'; id: string | null }
  | { type: 'profiles-changed'; profiles: ReadonlyArray<Profile> }
  | { type: 'profile-selected'; id: string | null; values: ProfileValues }
  | { type: 'profile-value-changed'; key: keyof ProfileValues; value: string }
  | { type: 'request-value-changed'; key: keyof RequestValues; value: string }
  | { type: 'choice-changed'; group: string; targetId: string | null }
  | { type: 'box-toggled'; targetId: string; checked: boolean }
  | { type: 'focus-changed'; targetId: string | null }

const INITIAL: State = {
  template: { type: 'none' },
  mappings: [],
  activeMappingId: null,
  profiles: [],
  activeProfileId: null,
  profileValues: EMPTY_PROFILE,
  request: EMPTY_REQUEST,
  checkboxChoice: {},
  checkboxState: {},
  focusedTargetId: null,
  storageAvailable: true,
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'template-loaded':
      return {
        ...state,
        template: {
          type: 'loaded',
          fileName: action.fileName,
          package: action.package,
          document: action.document,
        },
      }
    case 'template-unreadable':
      return {
        ...state,
        template: { type: 'unreadable', fileName: action.fileName, reason: action.reason },
      }
    case 'template-cleared':
      return { ...state, template: { type: 'none' } }
    case 'hydrated':
      return {
        ...state,
        mappings: action.mappings,
        profiles: action.profiles,
        activeProfileId: action.activeProfileId,
        profileValues:
          action.profiles.find((profile) => profile.id === action.activeProfileId)?.values ??
          state.profileValues,
        storageAvailable: action.storageAvailable,
      }
    case 'mappings-changed':
      return {
        ...state,
        mappings: action.mappings,
        activeMappingId:
          action.activeMappingId === undefined ? state.activeMappingId : action.activeMappingId,
      }
    case 'mapping-selected':
      return { ...state, activeMappingId: action.id }
    case 'profiles-changed':
      return { ...state, profiles: action.profiles }
    case 'profile-selected':
      return { ...state, activeProfileId: action.id, profileValues: action.values }
    case 'profile-value-changed':
      return {
        ...state,
        profileValues: { ...state.profileValues, [action.key]: action.value },
      }
    case 'request-value-changed':
      return { ...state, request: { ...state.request, [action.key]: action.value } }
    case 'choice-changed':
      return {
        ...state,
        checkboxChoice: { ...state.checkboxChoice, [action.group]: action.targetId },
      }
    case 'box-toggled':
      return {
        ...state,
        checkboxState: { ...state.checkboxState, [action.targetId]: action.checked },
      }
    case 'focus-changed':
      return { ...state, focusedTargetId: action.targetId }
    default: {
      const unreachable: never = action
      throw new Error(`unhandled action ${JSON.stringify(unreachable)}`)
    }
  }
}

export type AppState = State & {
  readonly store: Store | null
  readonly openTemplate: (file: File) => Promise<void>
  readonly clearTemplate: () => void
  readonly persistMapping: (mapping: Mapping) => void
  readonly removeMapping: (id: string) => void
  readonly selectMapping: (id: string | null) => void
  readonly persistProfile: (profile: Profile) => void
  readonly removeProfile: (id: string) => void
  readonly selectProfile: (id: string | null) => void
  readonly setProfileValue: (key: keyof ProfileValues, value: string) => void
  readonly setRequestValue: (key: keyof RequestValues, value: string) => void
  readonly setChoice: (group: string, targetId: string | null) => void
  readonly setBox: (targetId: string, checked: boolean) => void
  readonly setFocus: (targetId: string | null) => void
  readonly refreshStorage: () => void
}

const Context = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reduce, INITIAL)
  const store = useMemo(() => (typeof window === 'undefined' ? null : browserStore()), [])

  const hydrate = useCallback(() => {
    dispatch({
      type: 'hydrated',
      mappings: loadMappings(store),
      profiles: loadProfiles(store),
      activeProfileId: loadActiveProfileId(store),
      storageAvailable: store !== null,
    })
  }, [store])

  useEffect(hydrate, [hydrate])

  const openTemplate = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const read = readDocx(bytes)
    if (read.type !== 'read') {
      dispatch({ type: 'template-unreadable', fileName: file.name, reason: read.reason })
      return
    }
    const parsed = parseDocument(documentXml(read.package))
    if (parsed.type !== 'parsed') {
      dispatch({ type: 'template-unreadable', fileName: file.name, reason: parsed.reason })
      return
    }
    dispatch({
      type: 'template-loaded',
      fileName: file.name,
      package: read.package,
      document: parsed.document,
    })
  }, [])

  const value: AppState = useMemo(
    () => ({
      ...state,
      store,
      openTemplate,
      clearTemplate: () => dispatch({ type: 'template-cleared' }),
      persistMapping: (mapping) =>
        dispatch({
          type: 'mappings-changed',
          mappings: saveMapping(store, mapping),
          activeMappingId: mapping.id,
        }),
      removeMapping: (id) =>
        dispatch({
          type: 'mappings-changed',
          mappings: deleteMapping(store, id),
          activeMappingId: state.activeMappingId === id ? null : state.activeMappingId,
        }),
      selectMapping: (id) => dispatch({ type: 'mapping-selected', id }),
      persistProfile: (profile) =>
        dispatch({ type: 'profiles-changed', profiles: saveProfile(store, profile) }),
      removeProfile: (id) => {
        dispatch({ type: 'profiles-changed', profiles: deleteProfile(store, id) })
        if (state.activeProfileId === id) {
          saveActiveProfileId(store, null)
          dispatch({ type: 'profile-selected', id: null, values: EMPTY_PROFILE })
        }
      },
      selectProfile: (id) => {
        saveActiveProfileId(store, id)
        const values = state.profiles.find((profile) => profile.id === id)?.values ?? EMPTY_PROFILE
        dispatch({ type: 'profile-selected', id, values })
      },
      setProfileValue: (key, valueText) =>
        dispatch({ type: 'profile-value-changed', key, value: valueText }),
      setRequestValue: (key, valueText) =>
        dispatch({ type: 'request-value-changed', key, value: valueText }),
      setChoice: (group, targetId) => dispatch({ type: 'choice-changed', group, targetId }),
      setBox: (targetId, checked) => dispatch({ type: 'box-toggled', targetId, checked }),
      setFocus: (targetId) => dispatch({ type: 'focus-changed', targetId }),
      refreshStorage: hydrate,
    }),
    [state, store, openTemplate, hydrate],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useApp(): AppState {
  const value = useContext(Context)
  if (value === null) throw new Error('useApp used outside AppStateProvider')
  return value
}
