# DESIGN — Isi Surat

Authoritative for every visual decision in this repository. `PRD.md` says what the product is; this says what it looks like and why. When code and this document disagree, this document is right.

---

## 1. The house layer

These projects should read as siblings — recognisably from the same hand — without looking like one template recoloured. **What is shared is rhythm and rigour; what is per-app is identity.**

**Shared across every project:**

```
space    4 8 12 16 24 32 48 64 96 128     4px base
motion   fast 120ms · state 240ms · orchestrated 500–600ms · ease cubic-bezier(0.2,0,0,1)
edge     hairline 0.5px · radius 2px only
```

- **One orchestrated moment per app.** Everything else is state change.
- **The legend contract.** Every view states what it is showing and what it cannot show.
- **The citation line.** Small, monospace, always present where a claim is made.
- **Type floor 16px.** Tabular figures on anything that updates.
- **Zero runtime network. Offline after first load. Self-hosted fonts.**
- **Reduced motion gets a complete alternative**, never a degraded one.
- **No component library.**

**Per-app:** colour, typeface, layout, and the instrument.

## 2. This app's identity

**It looks like a cleaner version of the thing it fills.**

The siblings are atlases and instruments. This is a work tool that produces an official document, and the honest register is the document's own: Roman-numeraled sections, boxed fields, ruled rows, precise numerals, nothing decorative.

Light, calm, dense enough to be efficient. **Someone should be able to use it at their desk in five minutes without a tutorial**, because the layout mirrors the form they already know.

No delight. No personality flourishes. A person filling a leave request wants to be finished.

## 3. Colour — three field states

The semantic core. Every field on the form is in one of three states, and the reader must know which at a glance.

```
--paper    #F6F5F1    warm off-white
--ink      #1D1F1C    labels, values, rules
--rule     #D9D7CF    hairlines, field boxes, section borders
```

### The three states

```
--typed     #2B4C6B    slate blue — you entered this          8.2:1 on paper
--derived   #4F6A5C    muted green — computed, not editable   5.4:1 on paper
--unmapped  hatch      diagonal over --paper — the template has this, you have not mapped it
```

`--derived` was `#5E7A6B` and measured 4.3:1 — under the floor §9 asks for, on the one state that carries a value nobody can retype. Deepened, same hue.

### Two greys, and no third

```
--ink-muted   #555653    6.8:1    secondary prose, hints, captions
--ink-subtle  #6E6F6B    4.6:1    the quietest text allowed
```

Every muted grey in the app is one of these two. **No opacity modifier on `--ink`** — `text-ink/50` reads as a token and is really a value, it measured 3.2:1, and the privacy line was set in it.

**`--derived` is the important one.** A derived field looks visibly different from a typed one, so nobody wonders why they cannot edit the day count — the colour already said it is computed. Derived fields are never rendered as disabled inputs; they are rendered as *results* — **in the preview, where they land in the document**, rather than as a second list beside the form. A computed value shown twice is a value somebody has to reconcile.

**`--unmapped` uses a pattern, not a colour**, because it is an absence rather than a value — the same rule the sibling projects apply to unknown data.

### Validation

```
--attention  #946022    amber — a warning, never a block      4.9:1 on paper
```

Also deepened, from `#B5762E` at 3.4:1. The amber marker is the only thing separating a warning from ordinary prose, and it has to be read to do that.

**Amber is a mark, never a surface.** No amber background, no amber tint behind a paragraph. The moment it washes a block that is merely informational — "map mode needs a wide screen" — it stops meaning *a warning stands here* and starts meaning *this text is a bit important*, which is not a thing the palette can afford to say.

**Amber, not red.** Validation warns and never prevents; offices have exceptions, and a red error state implies a refusal the app does not make. Amber sits beside the field, with the reason in words.

**No red anywhere in the product.** Nothing here is an error, including a template mismatch — that is a refusal with an explanation, rendered in ink with an amber marker.

## 4. Type

```
Public Sans       labels, prose, controls — designed for government use, plain and legible
IBM Plex Mono     NIP, dates, day counts, node indices, fingerprints
```

Self-hosted via `next/font`.

```
14  16  18  22  28          1.25 ratio
```

**One scale, declared once.** `globals.css` holds every token — colour, type, space, radius, edge — and `tailwind.config.ts` names them without repeating a value. Two files holding the same hex is how one palette becomes two.

