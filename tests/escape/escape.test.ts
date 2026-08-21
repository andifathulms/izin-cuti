import { describe, expect, it } from 'vitest'
import {
  escapeForDocument,
  escapeXmlAttribute,
  escapeXmlText,
  stripInvalidXmlChars,
  unescapeXmlText,
} from '@/lib/docx/escape'
import {
  HOSTILE_VALUES,
  PRESERVED_WHITESPACE,
  UNREPRESENTABLE_VALUES,
} from '../fixtures/hostile-values'
import { checkWellFormed } from '../fixtures/well-formed'

describe('escapeXmlText', () => {
  it('escapes the three characters that matter in character data', () => {
    expect(escapeXmlText('& < >')).toBe('&amp; &lt; &gt;')
  })

  it('escapes the ampersand first, so escapes are not double-escaped', () => {
    expect(escapeXmlText('<')).toBe('&lt;')
    expect(escapeXmlText('&lt;')).toBe('&amp;lt;')
  })

  it('leaves quotes alone in character data, where they are legal', () => {
    expect(escapeXmlText(`"'`)).toBe(`"'`)
  })
})

describe('escapeXmlAttribute', () => {
  it('escapes both quote forms as well', () => {
    expect(escapeXmlAttribute(`a & b " c ' d < e`)).toBe(
      'a &amp; b &quot; c &apos; d &lt; e',
    )
  })
})

describe('the permanent hostile-value fixtures', () => {
  it.each(HOSTILE_VALUES)('produces well-formed XML for $label', ({ value }) => {
    const xml = `<w:t xml:space="preserve">${escapeForDocument(value)}</w:t>`
    expect(checkWellFormed(xml)).toEqual({ type: 'well-formed' })
  })

  it.each(HOSTILE_VALUES)('round-trips $label through escape and unescape', ({ value }) => {
    expect(unescapeXmlText(escapeForDocument(value))).toBe(value)
  })

  it.each(HOSTILE_VALUES)('produces a well-formed attribute for $label', ({ value }) => {
    const xml = `<w:pStyle w:val="${escapeXmlAttribute(stripInvalidXmlChars(value))}"/>`
    expect(checkWellFormed(xml)).toEqual({ type: 'well-formed' })
  })
})

describe('characters XML cannot represent', () => {
  it.each(UNREPRESENTABLE_VALUES)('strips $label', ({ value, expected }) => {
    expect(stripInvalidXmlChars(value)).toBe(expected)
  })

  it.each(UNREPRESENTABLE_VALUES)('still yields well-formed XML for $label', ({ value }) => {
    const xml = `<w:t>${escapeForDocument(value)}</w:t>`
    expect(checkWellFormed(xml)).toEqual({ type: 'well-formed' })
  })

  it.each(PRESERVED_WHITESPACE)('keeps $label, which is legal XML', ({ value }) => {
    expect(stripInvalidXmlChars(value)).toBe(value)
  })
})

describe('unescapeXmlText', () => {
  it('reads back the five named entities', () => {
    expect(unescapeXmlText('&amp;&lt;&gt;&quot;&apos;')).toBe(`&<>"'`)
  })

  it('reads back numeric character references, decimal and hex', () => {
    expect(unescapeXmlText('&#8730; &#x221A;')).toBe('√ √')
  })

  it('leaves an unrecognised reference verbatim rather than guessing', () => {
    expect(unescapeXmlText('&nbsp; &notanentity;')).toBe('&nbsp; &notanentity;')
  })
})

describe('the well-formedness check itself', () => {
  it('catches the bare ampersand that an unescaped value would leave', () => {
    const result = checkWellFormed('<w:t>Umum & Kepegawaian</w:t>')
    expect(result.type).toBe('malformed')
  })

  it('catches the unbalanced element that a raw tag-shaped value would leave', () => {
    // What a raw `</w:t>` in a user's value would leave behind.
    const result = checkWellFormed('<w:t></w:t> ekor</w:t>')
    expect(result.type).toBe('malformed')
  })

  it('accepts attributes containing escaped specials', () => {
    expect(checkWellFormed('<a b="x &amp; y" c=\'z\'/>')).toEqual({ type: 'well-formed' })
  })
})
