# DESIGN — Izin Cuti

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
--paper    #F5F4EC    warm document ground, biased green rather than cream
--page     #FDFCF7    the sheet, and the field somebody types into
--ink      #211E19    labels, values, rules                   15.05:1 on paper
--rule     #DDD8C9    hairlines, field boxes, section borders
```

`--paper` and `--page` are two steps of the same ground, not a colour and a white. The form is a document; a field is a place on it where something is written, and it sits one step lighter than the page around it rather than jumping to `#FFF`. True white survives in exactly one place — `--white`, the label on the `--typed` button, at 10.66:1.

### The three states

```
--typed     #23405F    fountain-pen blue — you entered this     9.66:1 on paper
--derived   #4B6650    muted green — computed, not editable     5.74:1 on paper
--unmapped  hatch      diagonal over --paper — the template has this, you have not mapped it
```

**`--derived` is the important one.** A derived field looks visibly different from a typed one, so nobody wonders why they cannot edit the day count — the colour already said it is computed. Derived fields are never rendered as disabled inputs; they are rendered as *results* — **in the preview, where they land in the document**, rather than as a second list beside the form. A computed value shown twice is a value somebody has to reconcile.

**`--unmapped` uses a pattern, not a colour**, because it is an absence rather than a value — the same rule the sibling projects apply to unknown data.

### Two greys, and no third

```
--ink-muted   #57534A   6.94:1    secondary prose, hints, captions
--ink-subtle  #6F6B60   4.82:1    the quietest text allowed
```

Every muted grey in the app is one of these two. **No opacity modifier on `--ink`** — `text-ink/50` reads as a token and is really a value, and it measures well under the floor §9 asks for.

### Validation

```
--attention  #8B5C1D   amber — a warning, never a block        5.22:1 on paper
```

**Amber is a mark, never a surface.** No amber background, no amber tint behind a paragraph. The moment it washes a block that is merely informational — "map mode needs a wide screen" — it stops meaning *a warning stands here* and starts meaning *this text is a bit important*, which is not a thing the palette can afford to say.

**Amber, not red.** Validation warns and never prevents; offices have exceptions, and a red error state implies a refusal the app does not make. Amber sits beside the field, with the reason in words.

**No red anywhere in the product.** Nothing here is an error, including a template mismatch — that is a refusal with an explanation, rendered in ink with an amber marker.

### Every ratio here is measured

Against `--paper`, with the WCAG 2.1 relative-luminance formula, not estimated from a screen. The floor is 4.5:1 and no text colour in the palette is within a rounding error of it. A colour that cannot clear the floor is deepened at the same hue rather than kept and excused.

## 4. Type

```
Source Serif 4    section headings, and the document's own title — nowhere else
Public Sans       labels, prose, controls — designed for government use, plain and legible
IBM Plex Mono     NIP, dates, day counts, node indices, fingerprints
```

Self-hosted via `next/font`.

### Where the serif may appear, and where it may not

The left pane is meant to read as the document it fills, and a serif on the Roman-numeraled section headings is the cheapest honest way to say so. It carries **section headings and the document's own title, and nothing else**.

It may not touch a label, a control, a button, a warning, a caption, or a value. The moment it does, it stops meaning *this is a document heading* and starts meaning *this text is a bit important* — the same failure §3 forbids for amber, for the same reason. `font-display` exists in the config so that the rule has one name to be broken by, and so a review can grep for it.

```
14  16  18  22  28          1.25 ratio
```

**One scale, declared once.** `globals.css` holds every token — colour, type, space, radius, edge — and `tailwind.config.ts` names them without repeating a value. Two files holding the same hex is how one palette becomes two.

**Monospace on every number that has to be read digit by digit.** An NIP is eighteen digits and gets checked against a card; proportional figures make that harder than it needs to be. Tabular figures throughout.

Light ground, no dark-mode correction. Body 400, labels 500, section headings 600.

## 5. Layout — two panes, two modes

**Fill mode** is the default and the common case.

```
left  50%   the rail, then the form, sectioned as the document is
right 50%   live preview, scroll-linked to the focused field
```

Equal halves. The preview is not a thumbnail — it is where the derived values are read and where the fill is checked, so it gets the same room as the form.

### The form is a ledger, not a stack of inputs

The document the office hands out has Roman-numeraled sections and labels with something written on a line above them. The left pane has the same, in the same order, because somebody who knows the paper form should find their place on the screen without being taught how.

