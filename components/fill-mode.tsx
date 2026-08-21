'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/components/app-state'
import { TemplatePicker } from '@/components/shell/template-picker'
import { DocumentPreview } from '@/components/preview/document-preview'
import { StateLegend } from '@/components/shell/chrome'
import { DownloadPanel } from '@/components/summary/download-panel'
import { DriftNotice } from '@/components/summary/drift-notice'
import {
  ChoiceGroupField,
  DerivedField,
  StandaloneBox,
  TextField,
} from '@/components/form/fields'
import { buildForm, checkedTargetIds, leaveTypeSelection } from '@/lib/fill/form'
import { applyMapping } from '@/lib/mapping/apply'
import { buildPreview, resolutionFromFill } from '@/lib/preview/model'
import { validate } from '@/lib/validate/checks'
import { serialiseDocx } from '@/lib/docx/serialise'
import type { ProfileValues, RequestValues } from '@/lib/derive/compute'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * Fill mode: the form on the left, the preview on the right, and the download
 * beneath the summary.
 *
 * Focusing a field marks where its value lands in the preview, so you always
 * see where the thing you are typing goes. DESIGN.md §5.
 */
export function FillMode({ locale }: { locale: Locale }) {
  const t = strings(locale)
  const app = useApp()
  const {
    template,
    mappings,
    activeMappingId,
    selectMapping,
    profileValues,
    request,
    checkboxChoice,
    checkboxState,
    focusedTargetId,
    setFocus,
    setProfileValue,
    setRequestValue,
    setChoice,
    setBox,
  } = app

  const [previewOpen, setPreviewOpen] = useState(false)
  const document = template.type === 'loaded' ? template.document : null
  const mapping = mappings.find((candidate) => candidate.id === activeMappingId) ?? null

  // With one mapping saved, choosing it is not a decision worth asking about.
  useEffect(() => {
    if (mapping === null && mappings.length === 1) selectMapping(mappings[0]!.id)
  }, [mapping, mappings, selectMapping])

  const leaveType = useMemo(
    () => (mapping === null ? null : leaveTypeSelection(mapping, checkboxChoice)),
    [mapping, checkboxChoice],
  )

  const warnings = useMemo(
    () =>
      validate({
        profile: profileValues,
        // The chosen leave type feeds the checks that depend on it, without
        // being a field anybody typed.
        request: { ...request, jenisCuti: leaveType?.chosenLabel ?? request.jenisCuti },
        jenisCutiTerpilih: leaveType?.count ?? 1,
      }),
    [profileValues, request, leaveType],
  )

  const model = useMemo(() => {
    if (mapping === null) return null
    return buildForm(
      mapping,
      { profile: profileValues, request },
      t.fieldLabels,
      warnings,
      checkboxChoice,
      checkboxState,
    )
  }, [mapping, profileValues, request, t.fieldLabels, warnings, checkboxChoice, checkboxState])

  const applied = useMemo(() => {
    if (document === null || mapping === null) return null
    return applyMapping(document, mapping, {
      profile: profileValues,
      request,
      checkboxChoice,
      checkboxState,
    })
  }, [document, mapping, profileValues, request, checkboxChoice, checkboxState])

  const preview = useMemo(() => {
    if (document === null) return null
    if (mapping === null || applied === null || applied.type !== 'filled') {
      return buildPreview(document, {
        values: new Map(),
        boxes: new Map(),
        markUnmapped: false,
        mappedNodes: new Set(),
        mappedCells: new Set(),
        focusedTargetId,
      })
    }
    return buildPreview(
      document,
      resolutionFromFill(
        mapping,
        applied.fields,
        model === null ? new Set() : checkedTargetIds(model),
        focusedTargetId,
      ),
    )
  }, [document, mapping, applied, model, focusedTargetId])

  const download = () => {
    if (template.type !== 'loaded' || applied === null || applied.type !== 'filled') return
    const bytes = serialiseDocx(template.package, applied.xml)
    // Copied into its own buffer: fflate may hand back a view onto a larger
    // one, and Blob would otherwise be given the whole thing.
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = fileName(mapping?.name ?? 'surat', profileValues, request)
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (document === null) {
    return (
      <div>
        <TemplatePicker locale={locale} />
        <div className="px-6 py-12">
          <h1 className="text-xl font-semibold">{t.noTemplate}</h1>
          <p className="mt-2 text-base text-ink/70">{t.noTemplateHint}</p>
        </div>
      </div>
    )
  }

  if (applied !== null && applied.type === 'refused-drift') {
    return (
      <div>
        <TemplatePicker locale={locale} />
        <DriftNotice locale={locale} differences={applied.differences} />
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <TemplatePicker locale={locale} />

      <div className="no-print flex flex-wrap items-center gap-4 border-b border-rule px-6 py-3">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium">{t.fillChooseMapping}</span>
          <select
            value={activeMappingId ?? ''}
            onChange={(event) => selectMapping(event.target.value || null)}
            className="rounded border border-rule bg-white px-2 py-1 text-base"
          >
            <option value="">—</option>
            {mappings.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <StateLegend locale={locale} />
        <button
          type="button"
          onClick={() => setPreviewOpen((open) => !open)}
          className="ml-auto rounded border border-rule px-3 py-1 text-sm lg:hidden"
        >
          {t.preview}
        </button>
      </div>

      {mapping === null || model === null ? (
        <div className="px-6 py-12">
          <h1 className="text-xl font-semibold">{t.fillNoMapping}</h1>
          <p className="mt-2 text-base">
            <Link href={`/${locale}/petakan`} className="text-typed underline">
              {t.navMap}
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[3fr_2fr]">
          <div className="min-h-0 overflow-auto border-r border-rule">
            <form className="space-y-8 px-6 py-6" onSubmit={(event) => event.preventDefault()}>
              <Section title={t.fillProfile}>
                {model.profile.map((field) => (
                  <TextField
                    key={field.key}
                    field={field}
                    onChange={(value) => setProfileValue(field.key as keyof ProfileValues, value)}
                    onFocus={setFocus}
                  />
                ))}
              </Section>

              <Section title={t.fillRequest}>
                {model.request.map((field) => (
                  <TextField
                    key={field.key}
                    field={field}
                    onChange={(value) => setRequestValue(field.key as keyof RequestValues, value)}
                    onFocus={setFocus}
                  />
                ))}
              </Section>

              {(model.groups.length > 0 || model.standalone.length > 0) && (
                <Section title={t.fillChecklist}>
                  {model.groups.map((group) => (
                    <ChoiceGroupField
                      key={group.group}
                      group={group}
                      onChoose={(targetId) => setChoice(group.group, targetId)}
                      onFocus={setFocus}
                    />
                  ))}
                  {model.standalone.map(({ target, checked }) => (
                    <StandaloneBox
                      key={target.id}
                      target={target}
                      checked={checked}
                      onToggle={(next) => setBox(target.id, next)}
                      onFocus={setFocus}
                    />
                  ))}
                </Section>
              )}

              {model.derived.length > 0 && (
                <Section title={t.fillDerived} note={t.fillDerivedNote}>
                  {model.derived.map((row) => (
                    <DerivedField key={row.targetId} locale={locale} row={row} onFocus={setFocus} />
                  ))}
                </Section>
              )}
            </form>

            <DownloadPanel
              locale={locale}
              fields={applied?.type === 'filled' ? applied.fields : []}
              checkedLabels={applied?.type === 'filled' ? applied.checkedLabels : []}
              warnings={warnings}
              disabled={applied === null || applied.type !== 'filled'}
              onDownload={download}
              onPrint={() => window.print()}
            />
          </div>

          <div className={`min-h-0 ${previewOpen ? '' : 'hidden lg:block'}`}>
            <DocumentPreview locale={locale} model={preview} focusKey={focusedTargetId} />
          </div>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="border-b border-rule pb-1 text-base font-semibold">{title}</h2>
      {note !== undefined && <p className="mt-1 text-sm text-ink/60">{note}</p>}
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  )
}

/** A filename somebody can find again in a downloads folder. */
function fileName(mappingName: string, profile: ProfileValues, request: RequestValues): string {
  const parts = [mappingName, profile.nama, request.mulai].filter((part) => part.trim() !== '')
  return `${parts.join(' - ').replace(/[\\/:*?"<>|]/g, '-')}.docx`
}
