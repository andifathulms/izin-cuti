# CLAUDE.md — Isi Surat

Client-side docx template mapper and filler. Map an office form's fields once, then fill it from a short form. Static site, GitHub Pages, no backend, no runtime network, nothing transmitted.

Read `PRD.md` before starting any task, and **`DESIGN.md` before writing any UI**.

**Five things shape everything:**

1. **A silently mis-filled official form is the worst outcome this tool can produce.** Mappings carry a template fingerprint; a changed template is **refused with the mismatches named**, never guessed at.
2. **Escaping is mandatory.** An address containing `&`, a name containing `<` — unescaped, these produce a file Word refuses to open. Every substituted value is escaped.
3. **Nothing leaves the device.** Name, NIP, home address, phone, reason for leave. There is no server, so this is structural rather than a policy — and it is stated where the user is typing.
4. **Only `word/document.xml` is modified.** Every other package part is copied through byte-for-byte.
5. **DOCX is authoritative; PDF is approximate.** Faithful docx-to-PDF needs a rendering engine and cannot be done in a browser. Never imply otherwise.

---

## Stack

- Next.js 14, App Router, `output: 'export'` — static only
- TypeScript, `strict: true`
- Tailwind CSS, tokens from `DESIGN.md`
- fflate or JSZip for the package; a DOM/XML parser for `document.xml`
- mammoth.js for the HTML preview, if its output proves adequate — **evaluate, do not assume**
- Vitest
- pnpm
- **No component library. No analytics. No error reporting. No third-party script of any kind.**
- Fonts via `next/font`, self-hosted.

## Commands

```bash
pnpm dev
pnpm build                  # static export to ./out
pnpm preview                # serve ./out under the production basePath
pnpm test                   # vitest watch
pnpm test:run               # vitest once — before every commit
pnpm test:roundtrip         # fill → re-parse → values match
pnpm test:package           # zip integrity, XML well-formedness, byte-identical passthrough
pnpm test:escape            # XML-special characters
pnpm test:drift             # fingerprint detection, both directions
pnpm typecheck
pnpm lint
```

`test:roundtrip`, `test:package` and `test:escape` gate the build and CI.

## Layout

```
app/
  [locale]/                 # id (default), en
    isi/                    # fill mode — form + preview
    petakan/                # map mode — node list + preview
    profil/                 # saved profiles, export, clear
components/
  form/                     # generated fields, three states
  preview/                  # HTML render, scroll-linked, changed-region mark
  nodelist/                 # text nodes and empty cells with context
  summary/                  # pre-download summary
lib/
  docx/                     # THE CORE. Pure. Bytes and plain data. Runs in Node.
    unzip.ts
    parse.ts                # → text nodes + empty cells, with context
    fill.ts                 # substitute text, insert checkmarks
    escape.ts               # XML escaping — ONE definition
    serialise.ts            # re-zip, passthrough unmodified parts
    fingerprint.ts          # template identity + drift detection
  mapping/                  # schema, storage, kind assignment
  derive/                   # computed fields — working days, dates, balances
  validate/                 # non-blocking checks
tests/
  roundtrip/  package/  escape/  drift/
```

## Invariants

1. **`lib/docx` is pure and runs in Node.** Bytes in, bytes out. No DOM, no React, no clock, no network, no module-level mutable state. This is what makes the round-trip suite possible.

2. **Every substituted value passes through `escape.ts`.** One definition, no exceptions, no call site that bypasses it. **Preserve `xml:space="preserve"` wherever it appears** — dropping it collapses leading and trailing spaces that the document relies on.

3. **Only `word/document.xml` is modified.** All other parts — fonts, images, styles, settings, relationships — are copied byte-for-byte. Asserted by test.

4. **Mappings carry a fingerprint** of node count, structural hash, and per-target surrounding context. **On mismatch the fill is refused**, the specific differences are named, and a re-map is offered. **Never fill a template whose fingerprint does not match.**

5. **A target split across runs is never partially filled.** Word-edited templates may split a value across `<w:r>` elements. The mapper either merges the runs or flags the target as unmappable — **there is no path that writes into one half of a split value.**

6. **Checkbox targets are a distinct type from text targets.** Empty cells do not appear among text nodes; a text-only mapper misses every checkbox in the form. Inserting and removing `√` is idempotent, and single-select groups enforce exactly one.

7. **Derived fields are never editable and never stored as input.** They are computed at fill time from profile and per-request values. A derived field with a stored value is a bug.

8. **Validation warns and never blocks.** No check prevents a download. Offices have exceptions, and a tool that refuses to produce a document gets abandoned.

