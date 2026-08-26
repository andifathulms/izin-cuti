'use client'

import { useRef, useState } from 'react'
import { useApp } from '@/components/app-state'
import { PrivacyLine } from '@/components/shell/chrome'
import { TemplatePicker } from '@/components/shell/template-picker'
import { EMPTY_PROFILE, type ProfileValues } from '@/lib/derive/compute'
import { formatNip, normaliseNip } from '@/lib/derive/nip'
import { fieldLayout } from '@/lib/fill/form'
import { SPAN } from '@/components/form/fields'
import { clearAll, exportAll, importAll } from '@/lib/mapping/storage'
import { forgetTemplate } from '@/lib/mapping/template-store'
import Link from 'next/link'
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
    // Not the button's own label echoed back: "Simpan profil" sitting beside
    // the button it came from is indistinguishable from the button, and it
    // never leaves, so the next save appears to do nothing at all.
    setNotice(t.profileSaved)
  }

  const doExport = () => {
    const blob = new Blob([exportAll(store)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'izin-cuti.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (file: File) => {
    const result = importAll(store, await file.text())
    // It used to say `2 + 1`: two integers and a plus sign, with no words, as
    // the only confirmation for the one operation that overwrites saved data.
    setNotice(
      result.type === 'imported'
        ? t.profileImported
            .replace('{m}', String(result.mappings))
            .replace('{p}', String(result.profiles))
        : `${t.profileImportRejected} ${result.reason}`,
    )
    refreshStorage()
  }

  const doClear = () => {
    if (!window.confirm(t.profileClearConfirm)) return
    clearAll(store)
    // Clear all means all of it, including a remembered template.
    void forgetTemplate()
    refreshStorage()
    selectProfile(null)
    setNotice(t.profileCleared)
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
              spellCheck={false}
              className="mt-1 w-full border-0 border-b border-rule bg-transparent px-1 py-1 text-base"
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
                    /*
                     * The tick was the whole of it: a bare ✓ in a span, which
                     * a screen reader reads as the character or as nothing,
                     * so which profile is loaded — the one thing this list is
                     * for — was unavailable. The glyph is decoration and the
                     * state is a word, the same shape the preview's checkbox
                     * uses. WCAG 1.1.1.
                     */
                    <span className="ml-2 font-mono text-sm text-typed">
                      <span aria-hidden>✓</span>
                      <span className="sr-only">{t.profileActive}</span>
                    </span>
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
                  className="rounded border border-rule px-3 py-1 text-sm text-ink-muted"
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
        {/*
         * The same fourteen fields as the fill screen, laid out the same way.
         * This grid was md:grid-cols-2 with every field the same width, so the
         * shape learned on one screen did not transfer to the other — and it
         * decided what a NIP was by testing the key for the substring "nip"
         * rather than asking the one place that knows. Both now come from
         * fieldLayout().
         */}
        <div className="mt-3 grid grid-cols-6 gap-x-4 gap-y-3">
          {(Object.keys(EMPTY_PROFILE) as Array<keyof ProfileValues>).map((key) => {
            const { input, span, prose } = fieldLayout(key)
            const isNip = input === 'nip'
            return (
              <label key={key} className={`block ${SPAN[span]}`}>
                <span className="block text-sm font-medium">{t.fieldLabels[key] ?? key}</span>
                <input
                  type="text"
                  inputMode={isNip ? 'numeric' : undefined}
                  value={isNip ? formatNip(profileValues[key]) : profileValues[key]}
                  onChange={(event) =>
                    setProfileValue(
                      key,
                      isNip ? normaliseNip(event.target.value) : event.target.value,
                    )
                  }
                  spellCheck={prose}
                  className={[
                    'mt-1 w-full border-0 border-b border-rule bg-transparent px-1 py-1 text-base text-typed',
                    isNip ? 'font-mono' : '',
                  ].join(' ')}
                />
              </label>
            )
          })}
        </div>
      </section>

      {/* The document. Not on the fill screen, because this app fills one form
          and opens it itself — this is the escape hatch for the day the office
          reissues it. */}
      <section className="mt-8">
        <h2 className="border-b border-rule pb-1 text-base font-semibold">{t.documentSource}</h2>
        <div className="-mx-6 mt-2">
          <TemplatePicker locale={locale} />
        </div>
      </section>

      {mappings.length > 0 && (
        <section className="mt-8">
          <h2 className="border-b border-rule pb-1 text-base font-semibold">{t.savedMappings}</h2>
          <ul className="mt-2 divide-y divide-rule">
            {mappings.map((mapping) => (
              <li key={mapping.id} className="flex items-center gap-3 py-2">
                {/* Was `37 · 97/14`: three unlabelled integers, a slash and a
                    middot, in the list where you decide what to delete. */}
                <span className="flex-1 text-base">
                  {mapping.name}{' '}
                  <span className="font-mono text-sm text-ink-muted">
                    {mapping.targets.length} {t.targets} ·{' '}
                    {mapping.fingerprint.textNodeCount} {t.textNodes} ·{' '}
                    {mapping.fingerprint.checkboxCellCount} {t.checkboxCells}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeMapping(mapping.id)}
                  className="rounded border border-rule px-3 py-1 text-sm text-ink-muted"
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
          {/* Saving, importing and clearing said nothing at all to a screen
              reader. role="status" is polite and does not move focus, which
              is right for a confirmation nobody asked to be interrupted by.
              WCAG 4.1.3. */}
          {notice !== null && (
            <span role="status" className="text-sm text-ink-muted">
              {notice}
            </span>
          )}
        </div>

        {/*
         * Clear-all stood in that same row, the same size as Export — which is
         * its own safety net — and it is the only irreversible action in the
         * app. Weight should match consequence, so it sits apart, under a
         * rule, with what it deletes written out rather than living only
         * inside a confirm dialog nobody reads.
         */}
        <div className="mt-8 border-t border-rule pt-4">
          <button
            type="button"
            onClick={doClear}
            className="rounded border border-attention px-4 py-2 text-base text-attention"
          >
            {t.profileClearAll}
          </button>
          <p className="mt-2 max-w-[60ch] text-sm text-ink-muted">{t.profileClearWhy}</p>
        </div>

        {/* Not in the main navigation: needed only if the office reissues the
            form and the mapping has to be redrawn. */}
        <p className="mt-6 text-sm text-ink-muted">
          <Link href={`/${locale}/petakan`} className="underline">
            {t.navMap}
          </Link>
        </p>
      </section>
    </div>
  )
}
