import type { Metadata } from 'next'
import { IBM_Plex_Mono, Public_Sans } from 'next/font/google'
import './globals.css'

/**
 * Self-hosted by next/font: the files are fetched at build time and served
 * from this origin. Zero runtime network is a promise the app keeps, and a
 * font request to a third party would break it on the first page load.
 *
 * Public Sans was designed for government use — plain, legible, and the right
 * register for a document like this. IBM Plex Mono carries every number that
 * has to be read digit by digit.
 */
const publicSans = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-public-sans',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  title: 'Isi Surat',
  description:
    'Isi Formulir Permintaan dan Pemberian Cuti, lalu unduh suratnya sebagai DOCX. Semuanya berjalan di perangkat ini — tidak ada yang dikirim ke mana pun.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${publicSans.variable} ${plexMono.variable}`}>
      <body className="bg-paper text-ink font-sans">{children}</body>
    </html>
  )
}
