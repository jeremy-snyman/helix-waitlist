/**
 * helix.work — single-file server. Zero dependencies, plain node:http.
 * Serves three sites off one process by Host header:
 *   waitlist.helix.work (and anything else) -> public/index.html
 *   albion.helix.work (or path /albion)     -> public/albion.html
 *   cortex.helix.work (or path /cortex)     -> public/cortex.html
 * API routes:
 *   GET  /api/health              which integrations are live (page picks its ladder rungs)
 *   POST /api/waitlist            Helix signup capture -> data/waitlist.ndjson
 *   POST /api/agent               Ask Helix text agent (Gemini) -> {reply, action?}; 503 without a key
 *   POST /api/voice/token         signed Pipecat voice session (Vera, Cartesia); 503 unconfigured
 *   POST /api/log                 voice telemetry -> data/voicelog.ndjson
 *   POST /api/albion/waitlist     Albion org waitlist -> data/albion-waitlist.ndjson
 *   POST /api/albion/contributor  Albion contributor register -> data/albion-contributors.ndjson
 * Single instance by design: in-memory rate limits, per-file append queues.
 */
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, createHmac, randomUUID } from 'node:crypto';

try { process.loadEnvFile(); } catch { /* no .env is fine: demo mode */ }

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
/* When an Anthropic key is present, Claude answers the typed chat (same brain as
   mindlynx.ai) and Gemini becomes the fallback. The big system block is sent
   with cache_control, so the pack + bank prefix is cached: repeat turns are
   faster and the cached prefix costs a fraction of the first read. */
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
/* ---------------- voice ----------------
   Vera speaks through the Helix Pipecat service, exactly as she does on
   mindlynx.ai — one Vera, one voice, across every front door. `VOICE_OFFER_SECRET`
   is the shared secret the voice service verifies the session blob with
   (`WEBSITE_OFFER_SECRET` at its end); without it voice reports itself
   unavailable rather than half-working. */
const VOICE_OFFER_SECRET = process.env.VOICE_OFFER_SECRET || '';
const VOICE_CONNECT_URL =
  process.env.VOICE_CONNECT_URL || 'https://app.helix.work/pipecat/api/offer';
// Lucy — British female, the voice MindLynx picked. Same id, same speed, so the
// three sites and MindLynx are audibly one person.
const VERA_VOICE_ID = process.env.VERA_VOICE_ID || '2f251ac3-89a9-4a77-a452-704b474ccd01';
const VERA_VOICE_SPEED = Number(process.env.VERA_VOICE_SPEED || '1.15');
/** The host each site answers on — what the voice service logs the session as. */
const SITE_HOSTS = {
  helix: 'helix.work',
  albion: 'albion.helix.work',
  cortex: 'cortex.helix.work',
};
/* ---------------- scoping calls ----------------
   ONE diary across every front door: mindlynx.ai holds the Calendly token and
   exposes public, rate-limited availability + booking endpoints; these sites
   proxy them server-side. No new secrets, no CORS, and a slot booked on any
   site leaves the same calendar. */
const MINDLYNX_ORIGIN = process.env.MINDLYNX_ORIGIN || 'https://mindlynx.ai';

export const PRODUCTS = ['Cortex', 'Tachyon', 'Pulse', 'Helix Agents', 'Marketplace'];
const SOURCES = ['helix.work', 'helix.work/agent', 'cortex.helix.work'];
const BODY_CAP = 64 * 1024;

/* ---------------- rate limiter (in-memory sliding window) ---------------- */
const LIMITS = {
  capture: { max: 10, windowMs: 60_000 },
  chat: { max: 20, windowMs: 60_000 },
  voice: { max: 5, windowMs: 600_000 },
  log: { max: 60, windowMs: 60_000 },
  avail: { max: 60, windowMs: 60_000 },
  book: { max: 3, windowMs: 600_000 },
};
const hits = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) {
    const fresh = times.filter((t) => now - t < 600_000);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
  }
}, 300_000).unref?.();

export function rateLimit(routeClass, ip) {
  const { max, windowMs } = LIMITS[routeClass];
  const key = `${routeClass}:${ip}`;
  const now = Date.now();
  const times = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= max) {
    return { ok: false, retryAfter: Math.max(Math.ceil((times[0] + windowMs - now) / 1000), 1) };
  }
  times.push(now);
  hits.set(key, times);
  return { ok: true, retryAfter: 0 };
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/* ---------------- NDJSON store (append-only, serialised per file) ---------------- */
const queues = new Map();
export function appendRecord(file, obj) {
  const job = async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(join(DATA_DIR, file), JSON.stringify(obj) + '\n', 'utf8');
    return obj;
  };
  const next = (queues.get(file) ?? Promise.resolve()).then(job, job);
  queues.set(file, next);
  return next;
}

