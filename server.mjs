/**
 * helix.work — single-file server. Zero dependencies, plain node:http.
 * Serves two sites off one process by Host header:
 *   waitlist.helix.work (and anything else) -> public/index.html
 *   albion.helix.work (or path /albion)     -> public/albion.html
 * API routes:
 *   GET  /api/health              which integrations are live (page picks its ladder rungs)
 *   POST /api/waitlist            Helix signup capture -> data/waitlist.ndjson
 *   POST /api/agent               Ask Helix text agent (Gemini) -> {reply, action?}; 503 without a key
 *   POST /api/voice/token         Gemini Live ephemeral token mint; 503 without a key
 *   POST /api/log                 voice telemetry -> data/voicelog.ndjson
 *   POST /api/albion/waitlist     Albion org waitlist -> data/albion-waitlist.ndjson
 *   POST /api/albion/contributor  Albion contributor register -> data/albion-contributors.ndjson
 * Single instance by design: in-memory rate limits, per-file append queues.
 */
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

try { process.loadEnvFile(); } catch { /* no .env is fine: demo mode */ }

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';

export const PRODUCTS = ['Cortex', 'Tachyon', 'Pulse', 'Helix Agents', 'Marketplace'];
const SOURCES = ['helix.work', 'helix.work/agent'];
const BODY_CAP = 64 * 1024;

/* ---------------- rate limiter (in-memory sliding window) ---------------- */
const LIMITS = {
  capture: { max: 10, windowMs: 60_000 },
  chat: { max: 20, windowMs: 60_000 },
  voice: { max: 5, windowMs: 600_000 },
  log: { max: 60, windowMs: 60_000 },
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
    },
  };
}

/* ---------------- transcript filter (guardrails backstop) ---------------- */
const FORBIDDEN = ['justin', 'seillen', 'ionos', 'tui', 'zoopla', 'ohme', 'eca'];
const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN.join('|')})\\b`, 'gi');

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

const TOOL_SUFFIX = `

OUTPUT RULES

- Reply in plain conversational text. No markdown, no HTML, no bullet lists unless asked.
- Keep replies to a few sentences.
- The page has already greeted the visitor in your voice: it introduced you as Vera and asked whether you may call them by their first name and what it is. Do not repeat that introduction. If their first message reads as a bare name or an answer to that question, thank them, use the name from then on, and invite their first question.
- Sign-up details are collected one per turn: ask for the full name, wait for the reply, then ask for the work email, wait for the reply. If the visitor gives several details in one message, accept them all without re-asking.
- Call the show_signup_form tool only once the visitor has actually given both name and email. Never fill it with a guessed or example value.
- Never claim to have submitted anything. The visitor presses the button themselves.`;

const SIGNUP_TOOL = {
  functionDeclarations: [{
    name: 'show_signup_form',
    description: 'Render the pre-filled waiting-list sign-up form in the chat. Call ONLY after the visitor has explicitly stated both their name and their email address in this conversation. Never call it with a guessed, assumed or example value; if you do not have a real email yet, ask for it instead. If the visitor asks to change or correct a detail on the form, call this tool again with the corrected values and a fresh form replaces the old one. Render-only: the visitor reviews the form and presses submit themselves.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Visitor name as given' },
        email: { type: 'STRING', description: 'Visitor email as given' },
        products: { type: 'ARRAY', items: { type: 'STRING', enum: PRODUCTS }, description: 'Products the visitor showed interest in' },
      },
      required: ['name', 'email'],
    },
  }],
};

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

async function callGemini(message, history) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: CONTEXT_PACK + TOOL_SUFFIX }] },
      contents: toGeminiContents(message, history),
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }, // the model thinks inside this budget; 500 left answers truncated
      tools: [SIGNUP_TOOL],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const parts = (await res.json()).candidates?.[0]?.content?.parts ?? [];
  let reply = parts.filter((p) => p.text).map((p) => p.text).join(' ').trim();
  const call = parts.find((p) => p.functionCall)?.functionCall;
  let action;
  if (call?.name === 'show_signup_form') {
    const args = call.args || {};
    action = {
      type: 'show_signup_form',
      name: clean(args.name, 200),
      email: clean(args.email, 254).toLowerCase(),
      products: Array.isArray(args.products) ? args.products.filter((p) => PRODUCTS.includes(p)) : [],
    };
    reply ||= 'Here is your form, pre-filled. Tick the products you want first, check the consent box, then press the button. The button press is yours to make, not mine.';
  }
  if (!reply) throw new Error('empty reply'); // safety block or similar: let the scripted brain take it
  return { reply, action };
}

/* ---------------- Gemini Live voice: ephemeral token mint ---------------- */
const VOICE_SUFFIX = `

