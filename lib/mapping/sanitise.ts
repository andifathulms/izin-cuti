import { fillDocument, type FillInstruction, type FillResult } from '../docx/fill'
import type { ParsedDocument } from '../docx/parse'
import type { ProfileValues } from '../derive/compute'
import type { Target } from './schema'

/**
 * Produce a blank copy of a template.
 *
 * The office form arrives with a real person's real data in it — that is the
 * premise of this whole tool, PRD §1. A blank copy is what makes it safe to
 * keep the template on the device between sessions, and safe to hand to a
 * colleague.
 *
 * Doing this in Word is the one approach that breaks things: a Word re-save
 * restructures runs, drops empty ones and merges others, so the node count and
 * structure shift and a mapping made against the original no longer fits. Here
 * it is a fill like any other — only the text between `<w:t>` tags changes, and
 * every byte of structure is left exactly where it was.
 */

/**
 * Each value is replaced by its field name, never by nothing.
 *
 * Emptying them is not offered, and the reason is not cosmetic. A table cell
 * holding nothing but whitespace is precisely how a checkbox target is
 * identified — so emptying a value that sits alone in a cell reclassifies that
 * cell as a tick box, drops its text node, and shifts every node index after
 * it. The blank copy would no longer be the same document in the only sense
 * that matters here.
 *
 * A field name is also the more useful thing to read on a blank form.
 */
const FALLBACK_LABEL = '—'

export function blankCopy(
  document: ParsedDocument,
  targets: ReadonlyArray<Target>,
): FillResult {
  const instructions: FillInstruction[] = targets.map((target) =>
    target.type === 'text'
      ? {
          type: 'text',
          nodeIndices: target.nodeIndices,
          value: target.label.trim() === '' ? FALLBACK_LABEL : target.label,
        }
      : target.type === 'checkbox'
        ? // Every mapped box is cleared, whatever state the original was in.
          { type: 'checkbox', cellIndex: target.cellIndex, checked: false }
        : // A blank copy made from a document somebody had already signed must
          // not ship their signature inside it. Removing one is exact and
          // costs nothing when there is none.
          { type: 'signature', paragraphIndex: target.paragraphIndex, run: null },
  )
  return fillDocument(document, instructions)
}

export type Residue = {
  readonly nodeIndex: number
  /** Which profile field was found — "nama", "nip", "alamat". */
  readonly field: keyof ProfileValues
  /** The node's text, so a person can see where it is. */
  readonly text: string
  readonly context: string
}

/**
 * What a blank copy did *not* blank.
 *
 * Only mapped targets are cleared, so anything personal in a node nobody
 * mapped survives — a name in a footer, a NIP in a signature block. This looks
 * for the profile values already typed in and says where they still appear.
 *
 * It cannot find what it has not been told about: a phone number that is in the
 * document but not in the profile is invisible to it. The UI says so, because a
 * check that looks exhaustive and is not is worse than no check.
 */
export function residualPersonalData(
  document: ParsedDocument,
  profile: ProfileValues,
  alreadyBlanked: ReadonlySet<number>,
): ReadonlyArray<Residue> {
  const found: Residue[] = []

  for (const node of document.textNodes) {
    if (alreadyBlanked.has(node.index)) continue
    const haystack = node.text.toLowerCase()
    if (haystack.trim() === '') continue

    for (const [field, value] of Object.entries(profile) as Array<[keyof ProfileValues, string]>) {
      const needle = value.trim().toLowerCase()
      // Short values produce noise — a two-letter unit name would match half
      // the document. Four characters is where a match starts meaning something.
      if (needle.length < 4) continue
      if (!haystack.includes(needle)) continue
      found.push({
        nodeIndex: node.index,
        field,
        text: node.text,
        context: [node.context.section, node.context.rowLabel]
          .filter((part) => part.trim() !== '')
          .join(' | '),
      })
      break
    }
  }

  return found
}

/** Node indices a blank copy will have cleared. */
export function blankedNodes(targets: ReadonlyArray<Target>): ReadonlySet<number> {
  const blanked = new Set<number>()
  for (const target of targets) {
    if (target.type !== 'text') continue
    for (const index of target.nodeIndices) blanked.add(index)
  }
  return blanked
}