9. **Nothing is transmitted, stored remotely, or measured.** No analytics, no error reporting, no beacon, no fetch of any kind at runtime. Profiles and mappings live in local storage with explicit export and clear-all.

10. **No official template ships in the repository.** Not in fixtures, not in examples, not in the README. Test fixtures are synthetic documents generated by the test suite.

11. **No nomor surat generation.** A shared sequential number is shared state; the number is an input.

12. **No signature, no submission, no approval routing.**

13. **DOCX is labelled authoritative and PDF approximate** everywhere the two appear together. `DESIGN.md` §7.

14. **No red in the UI**, including validation. Amber warns; ink explains. `DESIGN.md` §3.

15. **Nothing is computed in a component.**

## Working style

- **Build `escape.ts` and its fixtures before `fill.ts`.** Escaping is not an edge case here — Indonesian addresses and unit names contain ampersands routinely, and an unescaped one produces a file that will not open.
- **Write the round-trip test before the fill logic.** Fill with known values, re-parse, assert. It is the backbone and everything else rests on it.
- **Test with a synthetic template first**, not the real one. The suite must not depend on a document that cannot be committed.
- **Verify the output opens in Word before claiming a milestone.** Zip and XML validity are necessary but not sufficient — open it.
- **Evaluate mammoth's output honestly.** It maps semantic structure rather than layout. If the preview is not good enough for someone to check their fill, say so and reconsider rather than shipping a misleading preview.
- **When a template does not fingerprint-match, stop.** Do not offer a best-effort fill. Name the mismatch.
- **Don't touch `next.config.js`, the Actions workflow, `escape.ts`, or `fingerprint.ts` without saying so explicitly.**
- **Never weaken a test to make something pass**, especially `test:escape` or `test:roundtrip`.

## Conventions

- Named exports; defaults only where Next requires them.
- Discriminated unions for target kinds (`text` | `checkbox`), field kinds (`profile` | `request` | `derived`), and results, keyed on `type`. Exhaustive `switch` with a `never` default.
- No `any`. No non-null `!` in `lib/docx`.
- **A field value is `{ kind: 'profile' | 'request', value } | { kind: 'derived', compute }`.** A derived field has no stored value in the type — invariant 7 made unrepresentable rather than merely forbidden.
- Node identity is document-order index plus context hash, never text content — text content is exactly what changes.
- Indonesian office vocabulary in identifiers and UI: `nip`, `jabatan`, `unitKerja`, `masaKerja`, `jenisCuti`, `sisaCuti`, `atasanLangsung`, `pejabatBerwenang`. Do not substitute English approximations.
- Dates formatted in Indonesian long form — `20 Juli 2026` — via an explicit month table, not `toLocaleDateString`, which varies by environment.
- Tabular figures on every NIP, date and count.
- Tailwind tokens exactly as in `DESIGN.md` — `paper`, `ink`, `rule`, `typed`, `derived`, `unmapped`, `attention`. Never raw hex in components.

## Testing rules

- `pnpm test:run` before every commit; `test:roundtrip`, `test:package` and `test:escape` before any commit touching `lib/docx`.
- **Round-trip asserted on every field type**: fill with known values, re-parse the output, values match exactly.
- **Package integrity asserted**: output unzips, `document.xml` well-formed, every original part present, unmodified parts byte-identical.
- **Escaping fixtures are permanent**: values containing `& < > " '` round-trip intact and produce valid XML.
- **Checkbox idempotence**: check, uncheck, re-check returns to the original state; single-select enforces exactly one.
- **Drift asserted both directions**: unchanged template loads; modified template refuses with named mismatches.
- **Split-run targets asserted unmappable or merged** — never partially written.
- Derived correctness: working days across weekends and month boundaries, Indonesian date formatting, balance arithmetic.
- Determinism: same template and values produce a byte-identical output.
- Bug fix → failing test first.

## Deployment

`main` builds and deploys via Actions; the round-trip, package and escape suites gate it. `basePath` must match the repository name; `.nojekyll` must exist in `out/`. Verify with `pnpm preview` before pushing.

## Framing

The interface states, where the user is entering personal data, that nothing leaves the device. It names DOCX as the authoritative output and PDF as an approximate convenience copy. It carries no official template, no government branding, and no OIKN identification. It does not sign, submit, or number documents.

## Current state

M0 — not yet scaffolded. Next: unzip, parse, escape, fill and serialise against a synthetic template, with the round-trip, package and escape suites. **No UI work until all three are green and an output opens cleanly in Word.**
