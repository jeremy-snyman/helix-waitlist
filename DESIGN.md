---
name: Helix / Albion front doors
description: Sovereign control-room dark — hairline-ruled panels, uppercase Anton, mono labels, twin signal accents.
colors:
  void-black: "#020307"
  console-panel: "#04070D"
  hairline-steel: "#1B2030"
  signal-white: "#F2F5F0"
  readout-grey: "#C0C5D2"
  mono-grey: "#7C8393"
  helix-lime: "#C8FF00"
  albion-mint: "#2DF1B4"
  builder-lavender: "#A78BFF"
  interrupt-pink: "#FF3D8A"
  meter-amber: "#FFB300"
  data-cyan: "#00E5FF"
typography:
  display:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(44px, 7.5vw, 92px)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(28px, 4vw, 44px)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "0.01em"
  title:
    fontFamily: "Anton, sans-serif"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.02em"
  body:
    fontFamily: "Archivo, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Spline Sans Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.18em"
rounded:
  none: "0"
spacing:
  sm: "12px"
  md: "24px"
  lg: "32px"
  xl: "48px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.helix-lime}"
    textColor: "{colors.void-black}"
    rounded: "{rounded.none}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "#d6ff3d"
    textColor: "{colors.void-black}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.signal-white}"
    rounded: "{rounded.none}"
    padding: "12px 22px"
  input:
    backgroundColor: "{colors.console-panel}"
    textColor: "{colors.signal-white}"
    rounded: "{rounded.none}"
    padding: "13px 14px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.readout-grey}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.console-panel}"
    rounded: "{rounded.none}"
---

# Design System: Helix / Albion front doors

## Overview

**Creative North Star: "The Control Room"**

A sovereign operations room at night. Every surface is near-black; structure is drawn, not shaded — 1px steel hairlines rule the space into consoles and panels, each labelled in uppercase mono like instrument tags. Headlines land in towering uppercase Anton, and the room's only colour comes from signal lights: lime for Helix, mint for Albion, with small status hues (lavender, pink, amber, cyan) marking individual instruments. The mood is sharp, kinetic and assured — ambient particles rise steadily through the dark, but the controls themselves stay precise and quiet: nothing decorative, confidence through exactness.

The system is flat by conviction. There are no shadows, no rounded corners, no gradient text, no glassmorphism. Depth comes from one tonal step (panel on void) and from the discipline of the ruling lines. It is a dark theme chosen for the use scene — an evaluation-stage visitor, often an investor or engineer, reading at leisure — not as a category habit.

**Key Characteristics:**
- Near-black canvas with a single tonal step for panels
- 1px hairline rules as the entire structural language
- Uppercase Anton display over Archivo body over mono microcopy
- Twin signal accents: lime owns helix.work, mint owns albion.helix.work
- Flat, square, quiet components; one ambient authored motion (rising dots)

## Colors

A black room lit by signal lights: two working accents, four instrument hues, and a disciplined grey ramp.

