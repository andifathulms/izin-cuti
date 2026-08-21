# PRD — Isi Surat

**Map an office form once, fill it in six fields forever. Your document never leaves your device.**

| | |
|---|---|
| **Status** | Draft — pre-implementation |
| **Owner** | Andi Fathul Mukminin Salahuddin |
| **Type** | Personal utility, open source |
| **Deployment** | GitHub Pages (static export, no server, no runtime network) |
| **Language** | Indonesian-first UI; English secondary |
| **Design** | See `DESIGN.md`. Authoritative for every visual decision. |

*Name: explanatory. Alternatives: **Isian Dokumen**, **Docx Filler**.*

---

## 1. Problem

Indonesian office life runs on Word forms. A cuti request has around thirty fields, most of which are the same every time — your name, your NIP, your jabatan, your atasan's name and NIP. You retype them, or you copy last month's file and edit it, and eventually you submit one with last month's dates still in it.

Word cannot check anything. It cannot tell you the letter date is after the leave date, that you asked for three days against a two-day balance, or that your NIP is seventeen digits.

**And the existing template has no placeholders in it.** It contains a real person's real data. Any tool requiring `{nama}` tokens requires you to rewrite every template you own first.

## 2. Approach — map, don't template

**Upload the document as it is.** The app reads the package, lists every text node and every empty table cell, and you click the ones that are variable and name them. That mapping is saved.

**You never edit the template in Word.** And the mapping works on any office document, not one hardcoded form.

## 3. Field kinds

Three, and the distinction is the product.

| Kind | Behaviour | Example |
|---|---|---|
| **Profile** | Typed once, saved, reused across every document | nama, NIP, jabatan, unit kerja, alamat, telp, atasan's name and NIP |
| **Per-request** | Typed each time | tanggal surat, jenis cuti, alasan, mulai, s/d, sisa cuti |
| **Derived** | Computed, never typed, never editable | day count from the date range, nama repeated in section VI, *hari* selected from *hari/bulan/tahun*, remaining balance |

For the reference cuti form that is roughly fourteen profile fields, six per-request, and the rest derived. **A request costs six fields instead of thirty.**

## 4. Target kinds in the document

**Text targets.** A `<w:t>` node whose content is replaced. The reference document holds 97 of them.

**Checkbox targets.** An empty table cell that receives a `√` character. The tick marks in this form are literal characters typed into cells — not form fields, not content controls — so checking a box means inserting the character and unchecking means leaving the cell empty. Section II has six such cells with exactly one allowed; sections VII and VIII have four each.

These are genuinely different target types and the mapping tool must surface both. **Empty cells do not appear among the text nodes**, so a text-only mapper would miss every checkbox in the form.

## 5. Outputs

**DOCX is the deliverable.** It is what the office expects, it stays editable, and Word supplies the fonts.

**PDF is print-from-preview, and is labelled approximate.** Converting a docx to PDF with real fidelity needs a rendering engine; that is not achievable in a browser. The app renders an HTML preview for checking the fill and for printing, and **states plainly that the docx is the authoritative output** while the PDF is a convenience copy whose layout may differ.

Promising pixel-faithful PDF would be a lie, and the person finding out would be the one whose form got rejected.

## 6. Validation — what Word cannot do

The reference document illustrates the need: it is dated **17 Juli 2025** for leave starting **20 Juli 2026**. Almost certainly a reused template rather than a real error, and exactly what gets bounced.

Checks the app can run:

- Letter date precedes the leave start.
- Requested days match the date span.
- Requested days do not exceed the remaining balance.
- Leave dates are working days.
- NIP is eighteen digits.
- Exactly one leave type selected.
- Required fields for the selected type are present.

**Validation warns; it never blocks.** Offices have exceptions, and a tool that refuses to produce a document because it disagrees with a human is a tool that gets abandoned.

## 7. Privacy — structural, not policy

Name, NIP, home address, phone number, reason for leave. **Nothing is uploaded, stored remotely, transmitted, or measured.** The document is read into memory, filled, and downloaded locally.

This is true because there is no server, not because of a policy — and it is stated plainly.

**Profiles and mappings are saved to the device** in local storage, with an explicit export and clear-all.

**The template may be remembered too, if asked.** It is the same document every time, so re-picking it each session is friction with no benefit — but the office form arrives with a real person's real data in it (§1), so what should be kept is a *blank copy*. The app produces one losslessly: every mapped value becomes its field name and not a byte of structure changes. Remembering is opt-in, lives in IndexedDB rather than local storage (a 5 MB docx does not fit in a string quota), shows the date it was remembered, and is cleared by clear-all.

The cost is stated where it is offered rather than hidden: **a remembered template never changes.** If the office reissues the form you would keep filling the old one, and the fingerprint cannot help — the remembered document is exactly what it was fingerprinted against.

## 8. Non-goals

- **No approval workflow, no submission, no routing.** Those need state and a server.
- **No digital signature.** TTE via BSrE requires a server and credentials; there is no client-side path.
- **No nomor surat minting.** A sequential number shared across users is shared state. **The number is an input**, assigned by whoever assigns it.
- **No bundled *filled* templates, and no template the app depends on.** One blank form ships as a convenience — the standard *Formulir Permintaan dan Pemberian Cuti*, blanked by the app's own engine, carrying nobody's data — with a preset mapping so a common case works without mapping ninety-six nodes first. The app remains generic: the bundled form is one mapping among many, fingerprinted like any other, and a different office form is supplied and mapped by whoever owns it.
- **No OCR, no scanned documents, no PDF templates in v1.**
- **No editing the template in Word to blank it.** A Word re-save restructures runs, and a mapping made against the original stops fitting. The blank copy is produced by the same fill engine that fills it.
- **No accounts, no server, no runtime network.**