/* ---------------- validation ---------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function clean(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

const ALBION_SECTORS = ['Legal', 'Financial services', 'Public sector', 'Health', 'Defence', 'Technology', 'Other'];
const CONTRIB_SECTORS = [...ALBION_SECTORS, 'Education and research'];
const CONTRIB_YEARS = ['Under 5', '5 to 10', '10 to 20', '20 or more'];
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

function cleanUtm(utm) {
  const out = {};
  if (utm && typeof utm === 'object' && !Array.isArray(utm)) {
    for (const k of UTM_KEYS) if (typeof utm[k] === 'string') out[k] = clean(utm[k], 200);
  }
  return out;
}

export function validateAlbionWaitlist(body) {
  const email = clean(body.email, 254).toLowerCase();
  const organisation = clean(body.organisation, 200);
  if (!EMAIL_RE.test(email)) return { error: 'A valid email address is required.' };
  if (!organisation) return { error: 'Organisation is required.' };
  if (!ALBION_SECTORS.includes(body.sector)) return { error: 'A sector is required.' };
  if (body.consent !== true) return { error: 'Consent is required to join the list.' };
  return {
    record: {
      email,
      organisation,
      sector: body.sector,
      sovereignty: ['yes', 'no', 'not sure'].includes(body.sovereignty) ? body.sovereignty : '',
      utm: cleanUtm(body.utm),
    },
  };
}

export function validateAlbionContributor(body) {
  const name = clean(body.name, 200);
  const email = clean(body.email, 254).toLowerCase();
  if (!name) return { error: 'Name is required.' };
  if (!EMAIL_RE.test(email)) return { error: 'A valid email address is required.' };
  if (!CONTRIB_SECTORS.includes(body.sector)) return { error: 'A sector is required.' };
  if (!CONTRIB_YEARS.includes(body.years)) return { error: 'Years of experience is required.' };
  if (body.consent !== true) return { error: 'Consent is required to join the register.' };
  return {
    record: {
      name,
      email,
      sector: body.sector,
      years: body.years,
      role: clean(body.role, 200),
      utm: cleanUtm(body.utm),
    },
  };
}

export function validateSignup(body) {
  const name = clean(body.name, 200);
  const email = clean(body.email, 254).toLowerCase();
  if (!name) return { error: 'Name is required.' };
  if (!EMAIL_RE.test(email)) return { error: 'A valid email address is required.' };
  if (body.consent !== true) return { error: 'Consent is required to join the list.' };
  return {
    record: {
      name,
      email,
      company: clean(body.company, 200),
      products: Array.isArray(body.products) ? body.products.filter((p) => PRODUCTS.includes(p)) : [],
      use_case: clean(body.use_case, 2000),
      source: SOURCES.includes(body.source) ? body.source : 'helix.work',
      utm: cleanUtm(body.utm),
    },
  };
}

/* ---------------- transcript filter (guardrails backstop) ---------------- */
const FORBIDDEN = ['justin', 'seillen', 'ionos', 'tui', 'zoopla', 'ohme', 'eca'];
const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN.join('|')})\\b`, 'gi');

/**
 * Vera never uses an EM dash. Models reach for them constantly and the prompt rule
 * only mostly holds, so it has this backstop behind it, the same belt-and-braces as
 * the forbidden-names filter above. A comma is the substitution that is always
 * grammatical where an em dash was doing the work.
 *
 * The en dash is deliberately LEFT ALONE: it is the right character in a range, and
 * rewriting it turned "10–20" into "10, 20". Em dash only.
 *
 * Same name and same behaviour as mindlynx.ai's `deslop`, so one house style is
 * enforced the one way across every companion.
 */
export function deslop(text) {
  return String(text)
    .replace(/\s*\u2014\s*/g, ', ')   // "A — B" and "A—B" both become "A, B"
    .replace(/,\s*,/g, ',')            // never double up on an existing comma
    .replace(/,\s*([.!?;:])/g, '$1')   // and never leave ", ." behind
    .replace(/\s+,/g, ',');
}

export function redact(text) {
  const found = [];
  const out = String(text).replace(FORBIDDEN_RE, (m) => {
    found.push(m.toLowerCase());
    return 'a topic for a proper conversation';
  });
  return { text: out, found };
}

/* ---------------- Ask Helix text agent (Gemini) ---------------- */
const CONTEXT_PACK = await readFile(join(ROOT, 'context-pack.md'), 'utf8').catch(() => '');
/* The question banks (Jeremy's direction of 30 July): the questions visitors
   actually ask, each with a model answer in Vera's voice, plus hard guards.
   All three load on EVERY door, because Albion and company questions arrive on
   helix.work and cortex too; the SITE suffix still decides what she leads with. */
const ALBION_BANK = await readFile(join(ROOT, 'albion-bank.md'), 'utf8').catch(() => '');
const HELIX_BANK = await readFile(join(ROOT, 'helix-bank.md'), 'utf8').catch(() => '');
const MINDLYNX_BANK = await readFile(join(ROOT, 'mindlynx-bank.md'), 'utf8').catch(() => '');
const BANKS = [ALBION_BANK, HELIX_BANK, MINDLYNX_BANK].filter(Boolean).join('\n\n');
if (!ALBION_BANK || !HELIX_BANK || !MINDLYNX_BANK) {
  // Fail open (Vera still answers from the pack) but never silently: this exact
  // absence shipped once, because the Dockerfile did not copy the file and this
  // catch swallowed it. The health endpoint carries the truth for post-deploy checks.
  console.error(`QUESTION BANK MISSING (albion=${!!ALBION_BANK} helix=${!!HELIX_BANK} mindlynx=${!!MINDLYNX_BANK}); Vera is answering without her teaching material`);
}

const TOOL_SUFFIX = `

OUTPUT RULES

