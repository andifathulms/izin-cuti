import type { Block, ParsedDocument } from '../docx/parse'
import type { FilledField } from '../mapping/apply'
import { textTargets, type Mapping } from '../mapping/schema'

/**
 * The preview's view model.
 *
 * Built here rather than in a component — nothing is computed in a component,
 * invariant 15 — and built from the same block model the parse produced, which
 * is what lets a run carry its text node index. That index is the whole reason
 * this exists instead of a semantic docx-to-HTML converter: without it the
 * preview cannot mark the field you are typing into, cannot scroll to it, and
 * cannot show which parts of the template are still unmapped.
 *
 * What it cannot do is show the layout. Column widths, page breaks, fonts and
 * spacing come from Word, and this is an approximation of the content in
 * document order. Every view that shows it says so. DESIGN.md §7, PRD §5.
 */

export type RunState = 'plain' | 'typed' | 'derived' | 'unmapped'

export type PreviewRun = {
  readonly text: string
  readonly state: RunState
  readonly targetId: string | null
  readonly nodeIndex: number | null
  readonly focused: boolean
}

export type PreviewBox = {
  readonly checked: boolean
  readonly state: RunState
  readonly targetId: string | null
  readonly cellIndex: number
  readonly focused: boolean
}

export type PreviewBlock =
  | {
      readonly type: 'paragraph'
      readonly key: string
      readonly runs: ReadonlyArray<PreviewRun>
      readonly alignment: 'left' | 'center' | 'right' | 'both'
      readonly bold: boolean
    }
  | {
      readonly type: 'table'
      readonly key: string
      readonly rows: ReadonlyArray<{
        readonly cells: ReadonlyArray<{
          readonly blocks: ReadonlyArray<PreviewBlock>
          readonly box: PreviewBox | null
          readonly widthTwips: number | null
        }>
      }>
    }

export type PreviewModel = {
  readonly blocks: ReadonlyArray<PreviewBlock>
}

export type Resolution = {
  /** Node index → what the fill will write there. */
  readonly values: ReadonlyMap<number, { readonly text: string; readonly state: RunState; readonly targetId: string }>
  /** Cell index → what the fill will do to that box. */
  readonly boxes: ReadonlyMap<number, { readonly checked: boolean; readonly targetId: string }>
  /** Mark nodes and cells nobody has mapped. Map mode only. */
  readonly markUnmapped: boolean
  readonly mappedNodes: ReadonlySet<number>
  readonly mappedCells: ReadonlySet<number>
  readonly focusedTargetId: string | null
}

export const NOTHING: Resolution = {
  values: new Map(),
  boxes: new Map(),
  markUnmapped: false,
  mappedNodes: new Set(),
  mappedCells: new Set(),
  focusedTargetId: null,
}

export function buildPreview(document: ParsedDocument, resolution: Resolution): PreviewModel {
  return { blocks: document.blocks.map((block, i) => convert(block, resolution, `b${i}`)) }
}

function convert(block: Block, resolution: Resolution, key: string): PreviewBlock {
  if (block.type === 'paragraph') {
    return {
      type: 'paragraph',
      key,
      alignment: block.alignment,
      bold: block.bold,
      runs: block.runs.map((run) => convertRun(run.text, run.textNodeIndex, resolution)),
    }
  }
  return {
    type: 'table',
    key,
    rows: block.rows.map((row, r) => ({
      cells: row.cells.map((cell, c) => ({
        widthTwips: cell.widthTwips,
        box: convertBox(cell.checkboxIndex, resolution),
        blocks: cell.blocks.map((child, b) => convert(child, resolution, `${key}-${r}-${c}-${b}`)),
      })),
    })),
  }
}