## 9. The drift problem

A saved mapping points at nodes in a specific document. **If the template changes, the mapping may point at the wrong place** — and a silently mis-filled official form is the worst failure this tool can produce.

**So each mapping stores a fingerprint** of the template: node count, structural hash, and surrounding context per mapped target. On load, a changed template is **detected and the fill refused**, with the specific mismatches named and a re-map offered.

Refuse rather than guess.

## 10. Features

### 10.1 Map
Upload, see every text node and empty cell in document order with its surrounding context, click to mark, name, and assign a kind. Save.

### 10.2 Fill
The form, generated from the mapping. Profile fields pre-filled, per-request fields empty, derived fields shown but not editable.

### 10.3 Preview
Live HTML rendering of the filled document beside the form, updating as you type. Also the print source. Labelled as an approximation of layout. §5.

### 10.4 Validate
Warnings inline against the offending field, never blocking. §6.

### 10.5 Profiles
Saved locally, switchable, exportable as a file, clearable. Useful when filling on behalf of someone else.

### 10.6 Library
Multiple mappings — cuti, SPPD, nota dinas — each with its own fingerprint and form. **Not the shape of v1:** this build fills one form, the cuti form, and presents itself that way. The engine is general and the map mode still exists as the recovery path for a reissued form, but nothing in the interface asks anybody to choose between documents.

### 10.7 Direktorat
Scoped to one kedeputian. Choosing a direktorat fills the unit kerja, the atasan's jabatan, and the direktur's name and NIP, so nobody retypes a colleague's NIP or gets it wrong. **A NIP that is not known is left empty and asked for once**, never guessed — a plausible wrong NIP on a signed letter is worse than an empty box. The place the letter is written is always Nusantara and is never asked for at all.

## 11. Architecture

Static Next.js 14 App Router export. No backend, no runtime network.

```
user's .docx
  → unzip (in memory)
  → parse word/document.xml → text nodes + empty cells
  → mapping (saved locally)
  → fill: substitute text, insert checkmarks
  → re-zip → Blob → download
  → HTML preview for checking and printing
```

**`lib/docx` is pure** — parse, map, fill, serialise. Takes and returns bytes and plain data. No DOM, no React, no network. Testable in Node, which is what makes §12 possible.

**XML escaping is mandatory.** An address containing `&`, a name containing `<`, a reason containing `"` — unescaped, these corrupt the document and Word refuses to open it. **Every substituted value is escaped**, and `xml:space="preserve"` is retained wherever present.

**Only `word/document.xml` is modified.** Every other part of the package is copied through byte-for-byte, including the embedded fonts and images.

**The reference document is 5.1 MB, of which 5.0 MB is embedded fonts.** Templates are user-supplied and never bundled, so this costs nothing — but it settles the question of shipping one.

## 12. Testing

**Round-trip is the backbone.** Fill a template with known values, re-parse the output, and assert the mapped nodes contain exactly those values. Every field, every type.

**Package integrity.** The output unzips, `document.xml` is well-formed, every original part is present, and unmodified parts are byte-identical to the input.

**Escaping.** Values containing `& < > " '` round-trip intact and produce well-formed XML. This is the defect that produces a file Word refuses to open, so it gets its own fixture set.

**Checkbox idempotence.** Checking, unchecking and re-checking returns the cell to its original state. Exactly one selection enforced where the form requires it.

**Drift detection, both directions.** An unchanged template loads its mapping; a modified template is refused with the mismatches named.

**Derived correctness.** Working-day counts across weekends and across month boundaries; Indonesian date formatting; balance arithmetic.

**Determinism.** Same template and same values produce a byte-identical output.

## 13. Milestones

| | | |
|---|---|---|
| **M0** | The engine | Scaffold; unzip, parse, fill, re-zip; escaping; round-trip and integrity suites green. **No UI.** |
| **M1** | Map | Node listing with context, marking, naming, kind assignment, fingerprinting. |
| **M2** | Fill | Generated form, profile storage, download. **Ship here — usable for the cuti form.** |
| **M3** | Preview | Live HTML rendering, print path, approximation notice. |
| **M4** | Validate | The checks in §6, inline and non-blocking. |
| **M5** | Depth | Multiple mappings, profile export, derived-field library. |

## 14. Success criteria

- Round-trip exact on every mapped field.
- Output opens in Word with no repair prompt.
- Values containing XML-special characters produce valid documents.
- A modified template is refused, never silently mis-filled.
- Nothing is transmitted, stored remotely, or measured.
- The reference cuti form fills from six per-request fields.
- No bundled official template anywhere in the repository.
- Zero network requests after first load.

## 15. Deployment

`output: 'export'`, `basePath` matching the repository name, `.nojekyll` in the output root. Fonts self-hosted. Verify under the production `basePath` with `pnpm preview` before pushing.

## 16. Risks

| Risk | Mitigation |
|---|---|
| **Silently mis-filling an official form.** | Fingerprint and drift detection; refuse rather than guess. §9. |
| **Corrupt output from unescaped values.** | Mandatory escaping with a dedicated fixture set. The likeliest cause of a file Word won't open. |
| **Run-splitting in Word-edited templates.** | The reference file is clean, but Word-authored ones may split a value across runs. The mapper must detect a split target and either merge the runs or flag it as unmappable — never partially fill it. |
| **PDF expected to be faithful.** | Labelled approximate everywhere; docx named as authoritative. §5. |
| **Publishing a government template.** | Templates are user-supplied. Nothing official ships in the repository. |
| **Scope creep into a workflow tool.** | §8 is binding. |
