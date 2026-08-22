import { notFound } from 'next/navigation'
import { AppStateProvider } from '@/components/app-state'
import { Header } from '@/components/shell/chrome'
import { HtmlLang } from '@/components/shell/html-lang'
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
      {/*
       * The shell owns the viewport and `main` takes what is left of it, so a
       * mode can simply be `h-full`. Fill mode and map mode each carried their
       * own `100vh` minus a guessed header height — 5rem in one, 4rem in the
       * other, neither matching the header — and every line added to the
       * header made both guesses wronger.
       *
       * The height itself is `.app-shell` in globals.css: 100dvh over a 100vh
       * fallback, which two declarations express and one utility class cannot.
       */}
      <div lang={params.locale} className="app-shell flex flex-col">
        <HtmlLang locale={params.locale} />
        <Header locale={params.locale} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </AppStateProvider>
  )
}
