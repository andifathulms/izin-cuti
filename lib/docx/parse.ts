import { unescapeXmlText } from './escape'
import { hashString } from './hash'
import { attr, firstChild, parseXml, walk, type XmlElement } from './xml'

/**
 * Read `word/document.xml` into the two things the mapper needs: every text
 * node, and every cell that can carry a checkmark.
 *
 * Both, and they are genuinely different. An empty table cell contains no
 * `<w:t>` at all, so a text-only mapper misses every checkbox in the form —
 * which in the reference cuti letter is fourteen of them. PRD §4.
 *
 * The parse also produces a block model, which is what the preview renders.
 * Rendering from the same walk is what lets the preview mark the node you are
 * typing into; a semantic converter cannot, because it has no node indices.
 */

export type NodeContext = {
  /** Text of this paragraph before the node. */
  readonly before: string
  /** Text of this paragraph after the node. */
  readonly after: string
  /** The whole paragraph, node included. */
  readonly paragraph: string
  /** The nearest preceding heading-like paragraph — "II. JENIS CUTI YANG DIAMBIL". */
  readonly section: string
  /** For a node or cell inside a table, the text of the row's first cell. */
  readonly rowLabel: string
}

export type TextNode = {
  readonly kind: 'text'
  /** Document-order index among text nodes. Half of a node's identity. */
  readonly index: number
  /** Unescaped text content. */
  readonly text: string
  /** Offsets of the content between `<w:t ...>` and `</w:t>`. */
  readonly contentStart: number
  readonly contentEnd: number
  /** Offsets of the whole `<w:t>` element, which is what a fill rewrites. */
  readonly elementStart: number
  readonly elementEnd: number
  /** The element's raw attribute text. Never re-ordered, never dropped. */
  readonly attrs: string
  readonly selfClosing: boolean
  /** Offsets of the whole enclosing `<w:r>`, for span merges. */
  readonly runStart: number
  readonly runEnd: number
  readonly preserveSpace: boolean
  readonly paragraphIndex: number
  /**
   * The next text node sits in an adjacent run with identical formatting —
   * so this may be one value Word split in two. A signal for the mapper to
   * offer a merge, never an automatic one. Invariant 5.
   */
  readonly mergeableWithNext: boolean
  readonly context: NodeContext
  /** Context hash. Identity is index plus this, never text content. */
  readonly contextHash: string
}

export type CheckboxCell = {
  readonly kind: 'checkbox'
  /** Document-order index among checkbox cells. */
  readonly index: number
  /** Whether the cell currently carries a checkmark. */
  readonly checked: boolean
  /** Offset just before the closing `</w:p>` of the cell's first paragraph. */
  readonly insertAt: number
  /**
   * When checked, the offsets of the run carrying the mark, so unchecking is
   * an exact removal rather than a rewrite.
   */
  readonly markStart: number | null
  readonly markEnd: number | null
  readonly tableIndex: number
  readonly rowIndex: number
  readonly columnIndex: number
  readonly context: NodeContext
  readonly contextHash: string
}

/**
 * A paragraph, with the one offset something can be inserted into.
 *
 * Text nodes and checkbox cells are the two things a mapping targets, and
 * neither of them is a place — a signature is not a value written over an
 * existing `<w:t>`, it is a drawing added to a paragraph that may well have
 * nothing in it at all. The document leaves exactly that: empty paragraphs
 * above the applicant's name in section VI, which is the space somebody signs.
 *
 * `empty` is what makes those findable. A paragraph with text in it is
 * somebody's sentence and a signature does not belong on top of it.
 */
export type Paragraph = {
  /** Document-order index. The same index `TextNode.paragraphIndex` carries. */
  readonly index: number
  /** Offset just before the closing `</w:p>`, where a run is appended. */
  readonly insertAt: number
  /** No text at all — the signature space the document leaves. */
  readonly empty: boolean
  /** Offsets of any `<w:drawing>` runs already in this paragraph, in order. */
  readonly drawingRuns: ReadonlyArray<{ readonly start: number; readonly end: number }>
  readonly context: NodeContext
  readonly contextHash: string
}

export type Run = {
  readonly text: string
  /**
   * Index into `textNodes`, for preview marking. Null for the run inside a
   * checkbox cell, which is a box state rather than a text target.
   */
  readonly textNodeIndex: number | null
}

export type Block =
  | {
      readonly type: 'paragraph'
      readonly paragraphIndex: number
      readonly runs: ReadonlyArray<Run>
      readonly alignment: 'left' | 'center' | 'right' | 'both'
      readonly bold: boolean
    }
  | {
      readonly type: 'table'
      readonly tableIndex: number
      readonly rows: ReadonlyArray<{
        readonly cells: ReadonlyArray<{
          readonly blocks: ReadonlyArray<Block>
          readonly checkboxIndex: number | null
          readonly widthTwips: number | null
        }>
      }>
    }