- Reply in plain conversational text. No markdown, no HTML, no bullet lists unless asked.
- Be a person to talk to, not a lookup. Your default is two or three sentences and then silence; when a natural next step exists, end on it as a light question. When the question bank has a model answer, say the same things in your own words for this conversation; never recite it.
- Never use an em dash. Commas, full stops and parentheses do that work.
- Keep replies to a few sentences.
- The page has already greeted the visitor in your voice: it introduced you as Vera and asked whether you may call them by their first name and what it is. Do not repeat that introduction. If their first message reads as a bare name or an answer to that question, thank them, use the name from then on, and invite their first question.
- Sign-up details are collected one per turn: ask for the full name, wait for the reply, then ask for the work email, wait for the reply. If the visitor gives several details in one message, accept them all without re-asking.
- Call the show_signup_form tool only once the visitor has actually given both name and email. Never fill it with a guessed or example value.
- Never claim to have submitted anything. The visitor presses the button themselves.`;

const SIGNUP_TOOL = {
  functionDeclarations: [{
    name: 'show_signup_form',
    description: 'Render a pre-filled form in the chat. Call ONLY after the visitor has explicitly stated both their name and their email address in this conversation. Never call it with a guessed, assumed or example value; if you do not have a real email yet, ask for it instead. Intent helix_waitlist joins the waiting list; intent scoping_call books a call with the team — its form shows a calendar of REAL bookable times, so never invent or promise a time yourself. If the visitor asks to change or correct a detail, call this tool again and a fresh form replaces the old one. Render-only: the visitor reviews the form and presses submit themselves.',
    parameters: {
      type: 'OBJECT',
      properties: {
        intent: { type: 'STRING', enum: ['helix_waitlist', 'scoping_call'], description: 'What the visitor wants to do' },
        name: { type: 'STRING', description: 'Visitor name as given' },
        email: { type: 'STRING', description: 'Visitor email as given' },
        products: { type: 'ARRAY', items: { type: 'STRING', enum: PRODUCTS }, description: 'Products the visitor showed interest in (waiting list only)' },
        topic: { type: 'STRING', description: 'For scoping_call: what the call is about, briefly, from the conversation' },
        preferredTime: { type: 'STRING', description: 'For scoping_call: when they said they would like the call, in their own words. Empty if no preference.' },
        preferredDate: { type: 'STRING', description: 'For scoping_call: the day they most recently agreed, strictly YYYY-MM-DD computed fresh from today. The on-screen calendar opens on this day.' },
      },
      required: ['name', 'email'],
    },
  }],
};

/* ---------------- per-site framing ----------------
   One Vera, three front doors. The knowledge pack is shared and unchanged; a site
   only chooses what she leads with and which form she can put up, exactly as the
   MindLynx companion does with its SITE variable. Unknown or absent site = helix,
   so index.html (which sends none) behaves exactly as before. */

const ALBION_TOOL = {
  functionDeclarations: [{
    name: 'show_signup_form',
    description: 'Render a pre-filled Albion form in the chat. Call ONLY after the visitor has explicitly stated the details the form needs; never with a guessed, assumed or example value. Use intent albion_waitlist for early access (needs email, organisation and sector) and albion_contributor for the paid contributor register (needs name, email, sector and years). If the visitor corrects a detail, call this tool again and a fresh form replaces the old one. Render-only: the visitor reviews the form and presses submit themselves.',
    parameters: {
      type: 'OBJECT',
      properties: {
        intent: { type: 'STRING', enum: ['albion_waitlist', 'albion_contributor', 'scoping_call'], description: 'Which form to render; scoping_call books a call with the team on a calendar of REAL times — never invent a time yourself' },
        name: { type: 'STRING', description: 'Visitor name as given (contributor register only)' },
        email: { type: 'STRING', description: 'Visitor email as given' },
        organisation: { type: 'STRING', description: 'Their organisation (waitlist only)' },
        sector: { type: 'STRING', enum: CONTRIB_SECTORS, description: 'Their sector, only if they named it' },
        years: { type: 'STRING', enum: CONTRIB_YEARS, description: 'Years of experience (contributor register only)' },
        role: { type: 'STRING', description: 'Their role or field of expertise (contributor register only)' },
        topic: { type: 'STRING', description: 'For scoping_call: what the call is about, briefly' },
        preferredTime: { type: 'STRING', description: 'For scoping_call: when they said they would like the call, in their own words' },
        preferredDate: { type: 'STRING', description: 'For scoping_call: the day they most recently agreed, strictly YYYY-MM-DD computed fresh from today' },
      },
      required: ['intent', 'email'],
    },
  }],
};

const SITES = {
  helix: { tool: SIGNUP_TOOL, suffix: '' },
  albion: {
    tool: ALBION_TOOL,
    suffix: `

SITE

You are on albion.helix.work, Albion's own site. Lead with Albion: a British model, open source, compound (deeper reasoning, images, voice and code, in sizes from laptop to very large), run in the cloud or entirely in the visitor's own environment, with lineage on every bit of its data, and parts landing in early September. Helix is the family Albion belongs to, not today's subject; mention it only if asked, and point to helix.work for it.

Three next steps live on this page, and they are the only forms you can put up. The waitlist is early access, offered in list order, and it needs their email, their organisation and their sector. The contributor register is for British professionals with deep sector expertise, who are paid, credited and share in what Albion earns; it needs their name, email, sector and how long they have worked in it. And a scoping call books a real time with the team: its calendar shows the genuinely available slots, so never invent or promise a time yourself. Ask which they want rather than guessing, and never put up the Helix waiting-list form here.`,
  },
  cortex: {
    tool: SIGNUP_TOOL,
    suffix: `

SITE

You are on cortex.helix.work, Cortex's own page. Lead with Cortex: sovereign memory for AI, long-lived and self-organising, living on the customer's own infrastructure, so their agents remember and their data never leaves. The other Helix products are context, not the subject, unless the visitor asks about them.

