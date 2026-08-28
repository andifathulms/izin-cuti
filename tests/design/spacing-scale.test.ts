import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every spacing utility names a step the scale actually has.
 *
 * `tailwind.config.ts` **replaces** the spacing scale rather than extending it,
 * so `h-40`, `w-56` and `max-h-20` are not smaller-than-expected — they are
 * nothing at all. The class is emitted into the markup, matches no rule, and
 * the element falls back to whatever the browser does. Nothing warns: not the
 * type checker, not the linter, not the build.
 *
 * This has now happened twice — once to four utilities before this suite
 * existed, once to a drawing pad that came out three times the height it was
 * written to be. It is the kind of thing a test catches for free and a person
 * catches by noticing something looks slightly wrong.
 */

const SCALE = new Set(['0', '1', '2', '3', '4', '6', '8', '12', '16', '24', '32', 'px', 'full'])

/**
 * Keywords Tailwind provides for these utilities whatever the spacing scale
 * says. `mx-auto` and `w-auto` are not steps and never were.
 */
const KEYWORDS = new Set(['auto', 'screen', 'fit', 'min', 'max', 'none', 'prose'])

/** The utilities whose numeric suffix is read from `theme.spacing`. */
const PREFIXES = [
  'p', 'pt', 'pr', 'pb', 'pl', 'px', 'py',
  'm', 'mt', 'mr', 'mb', 'ml', 'mx', 'my',
  'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h',
  'gap', 'gap-x', 'gap-y',
  'space-x', 'space-y',
  'inset', 'top', 'right', 'bottom', 'left',
  'translate-x', 'translate-y',
  'scroll-m', 'scroll-mt', 'scroll-p',
]

function sources(directory: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) out.push(...sources(path))
    else if (path.endsWith('.tsx') || path.endsWith('.ts')) out.push(path)
  }
  return out
}

/** Class-ish tokens out of every className in a file. */
function classNames(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`|\{\[([^\]]*)\])/gs)) {
    const blob = match[1] ?? match[2] ?? match[3] ?? ''
    for (const token of blob.split(/[\s'"`,]+/)) {
      if (token !== '') found.push(token)
    }
  }
  return found
}

describe('spacing utilities', () => {
  const offenders: Array<{ file: string; cls: string }> = []

  for (const file of [...sources('components'), ...sources('app')]) {
    const source = readFileSync(file, 'utf8')
    for (const raw of classNames(source)) {
      // Variants are irrelevant to the step; arbitrary values bypass the scale.
      const cls = raw.split(':').pop() ?? raw
      if (cls.includes('[')) continue
      const match = /^-?([a-z-]+)-([A-Za-z0-9.]+)$/.exec(cls)
      if (match === null) continue
      const [, prefix, step] = match
      if (!PREFIXES.includes(prefix!)) continue
      if (!SCALE.has(step!) && !KEYWORDS.has(step!)) offenders.push({ file, cls })
    }
  }

  it('name a step tailwind.config.ts actually declares', () => {
    expect(
      offenders.map((o) => `${o.cls} in ${o.file}`),
      'these classes are emitted into the markup and match no CSS rule',
    ).toEqual([])
  })

  it('is actually looking at something, so a broken matcher cannot pass silently', () => {
    const seen = sources('components').length
    expect(seen).toBeGreaterThan(5)
    expect(classNames('<div className="h-4 w-full" />')).toContain('h-4')
  })
})
