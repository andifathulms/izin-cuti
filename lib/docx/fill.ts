import { escapeForDocument } from './escape'
import { CHECKMARK, type ParsedDocument, type TextNode } from './parse'

/**
 * Substitute text and insert checkmarks.
 *
 * Every edit is a splice of the original `document.xml`. Nothing is
 * re-serialised, so a byte we did not aim at is a byte we did not change.
 *
 * Refusals are values, and they are specific. A fill that cannot be done
 * exactly is not done approximately — a silently mis-filled official form is
 * the worst thing this tool can produce.
 */

export type FillInstruction =
  | {
      readonly type: 'text'
      /**
       * A contiguous span of text nodes within one paragraph. More than one
       * when the mapper merged runs Word had split. The value lands in the
       * first; the rest are emptied — a whole-span write, never half of one.
       */
      readonly nodeIndices: ReadonlyArray<number>
      readonly value: string
    }
  | {
      readonly type: 'checkbox'
      readonly cellIndex: number
      readonly checked: boolean
    }

export type FillProblem = {
  readonly reason: string
  readonly instruction: FillInstruction
}

export type FillResult =
  | { type: 'filled'; xml: string }
  | { type: 'refused'; problems: ReadonlyArray<FillProblem> }

type Edit = { start: number; end: number; replacement: string }

export function fillDocument(
  document: ParsedDocument,
  instructions: ReadonlyArray<FillInstruction>,
): FillResult {
  const problems: FillProblem[] = []
  const edits: Edit[] = []

  for (const instruction of instructions) {
    switch (instruction.type) {
      case 'text': {
        const planned = planTextEdit(document, instruction)
        if (planned.type === 'problem') problems.push(planned.problem)
        else edits.push(...planned.edits)
        break
      }
      case 'checkbox': {
        const planned = planCheckboxEdit(document, instruction)
        if (planned.type === 'problem') problems.push(planned.problem)
        else edits.push(...planned.edits)
        break
      }
      default: {
        const unreachable: never = instruction
        throw new Error(`unhandled instruction ${JSON.stringify(unreachable)}`)
      }
    }
  }

  if (problems.length > 0) return { type: 'refused', problems }

  const overlap = findOverlap(edits, instructions)
  if (overlap !== null) return { type: 'refused', problems: [overlap] }

  return { type: 'filled', xml: applyEdits(document.xml, edits) }
}

type Planned =
  | { type: 'edits'; edits: ReadonlyArray<Edit> }
  | { type: 'problem'; problem: FillProblem }

function planTextEdit(
  document: ParsedDocument,
  instruction: Extract<FillInstruction, { type: 'text' }>,
): Planned {
  const refuse = (reason: string): Planned => ({
    type: 'problem',
    problem: { reason, instruction },
  })

  if (instruction.nodeIndices.length === 0) return refuse('no target node')

  const nodes: TextNode[] = []
  for (const index of instruction.nodeIndices) {
    const node = document.textNodes[index]
    if (node === undefined) {
      return refuse(`this document has no text node ${index}`)
    }
    nodes.push(node)
  }

  for (let i = 1; i < nodes.length; i++) {
    const previous = nodes[i - 1]!
    const current = nodes[i]!
    if (current.index !== previous.index + 1) {
      return refuse(
        `nodes ${previous.index} and ${current.index} are not contiguous, so the value would be written into part of the target`,
      )
    }
    if (current.paragraphIndex !== previous.paragraphIndex) {
      return refuse(
        `nodes ${previous.index} and ${current.index} are in different paragraphs`,
      )
    }
  }

  const [first, ...rest] = nodes as [TextNode, ...TextNode[]]
  return {
    type: 'edits',
    edits: [
      { start: first.elementStart, end: first.elementEnd, replacement: writeNode(first, instruction.value) },
      ...rest.map((node) => ({
        start: node.elementStart,
        end: node.elementEnd,
        replacement: writeNode(node, ''),
      })),
    ],
  }
}

/**
 * Rewrite one `<w:t>` element. Attributes are carried over exactly as written,
 * never re-ordered and never dropped; `xml:space="preserve"` is added when the
 * value needs it, because a value whose leading spaces are silently collapsed
 * is a wrong value.
 */
function writeNode(node: TextNode, value: string): string {
  const needsPreserve = value !== value.trim()
  const attrs =
    needsPreserve && !hasPreserve(node.attrs)
      ? `${node.attrs} xml:space="preserve"`
      : node.attrs
  return `<w:t${attrs}>${escapeForDocument(value)}</w:t>`
}

function hasPreserve(attrs: string): boolean {
  return /(?:^|\s)xml:space\s*=\s*("preserve"|'preserve')/.test(attrs)
}

function planCheckboxEdit(
  document: ParsedDocument,
  instruction: Extract<FillInstruction, { type: 'checkbox' }>,
): Planned {
  const cell = document.checkboxCells[instruction.cellIndex]
  if (cell === undefined) {
    return {
      type: 'problem',
      problem: {
        reason: `this document has no checkbox cell ${instruction.cellIndex}`,
        instruction,
      },
    }
  }

  // Already in the requested state. Doing nothing is what makes checking twice
  // the same as checking once. Invariant 6.
  if (cell.checked === instruction.checked) return { type: 'edits', edits: [] }

  if (instruction.checked) {
    return {
      type: 'edits',
      edits: [{ start: cell.insertAt, end: cell.insertAt, replacement: markRun() }],
    }
  }

  // Unchecking removes exactly the run that carries the mark, so the cell goes
  // back to the bytes it had before.
  if (cell.markStart === null || cell.markEnd === null) return { type: 'edits', edits: [] }
  return {
    type: 'edits',
    edits: [{ start: cell.markStart, end: cell.markEnd, replacement: '' }],
  }
}

function markRun(): string {
  return `<w:r><w:t>${escapeForDocument(CHECKMARK)}</w:t></w:r>`
}

function findOverlap(
  edits: ReadonlyArray<Edit>,
  instructions: ReadonlyArray<FillInstruction>,
): FillProblem | null {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end)
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]!
    const current = sorted[i]!
    const touching = previous.start === previous.end || current.start === current.end
    if (current.start < previous.end || (!touching && current.start === previous.start)) {
      return {
        reason: 'two instructions write the same part of the document',
        instruction: instructions[0] ?? { type: 'checkbox', cellIndex: -1, checked: false },
      }
    }
  }
  return null
}

/**
 * Applied back to front, so an earlier edit's offsets are still the offsets
 * that were measured. Sorting makes the result independent of the order the
 * instructions arrived in — determinism is asserted.
 */
function applyEdits(xml: string, edits: ReadonlyArray<Edit>): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end)
  let result = xml
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
  }
  return result
}
