/**
 * Indonesian first, English second.
 *
 * Office vocabulary stays in Indonesian in both: `nip`, `jabatan`, `unitKerja`,
 * `masaKerja`, `jenisCuti`, `sisaCuti`, `atasanLangsung`, `pejabatBerwenang`.
 * These are the words on the form and on the card in someone's wallet; an
 * English approximation would be a worse label in either language.
 */

export const LOCALES = ['id', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'id'

export function isLocale(value: string): value is Locale {
  return (LOCALES as ReadonlyArray<string>).includes(value)
}

type Strings = {
  readonly appName: string
  readonly tagline: string
  readonly navFill: string
  readonly navMap: string
  readonly navProfile: string
  readonly privacy: string
  readonly privacyWhy: string

  readonly chooseTemplate: string
  readonly chooseTemplateHint: string
  readonly noTemplate: string
  readonly noTemplateHint: string
  readonly templateLoaded: string
  readonly textNodes: string
  readonly checkboxCells: string
  readonly notADocx: string
  readonly useBundled: string
  readonly useBundledWhy: string
  readonly remember: string
  readonly rememberWhy: string
  readonly rememberedOn: string
  readonly rememberStale: string

  readonly mapDesktopOnly: string
  readonly mapIntro: string
  readonly mapNodeList: string
  readonly mapUnmapped: string
  readonly mapMapped: string
  readonly mapMarkAsText: string
  readonly mapMarkAsCheckbox: string
  readonly mapLabel: string
  readonly mapKind: string
  readonly mapKindProfile: string
  readonly mapKindRequest: string
  readonly mapKindDerived: string
  readonly mapGroup: string
  readonly mapGroupNone: string
  readonly mapMergeNext: string
  readonly mapSplitHint: string
  readonly mapSave: string
  readonly mapSaved: string
  readonly mapName: string
  readonly mapRemove: string
  readonly mapFilterAll: string
  readonly mapFilterUnmapped: string
  readonly mapFilterMapped: string
  readonly mapBlankCopy: string
  readonly mapBlankCopyWhy: string
  readonly mapBlankCopyDone: string
  readonly mapResidue: string
  readonly mapResidueWhy: string
  readonly mapResidueNone: string

  readonly fillProfile: string
  readonly fillRequest: string
  readonly fillDerived: string
  readonly fillDerivedNote: string
  readonly fillChecklist: string
  readonly fillNoMapping: string
  readonly fillChooseMapping: string
  readonly fillWaiting: string

  readonly preview: string
  readonly previewApproximate: string
  readonly previewEmpty: string
  readonly previewAsText: string

  readonly summary: string
  readonly summaryFilled: string
  readonly summaryDerived: string
  readonly summaryChecked: string
  readonly summaryWarnings: string
  readonly summaryNoWarnings: string

  readonly downloadDocx: string
  readonly printPdf: string
  readonly docxAuthoritative: string
  readonly pdfApproximate: string

  readonly driftTitle: string
  readonly driftExplain: string
  readonly driftRemap: string
  readonly driftCountText: string
  readonly driftCountCheckbox: string
  readonly driftStructure: string
  readonly driftMissing: string
  readonly driftContext: string

  readonly profileTitle: string
  readonly profileNew: string
  readonly profileName: string
  readonly profileSave: string
  readonly profileUse: string
  readonly profileDelete: string
  readonly profileExport: string
  readonly profileImport: string
  readonly profileClearAll: string
  readonly profileClearConfirm: string
  readonly profileNoStorage: string
  readonly savedMappings: string

  readonly fieldLabels: Readonly<Record<string, string>>
}

const id: Strings = {
  appName: 'Isi Surat',
  tagline:
    'Petakan formulir kantor sekali, isi dari enam kolom seterusnya. Dokumen tidak pernah meninggalkan perangkat ini.',
  navFill: 'Isi',
  navMap: 'Petakan',
  navProfile: 'Profil',
  privacy: 'Tidak ada yang Anda ketik meninggalkan perangkat ini.',
  privacyWhy:
    'Tidak ada server. Dokumen dibaca ke memori, diisi, lalu diunduh secara lokal. Profil dan pemetaan disimpan di penyimpanan lokal peramban.',

  chooseTemplate: 'Pilih berkas .docx',
  chooseTemplateHint: 'Berkas tetap di perangkat Anda. Tidak ada yang diunggah.',
  noTemplate: 'Belum ada dokumen',
  noTemplateHint:
    'Pilih berkas .docx milik Anda untuk mulai. Setelah terbuka, Anda bisa meminta aplikasi mengingatnya di perangkat ini, sehingga langkah ini cukup sekali.',
  templateLoaded: 'Dokumen dibaca',
  textNodes: 'simpul teks',
  checkboxCells: 'kotak centang',
  notADocx: 'Berkas ini tidak bisa dibaca sebagai .docx.',
  useBundled: 'Gunakan formulir cuti bawaan',
  useBundledWhy:
    'Formulir Permintaan dan Pemberian Cuti versi kosong, sudah dipetakan. Bila formulir kantor Anda berbeda, pilih berkas Anda sendiri lalu petakan sekali.',
  remember: 'Ingat dokumen ini di perangkat ini',
  rememberWhy:
    'Dokumen disimpan di peramban ini saja, dan tetap tidak dikirim ke mana pun. Gunakan salinan kosong — dokumen asli berisi data pribadi seseorang.',
  rememberedOn: 'Diingat pada',
  rememberStale:
    'Dokumen yang diingat tidak ikut berubah. Bila kantor menerbitkan formulir baru, pilih ulang berkasnya — pemeriksaan pemetaan tidak bisa mengetahuinya sendiri.',

  mapDesktopOnly:
    'Mode petakan hanya tersedia di layar lebar. Menandai puluhan simpul di ponsel bukan alur kerja yang nyata.',
  mapIntro:
    'Setiap simpul teks dan setiap sel kosong ditampilkan berurutan dengan konteksnya. Tandai yang berubah-ubah, beri nama, lalu tentukan jenisnya.',
  mapNodeList: 'Simpul dokumen',
  mapUnmapped: 'Belum dipetakan',
  mapMapped: 'Sudah dipetakan',
  mapMarkAsText: 'Petakan',
  mapMarkAsCheckbox: 'Petakan kotak',
  mapLabel: 'Nama kolom',
  mapKind: 'Jenis',
  mapKindProfile: 'Profil — diketik sekali, dipakai terus',
  mapKindRequest: 'Per pengajuan — diketik tiap kali',
  mapKindDerived: 'Dihitung — tidak pernah diketik',
  mapGroup: 'Kelompok pilihan',
  mapGroupNone: 'Berdiri sendiri',
  mapMergeNext: 'Gabungkan dengan simpul berikutnya',
  mapSplitHint:
    'Simpul ini bersebelahan dengan simpul berformat sama. Bila satu nilai terpecah oleh Word, gabungkan keduanya menjadi satu sasaran.',
  mapSave: 'Simpan pemetaan',
  mapSaved: 'Pemetaan tersimpan',
  mapName: 'Nama pemetaan',
  mapRemove: 'Lepaskan',
  mapFilterAll: 'Semua',
  mapFilterUnmapped: 'Belum dipetakan',
  mapFilterMapped: 'Sudah dipetakan',
  mapBlankCopy: 'Unduh salinan kosong',
  mapBlankCopyWhy:
    'Menghasilkan salinan dokumen ini dengan setiap nilai yang dipetakan diganti nama kolomnya, lalu mengarahkan pemetaan ke salinan itu. Susunan dokumen tidak berubah sedikit pun — jangan mengosongkannya lewat Word, karena penyimpanan ulang oleh Word menyusun ulang struktur teks.',
  mapBlankCopyDone: 'Salinan kosong diunduh, pemetaan diarahkan ke salinan itu.',
  mapResidue: 'Masih tersisa di dokumen',
  mapResidueWhy:
    'Hanya kolom yang dipetakan yang dikosongkan. Berikut nilai profil Anda yang masih muncul di simpul yang belum dipetakan. Pemeriksaan ini hanya mengenali nilai yang sudah Anda isi di profil — data pribadi lain yang tidak ada di profil tidak akan terlihat di sini.',
  mapResidueNone: 'Tidak ada nilai profil Anda yang tersisa di simpul yang belum dipetakan.',

  fillProfile: 'Data profil',
  fillRequest: 'Data pengajuan',
  fillDerived: 'Dihitung',
  fillDerivedNote: 'Nilai berikut dihitung dari isian di atas dan tidak dapat diubah.',
  fillChecklist: 'Pilihan',
  fillNoMapping: 'Belum ada pemetaan untuk dokumen ini.',
  fillChooseMapping: 'Pemetaan',
  fillWaiting: 'menunggu isian',

  preview: 'Pratinjau',
  previewApproximate:
    'Pratinjau ini perkiraan tata letak, bukan hasil akhir. DOCX adalah keluaran yang berlaku.',
  previewEmpty: 'Pratinjau muncul setelah dokumen dipilih.',
  previewAsText: 'Salin sebagai teks',

  summary: 'Ringkasan sebelum unduh',
  summaryFilled: 'Diisi',
  summaryDerived: 'Dihitung',
  summaryChecked: 'Dicentang',
  summaryWarnings: 'Perlu diperiksa',
  summaryNoWarnings: 'Tidak ada yang perlu diperiksa.',

  downloadDocx: 'Unduh DOCX',
  printPdf: 'Cetak PDF',
  docxAuthoritative: 'DOCX adalah keluaran yang berlaku.',
  pdfApproximate:
    'PDF dicetak dari pratinjau. Tata letaknya bisa berbeda dari dokumen aslinya.',

  driftTitle: 'Dokumen ini tidak cocok dengan pemetaan yang tersimpan',
  driftExplain:
    'Pengisian dihentikan. Mengisi dokumen yang berubah dapat menaruh nilai di tempat yang salah tanpa terlihat. Berikut perbedaannya.',
  driftRemap: 'Petakan ulang',
  driftCountText: 'Jumlah simpul teks',
  driftCountCheckbox: 'Jumlah kotak centang',
  driftStructure: 'Susunan dokumen berubah.',
  driftMissing: 'tidak ditemukan lagi',
  driftContext: 'sekarang berada di',

  profileTitle: 'Profil tersimpan',
  profileNew: 'Profil baru',
  profileName: 'Nama profil',
  profileSave: 'Simpan profil',
  profileUse: 'Pakai',
  profileDelete: 'Hapus',
  profileExport: 'Ekspor semua',
  profileImport: 'Impor berkas',
  profileClearAll: 'Hapus semua data',
  profileClearConfirm:
    'Semua profil dan pemetaan di perangkat ini akan dihapus. Tindakan ini tidak bisa dibatalkan.',
  profileNoStorage:
    'Peramban ini tidak mengizinkan penyimpanan lokal. Aplikasi tetap berjalan, tetapi tidak ada yang diingat setelah tab ditutup.',
  savedMappings: 'Pemetaan tersimpan',

  fieldLabels: {
    nama: 'Nama',
    nip: 'NIP',
    jabatan: 'Jabatan',
    unitKerja: 'Unit kerja',
    masaKerja: 'Masa kerja',
    alamat: 'Alamat rumah',
    telepon: 'Telepon',
    tempatSurat: 'Tempat penulisan surat',
    atasanNama: 'Nama atasan langsung',
    atasanNip: 'NIP atasan langsung',
    atasanJabatan: 'Jabatan atasan langsung',
    pejabatNama: 'Nama pejabat yang berwenang',
    pejabatNip: 'NIP pejabat yang berwenang',
    pejabatJabatan: 'Jabatan pejabat yang berwenang',
    tanggalSurat: 'Tanggal surat',
    mulai: 'Mulai tanggal',
    sampai: 'Sampai dengan',
    jenisCuti: 'Jenis cuti',
    alasan: 'Alasan cuti',
    sisaCutiSebelum: 'Sisa cuti sebelum pengajuan',
    alamatCuti: 'Alamat selama cuti',
  },
}

const en: Strings = {
  ...id,
  tagline:
    'Map an office form once, fill it in six fields forever. Your document never leaves your device.',
  navFill: 'Fill',
  navMap: 'Map',
  navProfile: 'Profile',
  privacy: 'Nothing you type leaves this device.',
  privacyWhy:
    'There is no server. The document is read into memory, filled, and downloaded locally. Profiles and mappings live in this browser’s local storage.',

  chooseTemplate: 'Choose a .docx file',
  chooseTemplateHint: 'The file stays on your device. Nothing is uploaded.',
  noTemplate: 'No document yet',
  noTemplateHint:
    'Choose your own .docx file to begin. Once it is open you can ask the app to remember it on this device, so this step happens only once.',
  templateLoaded: 'Document read',
  textNodes: 'text nodes',
  checkboxCells: 'checkbox cells',
  notADocx: 'This file could not be read as a .docx.',
  useBundled: 'Use the bundled cuti form',
  useBundledWhy:
    'A blank Formulir Permintaan dan Pemberian Cuti, already mapped. If your office’s form differs, choose your own file and map it once.',
  remember: 'Remember this document on this device',
  rememberWhy:
    'Kept in this browser only, and still sent nowhere. Use a blank copy — the original carries somebody’s personal data.',
  rememberedOn: 'Remembered on',
  rememberStale:
    'A remembered document never changes. If your office reissues the form, pick the file again — the mapping check cannot notice this on its own.',

  mapDesktopOnly:
    'Map mode needs a wide screen. Marking dozens of nodes on a phone is not a real workflow.',
  mapIntro:
    'Every text node and every empty cell, in document order, with its surrounding context. Mark the ones that vary, name them, and give each a kind.',
  mapNodeList: 'Document nodes',
  mapUnmapped: 'Unmapped',
  mapMapped: 'Mapped',
  mapMarkAsText: 'Map',
  mapMarkAsCheckbox: 'Map box',
  mapLabel: 'Field name',
  mapKind: 'Kind',
  mapKindProfile: 'Profile — typed once, reused',
  mapKindRequest: 'Per request — typed each time',
  mapKindDerived: 'Derived — never typed',
  mapGroup: 'Choice group',
  mapGroupNone: 'Stands alone',
  mapMergeNext: 'Merge with the next node',
  mapSplitHint:
    'This node sits beside one with identical formatting. If Word split a single value in two, merge them into one target.',
  mapSave: 'Save mapping',
  mapSaved: 'Mapping saved',
  mapName: 'Mapping name',
  mapRemove: 'Unmap',
  mapFilterAll: 'All',
  mapFilterUnmapped: 'Unmapped',
  mapFilterMapped: 'Mapped',
  mapBlankCopy: 'Download a blank copy',
  mapBlankCopyWhy:
    'Produces a copy of this document with every mapped value replaced by its field name, and re-points the mapping at that copy. Not a byte of structure changes — do not blank it in Word instead, because a Word re-save restructures the text runs.',
  mapBlankCopyDone: 'Blank copy downloaded, and the mapping now points at it.',
  mapResidue: 'Still in the document',
  mapResidueWhy:
    'Only mapped fields are blanked. These are values from your profile that still appear in nodes nobody mapped. This check only knows the values you have entered in your profile — personal data that is not in your profile is invisible to it.',
  mapResidueNone: 'None of your profile values remain in unmapped nodes.',

  fillProfile: 'Profile',
  fillRequest: 'This request',
  fillDerived: 'Computed',
  fillDerivedNote: 'These are computed from the fields above and cannot be edited.',
  fillChecklist: 'Selections',
  fillNoMapping: 'No mapping for this document yet.',
  fillChooseMapping: 'Mapping',
  fillWaiting: 'waiting on input',

  preview: 'Preview',
  previewApproximate:
    'This preview approximates the layout. The DOCX is the authoritative output.',
  previewEmpty: 'The preview appears once a document is chosen.',
  previewAsText: 'Copy as text',

  summary: 'Summary before download',
  summaryFilled: 'Filled',
  summaryDerived: 'Computed',
  summaryChecked: 'Ticked',
  summaryWarnings: 'Worth checking',
  summaryNoWarnings: 'Nothing to check.',

  downloadDocx: 'Download DOCX',
  printPdf: 'Print PDF',
  docxAuthoritative: 'The DOCX is the authoritative output.',
  pdfApproximate: 'The PDF is printed from the preview. Its layout may differ from the document.',

  driftTitle: 'This document does not match the saved mapping',
  driftExplain:
    'The fill was refused. Filling a changed template can put values in the wrong place without it showing. Here is what differs.',
  driftRemap: 'Map again',
  driftCountText: 'Text node count',
  driftCountCheckbox: 'Checkbox count',
  driftStructure: 'The document’s structure has changed.',
  driftMissing: 'is no longer there',
  driftContext: 'now sits in',

  profileTitle: 'Saved profiles',
  profileNew: 'New profile',
  profileName: 'Profile name',
  profileSave: 'Save profile',
  profileUse: 'Use',
  profileDelete: 'Delete',
  profileExport: 'Export everything',
  profileImport: 'Import a file',
  profileClearAll: 'Clear all data',
  profileClearConfirm:
    'Every profile and mapping on this device will be deleted. This cannot be undone.',
  profileNoStorage:
    'This browser does not allow local storage. The app still works, but nothing is remembered after the tab closes.',
  savedMappings: 'Saved mappings',

  fieldLabels: {
    ...id.fieldLabels,
    alamat: 'Home address',
    telepon: 'Telephone',
    tempatSurat: 'Place the letter is written',
    atasanJabatan: 'Atasan langsung — jabatan',
    pejabatJabatan: 'Pejabat berwenang — jabatan',
    tanggalSurat: 'Letter date',
    mulai: 'From',
    sampai: 'To',
    alasan: 'Reason for leave',
    sisaCutiSebelum: 'Leave balance before this request',
    alamatCuti: 'Address during leave',
  },
}

const DICTIONARY: Record<Locale, Strings> = { id, en }

export function strings(locale: Locale): Strings {
  return DICTIONARY[locale]
}

export type { Strings }
