import { notFound } from 'next/navigation'
import { isLocale, LOCALES } from '@/lib/i18n/strings'
import { FillMode } from '@/components/fill-mode'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default function FillPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound()
  return <FillMode locale={params.locale} />
}
