'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/components/app-state'
import { PrivacyFootnote } from '@/components/shell/template-picker'
import { DocumentPreview } from '@/components/preview/document-preview'
import { FlowLine, StateLegend } from '@/components/shell/chrome'
import { DownloadPanel } from '@/components/summary/download-panel'
import { DriftNotice } from '@/components/summary/drift-notice'
import { PdfPreview } from '@/components/summary/pdf-preview'
import { ChoiceGroupField, StandaloneBox, TextField } from '@/components/form/fields'
import { buildForm, checkedTargetIds, leaveTypeSelection } from '@/lib/fill/form'
import { DIREKTORAT, direktoratOf, managedKeys } from '@/lib/presets/kedeputian'
import { formatNip, normaliseNip } from '@/lib/derive/nip'
import { applyMapping } from '@/lib/mapping/apply'
import { buildPreview, resolutionFromFill } from '@/lib/preview/model'
import { validate } from '@/lib/validate/checks'
import { serialiseDocx } from '@/lib/docx/serialise'
import { renderPdf } from '@/lib/pdf/render'
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
    chooseDirektorat,
    openBundledForm,
  } = app

  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const document = template.type === 'loaded' ? template.document : null
  const mapping = mappings.find((candidate) => candidate.id === activeMappingId) ?? null

  // With one mapping saved, choosing it is not a decision worth asking about.
  useEffect(() => {
    if (mapping === null && mappings.length === 1) selectMapping(mappings[0]!.id)
  }, [mapping, mappings, selectMapping])

  // This app fills one form. Opening it is not a step worth making somebody
  // take, so it opens itself and the picker stays available for the day the
  // office reissues the form.
  useEffect(() => {
    if (template.type === 'none') openBundledForm()
  }, [template.type, openBundledForm])

  const chosenDirektorat = useMemo(() => direktoratOf(profileValues), [profileValues])
  const managed = useMemo(() => managedKeys(chosenDirektorat), [chosenDirektorat])

  const leaveType = useMemo(
    () => (mapping === null ? null : leaveTypeSelection(mapping, checkboxChoice)),
    [mapping, checkboxChoice],
  )

  // The chosen leave type travels with the request here, so the end-date
  // bounds know whether the twelve-day allowance applies.
  const requestWithType = useMemo(
    () => ({ ...request, jenisCuti: leaveType?.chosenLabel ?? request.jenisCuti }),
    [request, leaveType],
  )

  const warnings = useMemo(
    () =>
      validate({
        profile: profileValues,
        // The chosen leave type feeds the checks that depend on it, without
        // being a field anybody typed.
        request: requestWithType,
        jenisCutiTerpilih: leaveType?.count ?? 1,
      }),
    [profileValues, requestWithType, leaveType],
  )

  const model = useMemo(() => {
    if (mapping === null) return null
    return buildForm(
      mapping,
      { profile: profileValues, request: requestWithType },
      t.fieldLabels,
      warnings,
      checkboxChoice,
      checkboxState,
      managed,
    )
  }, [
    mapping,
    profileValues,
    requestWithType,
    t.fieldLabels,
    warnings,
    checkboxChoice,
    checkboxState,
    managed,
  ])

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

  const save = (bytes: Uint8Array, type: string, extension: string) => {
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = fileName(mapping?.name ?? 'surat', profileValues, request, extension)
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const pdfBytes = () =>
    preview === null ? null : renderPdf(preview, { title: mapping?.name ?? 'Surat' })

  const downloadPdf = () => {
    const bytes = pdfBytes()
    if (bytes !== null) save(bytes, 'application/pdf', 'pdf')
  }

  /**
   * Build the PDF and show it, in this tab, from a blob. Nothing is uploaded
   * to be previewed — which is the only reason a PDF preview can be offered
   * here at all.
   */
  const openPdfPreview = () => {
    const bytes = pdfBytes()
    if (bytes === null) return
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
    setPdfUrl((previous) => {
      if (previous !== null) URL.revokeObjectURL(previous)
      return URL.createObjectURL(blob)
    })
  }

  const closePdfPreview = useCallback(() => {
    setPdfUrl((previous) => {
      if (previous !== null) URL.revokeObjectURL(previous)
      return null
    })
  }, [])

  // A blob URL holds its bytes until it is revoked, and those bytes are
  // somebody's filled letter.
  useEffect(() => () => {
    if (pdfUrl !== null) URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  const download = () => {
    if (template.type !== 'loaded' || applied === null || applied.type !== 'filled') return
    save(
      serialiseDocx(template.package, applied.xml),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'docx',
    )
  }

  if (document === null) {
    /*
     * Two different absences, and they used to share one message.
     *
     * `none` on this screen is never a resting state — the effect above opens
     * the bundled form, and re-opens it after a clear — so it is the first
     * frame and nothing else. It was showing "no document yet, choose your
     * own .docx to begin", which is the first thing a stranger read and the
     * opposite of how this app works. It says what is happening instead.
     *
     * `unreadable` is a real stop, and it now gets the refusal and the reason
     * rather than being described as an empty screen.
     */
    const unreadable = template.type === 'unreadable'
    return (
      <div className="px-6 py-12">
        <h1 className="flex items-baseline gap-2 text-xl font-semibold">
          {unreadable && (
            <span aria-hidden className="text-attention">
              ▲
            </span>
          )}
          {unreadable ? t.notADocx : t.openingForm}
        </h1>
        <p className="mt-2 max-w-[70ch] text-base text-ink-muted">
          {unreadable ? t.notADocxHint : t.openingFormHint}
        </p>
        {unreadable && (
          <p className="mt-2 font-mono text-sm text-ink-muted">{template.reason}</p>
        )}
      </div>
    )
  }

  if (applied !== null && applied.type === 'refused-drift') {
    return <DriftNotice locale={locale} differences={applied.differences} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="no-print flex flex-wrap items-center gap-4 border-b border-rule px-6 py-2">
        {/* One form means one mapping, and a select with one option in it is
            noise. It reappears the moment there is a second. */}
        {mappings.length > 1 && (
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
        )}
        <FlowLine locale={locale} />
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
        <div className="print-area grid min-h-0 flex-1 lg:grid-cols-2">
          <div className="no-print min-h-0 overflow-auto border-r border-rule">
            <form className="space-y-8 px-6 py-6" onSubmit={(event) => event.preventDefault()}>
              <Section title={t.fillDirektorat} note={t.fillDirektoratHint}>
                <label className="block">
                  <span className="block text-sm font-medium">{t.fillDirektorat}</span>
                  <select
                    value={chosenDirektorat?.id ?? ''}
                    onChange={(event) => chooseDirektorat(event.target.value)}
                    className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-base text-typed"
                  >
                    <option value="">{t.fillDirektoratNone}</option>
                    {DIREKTORAT.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.nama}
                      </option>
                    ))}
                  </select>
                </label>

                {chosenDirektorat !== null && (
                  <div className="border-l-2 border-derived pl-3">
                    <p className="text-sm font-medium">{chosenDirektorat.jabatanDirektur}</p>
                    <p className="text-base text-derived">{chosenDirektorat.direkturNama}</p>
                    {chosenDirektorat.direkturNip === null ? (
                      <>
                        {/* Not invented. A plausible wrong NIP on a signed
                            letter is worse than an empty box — so it is asked
                            for, once, right here where the gap is visible.
                            The NIPs reach the document through derived fields,
                            so there is no generated input to fall back on. */}
                        <p className="mt-1 flex max-w-[60ch] items-baseline gap-2 text-sm">
                          <span aria-hidden className="text-attention">
                            ▲
                          </span>
                          {t.fillDirekturUnknownNip}
                        </p>
                        <label className="mt-2 block">
                          <span className="block text-sm font-medium">
                            {t.fieldLabels['atasanNip']}
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatNip(profileValues.atasanNip)}
                            onChange={(event) => {
                              // One person signs both blocks, so one entry.
                              const digits = normaliseNip(event.target.value)
                              setProfileValue('atasanNip', digits)
                              setProfileValue('pejabatNip', digits)
                            }}
                            onFocus={() => setFocus('atasan-nip')}
                            onBlur={() => setFocus(null)}
                            className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 font-mono text-base text-typed"
                          />
                        </label>
                      </>
                    ) : (
                      <p className="font-mono text-base text-derived">
                        NIP. {formatNip(chosenDirektorat.direkturNip)}
                      </p>
                    )}
                  </div>
                )}
              </Section>

              <Section title={t.fillProfile} grid>
                {model.profile.map((field) => (
                  <div key={field.key} className={SPAN[field.span]}>
                    <TextField
                      field={field}
                      onChange={(value) => setProfileValue(field.key as keyof ProfileValues, value)}
                      onFocus={setFocus}
                    />
                  </div>
                ))}
              </Section>

              <Section title={t.fillRequest} grid>
                {model.request.map((field) => (
                  <div key={field.key} className={SPAN[field.span]}>
                    <TextField
                      field={field}
                      onChange={(value) => setRequestValue(field.key as keyof RequestValues, value)}
                      onFocus={setFocus}
                    />
                  </div>
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

            </form>

            <div className="px-6">
              <PrivacyFootnote locale={locale} />
            </div>

            <DownloadPanel
              locale={locale}
              fields={applied?.type === 'filled' ? applied.fields : []}
              warnings={warnings}
              disabled={applied === null || applied.type !== 'filled'}
              onDownload={download}
              onPreviewPdf={openPdfPreview}
              onPrint={() => window.print()}
            />
          </div>

          <div className={`print-area min-h-0 ${previewOpen ? '' : 'hidden lg:block'}`}>
            <DocumentPreview locale={locale} model={preview} focusKey={focusedTargetId} />
          </div>
        </div>
      )}

      {pdfUrl !== null && (
        <PdfPreview
          locale={locale}
          url={pdfUrl}
          onDownload={downloadPdf}
          onClose={closePdfPreview}
        />
      )}
    </div>
  )
}

function Section({
  title,
  note,
  grid = false,
  children,
}: {
  title: string
  note?: string
  /** Lay the children out in a six-column row rather than stacking them. */
  grid?: boolean
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="border-b border-rule pb-1 text-base font-semibold">{title}</h2>
      {note !== undefined && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
      <div className={grid ? 'mt-3 grid grid-cols-6 gap-x-4 gap-y-3' : 'mt-3 space-y-4'}>
        {children}
      </div>
    </section>
  )
}

const SPAN: Record<2 | 3 | 6, string> = {
  2: 'col-span-6 sm:col-span-2',
  3: 'col-span-6 sm:col-span-3',
  6: 'col-span-6',
}

/** A filename somebody can find again in a downloads folder. */
function fileName(
  mappingName: string,
  profile: ProfileValues,
  request: RequestValues,
  extension: string,
): string {
  const parts = [mappingName, profile.nama, request.mulai].filter((part) => part.trim() !== '')
  return `${parts.join(' - ').replace(/[\\/:*?"<>|]/g, '-')}.${extension}`
}
