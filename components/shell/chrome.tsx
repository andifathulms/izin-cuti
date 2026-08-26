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
    /*
     * One line at any width that has room for one.
     *
     * This was three stacked rows — wordmark, then a two-sentence tagline,
     * then the flow line — and it took a third of a laptop screen before the
     * first field. The wordmark, what the app does, and the nav share a row
     * and wrap only when they must.
     *
     * The second half of the tagline used to live here too: "nothing is sent
     * anywhere". It is gone from the header on purpose. §8 asks for that
     * sentence at the foot of the column where the NIP and the home address
     * are being typed, because that is where it is believed, and it is
     * already there — saying it twice made the header longer and the claim
     * no more true.
     */
    <header className="no-print border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-full flex-wrap items-baseline gap-x-6 gap-y-1 px-6 py-3">
        <Link href={`/${locale}/isi`} className="text-lg font-semibold tracking-tight">
          {t.appName}
        </Link>

        {/* What this is, before anything else is read, at every width. */}
        <p className="order-last w-full text-base text-ink-muted sm:order-none sm:w-auto sm:flex-1">
          {t.taglineWhat}
        </p>

        {/* No aria-label: it announced "Izin Cuti navigation", naming the nav
            after the app rather than its contents, and there is only one nav
            on the page for it to be distinguished from. */}
        <nav className="flex items-center gap-1">
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
 *
 * It belongs beside the colours it explains, not ahead of them. On the fill
 * screen it was the first content on the page — three swatches explaining a
 * system nobody had met yet, in the strip where the purpose of the app should
 * be. And the third entry described a state the bundled form never reaches, so
 * `showUnmapped` keeps it for the template that does have one and drops it
 * where it only raises a question with no answer on screen.
 */
export function StateLegend({
  locale,
  showUnmapped = true,
}: {
  locale: Locale
  showUnmapped?: boolean
}) {
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
      {showUnmapped && (
        <li className="flex items-center gap-2">
          <span className="unmapped inline-block h-3 w-3 rounded border border-rule" />
          {t.mapUnmapped}
        </li>
      )}
    </ul>
  )
}
