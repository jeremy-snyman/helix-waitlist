# helix.work — Architecture (as built)

| | |
|---|---|
| **Status** | Living document — updated as each build step lands |
| **Date** | 14 July 2026 |
| **Related** | `docs/requirements.md` (what and why), `docs/agent-context-and-guardrails.md` (agent behaviour) |

British English. No em dashes.

---

## 1. Shape of the system

One static HTML page, one Node process, one data directory. No build step, no framework, no database service. One dependency (`@google/genai`), loaded lazily and only used to mint Gemini Live ephemeral tokens; every other line is stdlib.

```
helix-website/
  server.mjs              all server code (node:http)
  public/index.html       the entire Helix page: markup, styles, scripts, scripted brain
  public/albion.html      the Albion page (albion.helix.work): waitlist + contributor register, static forms only
  context-pack.md         the agent's system instruction (extract of the guardrails doc §3-10)
  docs/                   requirements, guardrails, this document
  scripts/counts.mjs      per-product demand tally (the release-order metric)
  test/api.test.mjs       node --test: validation, honeypot, redact, store, HTTP routes
  data/                   runtime only, gitignored: waitlist.ndjson, redactions.ndjson,
                          voicelog.ndjson, albion-waitlist.ndjson, albion-contributors.ndjson
  .env(.example)          all keys optional; empty env = demo mode
```

Everything runs on a single Node >= 22 instance by design: the rate limiter is an in-memory map and the store serialises writes with an in-process promise chain. Horizontal scaling is a Phase 2 problem; the swap points are the limiter map and `appendRecord()`.

## 2. Request routing (`server.mjs`)

One process serves two sites by Host header: a host beginning `albion.` (albion.helix.work) gets `public/albion.html` at `/`; every other host (waitlist.helix.work, localhost) gets `public/index.html`. The path `/albion` serves the Albion page on any host, which is what local testing and the Helix page's cross-links use; DNS and the edge canonicalise to the subdomain in production.

| Route | Handler | Notes |
|---|---|---|
| `GET /`, `/index.html` | static | Helix page, or the Albion page on an `albion.` host; pages cached in memory after first read; CSP + nosniff + referrer headers |
| `GET /albion`, `/albion.html` | static | the Albion page on any host |
| `GET /api/health` | health | `{ok, agent, voice}` — booleans keyed off `GEMINI_API_KEY`; the page reads this once at load to pick its ladder rungs |
| `POST /api/waitlist` | capture | the `FORM_ENDPOINT` seam |
| `POST /api/agent` | text agent | the `AGENT_ENDPOINT` seam |
| `POST /api/voice/token` | voice mint | ephemeral token for Gemini Live |
| `POST /api/log` | voice telemetry | client logs each voice-session stage (start, mic, mint, cdn, connected, first-audio, ws-error/close, fail) to `data/voicelog.ndjson` and the server console — the debugging eye into a visitor's browser |
| `POST /api/albion/waitlist` | capture | Albion organisation waitlist (email, organisation, sector whitelist, sovereignty y/n/not sure, consent, utm) -> `data/albion-waitlist.ndjson`; same rate class, honeypot and consent rules as the Helix capture |
| `POST /api/albion/contributor` | capture | Albion contributor register (name, email, sector, years whitelist, role, consent, utm) -> `data/albion-contributors.ndjson` |
| anything else | 404 JSON | no generic file server, so no path-traversal surface |

Request bodies are read with a 64 KB cap (413 above it), parsed as JSON (400 on garbage), and every POST route rate-limits before doing any work.

**Rate limits** (sliding window per `class:ip`, `x-forwarded-for` first hop): capture 10/min, chat 20/min, voice 5/10 min. 429 responses carry `Retry-After`. A periodic sweep stops the map growing unbounded.

**CSP**: `default-src 'self'`; scripts from self, inline (the page is one file) and `cdn.jsdelivr.net` plus `blob:` (audio worklet); connections to self and `generativelanguage.googleapis.com` (https + wss) and the CDN; fonts from Google Fonts; `frame-ancestors 'none'`.

## 3. Waitlist capture (the `FORM_ENDPOINT` seam)

Contract: `POST /api/waitlist` with JSON `{name, email, company?, products?, use_case?, source?, consent: true, website?: honeypot}` returns `{ok: true}` or `{ok: false, error}` (400/429/413).

