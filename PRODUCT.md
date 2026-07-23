# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Operators** (Helix): non-technical people who want to use AI safely — hire an agent or a team, brief it by talking, no infrastructure, no dependence on any single large lab.
- **Builders** (Helix): developers who reuse the platform — Cortex memory, workflow-born skills, the rules engine, generative UI — inside their own agentic workloads.
- **Sovereignty-bound organisations** (Albion waitlist): UK and EU organisations first — public sector teams with sovereignty mandates, legal and financial services under audit obligations, defence-adjacent suppliers.
- **Contributors** (Albion register): British professionals with deep sector expertise (law, financial services, public sector, health, defence, education/research) who want to be paid and credited for teaching a British model their field.

Visitors typically arrive during a fundraise window: investors, early adopters and press evaluating whether the company is real.

## Product Purpose

Two public early-access front doors on one Node process:

- **helix.work** (currently waitlist.helix.work): reveal the Helix proposition, capture **per-product** waiting-list demand — demand decides release order — and demonstrate the product live through Vera, the embedded conversational agent with real-time voice.
- **albion.helix.work**: present Albion (Britain's sovereign compound model, part of Helix), capture its organisation waitlist (sector shapes which vertical edition ships first) and its paid contributor register.

Success: a live, reliable waiting list and credible demonstration during the raise window (money in by **31 August 2026** — confirmed still operative, 23 July 2026). The unfinished Helix platform must never be on the critical path of these sites.

## Positioning

- Helix: **hire an AI team you actually own** — simple, sovereign, voice-driven. Data, memory and decisions stay in the customer's environment; agents are hired and retired like staff, not rented as seats.
- Albion: **one endpoint, many minds, and a receipt for every answer** — sovereign work is fail-closed, answers are verified not guessed, and proven work distils into a British core the customer owns. Contributors are paid, credited and share the upside (no scraping).

## Operating Context

- Phase 1 runs on ordinary proven parts (static pages + one Node server + NDJSON store + Gemini/Gemini Live) with two swap seams (`FORM_ENDPOINT`, `AGENT_ENDPOINT`) so Phase 2 (Cortex memory, UCL voice, Helix agent brain) is a backend swap, not a rewrite.
- One server hosts both sites by Host header; `/albion` and `/helix` serve either page on any host.
- Vera's knowledge is a closed, curated context pack (`context-pack.md`), kept in lockstep with `docs/agent-context-and-guardrails.md` §3–10 — same commit, always.

## Capabilities and Constraints

- The agent **never submits a sign-up**; it renders the form and the human clicks (FR-16). It never invents values.
- Hard prohibitions (all four enforcement layers): never mention Justin, Seillen, group/holding structure, prices, funding figures, partner or customer names, release dates, or technical internals beyond the pack. Publicly, Albion is credited to **MindLynx only**.
- British English throughout. No em dashes in site copy.
- GDPR: consent checkbox (unticked, required) on every capture form, server-stamped `consent_at`, retention "until general release or 12 months after last contact", erasure via hello@helix.work, no cookies.
- Empty `.env` must leave both pages fully working (scripted brain, demo mode).
- Undecided / open: Metis Flow site URL and GitHub org (REPLACE-ME), Albion og-image and scoping-call booking URL, Gemini Live quota tier for production, deployment host + DNS for both subdomains.

## Brand Commitments

- **Albion is part of the Helix family, not a co-equal brand** (Jeremy, 23 July 2026): Helix leads; Albion is cross-plugged, shares infrastructure, and future work should not grow it a separate identity or funnel.
- Ink palette on near-black (`#020307`), panels `#04070D`, hairlines `#1B2030`; **lime `#C8FF00` is Helix's accent, mint `#2DF1B4` is Albion's** — each site wears the other's accent only for its cross-plug band.
- Fonts: Anton (display, uppercase), Archivo (body), Spline Sans Mono (labels/eyebrows/buttons). Pinned by the owner — do not change.
- The agent is named **Vera**; warm, unfailingly polite, brief, British English; asks permission to use first names.
- Visual system (recorded in DESIGN.md): full-bleed hairlines close sections; panels are self-contained bordered boxes at content width (1100px wrap); no rounded corners, no shadows, flat 1px-border language.

## Evidence on Hand

- Metis Flow is genuinely open source and free — the only launched artefact that may be pointed at (URL still a placeholder).
- Albion hero asset: `public/albion-hero.jpg` (edge-faded, padded derivative of `docs/black_background.png`); original prototype scaffolds live in `helix-research/Prototypes/`.
- **No nameable customers, partners, testimonials, pricing or funding figures exist for public use — never fabricate them.** EU AI Act dates (Dec 2026 / Dec 2027) and the UK £500m Sovereign AI programme (£80m procurement open) are the only external proof points used, on the Albion page.

## Product Principles

1. The unfinished platform never blocks the front door — ship on proven parts, keep the seams.
2. Demand data decides release order; both capture paths write identical, queryable records.
3. Show, don't claim: the page itself (Vera, voice, generative form) is the product demo.
4. Sovereignty is the story and the practice — secrets server-side, closed context, consent-first data handling.
5. One family, two doors: Helix leads, Albion belongs to it; shared infrastructure, mirrored accents.

## Accessibility & Inclusion

**WCAG 2.2 AA is binding for both sites** (Jeremy, 23 July 2026) — Albion's public-sector/legal/defence audiences procure against it. Future work verifies contrast, keyboard access, visible focus, and reduced-motion behaviour to that standard.