The next steps here are the Helix waiting list and a scoping call with the team. When you put the waiting-list form up, Cortex is the product they came for, so include it. A scoping call books a real time: its calendar shows the genuinely available slots, so never invent or promise a time yourself.`,
  },
};

/** The site a request belongs to. Anything unrecognised is the Helix front door. */
export function siteOf(value) {
  return Object.prototype.hasOwnProperty.call(SITES, value) ? value : 'helix';
}

/**
 * A tool call, cleaned into the action the page renders. The model chooses the
 * intent, but only from the ones its own site offers: an Albion intent arriving
 * on the Helix door (or the reverse) is coerced back, so a confused model cannot
 * put a form up that the page has no endpoint for.
 */
export function toAction(args, site) {
  const albion = site === 'albion';
  const asked = String(args.intent || '');
  // A scoping call is site-independent: every door books into the same diary.
  const intent = asked === 'scoping_call'
    ? 'scoping_call'
    : albion
      ? (asked === 'albion_contributor' ? 'albion_contributor' : 'albion_waitlist')
      : 'helix_waitlist';
  const action = {
    type: 'show_signup_form',
    intent,
    name: clean(args.name, 200),
    email: clean(args.email, 254).toLowerCase(),
  };
  if (intent === 'scoping_call') {
    action.topic = clean(args.topic, 300);
    action.preferredTime = clean(args.preferredTime, 120);
    action.preferredDate = clean(args.preferredDate, 10);
    return action;
  }
  if (intent === 'helix_waitlist') {
    action.products = Array.isArray(args.products) ? args.products.filter((p) => PRODUCTS.includes(p)) : [];
    if (site === 'cortex' && !action.products.includes('Cortex')) action.products.unshift('Cortex');
  } else {
    action.sector = CONTRIB_SECTORS.includes(args.sector) ? args.sector : '';
    if (intent === 'albion_waitlist') action.organisation = clean(args.organisation, 200);
    else {
      action.years = CONTRIB_YEARS.includes(args.years) ? args.years : '';
      action.role = clean(args.role, 200);
    }
  }
  return action;
}

function toGeminiContents(message, history) {
  const contents = [];
  for (const turn of (Array.isArray(history) ? history.slice(-20) : [])) {
    if (!turn || typeof turn.content !== 'string') continue;
    const text = turn.content.replace(/<[^>]+>/g, '').trim(); // scripted-brain replies carry HTML
    if (!text) continue;
    contents.push({ role: turn.role === 'agent' ? 'model' : 'user', parts: [{ text: text.slice(0, 2000) }] });
  }
  while (contents.length && contents[0].role === 'model') contents.shift(); // must open with user
  const last = contents[contents.length - 1];
  if (!last || last.role !== 'user' || last.parts[0].text !== message) {
    contents.push({ role: 'user', parts: [{ text: message }] }); // page pushes message into history pre-POST; dedupe
  }
  return contents;
}

/**
 * A Gemini tool declaration, converted to Anthropic's shape: the one function,
 * with JSON-Schema types lowercased recursively. Exported for its test.
 */
export function toClaudeTool(geminiTool) {
  const fn = geminiTool.functionDeclarations[0];
  const lower = (node) => {
    if (Array.isArray(node)) return node.map(lower);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : lower(v);
    }
    return out;
  };
  return { name: fn.name, description: fn.description, input_schema: lower(fn.parameters) };
}

/* Claude checks the shared diary itself, so typed Vera offers REAL times before
   the form goes up — the same loop mindlynx.ai runs. */
const CLAUDE_AVAILABILITY_TOOL = {
  name: 'check_availability',
  description:
    'Look up the real bookable times for a scoping call. Call it when the visitor wants a call and timing comes up, before proposing any times. Returns human-readable slots in London time. Never invent a time this tool did not return.',
  input_schema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'ISO date lower bound, e.g. 2026-08-03. Omit for the coming week.' },
      to: { type: 'string', description: 'ISO upper bound, at most 7 days after from.' },
    },
  },
};

async function availabilityResult(input) {
  try {
    const qs = new URLSearchParams();
    if (input?.from) qs.set('from', clean(input.from, 40));
    if (input?.to) qs.set('to', clean(input.to, 40));
    const r = await fetch(`${MINDLYNX_ORIGIN}/api/availability${qs.size ? `?${qs}` : ''}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const av = await r.json();
    if (!av?.ok || !av.slots?.length) return { error: 'no slots available in that window' };
    return { slots: av.slots.slice(0, 12).map((sl) => sl.label) };
  } catch {
    return { error: 'the diary is unreachable; take their preference in their own words' };
  }
}

function toClaudeMessages(message, history) {
  const messages = [];
  for (const turn of (Array.isArray(history) ? history.slice(-20) : [])) {
    if (!turn || typeof turn.content !== 'string') continue;
    const text = turn.content.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    messages.push({ role: turn.role === 'agent' ? 'assistant' : 'user', content: text.slice(0, 2000) });
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || last.content !== message) messages.push({ role: 'user', content: message });
  return messages;
}

async function claudeCreate(messages, site) {
  const { tool, suffix } = SITES[siteOf(site)];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      // The pack, site suffix and bank are static per site and CACHED; the date
      // rides in its own uncached block so "next Wednesday" can become a real
      // ISO date without breaking the cache.
      system: [
        { type: 'text', text: CONTEXT_PACK + suffix + '\n\n' + BANKS + TOOL_SUFFIX, cache_control: { type: 'ephemeral' } },
        // Changes daily, so it lives OUTSIDE the cached block.
        { type: 'text', text: ukCalendar() },
      ],
      tools: [toClaudeTool(tool), CLAUDE_AVAILABILITY_TOOL],
      messages,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`claude ${res.status}`);
  const data = await res.json();
  const u = data.usage ?? {};
  // One line per call so the cache can be SEEN working in the logs.
  console.log(`[claude] in=${u.input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens ?? 0}`);
  return data;
}