Pipeline: rate limit -> honeypot (`website` field set means bot: return 200, write nothing) -> validate (name required <= 200 chars; email regex, lowercased, <= 254; products intersected with the canonical five; use_case <= 2000; `consent === true` mandatory; control characters stripped from all text) -> append to `data/waitlist.ndjson`:

```json
{"id":"<uuid>","created_at":"<iso>","name":"...","email":"...","company":"...",
 "products":["Cortex"],"use_case":"...","source":"helix.work|helix.work/agent",
 "user_agent":"...","consent_at":"<iso>"}
```

`created_at` and `consent_at` are server time. Both capture paths (classic form, agent mini-form) hit this same route with the same shape; only `source` differs (FR-8).

**Store**: `appendRecord(file, obj)` — `mkdir -p` on demand, `JSON.stringify + '\n'` appended under a per-file promise chain so concurrent requests never interleave lines. Append-only; a repeat email is a new line and readers fold by email, last write wins.

**Queryability (FR-11)**: `npm run counts` folds the store by email and prints signups per product plus totals.

**Erasure (NFR-4)**: until the admin section exists, removal is documented in the README: stop the process, `grep -v '"email":"person@example.com"' data/waitlist.ndjson > tmp && mv tmp data/waitlist.ndjson`, restart.

## 4. Text agent (the `AGENT_ENDPOINT` seam)

Contract: `POST /api/agent` with `{message, history: [{role: 'user'|'agent', content}]}` returns:

```json
{ "reply": "plain text",
  "action": { "type": "show_signup_form", "name": "...", "email": "...", "products": ["..."] } }
```

`action` is optional and only present when the model called the tool. Without a `GEMINI_API_KEY`, or on any upstream failure (10 s timeout, non-200, safety block), the route answers `503 {fallback: true}` and the page's scripted brain takes over — the conversation never dies (FR-18).

Upstream call: `POST generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` with:

- `systemInstruction`: the full `context-pack.md` plus a short tool-usage suffix (plain-text replies, when to call the tool, never submit).
- `contents`: page history mapped `agent -> model`, capped to the last 20 turns, HTML stripped (scripted-brain replies contain `<b>` tags), current message deduped (the page pushes it into history before POSTing).
- `generationConfig`: temperature 0.3, maxOutputTokens 500.
- `tools`: one function declaration, `show_signup_form(name, email, products[enum of the five])`, described as render-only — the human clicks.

A `functionCall` part becomes `action`; accompanying text becomes `reply` (canned line if the model sent none). There is no second model round-trip: the tool's "response" is the human pressing the button.

**Transcript filter (guardrails layer 3)**: every `reply` passes through `redact()` — word-boundary regex over the forbidden token list — before leaving the server. Hits are replaced with a deflection phrase and logged to `data/redactions.ndjson` as `{ts, tokens, ip}` for probe visibility. Voice caveat recorded in the guardrails doc §11.

