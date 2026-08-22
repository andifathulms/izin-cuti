import { notFound } from 'next/navigation'
import { isLocale, LOCALES } from '@/lib/i18n/strings'
import { pageMetadata } from '@/lib/i18n/metadata'
import { MapMode } from '@/components/map-mode'

export function generateMetadata({ params }: { params: { locale: string } }) {
  return isLocale(params.locale) ? pageMetadata(params.locale, 'petakan') : {}
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default function MapPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound()
  return <MapMode locale={params.locale} />
}