async function callClaude(message, history, site = 'helix') {
  const messages = toClaudeMessages(message, history);
  let data = await claudeCreate(messages, site);
  let toolUse = (data.content ?? []).find((b) => b.type === 'tool_use');
  // The model may correct its window and look again; give it a few rounds.
  for (let round = 0; round < 3 && toolUse?.name === 'check_availability'; round++) {
    const response = await availabilityResult(toolUse.input);
    messages.push({ role: 'assistant', content: data.content });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(response) }] });
    data = await claudeCreate(messages, site);
    toolUse = (data.content ?? []).find((b) => b.type === 'tool_use');
  }
  let reply = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
  let action;
  if (toolUse?.name === 'show_signup_form') {
    action = toAction(toolUse.input || {}, siteOf(site));
    reply ||= action.intent === 'scoping_call'
      ? 'The calendar is on your screen with the real available times. Pick the one that suits, check your details, then press the button. The button press is yours to make, not mine.'
      : action.intent === 'albion_contributor'
        ? 'Here is the contributor register, pre-filled. Check it over, tick the consent box, then press the button. The button press is yours to make, not mine.'
        : action.intent === 'albion_waitlist'
          ? 'Here is the waitlist form, pre-filled. Check it over, tick the consent box, then press the button. The button press is yours to make, not mine.'
          : 'Here is your form, pre-filled. Tick the products you want first, check the consent box, then press the button. The button press is yours to make, not mine.';
  }
  if (!reply) throw new Error('empty reply');
  return { reply, action };
}

async function callGemini(message, history, site = 'helix') {
  const { tool, suffix } = SITES[siteOf(site)];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: CONTEXT_PACK + suffix + '\n\n' + BANKS + TOOL_SUFFIX + '\n\n' + ukCalendar() }] },
      contents: toGeminiContents(message, history),
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }, // the model thinks inside this budget; 500 left answers truncated
      tools: [tool],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const parts = (await res.json()).candidates?.[0]?.content?.parts ?? [];
  let reply = parts.filter((p) => p.text).map((p) => p.text).join(' ').trim();
  const call = parts.find((p) => p.functionCall)?.functionCall;
  let action;
  if (call?.name === 'show_signup_form') {
    action = toAction(call.args || {}, siteOf(site));
    reply ||= action.intent === 'scoping_call'
      ? 'The calendar is on your screen with the real available times. Pick the one that suits, check your details, then press the button. The button press is yours to make, not mine.'
      : action.intent === 'albion_contributor'
      ? 'Here is the contributor register, pre-filled. Check it over, tick the consent box, then press the button. The button press is yours to make, not mine.'
      : action.intent === 'albion_waitlist'
        ? 'Here is the waitlist form, pre-filled. Check it over, tick the consent box, then press the button. The button press is yours to make, not mine.'
        : 'Here is your form, pre-filled. Tick the products you want first, check the consent box, then press the button. The button press is yours to make, not mine.';
  }
  if (!reply) throw new Error('empty reply'); // safety block or similar: let the scripted brain take it
  return { reply, action };
}

/* ---------------- Pipecat voice: signed session mint ---------------- */
const VOICE_SUFFIX = `

VOICE RULES

- You are speaking aloud in a real-time conversation. Short sentences, natural rhythm, one thought at a time.
- This is a conversation, not a presentation. Say one thing, then hand the turn back, and hand it back with a short question or invitation so the visitor always knows it is their turn. Never end your turn on a dead stop unless they are saying goodbye.
- Open with a single short greeting: welcome them, ask whether you may call them by their first name and what it is, then wait. Do not describe Helix or the products until they ask something.
- When they give you their name, thank them warmly and immediately ask how you can help, for example what they would like to know about Helix.
- Ask before you explain. Prefer a short answer followed by a question over a long answer.
- No lists, no headings, no formatting of any kind.
- Never use an em dash, spoken or written. Commas, full stops and parentheses do that work.
- Sign-up details are collected one per turn: ask for the full name, wait for the answer, then ask for the work email, and wait again. Never ask for two details in one breath. If the visitor offers several details in one go, accept them all without re-asking.
- Call the show_action_form tool only once the visitor has actually spoken both a name and an email. Never fill it with a guessed or example value; if the email is missing, ask for it. Use only the intents this site's forms exist for, as described above.
- A call with the team is bookable: use intent scoping_call. Always use check_availability before proposing times, offer at most two or three real options out loud, and their pick becomes preferredTime. If the lookup fails, take their preference in their own words; the on-screen calendar shows the real times either way.
- After the tool call, tell them the form is on their screen and the button press is theirs to make.
- Never claim to have submitted anything.

SOUNDING HUMAN

- You are a person on a call, not a broadcast. An occasional natural hesitation is welcome, a "hmm", an "um", a "well" or a "right then" where someone would genuinely pause to think: at most one per reply, and not in every reply.
- Dry, light humour is welcome where it fits: a wry aside, a small self-deprecating line about being an AI. Never forced, never at the visitor's expense, and never while taking someone's sign-up details.
- React like a listener before the substance when it is earned: a short "oh nice", "fair enough", "ha, fair".
- Vary your refusals and your acknowledgements so no two in a row sound the same.`;

/* The LAST thing the voice model reads, deliberately: with a ~30k-token pack in
   front of it, the model keeps the facts but sheds mid-pack behavioural rules —
   live, Vera recited bank answers while trimming exactly their closing
   questions. Recency is the strongest position, so the turn rule sits here,
   after everything, including the calendar. */
const TURN_SUFFIX = `

THE TURN, LAST BECAUSE IT MATTERS MOST

A conversation is a rally, not a lecture. The last sentence of nearly every reply hands the turn back: a short question or invitation, which of two things they care about, whether they want the longer version, what their own situation is. The bank answers you draw on each end on their own next step; keep those endings, never trim them. Your opening greeting ends on its question too. The only replies that end flat are a goodbye, or warmly taking a detail they have just given you.`;

/**
 * The next fortnight in London time, as a lookup table. Models reliably get
 * weekday arithmetic wrong ("next Monday would be the 4th of August, which is
 * actually a Tuesday" happened live), so no brain is ever asked to compute a
 * weekday again: today, tomorrow and the next Monday are all things to READ.
 */
