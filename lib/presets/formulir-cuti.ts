import type { FieldSource, Target } from '../mapping/schema'

/**
 * A mapping for the standard *Formulir Permintaan dan Pemberian Cuti*.
 *
 * The node indices below belong to one specific document — the blanked copy in
 * `presets/formulir-cuti-kosong.docx`. That is not a general fact about the
 * form, so the mapping travels with a fingerprint like any other, and a
 * different edition of the same form is refused rather than filled by index.
 *
 * Deliberately partial. Sections VII and VIII are for the atasan and the
 * pejabat to tick and sign; nothing here writes into them beyond their names,
 * because this tool does not approve anything on anyone's behalf (PRD §8).
 */

const text = (
  id: string,
  label: string,
  nodeIndices: ReadonlyArray<number>,
  source: FieldSource,
): Target => ({ type: 'text', id, label, nodeIndices, source })

const box = (id: string, label: string, cellIndex: number, group: string | null): Target => ({
  type: 'checkbox',
  id,
  label,
  cellIndex,
  group,
})

export const JENIS_CUTI_GROUP = 'Jenis cuti'

export const FORMULIR_CUTI_TARGETS: ReadonlyArray<Target> = [
  // The letterhead. "Nusantara, 21 Agustus 2026" is one node, so the place and
  // the date are composed rather than typed together.
  text('tempat-tanggal', 'Tempat dan tanggal surat', [1], {
    kind: 'derived',
    computation: 'tanggal-surat-dengan-tempat',
  }),
  text('tujuan-jabatan', 'Ditujukan kepada (jabatan)', [4], {
    kind: 'profile',
    key: 'atasanJabatan',
  }),
  // "Di - Nusantara". Not sensitive, but somebody in another city needs it to
  // change, so it is a field rather than part of the form.
  text('tujuan-tempat', 'Ditujukan kepada (tempat)', [7], {
    kind: 'profile',
    key: 'tempatSurat',
  }),

  // I. Data pegawai.
  text('nama', 'Nama', [11], { kind: 'profile', key: 'nama' }),
  text('nip', 'NIP', [13], { kind: 'profile', key: 'nip' }),
  text('jabatan', 'Jabatan', [15], { kind: 'profile', key: 'jabatan' }),
  // Never typed: the TMT is inside the NIP, so this cannot go stale.
  text('masa-kerja', 'Masa kerja', [17], {
    kind: 'derived',
    computation: 'masa-kerja-dari-nip',
  }),
  text('unit-kerja', 'Unit kerja', [19], { kind: 'profile', key: 'unitKerja' }),

  // III. Alasan.
  text('alasan', 'Alasan cuti', [28], { kind: 'request', key: 'alasan' }),

  // IV. Lamanya cuti. Nodes 31 and 32 are "1 hari/" and "bulan/tahun" — the
  // form's coret-yang-tidak-perlu pair. Merged into one target and written
  // whole, so the result reads "3 hari" rather than leaving slashes to strike.
  text('lama-cuti', 'Lama cuti', [31, 32], {
    kind: 'derived',
    computation: 'lama-cuti-dengan-satuan',
  }),
  text('mulai', 'Mulai tanggal', [35], {
    kind: 'derived',
    computation: 'tanggal-mulai-panjang',
  }),
  text('sampai', 'Sampai dengan', [37], {
    kind: 'derived',
    computation: 'tanggal-selesai-panjang',
  }),

  // V. Catatan cuti.
  text('sisa-cuti', 'Sisa cuti tahun berjalan', [46], {
    kind: 'request',
    key: 'sisaCutiSebelum',
  }),
  text('sisa-cuti-kalimat', 'Keterangan sisa cuti', [47], {
    kind: 'derived',
    computation: 'sisa-cuti-kalimat',
  }),

  // VI. Alamat selama cuti, and the signature block.
  text('telepon', 'Telepon', [55], { kind: 'profile', key: 'telepon' }),
  text('alamat-cuti', 'Alamat selama cuti', [56], {
    kind: 'derived',
    computation: 'salinan-alamat-cuti',
  }),
  text('nama-ttd', 'Nama (tanda tangan)', [60], {
    kind: 'derived',
    computation: 'salinan-nama',
  }),
  text('nip-ttd', 'NIP (tanda tangan)', [62], {
    kind: 'derived',
    computation: 'nip-berawalan',
  }),

  // VII and VIII carry the names of the people who sign them. The tick boxes
  // in those sections are left unmapped on purpose — they are somebody else's
  // decision, and this tool does not make it.
  text('atasan-jabatan', 'Jabatan atasan langsung', [68], {
    kind: 'profile',
    key: 'atasanJabatan',
  }),
  text('atasan-nama', 'Nama atasan langsung', [70], { kind: 'profile', key: 'atasanNama' }),
  text('atasan-nip', 'NIP atasan langsung', [71], {
    kind: 'derived',
    computation: 'salinan-nip-atasan',
  }),
  text('pejabat-jabatan', 'Jabatan pejabat berwenang', [77], {
    kind: 'profile',
    key: 'pejabatJabatan',
  }),
  text('pejabat-nama', 'Nama pejabat berwenang', [78], {
    kind: 'profile',
    key: 'pejabatNama',
  }),
  text('pejabat-nip', 'NIP pejabat berwenang', [79], {
    kind: 'derived',
    computation: 'salinan-nip-pejabat',
  }),

  // II. Exactly one of six. The labels are written out here rather than taken
  // from the row, because the row label of a tick box in this document is not
  // reliably its own option.
  box('cuti-tahunan', 'Cuti Tahunan', 0, JENIS_CUTI_GROUP),
  box('cuti-besar', 'Cuti Besar', 1, JENIS_CUTI_GROUP),
  box('cuti-sakit', 'Cuti Sakit', 2, JENIS_CUTI_GROUP),
  box('cuti-melahirkan', 'Cuti Melahirkan', 3, JENIS_CUTI_GROUP),
  box('cuti-penting', 'Cuti Karena Alasan Penting', 4, JENIS_CUTI_GROUP),
  box('cuti-diluar-tanggungan', 'Cuti di Luar Tanggungan Negara', 5, JENIS_CUTI_GROUP),
]

export const FORMULIR_CUTI_NAME = 'Formulir Permintaan dan Pemberian Cuti'
