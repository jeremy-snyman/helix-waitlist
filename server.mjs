/**
 * helix.work — single-file server. Zero dependencies, plain node:http.
 * Serves the static page and four API routes:
 *   GET  /api/health       which integrations are live (page picks its ladder rungs)
 *   POST /api/waitlist     signup capture -> data/waitlist.ndjson
 *   POST /api/agent        Ask Helix text agent (Gemini) -> {reply, action?}; 503 without a key
 *   POST /api/voice/token  Gemini Live ephemeral token mint; 503 without a key
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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview';

export const PRODUCTS = ['Cortex', 'Tachyon', 'Pulse', 'Helix Agents', 'Marketplace'];
const SOURCES = ['helix.work', 'helix.work/agent'];
const BODY_CAP = 64 * 1024;

/* ---------------- rate limiter (in-memory sliding window) ---------------- */
const LIMITS = {
  capture: { max: 10, windowMs: 60_000 },
  chat: { max: 20, windowMs: 60_000 },
  voice: { max: 5, windowMs: 600_000 },
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
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
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

let pageCache = null;
async function sendPage(res) {
  pageCache ??= await readFile(join(ROOT, 'public', 'index.html'));
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(pageCache);
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

async function handleAgent(req, res) {
  const ip = clientIp(req);
  const limited = rateLimit('chat', ip);
  if (!limited.ok) return json(res, 429, { ok: false, error: 'Too many requests.' }, { 'Retry-After': String(limited.retryAfter) });
  await readJson(req); // consume + validate shape even in fallback mode
  if (!GEMINI_API_KEY) return json(res, 503, { fallback: true });
  // Filled in with the Gemini generateContent call (text agent step).
  return json(res, 503, { fallback: true });
}

async function handleVoiceToken(req, res) {
  const ip = clientIp(req);
  const limited = rateLimit('voice', ip);
  if (!limited.ok) return json(res, 429, { ok: false, error: 'Too many requests.' }, { 'Retry-After': String(limited.retryAfter) });
  await readJson(req);
  if (!GEMINI_API_KEY) return json(res, 503, { degrade: 'webspeech' });
  // Filled in with the ephemeral token mint (voice step).
  return json(res, 503, { degrade: 'webspeech' });
}

export const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://local').pathname;
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) return await sendPage(res);
    if (req.method === 'GET' && path === '/api/health') {
      return json(res, 200, { ok: true, agent: !!GEMINI_API_KEY, voice: !!GEMINI_API_KEY });
    }
    if (req.method === 'POST' && path === '/api/waitlist') return await handleWaitlist(req, res);
    if (req.method === 'POST' && path === '/api/agent') return await handleAgent(req, res);
    if (req.method === 'POST' && path === '/api/voice/token') return await handleVoiceToken(req, res);
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