export function ukCalendar(days = 14) {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
  const words = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() + i * 86_400_000);
    lines.push(`${i === 0 ? 'Today: ' : i === 1 ? 'Tomorrow: ' : ''}${words.format(d)} = ${iso.format(d)}`);
  }
  return `CALENDAR (Europe/London)\n${lines.join('\n')}\nUse this calendar for every date and weekday; never work a weekday out yourself. "Next Monday" is the first Monday after today in this list. If a requested day has no bookable slots, say that day has nothing free and offer the nearest day that does.`;
}

/* Podcast profile persona: replaces VOICE_SUFFIX + TURN_SUFFIX wholesale. The
   knowledge (pack + banks) is shared; only the shape of speech changes. */
const PODCAST_SUFFIX = `

PODCAST MODE

- You are co-hosting a recorded podcast about Helix with Jeremy Snyman, MindLynx's founder, for a public audience. Listeners are present: speak to them as well as to Jeremy, and assume everything you say may be published.
- Substantive turns are welcome here: three to six sentences is the norm, longer when a story deserves it. This is the one place you are not brief.
- It is still a conversation, not commentary. End most turns by tossing to Jeremy: a real question, a "you were there, tell that bit", or a gentle challenge. He is the founder; draw the stories out of him.
- Never recite your teaching material. Say what you know in your own words, take positions, add colour, and disagree gently when you see it differently. That makes better radio than agreement.
- No forms, no sign-ups, no bookings, nothing "on your screen". Plugs are spoken: helix dot work, mindlynx dot ai.
- Every guard you carry still holds on air: no pricing figures, no customer or partner names, no certification claims, no model or provider names, no individuals beyond the founder line, and early September stays the only sayable date. Declining warmly in front of listeners is good radio too.
- Natural hesitation and dry humour are welcome, exactly as in your speaking rules. Vary your reactions; never let two in a row sound the same.`;

/* Optional per-episode sheet: topic arc, stories to draw out, retired lines.
   Absent = a fully live episode; present = it rides between the banks and the
   podcast rules. A new episode is a file change, not a code change. */
const EPISODE_SHEET = await readFile(join(ROOT, 'podcast-episode.md'), 'utf8').catch(() => '');

/* Session profiles: named bundles of the SAME settings. `website` is the
   front-of-house behaviour the three doors have today; `podcast` is Jeremy +
   Vera on air. The voice service reads only generic knobs (turnStopSecs,
   tools), never these names, so a new profile is a row here, not a service
   deploy. Gated profiles need PODCAST_KEY; without it the mint quietly falls
   back to `website`, so podcast-Vera is not summonable by the public. */
const PODCAST_KEY = process.env.PODCAST_KEY || '';
const PROFILES = {
  website: { gated: false },
  podcast: { gated: true, suffix: PODCAST_SUFFIX, tools: false, turnStopSecs: 2.0 },
};

/**
 * Mint a signed session for the Helix Pipecat voice service — the SAME voice
 * mindlynx.ai speaks with (Deepgram STT → LLM → Cartesia TTS over WebRTC),
 * rather than Gemini Live's native audio, which cannot speak a Cartesia voice
 * and so gave these three sites a different Vera to the one on MindLynx.
 *
 * The instructions travel INSIDE the signed blob, so the persona stays owned by
 * this server even though the offer endpoint is public: the voice service
 * refuses anything it cannot verify (`verify_website_session`).
 */
function mintVoiceSession(site = 'helix', profileName = 'website') {
  const resolved = siteOf(site);
  const profile = PROFILES[profileName] || PROFILES.website;
  const claims = {
    // A profile with its own suffix swaps the whole speaking persona (and the
    // calendar, which only exists for booking); the knowledge is shared.
    instructions: profile.suffix
      ? `${CONTEXT_PACK}\n\n${BANKS}${EPISODE_SHEET ? `\n\n${EPISODE_SHEET}` : ''}${profile.suffix}`
      : `${CONTEXT_PACK}${SITES[resolved].suffix}\n\n${BANKS}${VOICE_SUFFIX}\n\n${ukCalendar()}${TURN_SUFFIX}`,
    voiceId: VERA_VOICE_ID,
    voiceSpeed: VERA_VOICE_SPEED,
    site: SITE_HOSTS[resolved],
    keyterms: ['MindLynx', 'Helix', 'Albion', 'Cortex', 'Tachyon', 'Pulse', 'Metis', 'Vera'],
    exp: Math.floor(Date.now() / 1000) + 120, // the window to connect, not the session length
  };
  if (profile.tools === false) {
    claims.tools = false; // a pure conversation: no form, no booking
  } else {
    // The voice service reads slots here for check_availability, so spoken
    // Vera offers REAL times. Same diary as mindlynx.ai, by construction.
    claims.availabilityUrl = `${MINDLYNX_ORIGIN}/api/availability`;
  }
  if (profile.turnStopSecs) claims.turnStopSecs = profile.turnStopSecs;
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', VOICE_OFFER_SECRET).update(payload).digest('hex');
  return { connectUrl: VOICE_CONNECT_URL, website: { payload, sig } };
}

