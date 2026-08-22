'use client'

import { useEffect } from 'react'
import type { Locale } from '@/lib/i18n/strings'

/**
 * The page's language, corrected to the route's.
 *
 * `<html lang>` lives in the root layout, which sits above `[locale]` and
 * never sees which locale is being served — so every English page declared
 * itself Indonesian and was read aloud with Indonesian phonetics. WCAG 3.1.1.
 *
 * A root layout must own `<html>`, so the value cannot be rendered correctly
 * from there in a static export. It is corrected here instead, and the shell
 * carries `lang` on its own element as well, so the served markup is right
 * about its contents even before this runs. WCAG 3.1.2.
 */
export function HtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return null
}
