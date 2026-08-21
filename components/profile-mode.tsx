'use client'

import { useRef, useState } from 'react'
import { useApp } from '@/components/app-state'
import { PrivacyLine } from '@/components/shell/chrome'
import { EMPTY_PROFILE, type ProfileValues } from '@/lib/derive/compute'
import { clearAll, exportAll, importAll } from '@/lib/mapping/storage'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * Profiles, and the two controls that must never be buried in a settings
 * screen: export everything, and clear everything. A person who types their
 * NIP and home address into a page is owed both, visibly. DESIGN.md §8.
 */
export function ProfileMode({ locale }: { locale: Locale }) {
  const t = strings(locale)
  const app = useApp()
  const {
    store,
    storageAvailable,
    profiles,
    activeProfileId,
    profileValues,
    mappings,
    persistProfile,
    removeProfile,
    selectProfile,
    setProfileValue,
    removeMapping,
    refreshStorage,
  } = app

  const [name, setName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const save = () => {
    const label = name.trim() === '' ? (profileValues.nama.trim() || 'Profil') : name.trim()
    const existing = profiles.find((profile) => profile.id === activeProfileId)
    persistProfile({
      version: 1,
      id: existing?.id ?? `p-${Date.now().toString(36)}`,
      name: label,
      values: profileValues,
    })
    setNotice(t.profileSave)
  }

  const doExport = () => {
    const blob = new Blob([exportAll(store)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'isi-surat.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (file: File) => {
    const result = importAll(store, await file.text())
    setNotice(
      result.type === 'imported'
        ? `${result.mappings} + ${result.profiles}`
        : result.reason,
    )
    refreshStorage()
  }

  const doClear = () => {
    if (!window.confirm(t.profileClearConfirm)) return
    clearAll(store)
    refreshStorage()
    selectProfile(null)
    setNotice(t.profileClearAll)
  }

  return (
    <div className="mx-auto max-w-[80ch] px-6 py-8">
      <h1 className="text-xl font-semibold">{t.profileTitle}</h1>
      <PrivacyLine locale={locale} className="mt-2" />

      {!storageAvailable && (
        <p className="mt-4 flex items-baseline gap-2 text-base">
          <span aria-hidden className="text-attention">
            ▲
          </span>
          {t.profileNoStorage}
        </p>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="block text-sm font-medium">{t.profileName}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-base"
            />
          </label>
          <button
            type="button"
            onClick={save}
            className="rounded border border-typed bg-typed/10 px-4 py-2 text-base font-medium text-typed"
          >
            {t.profileSave}
          </button>
        </div>

        {profiles.length > 0 && (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {profiles.map((profile) => (
              <li key={profile.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-base">
                  {profile.name}
                  {profile.id === activeProfileId && (
                    <span className="ml-2 font-mono text-sm text-typed">✓</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    selectProfile(profile.id)
                    setName(profile.name)
                  }}
                  className="rounded border border-rule px-3 py-1 text-sm"
                >
                  {t.profileUse}
                </button>
                <button
                  type="button"
                  onClick={() => removeProfile(profile.id)}
                  className="rounded border border-rule px-3 py-1 text-sm text-ink/70"
                >
                  {t.profileDelete}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="border-b border-rule pb-1 text-base font-semibold">{t.fillProfile}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(Object.keys(EMPTY_PROFILE) as Array<keyof ProfileValues>).map((key) => (
            <label key={key} className="block">
              <span className="block text-sm font-medium">{t.fieldLabels[key] ?? key}</span>
              <input
                type="text"
                value={profileValues[key]}
                onChange={(event) => setProfileValue(key, event.target.value)}
                className={[
                  'mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-base text-typed',
                  key.toLowerCase().includes('nip') ? 'font-mono' : '',
                ].join(' ')}
              />
            </label>
          ))}
        </div>
      </section>

      {mappings.length > 0 && (
        <section className="mt-8">
          <h2 className="border-b border-rule pb-1 text-base font-semibold">{t.savedMappings}</h2>
          <ul className="mt-2 divide-y divide-rule">
            {mappings.map((mapping) => (
              <li key={mapping.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-base">
                  {mapping.name}{' '}
                  <span className="font-mono text-sm text-ink/60">
                    {mapping.targets.length} · {mapping.fingerprint.textNodeCount}/
                    {mapping.fingerprint.checkboxCellCount}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeMapping(mapping.id)}
                  className="rounded border border-rule px-3 py-1 text-sm text-ink/70"
                >
                  {t.profileDelete}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 border-t border-rule pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={doExport}
            className="rounded border border-rule px-4 py-2 text-base"
          >
            {t.profileExport}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded border border-rule px-4 py-2 text-base"
          >
            {t.profileImport}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void doImport(file)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={doClear}
            className="rounded border border-attention px-4 py-2 text-base text-attention"
          >
            {t.profileClearAll}
          </button>
          {notice !== null && <span className="text-sm text-ink/70">{notice}</span>}
        </div>
      </section>
    </div>
  )
}