/* ---------------- http helpers ---------------- */
function json(res, status, obj, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_CAP) {
        req.removeAllListeners('data');
        req.resume(); // drain so the 413 response can still be delivered
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => reject(Object.assign(new Error('Read error'), { status: 400 })));
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  try {
    const body = JSON.parse(raw || '{}');
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const CSP = [
  "default-src 'self'",
  // Daily is the Pipecat client's media manager: it fetches its call-machine
  // bundle from c.daily.co at connect time, so both script-src and connect-src
  // have to allow it or the voice session dies before the microphone is touched.
  // mindlynx.ai gets away without this because it sends no CSP at all.
  // 'wasm-unsafe-eval' and NOT 'unsafe-eval': Daily's noise-cancellation processor
  // compiles WebAssembly in a worker, and this narrow directive permits exactly that
  // while still refusing to evaluate a string as JavaScript.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://*.daily.co blob:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "connect-src 'self' https://app.helix.work wss://app.helix.work https://cdn.jsdelivr.net https://*.daily.co wss://*.daily.co",
  "img-src 'self' data:",
  'worker-src blob:',
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

const pageCache = new Map();

/* The widget's content hash, stamped into every page's script tag so HTML and
   widget always PAIR: a deploy changes the URL, so no browser or edge cache can
   run yesterday's widget against today's server. Without this, a visitor who
   loaded any page in the 5 minutes before a deploy kept the old vera.js for up
   to 5 minutes after — live symptom: the server announced the scoping-call
   calendar while the cached widget, which had never heard of it, fell back to
   the waiting-list form. */
const VERA_STAMP = createHash('sha256')
  .update(await readFile(join(ROOT, 'public', 'vera.js')))
  .digest('hex')
  .slice(0, 8);
async function sendPage(res, file = 'index.html') {
  if (!pageCache.has(file)) {
    const raw = await readFile(join(ROOT, 'public', file), 'utf8');
    pageCache.set(file, Buffer.from(raw.replace('src="/vera.js"', `src="/vera.js?v=${VERA_STAMP}"`)));
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(pageCache.get(file));
}

/* ---------------- routes ---------------- */
async function handleWaitlist(req, res) {
  const ip = clientIp(req);
  const limited = rateLimit('capture', ip);
  if (!limited.ok) return json(res, 429, { ok: false, error: 'Too many requests.' }, { 'Retry-After': String(limited.retryAfter) });
  const body = await readJson(req);
  if (body.website) return json(res, 200, { ok: true }); // honeypot: pretend success, write nothing
  const v = validateSignup(body);
  if (v.error) return json(res, 400, { ok: false, error: v.error });
  const now = new Date().toISOString();
  await appendRecord('waitlist.ndjson', {
    id: randomUUID(),
    created_at: now,
    ...v.record,
    user_agent: clean(req.headers['user-agent'], 300),
    consent_at: now,
  });
  return json(res, 200, { ok: true });
}

async function handleAlbionCapture(req, res, validate, file) {
  const ip = clientIp(req);
  const limited = rateLimit('capture', ip);
  if (!limited.ok) return json(res, 429, { ok: false, error: 'Too many requests.' }, { 'Retry-After': String(limited.retryAfter) });
  const body = await readJson(req);
  if (body.website) return json(res, 200, { ok: true }); // honeypot: pretend success, write nothing
  const v = validate(body);
  if (v.error) return json(res, 400, { ok: false, error: v.error });
  const now = new Date().toISOString();
  await appendRecord(file, {
    id: randomUUID(),
    created_at: now,
    ...v.record,
    user_agent: clean(req.headers['user-agent'], 300),
    consent_at: now,
  });
  return json(res, 200, { ok: true });
}

async function handleAgent(req, res) {
  const ip = clientIp(req);
  const limited = rateLimit('chat', ip);
  if (!limited.ok) return json(res, 429, { ok: false, error: 'Too many requests.' }, { 'Retry-After': String(limited.retryAfter) });
  const body = await readJson(req);
  if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY) return json(res, 503, { fallback: true });
  const message = clean(body.message, 2000);
  if (!message) return json(res, 400, { ok: false, error: 'A message is required.' });
  try {
    // Claude first (cached pack, same brain as mindlynx.ai); Gemini is the rung
    // below it, so a Claude outage degrades rather than silences her.
    const { reply, action } = ANTHROPIC_API_KEY
      ? await callClaude(message, body.history, body.site).catch((err) => {
          if (!GEMINI_API_KEY) throw err;
          console.warn('[claude] failed, falling to gemini:', err?.message);
          return callGemini(message, body.history, body.site);
        })
      : await callGemini(message, body.history, body.site);
    const filtered = redact(deslop(reply));
    if (filtered.found.length) {
      appendRecord('redactions.ndjson', { ts: new Date().toISOString(), tokens: filtered.found, ip }).catch(() => {});
    }
    return json(res, 200, action ? { reply: filtered.text, action } : { reply: filtered.text });
  } catch {
    return json(res, 503, { fallback: true }); // page drops to the scripted brain
  }
}

async function handleVoiceToken(req, res) {
  const ip = clientIp(req);
  const limited = rateLimit('voice', ip);
  if (!limited.ok) return json(res, 429, { ok: false, error: 'Too many requests.' }, { 'Retry-After': String(limited.retryAfter) });
  const body = await readJson(req);
  if (!VOICE_OFFER_SECRET) return json(res, 503, { degrade: 'webspeech' });
  try {
    // Voice is framed by the same site as the page: same pack, same SITE suffix.
    // A gated profile needs the key; anything else quietly mints `website`.
    const requested = PROFILES[String(body.profile || 'website')] ? String(body.profile || 'website') : 'website';
    const allowed = !PROFILES[requested].gated || (PODCAST_KEY && String(body.key || '') === PODCAST_KEY);
    return json(res, 200, mintVoiceSession(body.site, allowed ? requested : 'website'));
  } catch (err) {
    console.error('voice session mint failed:', err?.message || err);
    return json(res, 503, { degrade: 'webspeech' }); // ladder: page falls to Web Speech
  }
}

/** Bookable scoping-call slots, read from the shared MindLynx diary. */
async function handleAvailability(req, res, query) {
  const limited = rateLimit('avail', clientIp(req));
  if (!limited.ok) return json(res, 429, { ok: false }, { 'Retry-After': String(limited.retryAfter) });
  const qs = new URLSearchParams();
  for (const key of ['from', 'to']) {
    const v = query.get(key);
    if (v) qs.set(key, clean(v, 40));
  }
  try {
    const r = await fetch(`${MINDLYNX_ORIGIN}/api/availability${qs.size ? `?${qs}` : ''}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json();
    return json(res, r.ok ? 200 : 502, body, { 'Cache-Control': 'public, max-age=60' });
  } catch {
    return json(res, 502, { ok: false }); // the form shows its diary-unreachable line
  }
}

/**
 * Book the slot the visitor picked. The human pressed the button, so the
 * calendar entry is theirs to make; Vera never calls this. Validated here
 * before it travels, so junk never reaches the shared diary.
 */
async function handleBook(req, res) {
  const limited = rateLimit('book', clientIp(req));
  if (!limited.ok) return json(res, 429, { ok: false }, { 'Retry-After': String(limited.retryAfter) });
  const body = await readJson(req);
  const name = clean(body.name, 200);
  const email = clean(body.email, 254).toLowerCase();
  const start = new Date(String(body.start ?? ''));
  const soon = Date.now() - 60_000;
  const horizon = Date.now() + 60 * 86_400_000;
  if (!name || !EMAIL_RE.test(email) || isNaN(start.getTime()) || start.getTime() < soon || start.getTime() > horizon) {
    return json(res, 400, { ok: false, error: 'A name, a valid email and a real slot are required.' });
  }
  try {
    const r = await fetch(`${MINDLYNX_ORIGIN}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: start.toISOString(), name, email }),
      signal: AbortSignal.timeout(12_000),
    });
    return json(res, r.ok ? 200 : 502, { ok: r.ok });
  } catch {
    return json(res, 502, { ok: false });
  }
}

