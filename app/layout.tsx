import type { Metadata } from 'next'
import { IBM_Plex_Mono, Public_Sans, Source_Serif_4 } from 'next/font/google'
import { OG_IMAGE } from '@/lib/i18n/metadata'
import './globals.css'

/**
 * Self-hosted by next/font: the files are fetched at build time and served
 * from this origin. Zero runtime network is a promise the app keeps, and a
 * font request to a third party would break it on the first page load.
 *
 * Public Sans was designed for government use — plain, legible, and the right
 * register for a document like this. IBM Plex Mono carries every number that
 * has to be read digit by digit.
 *
 * Source Serif 4 carries the Roman-numeraled section headings and the
 * document's own title, and nothing else. The left pane is meant to read as
 * the document it fills; a serif on the headings is the cheapest honest way to
 * say so. The moment it reaches a label or a button it stops meaning "this is
 * a document heading" and starts meaning "this is a bit important" — the same
 * failure the palette forbids for amber. DESIGN.md §4.
 */
const publicSans = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-public-sans',
})

/*
 * One weight, because one weight is used. `font-mono` appears 23 times across
 * the components and never once beside `font-medium` or `font-semibold`, so
 * weight 500 was being preloaded on every route — 9.8 kB on the critical path
 * — and rendered nowhere.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-plex-mono',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
  variable: '--font-source-serif',
})

export const metadata: Metadata = {
  title: 'Izin Cuti',
  description:
    'Isi Formulir Permintaan dan Pemberian Cuti, lalu unduh suratnya sebagai DOCX. Semuanya berjalan di perangkat ini — tidak ada yang dikirim ke mana pun.',
  openGraph: { images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
  /*
   * A static file in public/, linked by hand: Next prefixes basePath onto the
   * icon links it writes but not onto a manifest route's link, which pointed
   * installs at a manifest GitHub Pages does not serve. The file itself bakes
   * the production paths in, so it is only right in production — which is the
   * only place anyone installs from.
   */
  manifest:
    process.env.NODE_ENV === 'production' ? '/izin-cuti/manifest.webmanifest' : '/manifest.webmanifest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${publicSans.variable} ${plexMono.variable} ${sourceSerif.variable}`}>
      <body className="bg-paper text-ink font-sans">{children}</body>
    </html>
  )
}
