# helix.work

The public early-access front door for Helix: one static page, an Ask Helix agent, and a waiting list captured into an owned datastore. Zero dependencies, no build step.

## Run

```sh
node server.mjs          # http://localhost:3000
```

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
