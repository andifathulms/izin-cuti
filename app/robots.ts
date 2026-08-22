import type { MetadataRoute } from 'next'
import { SITE_BASE, SITE_ORIGIN } from '@/lib/i18n/metadata'

/**
 * There was no robots.txt at all. Nothing here is private — the app has no
 * server and stores nothing remotely — so everything is allowed, and the
 * sitemap is named because six routes with no index page listing them are
 * otherwise found only by following the doorway's meta refresh.
 */
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_ORIGIN}${SITE_BASE}/sitemap.xml`,
  }
}
