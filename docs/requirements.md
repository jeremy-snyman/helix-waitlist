# Helix Waiting List and Ask Helix Agent — Requirements

| | |
|---|---|
| **Status** | Current — decisions of 14 July 2026 folded in |
| **Date** | 14 July 2026 |
| **Owner** | Jeremy Snyman (MindLynx) |
| **Surface** | helix.work (public early access) |
| **Related** | `docs/agent-context-and-guardrails.md` (agent behaviour), `docs/architecture.md` (as-built design). Upstream draft: `helix-research/Prototypes/helix-work-waitlist/Helix_Waitlist_Requirements_and_Technical_Spec.md` |
| **Audience** | Whoever builds, reviews or operates helix.work |

British English throughout. No em dashes. No section sign.

---

## 1. Purpose and scope

Stand up **helix.work** as the public early-access front door for Helix. It has three jobs:

1. Reveal the products and the proposition (hire an AI team you actually own; simple, sovereign, voice-driven).
2. Capture **per-product** waiting-list demand, which decides release order.
3. Demonstrate the product live, through an **Ask Helix** agent embedded in the page itself.

**In scope:** the public marketing page, the waiting-list capture, the Ask Helix conversational agent, and voice interaction.

**Added 22 July 2026 — Albion.** The same server also hosts **albion.helix.work**: a static page for Albion, Britain's sovereign compound model (part of Helix, credited to MindLynx only), with two capture forms — an organisation waitlist (email, organisation, sector, sovereignty requirement) and a paid contributor register (name, email, sector, years, role). Both post to `/api/albion/*` routes with the same validation, honeypot, rate-limit and consent standards as the Helix capture, into their own NDJSON files. Site routing is by Host header; `/albion` serves the page on any host. The Helix page cross-links (nav + band), and Vera carries a short approved Albion blurb (guardrails doc section 5a). No agent or voice on the Albion page in this phase.

**Out of scope:** the Helix platform and product apps, user accounts and authentication, billing, and any customer-facing agent execution beyond the front-of-house conversation.

---

## 2. Guiding principle

**Do not put the unfinished Helix platform on the critical path of the launch.** The waiting list must be live and reliable during the raise window (money in by 31 August), independent of where Helix itself has got to. Ship Phase 1 on ordinary, proven parts. Treat Cortex, the voice UCL element and a Helix-run agent as the Phase 2 upgrade that turns the page into the flagship dogfood demo. The build preserves two swap seams (section 6) so Phase 2 is a backend swap, not a rewrite.

---

## 3. Phased delivery

| | Phase 1 (this build) | Phase 2 (when Helix is ready) |
|---|---|---|
| **Agent brain** | Gemini flash model behind `/api/agent`, scripted demo brain as offline fallback | Helix agent behind the same endpoint |
| **Memory** | None | Cortex, keyed by email or session |
| **Voice** | Gemini Live real-time conversation via server-minted ephemeral tokens; browser Web Speech API as zero-cost fallback | Helix voice UCL element |
| **Capture** | Node server appending to an owned NDJSON store | Unchanged, plus signups flow into Cortex |
| **Dependency on Helix** | None | Full, and that is the point |

The page, the copy and the layout do not change between phases. Only the backends behind the two seams change.

---

## 4. Functional requirements

### 4.1 Marketing page