export type ParsedDocument = {
  /** The document part, verbatim. Every offset above indexes into this. */
  readonly xml: string
  readonly textNodes: ReadonlyArray<TextNode>
  readonly checkboxCells: ReadonlyArray<CheckboxCell>
  readonly paragraphs: ReadonlyArray<Paragraph>
  readonly blocks: ReadonlyArray<Block>
  /** Tag structure with all text removed. Changes when the template changes. */
  readonly structuralHash: string
}

export type ParseResult =
  | { type: 'parsed'; document: ParsedDocument }
  | { type: 'invalid'; reason: string; at: number }

/** The mark this form uses. A literal character in a cell, not a form field. */
export const CHECKMARK = '√'

export function parseDocument(xml: string): ParseResult {
  const tree = parseXml(xml)
  if (tree.type === 'invalid') return tree

  const body = firstChild(tree.root, 'w:body') ?? tree.root
  const state: State = {
    xml,
    textNodes: [],
    checkboxCells: [],
    paragraphs: [],
    paragraphCount: 0,
    tableCount: 0,
    section: '',
    insideCheckboxCell: false,
  }

  const blocks = readBlocks(body, state, '')
  linkMergeable(state.textNodes)

  return {
    type: 'parsed',
    document: {
      xml,
      textNodes: published(state.textNodes),
      checkboxCells: state.checkboxCells,
      paragraphs: state.paragraphs,
      blocks,
      structuralHash: structuralHash(blocks),
    },
  }
}

type MutableTextNode = { -readonly [K in keyof TextNode]: TextNode[K] }

/** Run formatting is needed to spot split values, but is not part of a node's
 * public shape — the mapper works in text and context, not in XML. */
type InternalTextNode = MutableTextNode & { formatting: string }

type State = {
  readonly xml: string
  readonly textNodes: InternalTextNode[]
  readonly checkboxCells: CheckboxCell[]
  readonly paragraphs: Paragraph[]
  paragraphCount: number
  tableCount: number
  section: string
  /**
   * Set while reading inside a checkbox cell. The checkmark is a `w:t` like any
   * other, and counting it would mean every text node after a ticked box
   * shifted by one — a mapping made against a blank template would then point
   * one node off in a filled one. A box's contents are its state, not a target.
   */
  insideCheckboxCell: boolean
}

function readBlocks(parent: XmlElement, state: State, rowLabel: string): Block[] {
  const blocks: Block[] = []
  for (const child of parent.children) {
    if (child.type !== 'element') continue
    if (child.name === 'w:p') blocks.push(readParagraph(child, state, rowLabel))
    else if (child.name === 'w:tbl') blocks.push(readTable(child, state))
  }
  return blocks
}

function readParagraph(paragraph: XmlElement, state: State, rowLabel: string): Block {
  const paragraphIndex = state.paragraphCount++
  const runs: Run[] = []
  const pieces: string[] = []
  const started = state.textNodes.length

  for (const run of paragraph.children) {
    if (run.type !== 'element' || run.name !== 'w:r') continue
    const rPr = firstChild(run, 'w:rPr')
    const formatting = rPr === null ? '' : state.xml.slice(rPr.start, rPr.end)

    for (const t of run.children) {
      if (t.type !== 'element') continue

      // A tab and a line break carry no text of their own, but they are why
      // "Yth" and the jabatan beside it are not run together. Dropping them
      // made the preview disagree with the document over spacing, which is
      // exactly what a preview must not do. They are laid out, not mapped, so
      // they carry no node index.
      if (t.name === 'w:tab' || t.name === 'w:br' || t.name === 'w:cr') {
        const whitespace = t.name === 'w:tab' ? '\t' : '\n'
        runs.push({ text: whitespace, textNodeIndex: null })
        pieces.push(whitespace)
        continue
      }

      if (t.name !== 'w:t') continue
      const raw = t.selfClosing ? '' : state.xml.slice(t.innerStart, t.innerEnd)
      const text = unescapeXmlText(raw)
      if (state.insideCheckboxCell) {
        runs.push({ text, textNodeIndex: null })
        pieces.push(text)
        continue
      }
      const index = state.textNodes.length
      state.textNodes.push({
        kind: 'text',
        index,
        text,
        contentStart: t.selfClosing ? t.end : t.innerStart,
        contentEnd: t.selfClosing ? t.end : t.innerEnd,
        elementStart: t.start,
        elementEnd: t.end,
        attrs: t.attrs,
        selfClosing: t.selfClosing,
        runStart: run.start,
        runEnd: run.end,
        preserveSpace: attr(t, 'xml:space') === 'preserve',
        paragraphIndex,
        mergeableWithNext: false,
        context: emptyContext(),
        contextHash: '',
        formatting,
      })
      runs.push({ text, textNodeIndex: index })
      pieces.push(text)
    }
  }

  const paragraphText = pieces.join('')
  if (isHeading(paragraphText)) state.section = paragraphText.trim()

  // Context is filled once the whole paragraph is known — a node's neighbours
  // are what make a list of 97 strings usable. DESIGN.md §5.
  for (let i = started; i < state.textNodes.length; i++) {
    const node = state.textNodes[i]!
    const before = pieces.slice(0, i - started).join('')
    const after = pieces.slice(i - started + 1).join('')
    node.context = {
      before,
      after,
      paragraph: paragraphText,
      section: state.section,
      rowLabel,
    }
    node.contextHash = hashContext(node.context)
  }

  const context: NodeContext = {
    before: paragraphText,
    after: '',
    paragraph: paragraphText,
    section: state.section,
    rowLabel,
  }
  state.paragraphs.push({
    index: paragraphIndex,
    // `innerEnd` is the offset of the closing tag's `<`, so a run written here
    // lands after everything the paragraph already holds and before `</w:p>`.
    // A self-closing `<w:p/>` has innerEnd === end and cannot take a child, so
    // it is recorded with an insertion point that plans will refuse.
    insertAt: paragraph.selfClosing ? -1 : paragraph.innerEnd,
    empty: paragraphText.trim() === '',
    drawingRuns: drawingRunsIn(paragraph),
    context,
    contextHash: hashContext(context),
  })

  return {
    type: 'paragraph',
    paragraphIndex,
    runs,
    alignment: alignmentOf(paragraph),
    bold: isHeading(paragraphText),
  }
}

