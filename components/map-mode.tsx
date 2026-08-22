'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/components/app-state'
import { TemplatePicker } from '@/components/shell/template-picker'
import { NodeList } from '@/components/nodelist/node-list'
import { DocumentPreview } from '@/components/preview/document-preview'
import { StateLegend } from '@/components/shell/chrome'
import { buildPreview, resolutionForMapping } from '@/lib/preview/model'
import { blankCopy, blankedNodes, residualPersonalData, type Residue } from '@/lib/mapping/sanitise'
import { serialiseDocx } from '@/lib/docx/serialise'
import { parseDocument } from '@/lib/docx/parse'
import { claimedCells, claimedNodes } from '@/lib/mapping/schema'
import { counts, filterNodes, nodeList, type NodeFilter } from '@/lib/mapping/nodelist'
import {
  addCheckboxTarget,
  addTextTarget,
  draftGroups,
  EMPTY_DRAFT,
  finaliseDraft,
  mergeWithNext,
  regroupTarget,
  relabelTarget,
  removeTarget,
  renameDraft,
  retypeTarget,
  unmergeLast,
  type Draft,
} from '@/lib/mapping/draft'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * Map mode. Entered rarely — once per template — and desktop only, because
 * marking ninety-seven nodes on a phone is not a real workflow and pretending
 * otherwise wastes somebody's afternoon. DESIGN.md §5.
 */