**Monospace on every number that has to be read digit by digit.** An NIP is eighteen digits and gets checked against a card; proportional figures make that harder than it needs to be. Tabular figures throughout.

Light ground, no dark-mode correction. Body 400, labels 500, section headings 600.

## 5. Layout — two panes, two modes

**Fill mode** is the default and the common case.

```
left  50%   the form, sectioned exactly as the document is
right 50%   live preview, scroll-linked to the focused field
```

Equal halves. The preview is not a thumbnail — it is where the derived values are read and where the fill is checked, so it gets the same room as the form.

Fields are laid out in a six-column row: a date takes a third, an ordinary field a half, anything with prose the full width. Three date pickers stacked down the page is three rows spent on what the eye reads as one thing.

Focusing a field scrolls the preview to that part of the document and marks it — **the preview pane only.** Never the page: a preview that drags the whole window while somebody is typing is worse than one that does not scroll at all. **You always see where the thing you are typing lands.**

**Map mode** is entered rarely, once per template.

```
left  50%   every text node and empty cell, in document order, with surrounding context
right 50%   the same preview, with mapped targets marked
```

Context is what makes mapping possible: a bare list of 97 strings is unusable, but *"Jabatan | **Perekayasa Ahli Pertama** | Masa Kerja"* is obvious.

**Mobile:** single column, preview collapsed behind a toggle. Map mode is desktop-only and says so — marking 97 nodes on a phone is not a real workflow.

## 6. Motion

**The orchestrated moment is the preview updating** — the document re-rendering as you type, with the changed region briefly marked so you see the effect land.

Everything else is state change: switching mode, expanding a section, opening a profile.

```
--dur-fast    120ms
--dur-state   240ms
--dur-mark    500ms     the changed-region highlight fading
```

**Nothing else animates.** No skeletons, no progress theatre, no success celebration on download. This is a work tool.

**Reduced motion:** the preview updates instantly without the highlight. Nothing is lost.

## 7. The download moment

The one place to get the tone right. A person has just produced an official document.

- **Three actions, clearly unequal:** *Unduh DOCX* is primary; *Pratinjau PDF* and *Cetak* are secondary, with the approximation note beside them, not hidden behind a tooltip.
- **The PDF is looked at before it is downloaded.** *Pratinjau PDF* opens the real file in the browser's own reader, at the size it prints, with the download inside it. Downloading a PDF unseen is how the wrong year reaches an atasan — and it is offered at all only because the file is built in the tab and never uploaded.
- **A last chance to notice the wrong year** — the warnings that stand, and any computed field still waiting on an input, immediately above the buttons.

  Not a summary of every filled value. That list duplicated the preview, which shows the same values in the document's own layout and is the better last look. What the preview cannot show is a warning, so that is what is left here.
- **No confetti, no toast, no celebration.** The file downloads. That is the whole event.

## 8. Privacy, said plainly

A persistent line, not a footer: **nothing you type leaves this device.** One sentence, at the foot of the column where the NIP and the address are being typed, because that is where it matters. One sentence and not three — a paragraph above the form is read once and never again.

The profile panel carries an explicit **export** and **clear all**, both visible rather than buried in settings.

## 9. Accessibility

- Every field has a real label, not a placeholder. Placeholders vanish on focus and are unusable for a form this long.
- Derived fields are marked `readonly` with an accessible explanation, not `disabled` — disabled fields are skipped by screen readers and their values are part of the document.
- Validation messages are associated with their field, announced, and non-blocking.
- Full keyboard path through the form in document order; focus visible at 3px.
- Type floor 16px; AA contrast on `--paper` for all three field states.
- **Target floor 24px**, as `--control-min`. Native checkboxes and radios render at about 13px and are sized up to it. WCAG 2.5.8.
- The preview has a text alternative — the filled document as readable text, which is also what someone would paste into a message.

## 10. What not to do

- No red anywhere, including on validation.
- No blocking validation.
- No derived field rendered as an editable-looking input.
- No unmapped target rendered as a colour rather than a pattern.
- No placeholder text standing in for a label.
- No celebration on download.
- No PDF button without its approximation note.
- No mapping UI on mobile.
- No dark mode.
- No component library.
