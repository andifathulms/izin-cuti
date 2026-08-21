import { notFound } from 'next/navigation'
import { isLocale, LOCALES } from '@/lib/i18n/strings'
import { ProfileMode } from '@/components/profile-mode'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default function ProfilePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound()
  return <ProfileMode locale={params.locale} />
}