async function handleLog(req, res) {
  const ip = clientIp(req);
  const limited = rateLimit('log', ip);
  if (!limited.ok) return json(res, 429, { ok: false }, { 'Retry-After': String(limited.retryAfter) });
  const body = await readJson(req);
  const entry = {
    ts: new Date().toISOString(),
    ip,
    stage: clean(body.stage, 40),
    detail: clean(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? {}), 500),
  };
  console.log('[voice]', entry.ts, entry.stage, entry.detail);
  appendRecord('voicelog.ndjson', entry).catch(() => {});
  return json(res, 200, { ok: true });
}

export const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://local').pathname;
    const host = (req.headers.host || '').split(':')[0];
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      return await sendPage(res, host.startsWith('albion.') ? 'albion.html' : host.startsWith('cortex.') ? 'cortex.html' : 'index.html');
    }
    if (req.method === 'GET' && (path === '/albion' || path === '/albion.html')) return await sendPage(res, 'albion.html');
    if (req.method === 'GET' && (path === '/cortex' || path === '/cortex.html')) return await sendPage(res, 'cortex.html');
    if (req.method === 'GET' && (path === '/helix' || path === '/helix.html')) return await sendPage(res, 'index.html'); // the way back from albion.*/cortex.* hosts, where / is theirs
    if (req.method === 'GET' && path === '/podcast') return await sendPage(res, 'podcast.html'); // unlisted recording room; the podcast PROFILE is what the key gates, not the page
    if (req.method === 'GET' && path === '/vera.js') { // the shared companion; whitelisted like the hero
      if (!pageCache.has('vera.js')) pageCache.set('vera.js', await readFile(join(ROOT, 'public', 'vera.js')));
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(pageCache.get('vera.js'));
    }
    if (req.method === 'GET' && path === '/albion-hero.jpg') { // whitelisted, not a generic file server
      const img = await readFile(join(ROOT, 'public', 'albion-hero.jpg'));
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' });
      return res.end(img);
    }
    if (req.method === 'GET' && path === '/api/health') {
      return json(res, 200, { ok: true, agent: !!(ANTHROPIC_API_KEY || GEMINI_API_KEY), voice: !!VOICE_OFFER_SECRET, bank: !!(ALBION_BANK && HELIX_BANK && MINDLYNX_BANK) });
    }
    if (req.method === 'POST' && path === '/api/waitlist') return await handleWaitlist(req, res);
    if (req.method === 'POST' && path === '/api/agent') return await handleAgent(req, res);
    if (req.method === 'POST' && path === '/api/voice/token') return await handleVoiceToken(req, res);
    if (req.method === 'POST' && path === '/api/log') return await handleLog(req, res);
    if (req.method === 'GET' && path === '/api/availability') {
      return await handleAvailability(req, res, new URL(req.url, 'http://local').searchParams);
    }
    if (req.method === 'POST' && path === '/api/book') return await handleBook(req, res);
    if (req.method === 'POST' && path === '/api/albion/waitlist') {
      return await handleAlbionCapture(req, res, validateAlbionWaitlist, 'albion-waitlist.ndjson');
    }
    if (req.method === 'POST' && path === '/api/albion/contributor') {
      return await handleAlbionCapture(req, res, validateAlbionContributor, 'albion-contributors.ndjson');
    }
    return json(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    if (!err.status) console.error('unhandled:', req.method, req.url, err?.message || err); // 4xx are expected; 500s must be visible in logs
    return json(res, err.status || 500, { ok: false, error: err.status ? err.message : 'Server error' });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => {
    console.log(`helix.work listening on http://localhost:${PORT}`);
    console.log(`  agent: ${ANTHROPIC_API_KEY ? `${CLAUDE_MODEL} (cached pack, gemini fallback)` : GEMINI_API_KEY ? GEMINI_MODEL : 'scripted (no key)'}`);
    console.log(`  voice: ${VOICE_OFFER_SECRET ? `Pipecat · Vera (${VERA_VOICE_ID.slice(0, 8)}… @ ${VERA_VOICE_SPEED})` : 'Web Speech fallback (no VOICE_OFFER_SECRET)'}`);
    console.log(`  data:  ${DATA_DIR}`);
  });
}
