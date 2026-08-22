import type { MetadataRoute } from 'next'
import { LOCALES } from '@/lib/i18n/strings'
import { PAGES, SITE_BASE, SITE_ORIGIN, pageUrl } from '@/lib/i18n/metadata'

/**
 * Every route, enumerated from the same two lists the router builds them
 * from — LOCALES and PAGES — so a new locale or a new page appears here
 * without anybody remembering to add it.
 */
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_ORIGIN}${SITE_BASE}/`, priority: 1 },
    ...LOCALES.flatMap((locale) =>
      PAGES.map((page) => ({
        url: pageUrl(locale, page),
        priority: page === 'isi' ? 0.9 : 0.5,
      })),
    ),
  ]
}
