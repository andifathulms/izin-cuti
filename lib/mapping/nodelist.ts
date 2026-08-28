import type { ParsedDocument } from '../docx/parse'
import type { Target } from './schema'

/**
 * The node list: every text node and every empty cell, in document order, with
 * the context that makes it recognisable.
 *
 * The two kinds live in separate index spaces but appear in one list, ordered
 * by where they sit in the file. A person mapping a form reads down it the way
 * they read down the form.
 *
 * Context is not decoration. A bare list of 97 strings is unusable; "Jabatan |
 * Perekayasa Ahli Pertama | Masa Kerja" is obvious. DESIGN.md §5.
 */

export type NodeEntry =
  | {
      readonly kind: 'text'
      readonly key: string
      readonly index: number
      readonly order: number
      readonly text: string
      readonly before: string
      readonly after: string
      readonly section: string
      readonly rowLabel: string
      /** The next node has identical formatting — possibly one split value. */
      readonly mergeableWithNext: boolean
      readonly mappedTo: Target | null
      /** This node is the tail of a merged span, so it has no controls of its own. */
      readonly partOfSpan: boolean
    }
  | {
      readonly kind: 'checkbox'
      readonly key: string
      readonly index: number
      readonly order: number
      readonly section: string
      readonly rowLabel: string
      readonly checked: boolean
      readonly mappedTo: Target | null
    }

export function nodeList(
  document: ParsedDocument,
  targets: ReadonlyArray<Target>,
): ReadonlyArray<NodeEntry> {
  const textOwner = new Map<number, Target>()
  const spanTail = new Set<number>()
  const cellOwner = new Map<number, Target>()

  for (const target of targets) {
    if (target.type === 'text') {
      target.nodeIndices.forEach((nodeIndex, position) => {
        textOwner.set(nodeIndex, target)
        if (position > 0) spanTail.add(nodeIndex)
      })
    } else if (target.type === 'checkbox') {
      cellOwner.set(target.cellIndex, target)
    }
    // A signature owns a paragraph, which is neither a node nor a cell, so it
    // claims nothing in this list and nothing here is shown as taken by it.
  }

  const entries: NodeEntry[] = [
    ...document.textNodes.map(
      (node): NodeEntry => ({
        kind: 'text',
        key: `t${node.index}`,
        index: node.index,
        order: node.elementStart,
        text: node.text,
        before: node.context.before,
        after: node.context.after,
        section: node.context.section,
        rowLabel: node.context.rowLabel,
        mergeableWithNext: node.mergeableWithNext,
        mappedTo: textOwner.get(node.index) ?? null,
        partOfSpan: spanTail.has(node.index),
      }),
    ),
    ...document.checkboxCells.map(
      (cell): NodeEntry => ({
        kind: 'checkbox',
        key: `c${cell.index}`,
        index: cell.index,
        order: cell.insertAt,
        section: cell.context.section,
        rowLabel: cell.context.rowLabel,
        checked: cell.checked,
        mappedTo: cellOwner.get(cell.index) ?? null,
      }),
    ),
  ]

  return entries.sort((a, b) => a.order - b.order)
}

export type NodeFilter = 'all' | 'unmapped' | 'mapped'

export function filterNodes(
  entries: ReadonlyArray<NodeEntry>,
  filter: NodeFilter,
  search: string,
): ReadonlyArray<NodeEntry> {
  const needle = search.trim().toLowerCase()
  return entries.filter((entry) => {
    if (entry.kind === 'text' && entry.partOfSpan) return false
    if (filter === 'unmapped' && entry.mappedTo !== null) return false
    if (filter === 'mapped' && entry.mappedTo === null) return false
    if (needle === '') return true
    return describe(entry).toLowerCase().includes(needle)
  })
}

/** Everything about an entry a person could search or read it by. */
export function describe(entry: NodeEntry): string {
  if (entry.kind === 'checkbox') {
    return [entry.section, entry.rowLabel].filter(Boolean).join(' | ')
  }
  return [entry.section, entry.rowLabel, entry.before, entry.text, entry.after]
    .filter((part) => part.trim() !== '')
    .join(' | ')
}

export function counts(entries: ReadonlyArray<NodeEntry>): {
  readonly text: number
  readonly checkbox: number
  readonly mapped: number
} {
  return {
    text: entries.filter((entry) => entry.kind === 'text').length,
    checkbox: entries.filter((entry) => entry.kind === 'checkbox').length,
    mapped: entries.filter((entry) => entry.mappedTo !== null).length,
  }
}
