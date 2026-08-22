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

/** Which page, in the app's own words — the same words the nav uses. */
export type Page = 'isi' | 'petakan' | 'profil'

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
function url(locale: Locale, page: Page): string {
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
      canonical: url(locale, page),
      languages: {
        id: url('id', page),
        en: url('en', page),
        'x-default': url(DEFAULT_LOCALE, page),
      },
    },
  }
}
