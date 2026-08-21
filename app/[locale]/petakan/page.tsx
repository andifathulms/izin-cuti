import { notFound } from 'next/navigation'
import { isLocale, LOCALES } from '@/lib/i18n/strings'
import { MapMode } from '@/components/map-mode'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default function MapPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound()
  return <MapMode locale={params.locale} />
}
