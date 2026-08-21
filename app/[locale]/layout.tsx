import { notFound } from 'next/navigation'
import { AppStateProvider } from '@/components/app-state'
import { Header } from '@/components/shell/chrome'
import { isLocale, LOCALES } from '@/lib/i18n/strings'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!isLocale(params.locale)) notFound()

  return (
    // The provider sits above both modes, so map mode and fill mode are two
    // views of one session and the chosen document survives the trip between.
    <AppStateProvider>
      <div className="flex min-h-screen flex-col">
        <Header locale={params.locale} />
        <main className="flex-1">{children}</main>
      </div>
    </AppStateProvider>
  )
}
