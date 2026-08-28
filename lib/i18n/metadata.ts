import type { Metadata } from 'next'
import { DEFAULT_LOCALE, strings, type Locale } from './strings'

/**
 * Page metadata, built from the strings the page itself renders.
 *
 * Every route used to serve one hardcoded title — "Isi Surat" — and one
 * hardcoded Indonesian description, English routes included. Composing both
 * from `strings.ts` means a title cannot drift from the tab it names, and a
 * description cannot drift from the sentence under the wordmark, because
 * there is only one copy of each.
 *
 * The origin is needed for canonical and og:url and is the one thing not
 * derivable from content. It matches `basePath` in next.config.js.
 */
export const SITE_ORIGIN = 'https://andifathulms.github.io'
export const SITE_BASE = '/izin-cuti'

/**
 * The share card's artwork: the app's own mark — a checked box beside the
 * boxes it fills for you — not a picture of any government form. One image
 * for every route; what differs per route is the text beside it.
 */
export const OG_IMAGE = {
  url: `${SITE_ORIGIN}${SITE_BASE}/og.png`,
  width: 1200,
  height: 630,
  alt: 'Izin Cuti',
}

/** Which page, in the app's own words — the same words the nav uses. */
export const PAGES = ['isi', 'petakan', 'profil'] as const
export type Page = (typeof PAGES)[number]

function pageName(locale: Locale, page: Page): string {
  const t = strings(locale)
  switch (page) {
    case 'isi':
      return t.navFill
    case 'petakan':
      return t.navMap
    case 'profil':
      return t.navProfile
    default: {
      const unreachable: never = page
      throw new Error(`unhandled page ${JSON.stringify(unreachable)}`)
    }
  }
}

/** The deployed URL of one page. Trailing slash: the export writes directories. */
export function pageUrl(locale: Locale, page: Page): string {
  return `${SITE_ORIGIN}${SITE_BASE}/${locale}/${page}/`
}

export function pageMetadata(locale: Locale, page: Page): Metadata {
  const t = strings(locale)
  // The two clauses the header shows, joined — outcome first, then why it is
  // safe to type an NIP into. Exactly what a person reads on arrival.
  const description = `${t.taglineWhat} ${t.taglineWhere}`

  return {
    title: `${pageName(locale, page)} — ${t.appName}`,
    description,
    /*
     * The same page exists in two locales and nothing said so, so a crawler
     * saw two near-identical documents competing with each other. Each names
     * itself canonical and points at its sibling; x-default goes to the
     * default locale, which is where the root doorway sends people too.
     */
    alternates: {
      canonical: pageUrl(locale, page),
      languages: {
        id: pageUrl('id', page),
        en: pageUrl('en', page),
        'x-default': pageUrl(DEFAULT_LOCALE, page),
      },
    },
    /*
     * How this tool actually spreads: one person sending a link to a
     * colleague in a chat. The preview card was title-only and identical for
     * all six routes, so a link to the profile page looked exactly like a
     * link to the form.
     *
     * Same title and description as above rather than a second set written by
     * hand — a card that disagrees with the page is worse than no card. The
     * image is the app's own mark, not a picture of a government form —
     * artwork that claims only what the app is.
     */
    openGraph: {
      type: 'website',
      siteName: t.appName,
      locale: locale === 'id' ? 'id_ID' : 'en_US',
      url: pageUrl(locale, page),
      title: `${pageName(locale, page)} — ${t.appName}`,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${pageName(locale, page)} — ${t.appName}`,
      description,
      images: [OG_IMAGE.url],
    },
  }
}