- **Sections are numbered in Roman**, under a heading in the display serif — the one place §4 allows it.
- **A value sits on a ruled line**, not inside a box: border on the bottom edge only, ground lifting to `--page` on focus, the 3px focus ring unchanged.
- **Rules are horizontal only.** A vertical rule looks right until a row does not add up to six columns; then the last cell in the row has an edge and the gap beside it does not, and the ledger reads as a rendering fault. A rule across the top of every cell joins its neighbours at any span combination.
- **Six-column rows.** A date takes a third, an ordinary field a half, anything with prose the full width. Three date pickers stacked down the page is three rows spent on what the eye reads as one thing. Options in a single-select group wrap into two columns where there is room, which is how the document prints them.

### The rail

A narrow column at the left edge of the form pane: one Roman numeral per section, and beneath it either the number of fields still empty or `√` once there are none. Each entry links into its section, so it reports on the form and is a way through it.

Complete is stated in `--derived`. Nothing in the rail is amber — a section nobody has reached yet is not a warning.

It is narrow on purpose. This pane is half the window and the form needs the rest of it; the numeral is the visible part, and the accessible name carries the sentence, because "II, 4/6" read aloud is not one.

**What the rail replaced:** a flow line in the header reading *Isi kolom → Periksa pratinjau → Unduh DOCX*. It named a sequence and never once said which part of it you were in. **A device that looks like a stepper and is a caption costs a row and answers nothing** — either it states position or it does not appear.

### The form scrolls; the download does not

The fields scroll inside the pane. The download panel is a sibling pinned to the bottom of it, on screen from the first frame. §7 is the rest of that argument.

### Focus

Focusing a field scrolls the preview to that part of the document and marks it — **the preview pane only.** Never the page: a preview that drags the whole window while somebody is typing is worse than one that does not scroll at all. **You always see where the thing you are typing lands.**

### Controls are drawn, not borrowed

Checkboxes and radios are real `input` elements with `appearance` given up, drawn as a hairline cell with a `√` in it — the same mark the fill engine inserts. The operating system's blue disc is not in this document. Same element, same keyboard path, same announced role, same 24px target; only the shape changes, from the platform's to the document's.

Single-select groups draw the `√` too, because that is what a single-select group is here: one cell of several with a mark in it.

A `select` is the same argument and needs saying separately, because Tailwind's preflight does not reset `appearance` on one: without `.field-select` it keeps the platform's rounded box and stepper arrows however it is bordered. Its chevron is markup rather than a background image — a data URI cannot read `--ink-subtle`, and writing a colour a second time is how one palette becomes two.

### The spellchecker is off unless the field is prose

A name, a NIP, a jabatan, a unit kerja, a phone number and an address are all underlined in red by the browser, and **this product has no red in it**. A person's own name is not a misspelling. `alasan` is the one field somebody writes a sentence in and the one field that keeps its checker; the rule is `PROSE_KEYS` in `lib/fill/form.ts` and no component decides it.

### The signature

Section V, and three numbered steps — make it, size it, check it. The numbering is information rather than decoration here: you cannot size a signature you have not made, and you cannot see where it lands until it has a size. §10 forbids numbering that is not a sequence; this one is.

The third step holds no control. It says where to look, because the answer is already in the preview beside it, and a second smaller preview inside the panel would be a second thing to reconcile — the same argument that keeps derived values out of the form.

**One number, not two.** The width is chosen and the height follows from the aspect ratio. A signature stretched out of proportion is not that person's signature, and offering two boxes is offering somebody the chance to make it wrong.

**Drawn or uploaded, and nothing downstream knows which.** Both end at PNG bytes. The drawing is trimmed to the ink before it is kept, so the width chosen in step two is the width of the signature rather than the width of the pad it was drawn in.

**Removing a photograph's white background is offered, never assumed.** It is a guess about which pixels are paper, and on pale ink it eats the stroke. Off by default, with the risk stated beside the control, so somebody can see it happen and say no.

**It is not a claim about identity, and the panel says so.** The line at the top of the section is that the signature is for the applicant's block only and that this app does not sign on anybody's behalf. Sections VII and VIII belong to other people.

**The image is the most personal thing here.** It says where it is kept, that clear-all removes it, and that the export file does not carry it — an export is a thing people mail to themselves or hand to a colleague, and a handwritten signature travelling inside one is a surprise nobody asked for.

