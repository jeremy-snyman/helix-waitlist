# helix.work

The public early-access front doors for Helix: the Helix page (with Vera, the Ask Helix agent), the Albion page and the Cortex page, served by one process off the Host header, with waiting lists captured into an owned datastore. One dependency (Gemini Live token minting), no build step.

## Run

```sh
npm install              # once; only @google/genai
node server.mjs          # http://localhost:3000 (/albion and /cortex serve the other pages)
```

Production runs the `Dockerfile` (node:22-slim, `DATA_DIR=/data`): mount a persistent volume at `/data`.

Optional `.env` (see `.env.example`): `GEMINI_API_KEY` unlocks the live agent and Gemini Live voice. Without it the page runs in demo mode (scripted brain, Web Speech voice) and is fully functional.

## Data

Signups append to `data/waitlist.ndjson` (gitignored — back this directory up).

- Per-product demand: `npm run counts`
- Erasure request: stop the server, then
  `grep -v '"email":"person@example.com"' data/waitlist.ndjson > tmp && mv tmp data/waitlist.ndjson`
- Redaction probe log: `data/redactions.ndjson`

## Test

```sh
npm test
```

## Docs

- `docs/requirements.md` — what and why, FRs/NFRs, acceptance criteria
- `docs/agent-context-and-guardrails.md` — what the agent may say; `context-pack.md` is its runtime extract (edit in lockstep)
- `docs/architecture.md` — as-built design

Helix is a MindLynx product.
