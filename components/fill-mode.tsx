'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/components/app-state'
import { PrivacyFootnote } from '@/components/shell/template-picker'
import { DocumentPreview } from '@/components/preview/document-preview'
import { DownloadPanel } from '@/components/summary/download-panel'
import { DriftNotice } from '@/components/summary/drift-notice'
import { PdfPreview } from '@/components/summary/pdf-preview'
import {
  CELL,
  ChoiceGroupField,
  SelectShell,
  SPAN,
  StandaloneBox,
  TextField,
} from '@/components/form/fields'
import { buildForm, checkedTargetIds, leaveTypeSelection } from '@/lib/fill/form'
import { sectionProgress } from '@/lib/fill/progress'
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

  const progress = useMemo(
    () => (model === null ? [] : sectionProgress(model, chosenDirektorat !== null)),
    [model, chosenDirektorat],
  )

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
            <SelectShell>
              <select
                value={activeMappingId ?? ''}
                onChange={(event) => selectMapping(event.target.value || null)}
                className="field-select w-full border-0 border-b border-rule bg-transparent px-1 py-1 text-base"
              >
                <option value="">—</option>
                {mappings.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </SelectShell>
          </label>
        )}
        {/*
         * The page had no h1 at all in its ordinary state: the sections opened
         * at h2 and the outline had no root, so a screen reader landing here
         * was given no page title. The document being filled is the honest
         * one, and naming it also answers the question the screen never
         * answered — which form is this.
         */}
        <h1 className="text-base font-semibold">{mapping?.name ?? t.appName}</h1>
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
          {/*
           * The form scrolls; the download does not.
           *
           * DownloadPanel used to sit at the foot of this scrolling column,
           * four sections below the fold — so the one button that is the
           * reason this app exists was reachable only by scrolling past every
           * field. It is a sibling of the scroller now, pinned to the bottom
           * of the column, and the warnings ride with it. DESIGN.md §7.
           */}
          <div className="no-print relative flex min-h-0 flex-col border-r border-rule">
            <div className="flex min-h-0 flex-1">
            <SectionRail locale={locale} sections={progress} titles={sectionTitles(t, model)} />
            <div className="min-h-0 flex-1 overflow-auto">
            <form className="space-y-8 px-6 py-6" onSubmit={(event) => event.preventDefault()}>
              <Section numeral="I" title={t.fillDirektorat} note={t.fillDirektoratHint}>
                <label className="block">
                  {/* The section heading one line above says "Direktorat"
                      already; printing it twice read as a rendering fault.
                      Kept in the accessibility tree, where the select still
                      needs a name of its own. */}
                  <span className="sr-only">{t.fillDirektorat}</span>
                  <SelectShell>
                    <select
                      value={chosenDirektorat?.id ?? ''}
                      onChange={(event) => chooseDirektorat(event.target.value)}
                      className="field-select mt-1 w-full border-0 border-b border-rule bg-transparent px-1 py-1 text-base text-typed"
                    >
                      <option value="">{t.fillDirektoratNone}</option>
                      {DIREKTORAT.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.nama}
                        </option>
                      ))}
                    </select>
                  </SelectShell>
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
                            className="mt-1 w-full border-0 border-b border-rule bg-transparent px-1 py-1 font-mono text-base text-typed"
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

              <Section numeral="II" title={t.fillProfile} grid>
                {model.profile.map((field) => (
                  <div key={field.key} className={`${SPAN[field.span]} ${CELL}`}>
                    <TextField
                      field={field}
                      onChange={(value) => setProfileValue(field.key as keyof ProfileValues, value)}
                      onFocus={setFocus}
                    />
                  </div>
                ))}
              </Section>

              {/*
                * Ahead of the dates, not after them.
                *
                * The leave type decides whether the twelve-working-day cap
                * applies, whether an alasan is required, and where the end-date
                * picker stops. Sitting last, it was routinely chosen after the
                * dates it governs — the case lib/fill/form.ts already has a
                * comment about. First the kind of leave, then the leave.
                *
                * With one group and nothing else, the group's own name is the
                * heading: "Pilihan" said nothing about what the decision was,
                * and printing both would be the same word twice.
                */}
              {(model.groups.length > 0 || model.standalone.length > 0) && (
                <Section
                  numeral="III"
                  title={
                    model.groups.length === 1 && model.standalone.length === 0
                      ? model.groups[0]!.group
                      : t.fillChecklist
                  }
                >
                  {model.groups.map((group) => (
                    <ChoiceGroupField
                      key={group.group}
                      locale={locale}
                      group={group}
                      hideLegend={model.groups.length === 1 && model.standalone.length === 0}
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

              <Section numeral="IV" title={t.fillRequest} grid>
                {model.request.map((field) => (
                  <div key={field.key} className={`${SPAN[field.span]} ${CELL}`}>
                    <TextField
                      field={field}
                      onChange={(value) => setRequestValue(field.key as keyof RequestValues, value)}
                      onFocus={setFocus}
                    />
                  </div>
                ))}
              </Section>


            </form>

            <div className="px-6 pb-6">
              <PrivacyFootnote locale={locale} />
            </div>
            </div>
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

/**
 * A numbered section of the ledger.
 *
 * The document numbers its sections in Roman and so does this, in the same
 * order — not because the numerals map one-to-one onto the document's own (the
 * form asks for a direktorat the letter states as a salutation, and the letter
 * splits across five headings where the form needs four), but because
 * numbering the sections is the document's habit and following it is what
 * lets somebody who knows the paper form find their place on the screen.
 *
 * The heading is the one place the serif is allowed. DESIGN.md §4.
 */
function Section({
  numeral,
  title,
  note,
  grid = false,
  children,
}: {
  /** Roman, in document order. */
  numeral: string
  title: string
  note?: string
  /** Lay the children out in a six-column row rather than stacking them. */
  grid?: boolean
  children: React.ReactNode
}) {
  return (
    <section id={`sec-${numeral}`} className="scroll-mt-4">
      <h2 className="flex items-baseline gap-3 border-b-2 border-ink pb-1">
        <span aria-hidden className="font-mono text-sm text-ink-subtle">
          {numeral}.
        </span>
        <span className="font-display text-lg font-semibold">{title}</span>
      </h2>
      {note !== undefined && <p className="mt-2 max-w-[68ch] text-sm text-ink-muted">{note}</p>}
      <div className={grid ? 'mt-1 grid grid-cols-6 gap-x-4' : 'mt-3 space-y-4'}>{children}</div>
    </section>
  )
}

/**
 * Which section you are in, and how much of it is left.
 *
 * Narrow on purpose: this pane is half the window and the form needs the rest
 * of it. Each entry is a link into its section, so it is a way through the
 * form as well as a report on it — the numeral is the visible part and the
 * accessible name carries the whole sentence, because "II, 4/6" read aloud is
 * not a sentence.
 *
 * Complete is stated in --derived, which is the app's word for "this one is
 * settled and not yours to type". Nothing here is amber: a section you have
 * not reached yet is not a warning. DESIGN.md §3.
 */
function SectionRail({
  locale,
  sections,
  titles,
}: {
  locale: Locale
  sections: ReturnType<typeof sectionProgress>
  titles: ReadonlyArray<string>
}) {
  const t = strings(locale)
  return (
    <nav
      aria-label={t.railLabel}
      className="flex w-12 flex-none flex-col items-center gap-2 border-r border-rule py-6"
    >
      {sections.map((section, index) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          aria-label={`${titles[index] ?? section.numeral} — ${section.filled}/${section.total} ${t.railFilled}`}
          className={[
            'flex w-10 flex-col items-center rounded py-1 font-mono leading-tight',
            'transition-colors duration-state ease-house hover:bg-typed/10',
            section.complete ? 'text-derived' : 'text-ink',
          ].join(' ')}
        >
          <span aria-hidden className="text-base">
            {section.numeral}
          </span>
          {/*
           * A bare number under a numeral reads as a page number. The one
           * that means "none left" is the √ this form marks a box with; the
           * one that means "some left" says so as a count of fields, in the
           * quietest grey the palette allows, so the numeral stays the thing
           * being read.
           */}
          <span
            aria-hidden
            className={section.complete ? 'text-sm' : 'text-sm text-ink-subtle'}
          >
            {section.complete ? '√' : `−${section.total - section.filled}`}
          </span>
        </a>
      ))}
    </nav>
  )
}

/**
 * The rail's accessible names, in the same order the sections are rendered.
 *
 * Section III takes its name from the group it holds when it holds exactly
 * one, which is the same rule the heading follows — so the rail and the
 * heading never disagree about what a section is called.
 */
function sectionTitles(t: ReturnType<typeof strings>, model: ReturnType<typeof buildForm> | null) {
  const checklist =
    model !== null && model.groups.length === 1 && model.standalone.length === 0
      ? model.groups[0]!.group
      : t.fillChecklist
  return [t.fillDirektorat, t.fillProfile, checklist, t.fillRequest]
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
