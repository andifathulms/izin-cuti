/**
 * A minimal, offset-preserving XML reader.
 *
 * We do not round-trip `document.xml` through a parser and a serialiser. A
 * serialiser normalises — attribute order, self-closing form, whitespace — and
 * every one of those changes is a change we did not intend to a document that
 * has to open in Word. So the tree here records *offsets into the original
 * string*, and every edit is a splice of that string. What we did not touch is
 * character-for-character what we read.
 *
 * Not a general XML processor: no namespace resolution, no DTD, no entity
 * expansion beyond what `escape.ts` does. WordprocessingML does not need them.
 */

export type XmlText = {
  readonly type: 'text'
  readonly raw: string
  readonly start: number
  readonly end: number
}

export type XmlOther = {
  readonly type: 'other'
  readonly raw: string
  readonly start: number
  readonly end: number
}

export type XmlElement = {
  readonly type: 'element'
  readonly name: string
  /** The raw attribute text, exactly as written. Never re-ordered. */
  readonly attrs: string
  readonly children: ReadonlyArray<XmlNode>
  /** Offset of the opening `<`. */
  readonly start: number
  /** Offset just past the closing `>`. */
  readonly end: number
  /** Offset just past the open tag's `>`; equals `end` when self-closing. */
  readonly innerStart: number
  /** Offset of the closing tag's `<`; equals `end` when self-closing. */
  readonly innerEnd: number
  readonly selfClosing: boolean
}

export type XmlNode = XmlElement | XmlText | XmlOther

export type ParseXmlResult =
  | { type: 'parsed'; root: XmlElement }
  | { type: 'invalid'; reason: string; at: number }

type MutableElement = {
  type: 'element'
  name: string
  attrs: string
  children: XmlNode[]
  start: number
  end: number
  innerStart: number
  innerEnd: number
  selfClosing: boolean
}

export function parseXml(xml: string): ParseXmlResult {
  const roots: XmlNode[] = []
  const stack: MutableElement[] = []
  let i = 0

  const push = (node: XmlNode) => {
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) {
      if (xml.slice(i).trim() !== '') push({ type: 'text', raw: xml.slice(i), start: i, end: xml.length })
      break
    }
    if (lt > i) push({ type: 'text', raw: xml.slice(i, lt), start: i, end: lt })

    const skip = skippableEnd(xml, lt)
    if (skip !== null) {
      push({ type: 'other', raw: xml.slice(lt, skip), start: lt, end: skip })
      i = skip
      continue
    }

    const gt = findTagEnd(xml, lt)
    if (gt === -1) return { type: 'invalid', reason: 'unterminated tag', at: lt }
    const inner = xml.slice(lt + 1, gt)

    if (inner.startsWith('/')) {
      const name = inner.slice(1).trim()
      const open = stack.pop()
      if (open === undefined || open.name !== name) {
        return { type: 'invalid', reason: `unexpected </${name}>`, at: lt }
      }
      open.innerEnd = lt
      open.end = gt + 1
      i = gt + 1
      continue
    }

    const selfClosing = inner.endsWith('/')
    const body = selfClosing ? inner.slice(0, -1) : inner
    const nameEnd = firstWhitespace(body)
    const name = nameEnd === -1 ? body : body.slice(0, nameEnd)
    if (name === '') return { type: 'invalid', reason: 'empty tag name', at: lt }
    const attrs = nameEnd === -1 ? '' : body.slice(nameEnd)

    const element: MutableElement = {
      type: 'element',
      name,
      attrs,
      children: [],
      start: lt,
      end: gt + 1,
      innerStart: gt + 1,
      innerEnd: gt + 1,
      selfClosing,
    }
    push(element)
    if (!selfClosing) stack.push(element)
    i = gt + 1
  }

  if (stack.length > 0) {
    const open = stack[stack.length - 1]!
    return { type: 'invalid', reason: `unclosed <${open.name}>`, at: open.start }
  }

  const root = roots.find((node): node is XmlElement => node.type === 'element')
  if (root === undefined) return { type: 'invalid', reason: 'no root element', at: 0 }
  return { type: 'parsed', root }
}

/** Comments, CDATA, declarations and processing instructions: passed over whole. */
function skippableEnd(xml: string, lt: number): number | null {
  const forms: ReadonlyArray<readonly [string, string]> = [
    ['<!--', '-->'],
    ['<![CDATA[', ']]>'],
    ['<?', '?>'],
    ['<!', '>'],
  ]
  for (const [open, close] of forms) {
    if (!xml.startsWith(open, lt)) continue
    const end = xml.indexOf(close, lt + open.length)
    return end === -1 ? xml.length : end + close.length
  }
  return null
}

/** `>` inside a quoted attribute value does not end the tag. */
function findTagEnd(xml: string, from: number): number {
  let quote: string | null = null
  for (let i = from + 1; i < xml.length; i++) {
    const c = xml[i]
    if (quote !== null) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '>') return i
  }
  return -1
}

function firstWhitespace(body: string): number {
  const m = /\s/.exec(body)
  return m ? m.index : -1
}

/** Read an attribute from an element's raw attribute text. */
export function attr(element: XmlElement, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`)
  const m = re.exec(element.attrs)
  if (!m) return null
  return m[2] ?? m[3] ?? ''
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function childElements(element: XmlElement): ReadonlyArray<XmlElement> {
  return element.children.filter((child): child is XmlElement => child.type === 'element')
}

export function firstChild(element: XmlElement, name: string): XmlElement | null {
  for (const child of element.children) {
    if (child.type === 'element' && child.name === name) return child
  }
  return null
}

/** Depth-first, document order. */
export function* walk(element: XmlElement): Generator<XmlElement> {
  yield element
  for (const child of element.children) {
    if (child.type === 'element') yield* walk(child)
  }
}