**Page side**: `AGENT_ENDPOINT = '/api/agent'`. Live replies are rendered with `textContent` (the scaffold's `innerHTML` rendering was an XSS hole once real model output flows through it); the scripted brain's own hardcoded HTML still uses `innerHTML`, which is safe because it is authored in the page. `action.show_signup_form` routes to the same `showMiniForm()` the scripted brain uses (FR-16, one form for all three brains).

## 5. Voice (Gemini Live)

- **Mint** (`POST /api/voice/token`): the server uses `@google/genai` (`ai.authTokens.create`, apiVersion `v1alpha` — the wire format is an undocumented converter, so the SDK is the honest path) with `uses: 1`, `expireTime` now+10 min, `newSessionExpireTime` now+2 min, and `liveConnectConstraints` locking the model (`GEMINI_LIVE_MODEL`, default `gemini-3.1-flash-live-preview`), response modality AUDIO, temperature 0.3, the context pack as system instruction (spoken-register suffix), the same `show_signup_form` tool, and input/output transcription. The browser can therefore only hold the conversation we configured: the API key never leaves the server and the token dies server-side even if the client misbehaves. Returns `{token, model}` where `token` is the auth token `name` the client uses as its apiKey; 503 `{degrade: 'webspeech'}` without a key or on mint failure.
- **Client**: mic button toggles a session. On first use the page dynamically imports `@google/genai@2.11.0` from jsdelivr (pinned, matching package.json; no build step; costs nothing unless voice is used; CDN failure drops a ladder rung), then `ai.live.connect({model, config: {responseModalities: ['AUDIO']}})` with the ephemeral token as apiKey. Audio in: `getUserMedia` mono with echo cancellation -> 16 kHz `AudioContext` -> inline AudioWorklet (Blob URL) -> Float32 to Int16 PCM -> base64 -> `sendRealtimeInput`. Audio out: 24 kHz PCM chunks scheduled sequentially against a play cursor; `interrupted` (barge-in) stops scheduled sources. Server VAD owns turn-taking.
- **Transcripts**: input/output transcription events accumulate into the same chat bubbles as text conversation; finalised on `turnComplete`.
- **Tool call over voice**: `toolCall.functionCalls` -> the shared `showMiniForm(args)` -> `sendToolResponse` acknowledging the form is shown and awaiting a human click.
- **Lifecycle**: click to start (mint -> connect -> recording UI), click again or any error to stop (close session, stop tracks, close audio contexts). Client hard stop at 5 minutes with a chat notice; the 10-minute token expiry is the server-side backstop; `goAway` handled as a clean stop.

**Degradation ladder (FR-21)**: Gemini Live -> Web Speech API (`SpeechRecognition` in, `speechSynthesis` out, the scaffold's original code) -> mic hidden. Rung chosen at load from `/api/health` plus feature detection. Deliberate asymmetry (owner decision, 15 Jul 2026): when the health check says Live voice exists, a failed Live connection NEVER downgrades to the browser voice (it is off-brand); the page shows a retry message instead. Web Speech is used only in keyless demo mode. The connecting state is a visual chat indicator, not a spoken browser-TTS line, for the same reason.

## 6. Security posture (NFR-8)

- Secrets only in the server environment; the page sees an ephemeral single-use token at most.
- All inputs validated, length-capped, control-characters stripped; products whitelist-intersected; source whitelist-checked.
- Body cap 64 KB; JSON parse errors are 400s; no generic static file serving.
- Honeypot field silently swallows bot signups (no write, success response, nothing to learn from).
- Per-IP rate limits on every POST route; voice minting is the tightest (5 per 10 minutes).
- LLM output treated as untrusted: rendered with `textContent`, transcript-filtered server-side.
- CSP restricts scripts/connections to self, the pinned CDN and the Gemini endpoints.

## 7. GDPR implementation (NFR-4)

- Lawful basis: consent. Unticked-by-default checkbox on both forms; client blocks submission without it; server 400s without `consent: true`; `consent_at` stamped server-side on every record.
- Privacy notice: inline `#privacy` section on the page (what is collected, why, where it lives, that it is never shared or used for training), retention (until general release or 12 months after last contact, whichever is sooner), erasure route (hello@helix.work). Footer links to it.
- No cookies, no cross-site requests carrying personal data, no third-party form processor. Voice audio streams to Google under their API terms; the privacy notice says voice is optional and the page works without it.

## 8. Deployment

- Any host that runs `node server.mjs` (Node >= 22) with a persistent volume at `data/` and HTTPS at the edge. Single instance. Both subdomains (waitlist.helix.work, albion.helix.work) point at the same instance; the server routes by Host header.
- `PORT` and `DATA_DIR` via environment. With no `GEMINI_API_KEY` the site is fully functional in demo mode, so the key can be added after DNS cutover.
- Back up `data/` — it is the waiting list.

## 9. Verification matrix

| Mode | Checks |
|---|---|
| Empty `.env` | page renders; scripted brain answers all chips; Web Speech mic (hidden in Firefox); both capture paths write full records; counts correct; no-consent blocked client and server side |
| With key (curl) | in-scope grounded answer; out-of-scope decline; reserved-topic deflection (pricing, individuals); signup turn returns `action` with pre-fill args; forbidden tokens absent from replies |
| Abuse | 21st rapid chat POST is 429 with Retry-After; honeypot POST returns 200 and writes nothing; 100 KB body is 413; bad JSON is 400; key removed mid-run degrades to scripted brain |
| Voice (manual, Chrome) | live conversation with transcripts in chat; barge-in stops playback; spoken signup renders the same form and only the human click writes; teardown clean; network tab never shows the API key; CDN blocked drops to Web Speech with notice |
| Automated | `npm test` — validation, honeypot, redact (including the `\b` boundary: "because" must survive), store append, HTTP routes |
