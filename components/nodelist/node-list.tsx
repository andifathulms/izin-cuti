'use client'

import { EMPTY_PROFILE, EMPTY_REQUEST, allDerivations } from '@/lib/derive/compute'
import type { FieldSource, Target } from '@/lib/mapping/schema'
import type { NodeEntry, NodeFilter } from '@/lib/mapping/nodelist'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * The node list, and the controls for one node.
 *
 * Context is the thing on the page: section, row label, and the text either
 * side. Somebody scanning for "the jabatan field" finds it by what surrounds
 * it, because the value itself is what changes.
 */

export type NodeListActions = {
  readonly onMapText: (nodeIndex: number, label: string) => void
  readonly onMapCheckbox: (cellIndex: number, label: string) => void
  readonly onRemove: (id: string) => void
  readonly onRelabel: (id: string, label: string) => void
  readonly onRetype: (id: string, source: FieldSource) => void
  readonly onRegroup: (id: string, group: string | null) => void
  readonly onMerge: (id: string) => void
  readonly onUnmerge: (id: string) => void
  readonly onFocus: (id: string | null) => void
}

export function NodeList({
  locale,
  entries,
  filter,
  search,
  groups,
  mergeProblem,
  onFilter,
  onSearch,
  actions,
}: {
  locale: Locale
  entries: ReadonlyArray<NodeEntry>
  filter: NodeFilter
  search: string
  groups: ReadonlyArray<string>
  mergeProblem: string | null
  onFilter: (filter: NodeFilter) => void
  onSearch: (search: string) => void
  actions: NodeListActions
}) {
  const t = strings(locale)
  const filters: ReadonlyArray<[NodeFilter, string]> = [
    ['all', t.mapFilterAll],
    ['unmapped', t.mapFilterUnmapped],
    ['mapped', t.mapFilterMapped],
  ]

  return (
    <section aria-label={t.mapNodeList} className="flex h-full min-h-0 flex-col">
      <div className="border-b border-rule px-4 py-3">
        <h2 className="text-base font-semibold">{t.mapNodeList}</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-ink-muted">{t.mapIntro}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onFilter(value)}
              aria-pressed={filter === value}
              className={[
                'rounded border px-3 py-1 text-sm transition-colors duration-state ease-house',
                filter === value ? 'border-typed bg-typed/10 text-typed' : 'border-rule text-ink-muted',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          {/* The label's only text was the glyph ⌕, so the accessible name of
              the search box was "⌕". The glyph stays as decoration; the name
              is a word. */}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span aria-hidden className="text-ink-muted">
              ⌕
            </span>
            <span className="sr-only">{t.mapSearch}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              className="w-48 rounded border border-rule bg-white px-2 py-1 text-base"
            />
          </label>
        </div>

        {mergeProblem !== null && (
          <p className="mt-2 flex items-baseline gap-2 text-sm">
            <span aria-hidden className="text-attention">
              ▲
            </span>
            {mergeProblem}
          </p>
        )}
      </div>

      <ol className="min-h-0 flex-1 divide-y divide-rule overflow-auto">
        {entries.map((entry) => (
          <li key={entry.key} className="px-4 py-3">
            <NodeRow locale={locale} entry={entry} groups={groups} actions={actions} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function NodeRow({
  locale,
  entry,
  groups,
  actions,
}: {
  locale: Locale
  entry: NodeEntry
  groups: ReadonlyArray<string>
  actions: NodeListActions
}) {
  const t = strings(locale)
  const mapped = entry.mappedTo

  return (
    <div
      onMouseEnter={() => actions.onFocus(mapped?.id ?? null)}
      onMouseLeave={() => actions.onFocus(null)}
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm text-ink-subtle">
          {entry.kind === 'text' ? 'T' : '□'}
          {String(entry.index).padStart(3, '0')}
        </span>
        <div className="min-w-0 flex-1">
          {entry.section !== '' && (
            <p className="text-sm text-ink-muted">{entry.section}</p>
          )}
          <p className="break-words text-base">
            {entry.kind === 'text' ? (
              <>
                <span className="text-ink-subtle">{entry.before}</span>
                <span className={mapped ? 'font-medium text-typed' : 'font-medium'}>
                  {/* Empty versus not is what separates a text target from a
                      checkbox cell, and ⌀ said that to sighted readers only. */}
                  {entry.text === '' ? (
                    <>
                      <span aria-hidden>⌀</span>
                      <span className="sr-only">{t.mapEmptyNode}</span>
                    </>
                  ) : (
                    entry.text
                  )}
                </span>
                <span className="text-ink-subtle">{entry.after}</span>
              </>
            ) : (
              <>
                <span className="mr-2 inline-block h-4 w-4 border border-rule align-middle" />
                <span className="font-medium">{entry.rowLabel}</span>
              </>
            )}
          </p>
          {entry.kind === 'text' && entry.rowLabel !== '' && (
            <p className="text-sm text-ink-muted">{entry.rowLabel}</p>
          )}
        </div>

        {mapped === null ? (
          <button
            type="button"
            onClick={() =>
              entry.kind === 'text'
                ? actions.onMapText(entry.index, defaultLabel(entry))
                : actions.onMapCheckbox(entry.index, defaultLabel(entry))
            }
            className="shrink-0 rounded border border-rule px-3 py-1 text-sm transition-colors duration-state ease-house hover:border-typed hover:text-typed"
          >
            {entry.kind === 'text' ? t.mapMarkAsText : t.mapMarkAsCheckbox}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => actions.onRemove(mapped.id)}
            className="shrink-0 rounded border border-rule px-3 py-1 text-sm text-ink-muted"
          >
            {t.mapRemove}
          </button>
        )}
      </div>

      {mapped !== null && (
        <TargetControls
          locale={locale}
          entry={entry}
          target={mapped}
          groups={groups}
          actions={actions}
        />
      )}
    </div>
  )
}

function TargetControls({
  locale,
  entry,
  target,
  groups,
  actions,
}: {
  locale: Locale
  entry: NodeEntry
  target: Target
  groups: ReadonlyArray<string>
  actions: NodeListActions
}) {
  const t = strings(locale)

  return (
    <div className="mt-3 space-y-3 border-l-2 border-typed/40 pl-4">
      <label className="block">
        <span className="block text-sm font-medium">{t.mapLabel}</span>
        <input
          type="text"
          value={target.label}
          onChange={(event) => actions.onRelabel(target.id, event.target.value)}
          className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-base"
        />
      </label>

      {target.type === 'text' ? (
        <>
          <label className="block">
            <span className="block text-sm font-medium">{t.mapKind}</span>
            <select
              value={sourceKey(target.source)}
              onChange={(event) => actions.onRetype(target.id, sourceFromKey(event.target.value))}
              className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-base"
            >
              <optgroup label={t.mapKindProfile}>
                {Object.keys(EMPTY_PROFILE).map((key) => (
                  <option key={key} value={`profile:${key}`}>
                    {t.fieldLabels[key] ?? key}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t.mapKindRequest}>
                {Object.keys(EMPTY_REQUEST).map((key) => (
                  <option key={key} value={`request:${key}`}>
                    {t.fieldLabels[key] ?? key}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t.mapKindDerived}>
                {allDerivations().map((derivation) => (
                  <option key={derivation.id} value={`derived:${derivation.id}`}>
                    {derivation.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <DerivedExplanation source={target.source} />

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-ink-muted">
              [{target.nodeIndices.join(', ')}]
            </span>
            {entry.kind === 'text' && entry.mergeableWithNext && (
              <button
                type="button"
                onClick={() => actions.onMerge(target.id)}
                className="rounded border border-rule px-2 py-1 text-sm"
              >
                + {t.mapMergeNext}
              </button>
            )}
            {target.nodeIndices.length > 1 && (
              <button
                type="button"
                onClick={() => actions.onUnmerge(target.id)}
                className="rounded border border-rule px-2 py-1 text-sm"
              >
                {/* Was named "−". Its sibling above reads as a sentence and
                    this one was announced as a minus sign. */}
                <span aria-hidden>−</span>
                <span className="sr-only">{t.mapUnmerge}</span>
              </button>
            )}
          </div>

          {entry.kind === 'text' && entry.mergeableWithNext && (
            <p className="max-w-[60ch] text-sm text-ink-muted">{t.mapSplitHint}</p>
          )}
        </>
      ) : (
        <label className="block">
          <span className="block text-sm font-medium">{t.mapGroup}</span>
          <input
            type="text"
            list="mapping-groups"
            value={target.group ?? ''}
            placeholder={t.mapGroupNone}
            onChange={(event) =>
              actions.onRegroup(target.id, event.target.value.trim() === '' ? null : event.target.value)
            }
            className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-base"
          />
          <datalist id="mapping-groups">
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </label>
      )}
    </div>
  )
}

/** Named computations explain themselves, so nobody wonders where a number came from. */
function DerivedExplanation({ source }: { source: FieldSource }) {
  if (source.kind !== 'derived') return null
  const derivation = allDerivations().find((candidate) => candidate.id === source.computation)
  if (derivation === undefined) return null
  return <p className="max-w-[60ch] text-sm text-derived">{derivation.explanation}</p>
}

function defaultLabel(entry: NodeEntry): string {
  if (entry.kind === 'checkbox') return entry.rowLabel
  return entry.rowLabel !== '' ? entry.rowLabel : entry.text.slice(0, 40)
}

function sourceKey(source: FieldSource): string {
  return source.kind === 'derived'
    ? `derived:${source.computation}`
    : `${source.kind}:${source.key}`
}

function sourceFromKey(value: string): FieldSource {
  const [kind, key = ''] = value.split(':') as [string, string]
  if (kind === 'profile') return { kind: 'profile', key: key as keyof typeof EMPTY_PROFILE }
  if (kind === 'derived') {
    return { kind: 'derived', computation: key as ReturnType<typeof allDerivations>[number]['id'] }
  }
  return { kind: 'request', key: key as keyof typeof EMPTY_REQUEST }
}
