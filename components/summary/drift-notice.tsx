'use client'

import Link from 'next/link'
import type { Difference } from '@/lib/docx/fingerprint'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * The refusal.
 *
 * This is the screen the whole fingerprint exists for, and it is deliberately
 * not an error: no red, no alarm, no shouting. A refusal, in ink, with an amber
 * marker and the specific differences named — because the person reading it has
 * to decide whether their office changed the form, and a wall of red tells them
 * nothing they can act on.
 *
 * There is no "fill anyway". DESIGN.md §3, invariant 4.
 */
export function DriftNotice({
  locale,
  differences,
}: {
  locale: Locale
  differences: ReadonlyArray<Difference>
}) {
  const t = strings(locale)

  return (
    <section className="mx-auto max-w-[70ch] px-6 py-12">
      <p aria-hidden className="text-lg text-attention">
        ▲
      </p>
      <h1 className="mt-2 text-xl font-semibold">{t.driftTitle}</h1>
      <p className="mt-3 text-base">{t.driftExplain}</p>

      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {differences.map((difference, i) => (
          <li key={i} className="py-3 text-base">
            <Describe locale={locale} difference={difference} />
          </li>
        ))}
      </ul>

      <Link
        href={`/${locale}/petakan`}
        className="mt-6 inline-block rounded border border-typed bg-typed/10 px-4 py-2 text-base font-medium text-typed"
      >
        {t.driftRemap}
      </Link>
    </section>
  )
}

function Describe({ locale, difference }: { locale: Locale; difference: Difference }) {
  const t = strings(locale)

  switch (difference.type) {
    case 'text-node-count':
      return (
        <>
          <span className="font-medium">{t.driftCountText}</span>{' '}
          <span className="font-mono">
            {difference.expected} → {difference.found}
          </span>
        </>
      )
    case 'checkbox-count':
      return (
        <>
          <span className="font-medium">{t.driftCountCheckbox}</span>{' '}
          <span className="font-mono">
            {difference.expected} → {difference.found}
          </span>
        </>
      )
    case 'structure':
      return <span className="font-medium">{t.driftStructure}</span>
    case 'target-missing':
      return (
        <>
          <span className="font-medium">{difference.label}</span>{' '}
          <span className="font-mono text-sm text-ink/60">
            {difference.kind}:{difference.index}
          </span>{' '}
          {t.driftMissing}
        </>
      )
    case 'target-context':
      return (
        <>
          <span className="font-medium">{difference.label}</span> {t.driftContext}{' '}
          <span className="font-mono text-sm">{difference.foundContext}</span>
        </>
      )
    default: {
      const unreachable: never = difference
      throw new Error(`unhandled difference ${JSON.stringify(unreachable)}`)
    }
  }
}
