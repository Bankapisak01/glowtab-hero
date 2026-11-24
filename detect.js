/* GlowTab Ranked — note detection + judging core (no DOM, no Web Audio: runs in the browser and in node).
 *
 * Score-informed: the game knows which note is due, so it only has to answer "did THIS pitch start inside its
 * timing window?". Two detectors answer that:
 *   1. YIN pitch tracker (strict)  — one clear note at a time.
 *   2. Tone-rise test (Goertzel)   — the due pitch got louder while other strings keep ringing (arpeggios, chords).
 * Both need a fresh start (a pick attack or a pitch change), so a note left ringing cannot score the next one.
 * Stand-in for the app's own detection pipeline; thresholds were tuned with tools/test_detect.js.
 */
'use strict';
(function (root) {
  const TUNING = [64, 59, 55, 50, 45, 40];
  const N = 4096;                       // analysis buffer handed in by the host (the most recent samples)
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const HANN = new Float32Array(N); for (let i = 0; i < N; i++) HANN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));

  function create(sr) {
    return { sr, rms: 0, slow: 0, attackT: -9, lastAtk: -9, pickT: -9, hist: [0, 0, 0, 0, 0, 0], last: 0, midi: 0, conf: 0, note: 0, noteT: -9, yb: new Float32Array(1100) };
  }

  // YIN on the last 2048 samples → [midi (float), confidence]
  function yin(d, buf) {
    const W = 1024, off = N - 2048, sr = d.sr, tMin = Math.floor(sr / 1500), tMax = Math.min(1023, Math.ceil(sr / 70)), y = d.yb;
    let sum = 0, best = -1; y[0] = 1;
    for (let tau = 1; tau <= tMax; tau++) {
      let s = 0; for (let j = 0; j < W; j++) { const v = buf[off + j] - buf[off + j + tau]; s += v * v; }
      sum += s; y[tau] = sum > 0 ? s * tau / sum : 1;
      if (best < 0 && tau > tMin + 1 && y[tau - 1] < 0.14 && y[tau - 1] <= y[tau] && y[tau - 1] <= y[tau - 2]) { best = tau - 1; break; }
    }
    if (best < 0) return [0, 0];
    const a = y[best - 1], b = y[best], c = y[best + 1], den = a - 2 * b + c, sh = den ? 0.5 * (a - c) / den : 0;
    return [69 + 12 * Math.log2(sr / (best + sh) / 440), 1 - b];
  }

  // amplitude of a sinusoid at f over the whole buffer (Hann-weighted Goertzel)
  function tone(d, buf, f) {
    const w = 2 * Math.PI * f / d.sr, k = 2 * Math.cos(w); let s1 = 0, s2 = 0;
    for (let i = 0; i < N; i++) { const s0 = buf[i] * HANN[i] + k * s1 - s2; s2 = s1; s1 = s0; }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / (N / 4);
  }

  // one analysis frame; t = song time of the newest sample (seconds)
  function feed(d, buf, t) {
    let e = 0, es = 0; for (let i = N - 2048; i < N; i++) e += buf[i] * buf[i];
    // pick attack = a burst of high-frequency energy (first difference), which a ringing string no longer has
    for (let i = N - 384; i < N; i++) { const v = buf[i] - buf[i - 1]; es += v * v; }
    d.rms = Math.sqrt(e / 2048); const sh = Math.sqrt(es / 384);
    if (d.rms > 0.008 && sh > d.slow * 1.5 + 0.0012 && t - d.lastAtk > 0.07) { d.attackT = t - 0.004; d.lastAtk = t; }
    d.slow = sh > d.slow ? d.slow + (sh - d.slow) * 0.5 : d.slow * 0.9 + sh * 0.1;
    // a real pick also makes the whole signal louder than it was a moment ago. A ringing string only fades, so the
    // crackle in its decay can look like an attack but never like a pick. Hold-On moves on only for a pick.
    let ew = 0; for (let i = N - 512; i < N; i++) ew += buf[i] * buf[i];
    const now = Math.sqrt(ew / 512), floor = Math.min.apply(null, d.hist);
    if (d.attackT >= t - 0.06 && now > floor * 1.3 + 0.006 && t - d.pickT > 0.16) d.pickT = d.attackT;
    d.hist.push(now); d.hist.shift();
    if (d.rms < 0.008) { d.midi = 0; d.conf = 0; d.note = 0; return; }
    const [m, c] = yin(d, buf); d.midi = m; d.conf = c;
    const r = c > 0.8 ? Math.round(m) : 0;
    // a note is new after an attack, or when the pitch moves to a different one (hammer-on, slide). The tracker losing
    // a fading note for a frame and finding it again is the same note, not a new one.
    if (d.attackT > d.noteT || (r && r !== d.last)) d.noteT = d.attackT > t - 0.16 ? d.attackT : t - 0.03;
    if (r) d.last = r; d.note = r;
  }

  /* ---------- a run: the notes of one song grouped by onset, judged against the detector ---------- */
  const JUDGE = [['PERFECT', 0.055, 100], ['GREAT', 0.1, 70], ['GOOD', 0.18, 40]];
  const multOf = combo => combo >= 40 ? 4 : combo >= 20 ? 3 : combo >= 10 ? 2 : 1;

  function groups(song, from, to) {
    const out = []; let g = null;
    for (const e of song.ev) {
      if (e.tech.includes('t') || e.t0 < from || e.t0 >= to) continue;
      if (!g || e.t0 - g.t > 0.012) { g = { t: e.t0, ev: [], midi: [], dead: 0, st: 0, j: -1, dt: 0, base: null }; out.push(g); }
      g.ev.push(e);
      // dead notes and harmonics have no fretted pitch to listen for: the attack alone scores them
      if (/[xo]/.test(e.tech)) g.dead++; else { const m = TUNING[e.str - 1] + e.fret; if (!g.midi.includes(m)) g.midi.push(m); }
    }
    out.forEach((g, i) => {
      const gap = Math.min(i ? g.t - out[i - 1].t : 9, i + 1 < out.length ? out[i + 1].t - g.t : 9);
      g.w = Math.max(0.05, Math.min(JUDGE[2][1], gap * 0.46));
      g.legato = g.ev.every(e => /[hs]/.test(e.tech));  // hammer-on / slide: no pick attack to wait for
    });
    return out;
  }
  function maxScore(gs) { let s = 0; gs.forEach((g, i) => { s += 100 * multOf(i + 1); }); return s; }

  function start(song, from, to, ranked) {
    const gs = groups(song, from, to);
    for (const e of song.ev) e.gs = 0;
    return { song: song.id, g: gs, i: 0, score: 0, combo: 0, maxCombo: 0, n: [0, 0, 0, 0], sumDt: 0, hits: 0, max: maxScore(gs), ranked, done: !gs.length, last: null };
  }

  function resolve(run, g, j, dt) {
    g.st = j < 3 ? 1 : 2; g.j = j; g.dt = dt; run.n[j]++;
    if (j < 3) { run.combo++; run.maxCombo = Math.max(run.maxCombo, run.combo); run.score += JUDGE[j][2] * multOf(run.combo); run.sumDt += dt; run.hits++; }
    else run.combo = 0;
    for (const e of g.ev) e.gs = g.st;
    run.last = { j, dt, t: g.t, g };
  }

  // new energy on the harmonic comb of each candidate pitch (due note and its neighbours) since the window opened
  const CAND = [0, -1, 1, -2, 2], PART = [1, 2, 3];
  function comb(d, buf, m) { const o = []; for (const c of CAND) for (const k of PART) o.push(tone(d, buf, hz(m + c) * k)); return o; }
  function rise(now, base, c) { let r = 0; for (let k = 0; k < 3; k++) r += Math.max(0, now[c * 3 + k] - base[c * 3 + k]); return r; }

  // is the due group being played in this frame? → hit time, or null
  function heard(run, g, d, buf, t) {
    const lo = g.t - g.w - 0.02, fresh = d.attackT >= lo ? d.attackT : null;
    if (!g.midi.length) return fresh;                                   // dead notes: the attack is all there is
    if (g.midi.length === 1) {
      const m = g.midi[0];
      if (d.conf > 0.8 && Math.abs(d.midi - m) < 0.5 && d.noteT >= lo) return fresh != null ? fresh : d.noteT;
      // a clear, different note is a miss — unless the tracker locked onto a common sub-harmonic of two ringing strings
      const q = Math.pow(2, (m - d.midi) / 12), sub = q > 1.4 && Math.abs(q - Math.round(q)) < 0.07;
      if (d.conf > 0.9 && Math.abs(d.midi - m) > 0.7 && !sub) return null;
    }
    // tone-rise: the due pitch must gain energy, and gain more than the pitches one and two semitones either side
    const now = g.midi.map(m => comb(d, buf, m));
    if (!g.base) { g.base = now; return null; }
    let ok = 0;
    now.forEach((a, k) => {
      const b = g.base[k], r = rise(a, b, 0);
      if (r > 0.05 * d.rms + 0.004 && r > (g.midi[k] < 55 ? 1.02 : 1.12) * Math.max(rise(a, b, 1), rise(a, b, 2)) && r > Math.max(rise(a, b, 3), rise(a, b, 4))) ok++;
      for (let i = 0; i < a.length; i++) if (a[i] < b[i]) b[i] = a[i];
    });
    if (ok < (g.midi.length === 1 ? 1 : Math.max(2, Math.ceil(g.midi.length * 0.6)))) return null;
    return fresh != null ? fresh : t - 0.03;
  }

  // call once per analysis frame, after feed(); returns the groups resolved in this frame
  function step(run, d, buf, t) {
    const out = [];
    while (!run.done) {
      const g = run.g[run.i];
      if (t > g.t + g.w + 0.03) { resolve(run, g, 3, 0); out.push(g); }
      else {
        if (t >= g.t - g.w) {
          const th = heard(run, g, d, buf, t);
          if (th != null) {
            const dt = Math.max(-g.w, Math.min(g.w, th - g.t)), a = Math.abs(dt);
            resolve(run, g, a <= JUDGE[0][1] ? 0 : a <= JUDGE[1][1] ? 1 : 2, dt); out.push(g);
            d.attackT = -9;                                             // one attack scores one group
          } else break;
        } else break;
      }
      if (++run.i >= run.g.length) run.done = true;
    }
    return out;
  }

  const acc = run => { const tot = run.n[0] + run.n[1] + run.n[2] + run.n[3]; return tot ? (run.n[0] + run.n[1] * 0.8 + run.n[2] * 0.5) / tot : 0; };
  const stars = a => a >= 0.95 ? 3 : a >= 0.8 ? 2 : a >= 0.6 ? 1 : 0;

  const api = { N, TUNING, hz, create, feed, tone, start, step, heard, acc, stars, multOf, JUDGE, groups, maxScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DET = api;
})(typeof window !== 'undefined' ? window : globalThis);