- **FR-1** The page presents, in order: hero, the Hire / Own / Speak pillars, "Who is Helix for" (operators and builders), the product rings, the Metis Flow band, the Ask Helix agent, the classic waiting-list form, and the footer. The scaffold from `helix-research/Prototypes/helix-work-waitlist/index.html` implements this content and is the reference; `public/index.html` is its adapted production copy.
- **FR-2** Hero headline is "Hire an AI team you actually own", leading with the workforce and sovereignty stack. No OS/IO or "operating system" language anywhere customer-facing.
- **FR-3** The three pillars answer "what do I get" in one glance: **Hire** (a workforce on demand, no infrastructure), **Own** (data stays in your environment, never trains a lab's model), **Speak** (say what you need, no dashboards).
- **FR-4** Brand: Ink palette, Anton / Archivo / Spline Sans Mono, British English. Per-product ring colours per Lisa (open item 5).
- **FR-5** Footer attribution: "Helix is a MindLynx product". Copyright MindLynx.

### 4.2 Waiting-list capture

- **FR-6** A classic form captures: name (required), work email (required), company (optional), product interest (multi-select across Cortex, Tachyon, Pulse, Helix Agents, Marketplace), and an optional free-text use case.
- **FR-7** Each product ring has a "Join waiting list" control that pre-selects that product and moves the visitor to the form.
- **FR-8** Every signup, whether from the classic form or the agent conversation, produces the **same** record shape and lands in the **same owned datastore**.
- **FR-9** Data ownership: signups are stored in infrastructure MindLynx controls (decision: the append-only NDJSON store in `data/waitlist.ndjson` on our own host, section 8), not a third-party form silo. This is a requirement, not a preference: a company selling sovereignty must not collect its own waiting list on someone else's servers.
- **FR-10** On success the visitor sees a clear confirmation. A confirmation email is out of Phase 1 (open item 6 resolved: no), expected in Phase 2.
- **FR-11** Per-product interest must be queryable, so demand can drive release order. Satisfied by `scripts/counts.mjs` (per-product tally over the store, deduplicated by email, last record wins).

### 4.3 Ask Helix agent

- **FR-12** The agent answers **in-scope** questions about Helix: what it is, the products, sovereignty, who it is for, voice, and the hire/retire model.
- **FR-13** For **out-of-scope** questions (nothing to do with Helix), the agent politely declines and steers back, rather than attempting an answer.
- **FR-14** For **reserved** topics that belong to a deeper relationship (pricing, funding, named partners, roadmap and release dates, tech stack, model choice), the agent gives the "that is for when the relationship goes a bit deeper" deflection and offers to take the visitor's details for a human follow-up.
- **FR-15** Sales behaviour: once it has delivered some value, the agent offers to sign the visitor up, then conversationally collects name, then email.
- **FR-16** The agent then renders a **pre-filled** sign-up form inside the chat via the `show_signup_form(name, email, products)` tool call. The final submission **must be a human click**. The agent must never auto-submit a signup on the visitor's behalf. This is a hard rule, enforced identically across all three brains (scripted, live text, voice).
- **FR-17** Accuracy guardrails: the agent must not fabricate facts or overclaim. It follows the approved positioning and, when unsure, defers to a human rather than inventing.
- **FR-18** The scripted demo brain works with no backend at all, so the page is never dead. With `GEMINI_API_KEY` set, live model responses take over; on any live failure (timeout, non-200, missing key) the page falls back to the scripted brain silently.
- **FR-18a** Context and guardrails are governed by a single **closed, curated context pack** (`context-pack.md`, the runtime extract of `docs/agent-context-and-guardrails.md` sections 3 to 10), injected as the system instruction. The agent knows only what is in that pack and refuses anything outside it. A server-side transcript filter redacts forbidden tokens as a backstop and logs every attempt.

### 4.4 Voice

- **FR-19** Phase 1: voice is a real-time conversation via Gemini Live, streaming speech in and out. Keys and sessions stay server-side: the browser receives only a single-use, short-lived ephemeral token whose model, system instruction and tools are locked at mint time. The browser Web Speech API stays as a zero-cost fallback where Gemini Live is unavailable (no key, CDN failure, connection failure).
- **FR-20** Phase 2: voice runs through the Helix voice UCL element, so spoken input issues UCL commands to the Helix agent rather than to a generic API.
- **FR-21** Graceful degradation: where no speech path is available at all, the microphone control is hidden and the page remains fully usable by text.

---

## 5. Data model

One record per signup line in `data/waitlist.ndjson`:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | `crypto.randomUUID()` |
| `created_at` | ISO timestamp | Server time |
| `name` | text | Required, max 200 chars |
| `email` | text | Required, lowercased, natural dedupe key, max 254 |
| `company` | text | Optional, max 200 |
| `products` | text[] | Subset of Cortex, Tachyon, Pulse, Helix Agents, Marketplace |
| `use_case` | text | Optional free text, max 2000 |
| `source` | text | `helix.work` (classic form) or `helix.work/agent` (chat) |
| `user_agent` | text | For basic analytics, max 300 |
| `consent_at` | ISO timestamp | Server time at which consent arrived; consent is mandatory |

Control characters are stripped from every text field. Repeat emails append a new line; export folds by email, last write wins.

---

## 6. Integration seams and configuration

Two seams are the only things that change between phases.

| Seam | Phase 1 | Phase 2 |
|---|---|---|
| `FORM_ENDPOINT` (`/api/waitlist`) | Node handler appending to the owned NDJSON store | Unchanged; may also forward the signup into Cortex |
| `AGENT_ENDPOINT` (`/api/agent`) | Gemini `generateContent` returning `{reply, action?}` from `{message, history}` | A Helix agent endpoint with the same request and response shape |

Phase 2 additional targets: **Cortex** (memory keyed by email or session), the **UCL voice element** (replacing the Gemini Live client), and a **Helix agent** as the reasoning backend. Each must expose a callable interface before it can be wired in; confirm availability before committing to a Phase 2 date.

Configuration is environment-only (`.env`, all keys optional): `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`, `PORT`, `DATA_DIR`. With an empty environment the site runs entirely in demo mode.

---

## 7. Non-functional requirements

- **NFR-1 Sovereignty and data ownership.** Signup data is held in infrastructure MindLynx controls. No third-party form processor holds the primary copy.
- **NFR-2 Hosting.** One small Node process (zero dependencies) on a host MindLynx controls, with a persistent volume mounted at `data/`. helix.work DNS points at it, HTTPS enforced at the edge. This supersedes the draft spec's static-host suggestion: the owned NDJSON store requires a persistent single instance, and that trade was chosen deliberately over adding a database service. Other Helix TLDs redirect here.
- **NFR-3 Performance.** The page is one static HTML file, served from memory. Fonts and the hero canvas do not block first paint.
- **NFR-4 Privacy and data protection.** Email capture is personal data under UK GDPR. Lawful basis is consent: an unticked-by-default consent checkbox on both forms, enforced client- and server-side, with `consent_at` recorded. A visible privacy notice on the page states what is collected, why, where it lives, the retention period (until general release, or 12 months after last contact, whichever is sooner) and the erasure route (email hello@helix.work). No cookies are set, so no cookie banner. Signup data is not shared with third parties.
- **NFR-5 Accessibility.** Keyboard navigable, sufficient contrast (the Ink palette targets this), labelled form fields, and the page fully usable without voice.
- **NFR-6 Browser support.** Current Chrome, Edge, Safari and Firefox. Voice degrades gracefully where unsupported (notably parts of Firefox and some mobile browsers).
- **NFR-7 Analytics.** Privacy-respecting only. The one metric that matters is per-product interest (`npm run counts`).
- **NFR-8 Security.** Rate limits per route class (capture 10/min, chat 20/min, voice mint 5/10 min per IP); all inputs validated, length-capped and stripped of control characters; request bodies capped at 64 KB; a honeypot field silently discards bot signups; all secrets server-side only; a restrictive Content-Security-Policy on the page; the ephemeral voice token is single-use and expires server-side.

---

## 8. Phase 1 stack (as decided, 14 July 2026)

- **Page:** the scaffold `index.html`, adapted in place (consent, privacy notice, endpoint wiring), served by the Node process. No build step.
- **Server:** one `server.mjs` (node:http) doing three jobs: static page, waitlist capture, and the two Gemini proxies (text agent, voice token mint). Single dependency `@google/genai`, used only for token minting.
- **Store:** append-only NDJSON (`data/waitlist.ndjson`), gitignored, backed up as a file. An admin section will sit over this store later; until then `scripts/counts.mjs` answers the release-order question and the README documents erasure.
- **Agent:** Gemini flash tier (`GEMINI_MODEL`) with the context pack as system instruction, temperature 0.3, one declared tool (`show_signup_form`). Scripted brain retained in the page as the fallback rung.
- **Voice:** Gemini Live (`GEMINI_LIVE_MODEL`) with ephemeral tokens; Web Speech API fallback retained.

Decisions this supersedes from the draft spec: Supabase (rejected: another service; NDJSON plus the future admin section covers it), form-service stopgap (rejected: violates NFR-1), serverless hosting (incompatible with the file store).

---

## 9. Phase 2 upgrade path

1. Stand up a Helix agent that accepts `{message, history}` and returns `{reply}`; point `/api/agent` at it.
2. Give that agent **Cortex** memory: store each visitor's questions and details keyed by email or session, and recall them on return.
3. Replace the Gemini Live client with the **UCL voice element**, so speaking on the page issues real UCL commands.
4. The page can now truthfully say the agent, its memory and its voice all run on Helix. It becomes the single best demo.

No front-end rewrite is required for any of this.

---

## 10. Open decisions

| # | Decision | Owner | Status |
|---|---|---|---|
| 1 | helix.work host and DNS | Jeremy | Open — any Node host with a persistent volume |
| 2 | Capture store | Jeremy | **Decided 14 Jul 2026: owned NDJSON store** |
| 3 | LLM provider for the Phase 1 agent | Jeremy | **Decided 14 Jul 2026: Gemini (one vendor with voice); swapping to Claude is a one-function change** |
| 4 | Metis Flow domain and GitHub org URL | Jeremy | Open — REPLACE-ME placeholders in the page |
| 5 | Per-product ring colours | Lisa | Open — scaffold colours stand until then |
| 6 | Confirmation email in Phase 1 | Jeremy | **Decided: no. Phase 2.** |
| 7 | Cortex service API availability and shape | Helix team | Open |
| 8 | UCL voice web component availability | Helix team | Open |

---

## 11. Acceptance criteria

**Phase 1**

- Page is live at helix.work over HTTPS.
- Signups from both the classic form and the agent conversation land in `data/waitlist.ndjson` with all section 5 fields.
- Per-product interest is queryable via `npm run counts`.
- The agent demonstrates all four behaviours: in-scope answer, out-of-scope decline, reserved-topic deflection, and human-click signup.
- Voice works in a supported browser via Gemini Live, falls back to Web Speech without a key, and the mic hides where neither is available.
- A privacy notice is present and consent is recorded on every stored record.
- Basic accessibility checks pass.
- With an empty `.env` the page is fully functional in demo mode.

**Phase 2**

- Agent responses are served by a Helix agent.
- Memory recalls a returning visitor via Cortex.
- Voice runs through the UCL element.
- The page can state, truthfully, that this agent runs on Helix.

---

## 12. Out of scope

The Helix platform and product apps, user accounts and sign-in, billing, and a full CRM. Signup data may be exported or webhooked into a CRM later; that integration is a separate piece of work. The admin section over the store is planned separately.