VOICE RULES

- You are speaking aloud in a real-time conversation. Short sentences, natural rhythm, one thought at a time.
- This is a conversation, not a presentation. Say one thing, then hand the turn back, and hand it back with a short question or invitation so the visitor always knows it is their turn. Never end your turn on a dead stop unless they are saying goodbye.
- Open with a single short greeting: welcome them, ask whether you may call them by their first name and what it is, then wait. Do not describe Helix or the products until they ask something.
- When they give you their name, thank them warmly and immediately ask how you can help, for example what they would like to know about Helix.
- Ask before you explain. Prefer a short answer followed by a question over a long answer.
- No lists, no headings, no formatting of any kind.
- Sign-up details are collected one per turn: ask for the full name, wait for the answer, then ask for the work email, and wait again. Never ask for two details in one breath. If the visitor offers several details in one go, accept them all without re-asking.
- Call the show_signup_form tool only once the visitor has actually spoken both a name and an email. Never fill it with a guessed or example value; if the email is missing, ask for it.
- After the tool call, tell them the form is on their screen and the button press is theirs to make.
- Never claim to have submitted anything.`;

async function mintVoiceToken() {
  const { GoogleGenAI } = await import('@google/genai'); // the one dependency; only loaded when voice is used
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
  const now = Date.now();
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + 10 * 60_000).toISOString(),      // hard server-side session kill
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(), // window to actually connect
      liveConnectConstraints: {
        model: GEMINI_LIVE_MODEL,
        config: {
          responseModalities: ['AUDIO'],
          temperature: 0.3,
          systemInstruction: CONTEXT_PACK + VOICE_SUFFIX,
          tools: [SIGNUP_TOOL],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
      httpOptions: { apiVersion: 'v1alpha' },
    },
  });
  return token.name;
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
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net blob:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "connect-src 'self' https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://cdn.jsdelivr.net",
  "img-src 'self' data:",
  'worker-src blob:',
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

const pageCache = new Map();
async function sendPage(res, file = 'index.html') {
  if (!pageCache.has(file)) pageCache.set(file, await readFile(join(ROOT, 'public', file)));
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
  if (!GEMINI_API_KEY) return json(res, 503, { fallback: true });
  const message = clean(body.message, 2000);
  if (!message) return json(res, 400, { ok: false, error: 'A message is required.' });
  try {
    const { reply, action } = await callGemini(message, body.history);
    const filtered = redact(reply);
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
  await readJson(req);
  if (!GEMINI_API_KEY) return json(res, 503, { degrade: 'webspeech' });
  try {
    const token = await mintVoiceToken();
    return json(res, 200, { token, model: GEMINI_LIVE_MODEL });
  } catch (err) {
    console.error('voice token mint failed:', err?.message || err);
    return json(res, 503, { degrade: 'webspeech' }); // ladder: page falls to Web Speech
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
    const albionHost = (req.headers.host || '').split(':')[0].startsWith('albion.');
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      return await sendPage(res, albionHost ? 'albion.html' : 'index.html');
    }
    if (req.method === 'GET' && (path === '/albion' || path === '/albion.html')) return await sendPage(res, 'albion.html');
    if (req.method === 'GET' && path === '/api/health') {
      return json(res, 200, { ok: true, agent: !!GEMINI_API_KEY, voice: !!GEMINI_API_KEY });
    }
    if (req.method === 'POST' && path === '/api/waitlist') return await handleWaitlist(req, res);
    if (req.method === 'POST' && path === '/api/agent') return await handleAgent(req, res);
    if (req.method === 'POST' && path === '/api/voice/token') return await handleVoiceToken(req, res);
    if (req.method === 'POST' && path === '/api/log') return await handleLog(req, res);
    if (req.method === 'POST' && path === '/api/albion/waitlist') {
      return await handleAlbionCapture(req, res, validateAlbionWaitlist, 'albion-waitlist.ndjson');
    }
    if (req.method === 'POST' && path === '/api/albion/contributor') {
      return await handleAlbionCapture(req, res, validateAlbionContributor, 'albion-contributors.ndjson');
    }
    return json(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    return json(res, err.status || 500, { ok: false, error: err.status ? err.message : 'Server error' });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => {
    console.log(`helix.work listening on http://localhost:${PORT}`);
    console.log(`  agent: ${GEMINI_API_KEY ? GEMINI_MODEL : 'scripted (no GEMINI_API_KEY)'}`);
    console.log(`  voice: ${GEMINI_API_KEY ? GEMINI_LIVE_MODEL : 'Web Speech fallback'}`);
    console.log(`  data:  ${DATA_DIR}`);
  });
}
