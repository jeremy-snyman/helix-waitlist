/** Per-product waiting-list demand: folds the store by email (last record wins). */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
const raw = await readFile(join(DATA_DIR, 'waitlist.ndjson'), 'utf8').catch(() => '');

const byEmail = new Map();
for (const line of raw.split('\n').filter(Boolean)) {
  try {
    const r = JSON.parse(line);
    if (r.email) byEmail.set(r.email, r);
  } catch { /* skip bad lines */ }
}

const counts = {};
for (const r of byEmail.values()) for (const p of r.products || []) counts[p] = (counts[p] || 0) + 1;

console.log(`Signups (unique emails): ${byEmail.size}`);
for (const [p, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${p.padEnd(14)} ${n}`);
}