function convertRun(text: string, nodeIndex: number | null, resolution: Resolution): PreviewRun {
  if (nodeIndex === null) {
    return { text, state: 'plain', targetId: null, nodeIndex: null, focused: false }
  }

  const filled = resolution.values.get(nodeIndex)
  if (filled !== undefined) {
    return {
      text: filled.text,
      state: filled.state,
      targetId: filled.targetId,
      nodeIndex,
      focused: filled.targetId === resolution.focusedTargetId,
    }
  }

  const unmapped = resolution.markUnmapped && !resolution.mappedNodes.has(nodeIndex)
  return {
    text,
    state: unmapped ? 'unmapped' : 'plain',
    targetId: null,
    nodeIndex,
    focused: false,
  }
}

function convertBox(cellIndex: number | null, resolution: Resolution): PreviewBox | null {
  if (cellIndex === null) return null
  const mapped = resolution.boxes.get(cellIndex)
  if (mapped !== undefined) {
    return {
      checked: mapped.checked,
      state: 'typed',
      targetId: mapped.targetId,
      cellIndex,
      focused: mapped.targetId === resolution.focusedTargetId,
    }
  }
  const unmapped = resolution.markUnmapped && !resolution.mappedCells.has(cellIndex)
  return {
    checked: false,
    state: unmapped ? 'unmapped' : 'plain',
    targetId: null,
    cellIndex,
    focused: false,
  }
}

/**
 * Turn a mapping and its resolved field values into a resolution.
 *
 * A span target writes its value into the first node and empties the rest,
 * exactly as the fill does, so what the preview shows is what the download
 * contains rather than a second guess at it.
 */
export function resolutionFromFill(
  mapping: Mapping,
  fields: ReadonlyArray<FilledField>,
  checkedTargetIds: ReadonlySet<string>,
  focusedTargetId: string | null,
): Resolution {
  const values = new Map<number, { text: string; state: RunState; targetId: string }>()
  const targets = textTargets(mapping)

  targets.forEach((target, i) => {
    const field = fields[i]
    if (field === undefined) return
    const state: RunState = field.kind === 'derived' ? 'derived' : 'typed'
    target.nodeIndices.forEach((nodeIndex, position) => {
      values.set(nodeIndex, {
        text: position === 0 ? field.value : '',
        state,
        targetId: target.id,
      })
    })
  })

  const boxes = new Map<number, { checked: boolean; targetId: string }>()
  for (const target of mapping.targets) {
    if (target.type !== 'checkbox') continue
    boxes.set(target.cellIndex, {
      checked: checkedTargetIds.has(target.id),
      targetId: target.id,
    })
  }

  return {
    values,
    boxes,
    markUnmapped: false,
    mappedNodes: new Set(),
    mappedCells: new Set(),
    focusedTargetId,
  }
}

/** Map mode: the template as it stands, with what is not yet mapped marked. */
export function resolutionForMapping(
  mappedNodes: ReadonlySet<number>,
  mappedCells: ReadonlySet<number>,
  focusedTargetId: string | null,
): Resolution {
  return {
    values: new Map(),
    boxes: new Map(),
    markUnmapped: true,
    mappedNodes,
    mappedCells,
    focusedTargetId,
  }
}

/**
 * The preview's text alternative — also what somebody would paste into a
 * message. DESIGN.md §9.
 */
export function previewAsText(model: PreviewModel): string {
  const lines: string[] = []
  const visit = (blocks: ReadonlyArray<PreviewBlock>, indent: string): void => {
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        const text = block.runs.map((run) => run.text).join('')
        if (text.trim() !== '') lines.push(indent + text)
        continue
      }
      for (const row of block.rows) {
        const cells = row.cells.map((cell) => {
          if (cell.box !== null) return cell.box.checked ? '[√]' : '[ ]'
          return cell.blocks
            .flatMap((child) => (child.type === 'paragraph' ? [child.runs.map((r) => r.text).join('')] : []))
            .join(' ')
            .trim()
        })
        const line = cells.filter((cell) => cell !== '').join('  |  ')
        if (line.trim() !== '') lines.push(indent + line)
      }
    }
  }
  visit(model.blocks, '')
  return lines.join('\n')
}