/**
 * The `<w:r>` elements in this paragraph that carry a `<w:drawing>`.
 *
 * Removing a signature has to remove exactly the run that was added, the same
 * way unchecking a box removes exactly the run carrying the mark — so the
 * document goes back to the bytes it had rather than to something equivalent.
 */
function drawingRunsIn(paragraph: XmlElement): ReadonlyArray<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = []
  for (const child of paragraph.children) {
    if (child.type !== 'element' || child.name !== 'w:r') continue
    if (firstChild(child, 'w:drawing') === null) continue
    runs.push({ start: child.start, end: child.end })
  }
  return runs
}

function readTable(table: XmlElement, state: State): Block {
  const tableIndex = state.tableCount++
  const rows: Array<{ cells: Array<{ blocks: Block[]; checkboxIndex: number | null; widthTwips: number | null }> }> = []

  let rowIndex = 0
  for (const tr of table.children) {
    if (tr.type !== 'element' || tr.name !== 'w:tr') continue
    const cells: Array<{ blocks: Block[]; checkboxIndex: number | null; widthTwips: number | null }> = []
    const tcs = tr.children.filter(
      (child): child is XmlElement => child.type === 'element' && child.name === 'w:tc',
    )
    // The row's label is its first cell with any text in it. On a checkbox row
    // the first cell is the empty box, and "the box next to Cuti Tahunan" is
    // the only description of it a person can act on.
    const rowLabel = rowLabelOf(tcs, state.xml)

    let columnIndex = 0
    for (const tc of tcs) {
      const checkbox = readCheckboxCell(tc, state, { tableIndex, rowIndex, columnIndex, rowLabel })
      state.insideCheckboxCell = checkbox !== null
      cells.push({
        blocks: readBlocks(tc, state, rowLabel),
        checkboxIndex: checkbox,
        widthTwips: cellWidth(tc),
      })
      state.insideCheckboxCell = false
      columnIndex++
    }
    rows.push({ cells })
    rowIndex++
  }

  return { type: 'table', tableIndex, rows }
}

/**
 * A checkbox cell is one that holds nothing but a possible checkmark.
 *
 * Defined by what it *can* hold rather than by being empty, deliberately: once
 * a box is ticked the cell is no longer empty, and a definition based on
 * emptiness would lose the target the moment it was used. Ticking, unticking
 * and re-ticking has to return to where it started. Invariant 6.
 */
