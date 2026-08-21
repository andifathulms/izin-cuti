/**
 * The permanent escaping fixture set. These values are the reason `escape.ts`
 * exists: each one, substituted raw, produces a document Word refuses to open.
 *
 * Do not trim this list to make something pass.
 */
export const HOSTILE_VALUES: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'ampersand in a unit name', value: 'Bagian Umum & Kepegawaian' },
  { label: 'bare less-than', value: 'gaji < 5 juta' },
  { label: 'bare greater-than', value: 'masa kerja > 10 tahun' },
  { label: 'double quotes', value: 'alasan: "keperluan keluarga"' },
  { label: 'apostrophe', value: "Jl. Ma'ruf No. 17" },
  { label: 'all five at once', value: `& < > " '` },
  { label: 'a literal entity the user typed', value: '&amp; sudah ter-escape' },
  { label: 'something shaped like a tag', value: '<w:t>bukan tag</w:t>' },
  { label: 'a CDATA close sequence', value: 'akhir ]]> di tengah' },
  { label: 'an XML comment', value: '<!-- komentar -->' },
  { label: 'a processing instruction', value: '<?xml version="1.0"?>' },
  { label: 'leading and trailing spaces', value: '   spasi di ujung   ' },
  { label: 'non-ASCII with a diacritic', value: 'Sekretariat Jenderal — Otorita IKN' },
  { label: 'an emoji beyond the BMP', value: 'catatan 🗒️ singkat' },
  { label: 'a newline inside a value', value: 'baris satu\nbaris dua' },
  { label: 'a tab inside a value', value: 'kolom\tkolom' },
  { label: 'an ampersand run', value: '&&&&&' },
  { label: 'an unterminated entity', value: 'A&B; & C' },
  { label: 'an empty value', value: '' },
  { label: 'the checkmark character itself', value: '√' },
]

/**
 * Values containing characters XML 1.0 cannot represent at all. These are
 * stripped rather than escaped — there is no escape that makes them legal.
 */
const ch = (code: number) => String.fromCharCode(code)

export const UNREPRESENTABLE_VALUES: ReadonlyArray<{
  label: string
  value: string
  expected: string
}> = [
  { label: 'a NUL byte', value: `nama${ch(0x00)} palsu`, expected: 'nama palsu' },
  { label: 'a vertical tab', value: `a${ch(0x0b)}b`, expected: 'ab' },
  { label: 'a form feed', value: `a${ch(0x0c)}b`, expected: 'ab' },
  { label: 'an ASCII escape', value: `a${ch(0x1b)}b`, expected: 'ab' },
  { label: 'a non-character', value: `a${ch(0xfffe)}b`, expected: 'ab' },
]

/** Legal whitespace, which must survive untouched. */
export const PRESERVED_WHITESPACE: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'tab', value: `a${ch(0x09)}b` },
  { label: 'newline', value: `a${ch(0x0a)}b` },
  { label: 'carriage return', value: `a${ch(0x0d)}b` },
]
