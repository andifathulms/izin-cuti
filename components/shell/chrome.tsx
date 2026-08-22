'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { strings, type Locale } from '@/lib/i18n/strings'

/**
 * The frame. Roman-numeraled sections and ruled rows belong to the document;
 * the chrome around them stays quiet enough to disappear.
 */

export function Header({ locale }: { locale: Locale }) {
  const t = strings(locale)
  const pathname = usePathname()
  const other: Locale = locale === 'id' ? 'en' : 'id'

  // This app fills one form, so mapping is not a place people go — it is the
  // recovery path for the day the office reissues the form. The route stays
  // (the drift refusal and the profile page both link to it); it is just not
  // presented as one of two modes.
  const tabs = [
    { href: `/${locale}/isi`, label: t.navFill },
    { href: `/${locale}/profil`, label: t.navProfile },
  ]

  return (
    <header className="no-print border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-full items-baseline justify-between gap-6 px-6 pt-4">
        <div className="flex items-baseline gap-4">
          <Link href={`/${locale}/isi`} className="text-lg font-semibold tracking-tight">
            {t.appName}
          </Link>
        </div>

        <nav className="flex items-center gap-1" aria-label={t.appName}>
          {tabs.map((tab) => {
            const active = pathname?.startsWith(tab.href) ?? false
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'rounded border px-3 py-1 text-base transition-colors duration-state ease-house',
                  active
                    ? 'border-typed bg-typed/10 text-typed'
                    : 'border-transparent text-ink-muted hover:border-rule',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            )
          })}
          <Link
            href={`/${other}${pathname?.slice(3) ?? '/isi'}`}
            className="ml-2 rounded border border-rule px-2 py-1 font-mono text-sm uppercase text-ink-muted"
            hrefLang={other}
          >
            {other}
          </Link>
        </nav>
      </div>

      {/*
       * What this is, on its own line, at every width.
       *
       * It used to sit beside the wordmark at `text-sm` inside `hidden
       * md:block` — smaller than any label on the page, and absent on a
       * phone, where the only words above the form were the two in the
       * wordmark. "Isi Surat" does not tell a stranger that this fills a
       * cuti form or that it hands back a DOCX. This does, in one line,
       * before anything else is read.
       */}
      <p className="max-w-[92ch] px-6 pb-4 pt-1 text-base">
        {t.taglineWhat} <span className="text-ink-muted">{t.taglineWhere}</span>
      </p>
    </header>
  )
}

/**
 * Said where the NIP and the home address are being typed, not in a footer.
 * That is where it matters and where it is believed. DESIGN.md §8.
 */
export function PrivacyLine({ locale, className = '' }: { locale: Locale; className?: string }) {
  const t = strings(locale)
  return (
    <p className={`text-sm text-ink-muted ${className}`}>
      <span className="font-medium text-ink">{t.privacy}</span> {t.privacyWhy}
    </p>
  )
}

/**
 * The legend contract: every view says what it is showing and what it cannot
 * show. Here, that the three field states mean three different things.
 */
export function StateLegend({ locale }: { locale: Locale }) {
  const t = strings(locale)
  return (
    <ul className="no-print flex flex-wrap items-center gap-4 text-sm text-ink-muted">
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded border border-typed bg-typed/20" />
        {t.fillProfile} / {t.fillRequest}
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded border border-derived bg-derived/20" />
        {t.fillDerived}
      </li>
      <li className="flex items-center gap-2">
        <span className="unmapped inline-block h-3 w-3 rounded border border-rule" />
        {t.mapUnmapped}
      </li>
    </ul>
  )
}