export function MapMode({ locale }: { locale: Locale }) {
  const t = strings(locale)
  const { template, mappings, persistMapping, profileValues, focusedTargetId, setFocus } = useApp()

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [filter, setFilter] = useState<NodeFilter>('all')
  const [search, setSearch] = useState('')
  const [mergeProblem, setMergeProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [residue, setResidue] = useState<ReadonlyArray<Residue> | null>(null)

  const document = template.type === 'loaded' ? template.document : null

  const entries = useMemo(
    () => (document === null ? [] : nodeList(document, draft.targets)),
    [document, draft.targets],
  )
  const shown = useMemo(() => filterNodes(entries, filter, search), [entries, filter, search])
  const tally = useMemo(() => counts(entries), [entries])

  const preview = useMemo(() => {
    if (document === null) return null
    return buildPreview(
      document,
      resolutionForMapping(
        claimedNodes(draft.targets),
        claimedCells(draft.targets),
        focusedTargetId,
      ),
    )
  }, [document, draft.targets, focusedTargetId])

  const save = () => {
    if (document === null) return
    const existing = mappings.find((mapping) => mapping.name === draft.name.trim())
    const result = finaliseDraft(draft, document, {
      // Identity comes from here, not from the draft module — that module has
      // no clock and no randomness, which is what makes it testable.
      id: existing?.id ?? `m-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    })
    if (result.type === 'incomplete') {
      setSaved(result.problems.join(' '))
      return
    }
    persistMapping(result.mapping)
    setSaved(t.mapSaved)
  }

  /**
   * Produce a blank copy of the template and re-point the mapping at it, in one
   * step.
   *
   * Both halves matter. Blanking a value that shares a paragraph with another
   * mapped value changes what sits either side of it, so a fingerprint taken
   * from the original does not necessarily fit the copy — doing the two
   * separately would leave a mapping that refuses its own blank template.
   */
  const downloadBlankCopy = () => {
    if (template.type !== 'loaded' || document === null) return

    const copy = blankCopy(document, draft.targets)
    if (copy.type !== 'filled') {
      setSaved(copy.problems.map((problem) => problem.reason).join(' '))
      return
    }

    const reparsed = parseDocument(copy.xml)
    if (reparsed.type !== 'parsed') {
      setSaved(reparsed.reason)
      return
    }

    const existing = mappings.find((mapping) => mapping.name === draft.name.trim())
    const remade = finaliseDraft(draft, reparsed.document, {
      id: existing?.id ?? `m-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    })
    if (remade.type === 'incomplete') {
      setSaved(remade.problems.join(' '))
      return
    }
    persistMapping(remade.mapping)

    const bytes = serialiseDocx(template.package, copy.xml)
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `${(draft.name.trim() || 'template').replace(/[\\/:*?"<>|]/g, '-')} - kosong.docx`
    anchor.click()
    URL.revokeObjectURL(url)

    // What the blank copy did not blank. Only mapped fields are cleared, so a
    // name in a footer nobody mapped is still sitting there.
    setResidue(residualPersonalData(reparsed.document, profileValues, blankedNodes(draft.targets)))
    setSaved(t.mapBlankCopyDone)
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <TemplatePicker locale={locale} />

      <p className="no-print border-b border-rule bg-attention/5 px-6 py-2 text-sm lg:hidden">
        {t.mapDesktopOnly}
      </p>

      {document === null ? (
        <div className="px-6 py-12">
          <h1 className="text-xl font-semibold">{t.noTemplate}</h1>
          <p className="mt-2 text-base text-ink-muted">{t.noTemplateHint}</p>
        </div>
      ) : (
        <>
          <div className="no-print flex flex-wrap items-center gap-4 border-b border-rule px-6 py-3">
            <label className="flex items-center gap-2">
              <span className="text-sm font-medium">{t.mapName}</span>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft(renameDraft(draft, event.target.value))}
                className="w-64 rounded border border-rule bg-white px-2 py-1 text-base"
              />
            </label>
            <span className="font-mono text-sm text-ink-muted">
              {tally.mapped} / {tally.text + tally.checkbox}
            </span>
            <button
              type="button"
              onClick={save}
              className="rounded border border-typed bg-typed/10 px-4 py-1 text-base font-medium text-typed"
            >
              {t.mapSave}
            </button>
            <button
              type="button"
              onClick={downloadBlankCopy}
              className="rounded border border-rule px-4 py-1 text-base"
            >
              {t.mapBlankCopy}
            </button>
            {saved !== null && <span className="text-sm text-ink-muted">{saved}</span>}
            <StateLegend locale={locale} />
          </div>

          <p className="no-print max-w-[90ch] border-b border-rule px-6 py-2 text-sm text-ink-muted">
            {t.mapBlankCopyWhy}
          </p>

          {residue !== null && (
            <section className="no-print border-b border-rule px-6 py-3">
              <h2 className="flex items-baseline gap-2 text-base font-semibold">
                {residue.length > 0 && (
                  <span aria-hidden className="text-attention">
                    ▲
                  </span>
                )}
                {residue.length > 0 ? t.mapResidue : t.mapResidueNone}
              </h2>
              {residue.length > 0 && (
                <>
                  <p className="mt-1 max-w-[90ch] text-sm text-ink-muted">{t.mapResidueWhy}</p>
                  <ul className="mt-2 space-y-1">
                    {residue.map((item) => (
                      <li key={item.nodeIndex} className="text-sm">
                        <span className="font-mono text-ink-subtle">
                          T{String(item.nodeIndex).padStart(3, '0')}
                        </span>{' '}
                        <span className="font-medium">{item.text}</span>{' '}
                        <span className="text-ink-muted">
                          {item.context} · {t.fieldLabels[item.field] ?? item.field}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-2">
            <div className="min-h-0 border-r border-rule">
              <NodeList
                locale={locale}
                entries={shown}
                filter={filter}
                search={search}
                groups={draftGroups(draft)}
                mergeProblem={mergeProblem}
                onFilter={setFilter}
                onSearch={setSearch}
                actions={{
                  onMapText: (index, label) => setDraft(addTextTarget(draft, index, label)),
                  onMapCheckbox: (index, label) => setDraft(addCheckboxTarget(draft, index, label)),
                  onRemove: (id) => setDraft(removeTarget(draft, id)),
                  onRelabel: (id, label) => setDraft(relabelTarget(draft, id, label)),
                  onRetype: (id, source) => setDraft(retypeTarget(draft, id, source)),
                  onRegroup: (id, group) => setDraft(regroupTarget(draft, id, group)),
                  onMerge: (id) => {
                    const result = mergeWithNext(draft, id, document)
                    if (result.type === 'refused') setMergeProblem(result.reason)
                    else {
                      setMergeProblem(null)
                      setDraft(result.draft)
                    }
                  },
                  onUnmerge: (id) => setDraft(unmergeLast(draft, id)),
                  onFocus: setFocus,
                }}
              />
            </div>
            <div className="min-h-0">
              <DocumentPreview locale={locale} model={preview} focusKey={focusedTargetId} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
