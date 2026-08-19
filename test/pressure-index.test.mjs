// HELIX-PRESSURE-INDEX-RALPH-001 P02: the hosting mechanism serves the Index
// placeholder publicly. The route rides the same whitelisted-page seam as
// /cortex; no generic file server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = process.env.DATA_DIR || await mkdtemp(join(tmpdir(), 'helix-test-'));
process.env.GEMINI_API_KEY = '';
const { server } = await import('../server.mjs');

test('GET /pressure-index serves the placeholder on any host, no session', async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/pressure-index`, {
      headers: { Host: 'waitlist.helix.work' },
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /Pressure Index/);
    assert.match(body, /Issue 01/);
    assert.match(body, /28 August 2026/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
