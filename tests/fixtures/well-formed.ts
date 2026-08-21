/**
 * A small XML well-formedness check, dependency-free and deliberately strict.
 *
 * It is not a general parser — it exists to answer one question the suite asks
 * repeatedly: would Word refuse to open this? Unescaped `&` and `<` in
 * character data, unbalanced elements and unquoted attributes are exactly the
 * damage a missing escape does.
 */
export type WellFormedResult =
  | { type: 'well-formed' }
  | { type: 'malformed'; reason: string; at: number }

export function checkWellFormed(xml: string): WellFormedResult {
  const stack: string[] = []
  let i = 0

  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    const text = lt === -1 ? xml.slice(i) : xml.slice(i, lt)
    const bad = findBareEntity(text)
    if (bad !== -1) return { type: 'malformed', reason: 'bare & in character data', at: i + bad }
    if (lt === -1) break

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt)
      if (end === -1) return { type: 'malformed', reason: 'unterminated comment', at: lt }
      i = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt)
      if (end === -1) return { type: 'malformed', reason: 'unterminated CDATA', at: lt }
      i = end + 3
      continue
    }
    if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt)
      if (end === -1) return { type: 'malformed', reason: 'unterminated declaration', at: lt }
      i = end + 1
      continue
    }

    const end = findTagEnd(xml, lt)
    if (end === -1) return { type: 'malformed', reason: 'unterminated tag', at: lt }
    const tag = xml.slice(lt + 1, end)

    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim()
      if (stack.pop() !== name) {
        return { type: 'malformed', reason: `unbalanced close </${name}>`, at: lt }
      }
    } else {
      const selfClosing = tag.endsWith('/')
      const body = selfClosing ? tag.slice(0, -1) : tag
      const name = body.split(/[\s/]/, 1)[0] ?? ''
      if (name === '') return { type: 'malformed', reason: 'empty tag name', at: lt }
      const attrs = body.slice(name.length)
      const attrProblem = checkAttributes(attrs)
      if (attrProblem) return { type: 'malformed', reason: attrProblem, at: lt }
      if (!selfClosing) stack.push(name)
    }
    i = end + 1
  }

  if (stack.length > 0) {
    return { type: 'malformed', reason: `unclosed <${stack[stack.length - 1]}>`, at: xml.length }
  }
  return { type: 'well-formed' }
}

/** `<` and `>` inside quoted attribute values are legal; find the real tag end. */
function findTagEnd(xml: string, from: number): number {
  let quote: string | null = null
  for (let i = from + 1; i < xml.length; i++) {
    const c = xml[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '>') return i
    else if (c === '<') return -1
  }
  return -1
}

function findBareEntity(text: string): number {
  const amp = /&(?!(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);)/.exec(text)
  if (amp) return amp.index
  return -1
}

function checkAttributes(attrs: string): string | null {
  const re = /\s+([A-Za-z_:][-\w.:]*)\s*=\s*("([^"]*)"|'([^']*)')/g
  let consumed = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs)) !== null) {
    if (m.index !== consumed) return 'malformed attribute'
    consumed = m.index + m[0].length
    const value = m[3] ?? m[4] ?? ''
    if (findBareEntity(value) !== -1) return 'bare & in attribute value'
    if (value.includes('<')) return 'bare < in attribute value'
  }
  return attrs.slice(consumed).trim() === '' ? null : 'malformed attribute'
}