### The preview is a sheet, at the document's scale

`--page` on `--paper`, with the app's one shadow under it and margins inside it. It is what somebody checks their letter against before it goes to an atasan, and it should look like the thing being checked. No page number: the preview is one continuous article and pagination is Word's to decide.

**Its measurements are the document's, not the interface's.** Type size, line height, cell padding, page margin and column widths are the constants in `lib/pdf/render.ts`, in the same units — points on a 595pt A4. The PDF preview and the on-screen preview are two renderings of one model and they used to disagree about every one of those numbers, so the thing somebody checked was not the thing they printed.

`--doc-unit` turns one of those points into a length that fits the pane, the way a PDF viewer's *fit width* does, and everything else is a multiple of it. The page keeps its proportions at any pane width and the type is as large as the room allows.

**This is the one place the 16px type floor does not apply**, and it is worth being explicit about why. §9's floor is about interface text, which somebody reads. This is a facsimile of a page, which somebody *checks* — and it stops being checkable the moment it stops matching what will print. It remains real selectable text rather than an image, so a screen reader is unaffected, browser zoom works, and the PDF preview at full size is a click away. Below the two-pane breakpoint the column proportions are already given up to reflow, and the type goes back to being sized for reading rather than for fitting.

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

- **It does not scroll away.** The panel is pinned to the foot of the form column rather than sitting at the end of it. It used to be four sections below the fold, which meant the one button this app exists to offer was reachable only by scrolling past every field.
- **Three actions, clearly unequal:** *Unduh DOCX* is primary; *Pratinjau PDF* and *Cetak* are secondary, with the approximation note beside them, not hidden behind a tooltip.

  DOCX leads for one reason, and it is not that the PDF matters less. **The DOCX is the office's own form file** — opened, written into, closed again — so its layout is the form's by construction. The PDF is composed by this app in Helvetica from the same model: identical content, its own layout. Somebody sending the built-in PDF is very likely fine; somebody whose office checks it against the printed form is not, and only one of those two failures is silent. So the safer file leads, and the note beside the PDF says **how to get an exact one** rather than only that this one is approximate.
- **The PDF is looked at before it is downloaded.** *Pratinjau PDF* opens the real file in the browser's own reader, at the size it prints, with the download inside it. Downloading a PDF unseen is how the wrong year reaches an atasan — and it is offered at all only because the file is built in the tab and never uploaded.
- **A last chance to notice the wrong year** — the warnings that stand, and any computed field still waiting on an input, immediately above the buttons.

  Being pinned gives the panel a height budget, so the warnings scroll inside their own box past three or so. They keep their place immediately above the buttons; they no longer push the buttons off the screen for somebody who has a lot of them.

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
- **Target floor 24px**, as `--control-min`. Checkboxes and radios render at about 13px by default and are sized up to it. WCAG 2.5.8. Giving up `appearance` to draw them as the document's `√` changes the shape and nothing else — the element, the role, the keyboard path and the target size are the native ones. **A drawn control that is not a real `input` is not permitted**, whatever it looks like.
- The preview has a text alternative — the filled document as readable text, which is also what someone would paste into a message.

## 10. What not to do

- No red anywhere, including on validation.
- No blocking validation.
- No derived field rendered as an editable-looking input.
- No unmapped target rendered as a colour rather than a pattern.
- No placeholder text standing in for a label.
- No device that looks like a stepper without stating position.
- No serif outside a section heading or the document's title. §4.
- No shadow anywhere but under the preview sheet.
- No page count on the preview — pagination belongs to Word.
- No signature drawn into a PDF that the DOCX does not carry, or the other way round. Both render from one model.
- No second box for a signature's height.
- No second set of figures for the preview. It reads `lib/pdf/render.ts`'s constants or it is lying about what will print.
- No browser spellchecker on a field that is not prose. Red is red whoever drew it.
- No `select` without `.field-select`. Preflight will not reset `appearance` for you.
- No celebration on download.
- No PDF button without its approximation note, and no approximation note without the way to get an exact one. "The DOCX is authoritative" is true and, alone, useless to somebody whose office wants a PDF.
- No claim that the PDF is invalid. It is re-composed, not wrong — for most offices it is fine, and this app has no standing to rule on it.
- No mapping UI on mobile.
- No dark mode.
- No component library.
