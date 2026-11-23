/* Offline check of detect.js: synthesise a performance of each song (same plucked-string model as the prototype),
 * run the detector frame by frame at 60 Hz and print what it judged.   node tools/test_detect.js [songId] */
'use strict';
global.window = {}; require('../data/songs.js');
const DET = require('../detect.js'), SONGS = window.GT_SONGS, SR = 48000;
const only = process.argv[2], pick = process.argv[3];
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.87;
const PL = {};
function pluck(midi) {
  if (PL[midi]) return PL[midi];
  const n = Math.round(SR / DET.hz(midi)), len = Math.floor(SR * 2.4), d = new Float32Array(len), ring = new Float32Array(n);
  let prev = 0; for (let i = 0; i < n; i++) { prev = prev * 0.5 + (rnd() * 2 - 1) * 0.5; ring[i] = prev; }
  for (let i = 0; i < len; i++) { const j = i % n; d[i] = ring[j]; ring[j] = (ring[j] + ring[(j + 1) % n]) * 0.4985; }
  return PL[midi] = d;
}
function prep(s) {
  const spb = 60 / s.bpm;
  s.ev = s.notes.map(n => { const t0 = (n[0] * 4 + n[1]) * spb; return { str: n[3], fret: n[4], tech: n[5], t0, t1: t0 + Math.max(n[2] * spb, 0.1) }; });
}
// opt: jitter (s), skip (probability), shift (semitones), late (s), every (play 1 note in n), noise
function perform(s, o) {
  const end = s.ev[s.ev.length - 1].t0 + 3, x = new Float32Array(Math.ceil(end * SR)), lane = [1, 2, 3, 4, 5, 6].map(() => new Float32Array(x.length)); let k = 0;
  for (const e of s.ev) {
    if (e.tech.includes('t')) continue; k++;
    if (o.silent || rnd() < (o.skip || 0) || (o.every && k % o.every)) continue;
    const t = e.t0 + (o.late || 0) + gauss() * (o.jitter || 0), i0 = Math.max(0, Math.round(t * SR)), dead = /x/.test(e.tech), y = lane[e.str - 1];
    const b = pluck(DET.TUNING[e.str - 1] + e.fret + (o.shift || 0)), len = dead ? SR * 0.08 : b.length;
    for (let i = 0; i < 240 && i0 - 240 + i >= 0; i++) y[i0 - 240 + i] *= 1 - i / 240;       // a string sounds one note at a time
    for (let i = i0; i < Math.min(y.length, i0 + SR * 2.5); i++) y[i] = 0;
    for (let i = 0; i < len && i0 + i < y.length; i++) y[i0 + i] = b[i] * 0.3 * (dead ? Math.exp(-i / (SR * 0.015)) : 1);
  }
  for (const y of lane) for (let i = 0; i < x.length; i++) x[i] += y[i];
  if (o.noise) for (let i = 0; i < x.length; i++) x[i] += (rnd() * 2 - 1) * o.noise;
  return x;
}
function judge(s, x) {
  const d = DET.create(SR), run = DET.start(s, 0, 1e9, true), buf = new Float32Array(DET.N);
  for (let f = 0; !run.done; f++) {
    const t = f / 60, i1 = Math.round(t * SR); if (i1 > x.length + SR) break;
    for (let i = 0; i < DET.N; i++) { const j = i1 - DET.N + i; buf[i] = j >= 0 && j < x.length ? x[j] : 0; }
    DET.feed(d, buf, t); DET.step(run, d, buf, t);
  }
  return run;
}
const CASES = [['perfect', {}], ['human ±30ms, 5% skipped', { jitter: 0.03, skip: 0.05, noise: 0.004 }], ['late 120 ms', { late: 0.12 }],
  ['every 2nd note only', { every: 2 }], ['wrong: +2 semitones', { shift: 2 }], ['wrong: +1 semitone', { shift: 1 }], ['silence + noise', { silent: 1, noise: 0.01 }]];
for (const id in SONGS) {
  if (only && id !== only) continue;
  const s = SONGS[id]; prep(s); console.log(`\n${id} ${s.title}`);
  for (const [name, o] of CASES) {
    if (pick && !pick.split(',').some(p => name.startsWith(p))) continue;
    seed = 7; const r = judge(s, perform(s, o)), tot = r.g.length;
    console.log(`  ${name.padEnd(26)} P ${String(r.n[0]).padStart(4)} G ${String(r.n[1]).padStart(4)} OK ${String(r.n[2]).padStart(4)} miss ${String(r.n[3]).padStart(4)} /${tot}  acc ${(DET.acc(r) * 100).toFixed(1).padStart(5)}%  combo ${String(r.maxCombo).padStart(4)}  avg ${(r.hits ? r.sumDt / r.hits * 1000 : 0).toFixed(0)} ms  score ${r.score}/${r.max}`);
  }
}