### Primary
- **Helix Lime** (#C8FF00): Helix's voice — primary buttons, the logo full-stop, keyword spans in headlines, focus outlines and selection on helix.work. Appears on Albion only inside the Helix cross-plug band.
- **Albion Mint** (#2DF1B4): Albion's voice — same roles on albion.helix.work. Appears on Helix only inside the Albion cross-plug band.

### Tertiary
- **Builder Lavender** (#A78BFF), **Interrupt Pink** (#FF3D8A), **Meter Amber** (#FFB300), **Data Cyan** (#00E5FF): instrument lights — product card swatches, list bullets, the recording state (pink). Never used for large surfaces.

### Neutral
- **Void Black** (#020307): the page. Everything sits on it.
- **Console Panel** (#04070D): panel and card fill — one perceptible step above void.
- **Hairline Steel** (#1B2030): every border, rule and divider. 1px, always.
- **Signal White** (#F2F5F0): headings and primary text.
- **Readout Grey** (#C0C5D2): body and supporting text on dark.
- **Mono Grey** (#7C8393): mono labels, eyebrows, form notes — the quietest voice.

### Named Rules
**The Two Signals Rule.** Lime belongs to Helix; mint belongs to Albion. Each site shows the other's accent only in its cross-plug band, and accents stay under roughly a tenth of any viewport. Their rarity is the authority.

## Typography

**Display Font:** Anton (sans-serif fallback)
**Body Font:** Archivo (sans-serif fallback)
**Label/Mono Font:** Spline Sans Mono (monospace fallback)

**Character:** Broadsheet-scale uppercase condensed display over a plain-spoken grotesque, annotated everywhere in tracked-out engineering mono. Loud headlines, quiet instruments.

### Hierarchy
- **Display** (400, clamp(44px, 7.5vw, 92px), 1.04): hero headlines only; uppercase; accent-coloured `<span>` marks the operative phrase.
- **Headline** (400, clamp(28px, 4vw, 44px), 1.04): section `h2`, uppercase, one accent span permitted.
- **Title** (400, 24–28px): panel and card headings, uppercase Anton.
- **Body** (400, 16px, 1.55): Archivo; supporting copy in Readout Grey; measures capped around 480–760px depending on role.
- **Label** (400, 10–13px, 0.12–0.22em tracking, uppercase): Spline Sans Mono for eyebrows, buttons, form labels, instrument tags, form notes.

### Named Rules
**The Instrument Tag Rule.** Every panel, form field and band is labelled in uppercase tracked mono. Mono is the language of measurement here — never body copy, never headlines.

## Layout

One centred 1100px column (`.wrap`, 24px gutters) on a full-bleed dark canvas. Sections run 80px vertical padding (56px under 640px); thin cross-plug bands run 48px. Panels use a two-step internal padding scale: 24px for compact strips and tags, 32px for feature panels and cards. Grids butt cells together with gap 0 and rule the joints with internal 1px hairlines; forms use 18px gaps in a two-column grid that collapses at 640px. Heroes are full-bleed compositions (canvas particles, masked imagery) that resolve into the column immediately below.

**The Hairline Rule.** Full-bleed hairlines do exactly one job: closing a section. Panels own all four of their edges at content width. No element ever borrows an edge from a full-bleed rule — the T-junction is the system's cardinal sin.

## Elevation & Depth

Flat, deliberately. There are no box-shadows anywhere. Depth is conveyed by the single tonal step from Void Black to Console Panel, by hairline containment, and in the Albion hero by a radial-masked photograph that emerges from the dark. Overlay chrome (the sticky header) separates by a hairline plus slight background blur, not by shadow.

## Shapes

Square everything: border-radius 0 on every control, panel, chip and image. The form language is the ruled rectangle; small filled squares (7–10px) act as bullets, swatches and status lights. No pills, no circles except the visitor-facing typing dots.

## Components

### Buttons
- **Shape:** square (0 radius), mono uppercase 13px, 0.12em tracking
- **Primary:** accent-filled — lime on Helix, mint on Albion — with Void Black text, 12px 22px padding (weight 500)
- **Ghost (default `.btn`):** transparent with 1px Hairline Steel border; hover raises border to Mono Grey
- **Hover / Focus:** 160ms ease on colour/border; `:focus-visible` draws a 2px accent outline offset 2px
- **States:** disabled submit shows "Sending…" text swap; no spinners

### Chips (Helix chat suggestions)
- **Style:** transparent, 1px hairline border, mono 12px, Readout Grey text
- **State:** hover shifts border and text to accent/white; they are buttons, not links

### Cards / Containers
- **Corner Style:** square
- **Background:** Console Panel on Void Black
- **Border:** 1px Hairline Steel on all four sides; grid neighbours share internal 1px rules
- **Internal Padding:** 24px compact / 32px feature
- **Header row:** mono index tag (e.g. "01 / MEMORY") left, 10px status square right

### Inputs / Fields
- **Style:** Console Panel fill, 1px hairline border, square, Archivo 15px, 13px 14px padding
- **Focus:** border shifts to the page accent (no glow)
- **Choice controls:** bordered label boxes with native accent-coloured controls; a checked box lifts its border to the accent

### Navigation
- **Style:** sticky 58px bar, hairline bottom rule, translucent Void Black with 4px blur; Anton logotype with accent full-stop; ghost + primary button pair right
- **Cross-links:** tiny mono "part of Helix →" backlink beside the Albion logotype

### Signature: the cross-plug band
A full-bordered panel at content width, 32px padding, wearing the *other* site's accent as its border and primary button — mint Albion band on Helix, lime Helix band on Albion. Eyebrow, one Anton line with accent span, one sentence, two CTAs.

## Do's and Don'ts

### Do:
- **Do** draw all structure with 1px Hairline Steel; group by proximity first, panels second.
- **Do** keep the page accent rare and semantic — buttons, keywords, focus, selection.
- **Do** label everything architectural in uppercase tracked mono.
- **Do** use the 24/32 panel padding scale and 80/48 section rhythm.
- **Do** hold WCAG 2.2 AA: Readout Grey on Void Black for body, visible focus everywhere, reduced-motion respect for ambient canvases.

### Don't:
- **Don't** round a corner, cast a shadow, or gradient any text.
- **Don't** let any element borrow an edge from a full-bleed rule (no border-top:0 tricks).
- **Don't** cross the accent streams: no mint UI on Helix or lime UI on Albion outside the cross-plug bands.
- **Don't** introduce new hues, new fonts, or body-copy mono.
- **Don't** add motion beyond the ambient rising dots and 160ms state eases.