function readCheckboxCell(
  tc: XmlElement,
  state: State,
  position: { tableIndex: number; rowIndex: number; columnIndex: number; rowLabel: string },
): number | null {
  const text = plainTextOf(tc, state.xml)
  const stripped = text.split(CHECKMARK).join('').trim()
  if (stripped !== '') return null

  const paragraph = tc.children.find(
    (child): child is XmlElement => child.type === 'element' && child.name === 'w:p',
  )
  // A `w:tc` must contain at least one `w:p`; one that does not is malformed
  // and is not offered as a target rather than being repaired.
  if (paragraph === undefined || paragraph.selfClosing) return null

  const mark = findMarkRun(paragraph, state.xml)
  const index = state.checkboxCells.length
  const context: NodeContext = {
    before: '',
    after: '',
    paragraph: text,
    section: state.section,
    rowLabel: position.rowLabel,
  }

  state.checkboxCells.push({
    kind: 'checkbox',
    index,
    checked: mark !== null,
    insertAt: paragraph.innerEnd,
    markStart: mark?.start ?? null,
    markEnd: mark?.end ?? null,
    tableIndex: position.tableIndex,
    rowIndex: position.rowIndex,
    columnIndex: position.columnIndex,
    context,
    contextHash: hashContext(context),
  })
  return index
}

function rowLabelOf(cells: ReadonlyArray<XmlElement>, xml: string): string {
  for (const cell of cells) {
    const text = plainTextOf(cell, xml).trim()
    if (text !== '' && text !== CHECKMARK) return text
  }
  return ''
}

function findMarkRun(paragraph: XmlElement, xml: string): { start: number; end: number } | null {
  for (const run of paragraph.children) {
    if (run.type !== 'element' || run.name !== 'w:r') continue
    if (plainTextOf(run, xml).includes(CHECKMARK)) return { start: run.start, end: run.end }
  }
  return null
}

/**
 * Adjacent runs with identical formatting and nothing between them may be one
 * value Word split. Flagged so the mapper can offer a merge; never merged here.
 */
function linkMergeable(nodes: InternalTextNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) {
    const node = nodes[i]!
    const next = nodes[i + 1]!
    node.mergeableWithNext =
      node.paragraphIndex === next.paragraphIndex && node.formatting === next.formatting
  }
}

/** Drop the internal formatting field on the way out. */
function published(nodes: ReadonlyArray<InternalTextNode>): ReadonlyArray<TextNode> {
  return nodes.map(({ formatting: _formatting, ...node }) => node)
}

function alignmentOf(paragraph: XmlElement): 'left' | 'center' | 'right' | 'both' {
  const pPr = firstChild(paragraph, 'w:pPr')
  const jc = pPr === null ? null : firstChild(pPr, 'w:jc')
  const value = jc === null ? null : attr(jc, 'w:val')
  return value === 'center' || value === 'right' || value === 'both' ? value : 'left'
}

function cellWidth(tc: XmlElement): number | null {
  const tcPr = firstChild(tc, 'w:tcPr')
  const tcW = tcPr === null ? null : firstChild(tcPr, 'w:tcW')
  const value = tcW === null ? null : attr(tcW, 'w:w')
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function plainTextOf(element: XmlElement | undefined, xml: string): string {
  if (element === undefined) return ''
  let text = ''
  for (const node of walk(element)) {
    if (node.name !== 'w:t') continue
    text += node.selfClosing ? '' : unescapeXmlText(xml.slice(node.innerStart, node.innerEnd))
  }
  return text
}

/** "I. DATA PEGAWAI", "VII. PERTIMBANGAN ATASAN LANGSUNG". */
function isHeading(text: string): boolean {
  return /^\s*[IVXLC]+\s*[.)]\s*\S/.test(text)
}

function emptyContext(): NodeContext {
  return { before: '', after: '', paragraph: '', section: '', rowLabel: '' }
}

function hashContext(context: NodeContext): string {
  return hashString(
    [context.section, context.rowLabel, context.before, context.after].join(' '),
  )
}

/**
 * The document's skeleton: tables, rows, cells and paragraph shapes, with every
 * scrap of text removed. Two documents with the same structural hash have the
 * same bones; a template that gained a row or lost a cell does not.
 *
 * A checkbox cell contributes only the fact that it is a checkbox cell. Its
 * contents are its state — ticking a box adds a run, and a hash that counted
 * that would refuse a template the moment somebody used it.
 */
function structuralHash(blocks: ReadonlyArray<Block>): string {
  const parts: string[] = []
  const visitBlocks = (list: ReadonlyArray<Block>): void => {
    for (const block of list) {
      if (block.type === 'paragraph') {
        parts.push(`p${block.runs.length}${block.alignment[0]}`)
        continue
      }
      parts.push('tbl[')
      for (const row of block.rows) {
        parts.push('tr[')
        for (const cell of row.cells) {
          if (cell.checkboxIndex !== null) {
            parts.push('box')
            continue
          }
          parts.push(`tc${cell.widthTwips ?? '?'}(`)
          visitBlocks(cell.blocks)
          parts.push(')')
        }
        parts.push(']')
      }
      parts.push(']')
    }
  }
  visitBlocks(blocks)
  return hashString(parts.join(' '))
}

