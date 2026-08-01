#!/usr/bin/env node
/* Produce a publishable episode from a recorded session.
 *
 * The voice service leaves two time-aligned WAVs in S3 per recorded session
 * (podcast/<utc-day>/<session>-user.wav and -vera.wav). This script pulls them,
 * mixes the two voices, normalises loudness for podcast delivery (-16 LUFS),
 * optionally wraps intro/outro stingers around it, and writes an mp3.
 *
 * Runs on a laptop, not a service: needs `aws` (logged in) and `ffmpeg` on PATH.
 *
 *   node tools/produce-episode.mjs <session-id> [--day YYYY-MM-DD]
 *        [--intro path.wav] [--outro path.wav] [--out episode.mp3]
 *   node tools/produce-episode.mjs --user a.wav --vera b.wav [--intro ...] [--out ...]
 *
 * The raw per-voice WAVs remain in S3 untouched — a real edit happens in a DAW
 * on those; this is the good-enough-to-publish path.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BUCKET = 'helix-pilot-voice-153389276148';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const sessionId = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
const day = opt('day') || new Date().toISOString().slice(0, 10);
const out = opt('out') || `episode-${day}.mp3`;

function run(cmd, argv, why) {
  const res = spawnSync(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (res.error?.code === 'ENOENT') {
    console.error(`${cmd} is not installed or not on PATH (needed to ${why})`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`${cmd} failed while trying to ${why}`);
    process.exit(1);
  }
}

let userWav = opt('user');
let veraWav = opt('vera');
if (!userWav || !veraWav) {
  if (!sessionId) {
    console.error('usage: produce-episode.mjs <session-id> [--day YYYY-MM-DD] [--intro w] [--outro w] [--out f]');
    process.exit(1);
  }
  const dir = mkdtempSync(join(tmpdir(), 'episode-'));
  userWav = join(dir, 'user.wav');
  veraWav = join(dir, 'vera.wav');
  for (const [name, dest] of [['user', userWav], ['vera', veraWav]]) {
    run('aws', ['s3', 'cp', `s3://${BUCKET}/podcast/${day}/${sessionId}-${name}.wav`, dest], `download the ${name} track`);
  }
}

/* One ffmpeg pass: mix the two voices (no auto-attenuation), loudness-normalise
 * to podcast delivery spec, then splice stingers around the conversation. Every
 * piece is coerced to 44.1k mono first — concat refuses mismatched inputs, and
 * stinger assets will not share the session's sample rate. */
const intro = opt('intro');
const outro = opt('outro');
const FMT = 'aresample=44100,aformat=channel_layouts=mono';
const inputs = [userWav, veraWav, intro, outro].filter(Boolean).flatMap((f) => ['-i', f]);
const mixed = `[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,${FMT}[ep]`;
const stingers = [intro && '[2:a]', outro && (intro ? '[3:a]' : '[2:a]')].filter(Boolean);
const pieces = [intro && '[s0]', '[ep]', outro && (intro ? '[s1]' : '[s0]')].filter(Boolean);
const filter = pieces.length === 1
  ? mixed.replace('[ep]', '[out]')
  : [mixed, ...stingers.map((s, n) => `${s}${FMT}[s${n}]`), `${pieces.join('')}concat=n=${pieces.length}:v=0:a=1[out]`].join(';');
run('ffmpeg', ['-y', ...inputs, '-filter_complex', filter, '-map', '[out]', '-b:a', '192k', out], 'produce the episode');
console.log(`wrote ${out}`);
