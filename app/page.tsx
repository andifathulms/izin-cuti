import Link from 'next/link'
import { DEFAULT_LOCALE } from '@/lib/i18n/strings'

/**
 * The root is a doorway to the Indonesian fill page.
 *
 * Not `redirect()`: in a static export that renders an error page rather than
 * a redirect, which is the sort of thing only a build of the real thing tells
 * you. A meta refresh works without JavaScript, and the link below works when
 * even that is blocked.
 */
export default function Home() {
  const target = `${process.env.NODE_ENV === 'production' ? '/izin-cuti' : ''}/${DEFAULT_LOCALE}/isi/`
  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${target}`} />
      <main className="mx-auto max-w-[60ch] px-6 py-24">
        <h1 className="text-xl font-semibold">Isi Surat</h1>
        {/* Seen for an instant, or for good if the refresh is blocked. Either
            way it should say what the thing is rather than only its name. */}
        <p className="mt-2 text-base">
          Isi Formulir Permintaan dan Pemberian Cuti, lalu unduh suratnya sebagai DOCX.{' '}
          <span className="text-ink-muted">
            Semuanya berjalan di perangkat ini — tidak ada yang dikirim ke mana pun.
          </span>
        </p>
        <p className="mt-4 text-base">
          <Link href={`/${DEFAULT_LOCALE}/isi`} className="text-typed underline">
            Lanjut ke halaman isi
          </Link>
        </p>
      </main>
    </>
  )
}
