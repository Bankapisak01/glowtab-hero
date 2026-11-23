/* GlowTab Ranked — the game layer on top of Hero Mode.
 * Some Official Tabs (GAME_SONGS) can be played for a score: the microphone hears the guitar, detect.js judges
 * every note against the tab, and a full run at 100 % posts to that song's weekly leaderboard and earns coins.
 *   input      microphone (getUserMedia), or the demo bot — a synthesised player routed into the same detector
 *   scoring    PERFECT / GREAT / GOOD / MISS + combo multiplier (detect.js)
 *   ranked     whole song, 100 % speed, no pause, no seek; anything else is a practice score
 *   rewards    coins per run (capped) + a weekly rank payout; coins buy in-app items only
 * Leaderboard, wallet and shop are local mock data (localStorage 'gt-game'); there is no server here.
 * Loaded after detect.js and hero.js, before app.js; everything is called at render / frame time.
 */
'use strict';
const GAME_SONGS = { LJS001: 1, ART001: 1, VT001: 1 };   // single-note lines the detector reads reliably
const GAME_ICONS = {
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9.5 13v2M14.5 13v2"/>',
};
const G = { mode: 'jam', mic: 'off' /* off | on | denied | bot */, botLv: 'pro', an: null, buf: null, det: null, node: null, stream: null, bus: null,
  listen: false, hold: false, hw: null /* waiting on a note: {at} */, run: null, result: null, panel: null /* {kind:'result'|'board'|'shop', sf, id, tab} */, lat: 0.06, pop: null, lastTs: 0, bi: 0, bstr: {}, bl: [], muted: null, level: 0 };
const BOT = { pro: { jit: 0.014, skip: 0, wrong: 0, label: 'มือโปร' }, mid: { jit: 0.04, skip: 0.06, wrong: 0.04, label: 'มือกลาง' } };
const G_NOTE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const G_J = [['PERFECT', '#A3E635'], ['GREAT', '#6FB1FF'], ['GOOD', '#F5B14A'], ['MISS', '#FF6B6B']];
const G_COIN = { stars: [0, 10, 20, 40], fc: 20, first: 30, pb: 10, runsPerDay: 3, dayCap: 150 };
const G_PRIZE = [[1, 1, 500], [2, 3, 300], [4, 10, 150]];   // rank from..to → coins; then top 25 % = 60, anyone on the board = 20
const G_SHOP = [
  { id: 'skin-carbon', n: 'สกินกีตาร์ 3D · Carbon Weave', k: 'สกิน', c: 300 }, { id: 'led-neon', n: 'เอฟเฟกต์ไฟ LED · Neon Pulse', k: 'สกิน', c: 200 },
  { id: 'bg-stage', n: 'ฉาก Hero Mode · Night Stage', k: 'ฉาก', c: 150 }, { id: 'frame-gold', n: 'กรอบโปรไฟล์ · Gold Pick', k: 'โปรไฟล์', c: 120 },
  { id: 'song7', n: 'ปลดล็อกเพลง PRO 1 เพลง · 7 วัน', k: 'สิทธิ์เล่น', c: 250 }, { id: 'pro1', n: 'PRO Day Pass · 24 ชม.', k: 'สิทธิ์เล่น', c: 400 },
];

/* ---------- wallet + personal bests (mock, this browser only) ---------- */
const GS = (() => { let v = null; try { v = JSON.parse(localStorage.getItem('gt-game')); } catch (e) {} return Object.assign({ coins: 0, owned: [], best: {}, all: {}, day: { d: '', coins: 0, runs: {} }, first: {} }, v || {}); })();
const gsave = () => { try { localStorage.setItem('gt-game', JSON.stringify(GS)); } catch (e) {} };
const gnum = n => Math.round(n).toLocaleString('en-US');
const gcoin = n => `<span class="coin">${ic('coin')} ${gnum(n)}</span>`;
// the week runs Monday 00:00 – Sunday 24:00, Asia/Bangkok
function gweek() {
  const now = Date.now() + 7 * 3600e3, d = new Date(now), dow = (d.getUTCDay() + 6) % 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow), left = start + 7 * 864e5 - now, y = new Date(start).getUTCFullYear();
  return { id: `${y}-W${String(Math.floor((start - Date.UTC(y, 0, 1)) / 6048e5) + 1).padStart(2, '0')}`, day: d.toISOString().slice(0, 10), left: `${Math.floor(left / 864e5)} วัน ${Math.floor(left % 864e5 / 36e5)} ชม.` };
}
const GMAX = {}; const gmax = id => GMAX[id] || (GMAX[id] = DET.maxScore(DET.groups(SONGS[id], 0, 1e9)));
const gbest = (id, tab = 'week') => tab === 'week' ? (GS.best[id] || {})[gweek().id] : GS.all[id];

/* ---------- leaderboard (seeded mock players + this player's best) ---------- */
const G_NAMES = ['PickSlayer', 'น้องมายด์', 'FretRunner', 'ต้นกล้า', 'Mint_Gtr', 'ArpeggioKid', 'ครูโอ๊ต', 'LimeString', 'บีมมี่', 'NeonBach', 'SixStringSam', 'ปลายฟ้า', 'CapoQueen', 'JJ.riff', 'ภูผา', 'HammerOn', 'Tonewood', 'ไข่มุก', 'LegatoLee', 'DropD_Dan',
  'อิงฟ้า', 'RiffRaff', 'PalmMute', 'เจได', 'Bendit', 'StratCat', 'ข้าวปั้น', 'TapTap', 'Vibrato_V', 'หมูกรอบ', 'Luthier9', 'Echo.E', 'แทนไท', 'Sus4', 'OpenG', 'กีต้าร์น้อย', 'WhammyJo', 'NylonNan', 'ฟ้าใส', 'Octave8'];
function grand(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
function gboard(id, tab) {
  const r = grand(id + (tab === 'week' ? gweek().id : 'all')), max = gmax(id), names = G_NAMES.slice().sort(() => r() - 0.5);
  const rows = names.map((n, i) => {
    const f = tab === 'week' ? 0.9 - 0.7 * Math.pow(i / 39, 0.75) + (r() - 0.5) * 0.03 : 0.985 - 0.45 * Math.pow(i / 39, 0.85) + (r() - 0.5) * 0.01;
    return { n, score: Math.round(max * f / 10) * 10, acc: Math.min(0.999, 0.55 + f * 0.45) };
  });
  const me = gbest(id, tab); if (me) rows.push({ n: 'คุณ', me: 1, score: me.score, acc: me.acc });
  rows.sort((a, b) => b.score - a.score); rows.forEach((x, i) => x.rank = i + 1);
  return rows;
}
const grank = (id, tab = 'week') => { const m = gboard(id, tab).find(x => x.me); return m ? m.rank : 0; };
const gprize = (rank, n) => { if (!rank) return 0; for (const [a, b, c] of G_PRIZE) if (rank >= a && rank <= b) return c; return rank <= Math.ceil(n * 0.25) ? 60 : 20; };

/* ---------- audio input: microphone or the demo bot, both into one analyser ---------- */
function gattach(node) {
  if (!G.an) {
    G.an = E.ctx.createAnalyser(); G.an.fftSize = DET.N; G.an.smoothingTimeConstant = 0; G.buf = new Float32Array(DET.N); G.det = DET.create(E.ctx.sampleRate);
    const z = E.ctx.createGain(); z.gain.value = 0; G.an.connect(z); z.connect(E.ctx.destination);   // keeps the analyser pulled
  }
  if (G.node) { try { G.node.disconnect(G.an); } catch (e) {} }
  G.node = node; node.connect(G.an);
}
async function gmicOn() {
  await ensureCtx();
  try {
    // the browser's call-quality processing eats guitar notes, so it is turned off
    G.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    gattach(E.ctx.createMediaStreamSource(G.stream)); G.mic = 'on'; G.lat = (E.ctx.outputLatency || 0.02) + 0.045;
  } catch (e) { G.mic = 'denied'; }
  render();
}
async function gbotOn(lv) {
  await ensureCtx();
  if (G.stream) { G.stream.getTracks().forEach(t => t.stop()); G.stream = null; }
  if (!G.bus) { G.bus = E.ctx.createGain(); G.bus.gain.value = 0.9; G.bus.connect(E.master); }
  gattach(G.bus); G.mic = 'bot'; G.botLv = lv; G.lat = 0.012; render();
}
function gbotStop() { for (const x of G.bl) { try { x.stop(); } catch (e) {} } G.bl = []; G.bstr = {}; }
// the bot plays the tab on the same plucked-string model the tab-only songs use, with human timing and mistakes
function gbotSched(s, t) {
  const ahead = t - s.audioOffset + 0.25, lv = BOT[G.botLv], c = E.ctx;
  while (G.bi < s.ev.length && s.ev[G.bi].t0 < ahead) {
    const e = s.ev[G.bi++]; if (e.tech.includes('t') || Math.random() < lv.skip) continue;
    const when = E.c0 + (e.t0 + s.audioOffset - E.t0) / rate() + (Math.random() + Math.random() + Math.random() - 1.5) * 2 * lv.jit; if (when < c.currentTime + 0.004) continue;
    const dead = e.tech.includes('x'), src = c.createBufferSource(), g = c.createGain(), prev = G.bstr[e.str];
    src.buffer = pluck(TUNING[e.str - 1] + e.fret + (Math.random() < lv.wrong ? 1 : 0)); src.connect(g); g.connect(G.bus);
    g.gain.setValueAtTime(0.42, when); if (dead) g.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    if (prev) { prev.g.gain.setTargetAtTime(0, Math.max(c.currentTime, when - 0.006), 0.002); try { prev.src.stop(when + 0.03); } catch (x) {} }   // one note per string
    src.start(when); src.stop(when + (dead ? 0.1 : 2.3)); G.bstr[e.str] = { src, g }; G.bl.push(src);
  }
  if (G.bl.length > 200) G.bl = G.bl.slice(-80);
}

/* ---------- mode + the part the player takes over ---------- */
function gunmute() {
  const u = G.muted; if (!u) return; G.muted = null;
  const m = S.mix[u.id]; if (m) for (const k in u.st) if (m[k]) m[k].mute = u.st[k];
  S.metro = u.metro;
}
function gameSet(mode) {
  const s = S.songId && SONGS[S.songId]; if (mode === 'game' && !(s && GAME_SONGS[s.id])) mode = 'jam';
  gunmute(); gbotStop();
  if (mode === 'game') {   // the guitar line is the player's: silence it so the microphone only hears them
    const m = S.mix[s.id]; G.muted = { id: s.id, st: {}, metro: S.metro };
    for (const st of s.stems) if (['guide', 'artist', 'tabsynth'].includes(st.id)) { G.muted.st[st.id] = m[st.id].mute; m[st.id].mute = true; }
    if (s.stems.length === 1) S.metro = true;
  }
  G.mode = mode; G.run = null; G.result = null; G.panel = null; applyMix();
}
const gameOn = s => G.mode === 'game' && !!GAME_SONGS[s.id];
// Practice › ตรวจโน้ต: the same detector marks each note right or wrong on the tab — no score, no combo, any song, any speed, loops included
const G_BOTQ = new URLSearchParams(location.search).get('bot');   // ?bot=pro|mid: the demo bot stands in for the microphone
const glistenOn = () => G.listen && (S.app.screen === 'player' || S.web.screen === 'player');
const gready = () => G.mic === 'on' || G.mic === 'bot';

/* ---------- one run ---------- */
function grunStart(s, ts) {
  const first = s.ev.find(e => !e.tech.includes('t')), fromStart = ts <= first.t0 - 0.2;
  const why = S.loop ? 'เล่นเป็นท่อน' : S.speed !== 100 ? `ความเร็ว ${S.speed}%` : !fromStart ? 'ไม่ได้เริ่มจากต้นเพลง' : '';
  const a = S.loop ? barTime(S.loop.a) - s.audioOffset - 0.01 : ts - 0.05, b = S.loop ? barTime(S.loop.b + 1) - s.audioOffset - 0.01 : 1e9;
  G.run = DET.start(s, Math.max(a, ts - 0.05), b, !why); G.run.why = why; G.run.bot = G.mic === 'bot' ? G.botLv : '';
  G.result = null; G.pop = null; gbotStop(); G.bi = s.ev.findIndex(e => e.t0 >= ts - 0.01); if (G.bi < 0) G.bi = s.ev.length;
  if (G.det) { G.det.attackT = -9; G.det.noteT = -9; }
  G.hw = null;
}
function gameFrame(s, t) {
  const prac = !gameOn(s) && glistenOn();
  if (!gameOn(s) && !prac) return;
  const ts = t - s.audioOffset;
  if (G.an && gready()) {
    G.an.getFloatTimeDomainData(G.buf);
    let p = 0; for (let i = DET.N - 1024; i < DET.N; i++) p = Math.max(p, Math.abs(G.buf[i])); G.level = Math.max(p, G.level * 0.9);
  }
  const live = E.playing && E.ctx.currentTime >= E.c0;
  if (prac && G.hold) { if (gready()) gholdFrame(s, t, ts); }
  else if (!live) {
    if (!E.playing) { if (G.bl.length) gbotStop(); if (G.run && !G.run.done && G.run.ranked) { G.run.ranked = false; G.run.why = 'หยุดกลางเพลง'; } }
    if (G.an && gready()) DET.feed(G.det, G.buf, ts - G.lat);
  } else {
    if (!G.run || G.run.song !== s.id || G.result || ts < G.lastTs - 0.25) grunStart(s, ts);   // new song, new attempt, or the loop wrapped
    G.lastTs = ts;
    if (G.mic === 'bot') gbotSched(s, t);
    if (gready()) {
      const tn = ts - G.lat * rate(); DET.feed(G.det, G.buf, tn);
      const out = DET.step(G.run, G.det, G.buf, tn);
      if (out.length) { const g = out[out.length - 1]; G.pop = { j: g.j, dt: g.dt, at: performance.now() }; }
      if (prac) for (const g of out) atMark(g.ev[0].bar, g.ev[0].pos / 4, g.st === 1 ? 'at-ok' : 'at-bad');
    }
    const r = G.run;
    if (!prac && r.done && !S.loop && ts > r.g[r.g.length - 1].t + 1.2) { gameFinish(); return; }
  }
  // HUD
  const r = G.run, live2 = (k, v) => document.querySelectorAll(`[data-live=${k}]`).forEach(el => { if (el.textContent !== v) el.textContent = v; });
  live2('gscore', r ? gnum(r.score) : '0');
  live2('gcombo', r && r.combo > 1 ? `${r.combo} COMBO${DET.multOf(r.combo) > 1 ? ' ×' + DET.multOf(r.combo) : ''}` : '');
  live2('gacc', r && r.i ? (DET.acc(r) * 100).toFixed(1) + '%' : '–');
  live2('gmic', G.det && G.det.note ? G_NOTE[G.det.note % 12] + (Math.floor(G.det.note / 12) - 1) : '–');
  if (prac) {   // right / wrong for the note just played, and nothing else
    const p = G.pop, on = G.hw || (p && performance.now() - p.at < 900), hg = G.hw && G.run && G.run.g[G.run.i];
    const txt = !on ? '' : hg ? 'รอโน้ต: ' + hg.ev.map(e => `สาย ${e.str} เฟรต ${e.fret}`).join(' + ') : p.j === 3 ? '✕ พลาด' : p.held ? '✓ ผ่าน' : '✓ ถูก' + (Math.abs(p.dt) > 0.06 ? (p.dt < 0 ? ' · เร็วไป' : ' · ช้าไป') : '');
    document.querySelectorAll('[data-live=pjudge]').forEach(el => { if (el.textContent !== txt) { el.textContent = txt; el.className = !on ? '' : hg ? 'wait' : p.j === 3 ? 'bad' : 'ok'; } });
  }
  document.querySelectorAll('[data-live=glevel]').forEach(el => el.style.width = Math.min(100, G.level * 260) + '%');
}
// the player moved the playhead: the attempt starts over from there
function gameSeek() { G.run = null; G.hw = null; gbotStop(); atMarkClear(); }

/* ---------- Practice › Hold-On: the song stops on a note until the player plays it ----------
 * Played in time, the music never stops. Otherwise the playhead freezes on the note (a short grace after its beat),
 * keeps listening, and carries on from that note once it is heard. The detector runs on the audio clock here,
 * because song time stands still while waiting. */
function gbotPluck(e, when) {
  const c = E.ctx, src = c.createBufferSource(), g = c.createGain();
  src.buffer = pluck(TUNING[e.str - 1] + e.fret); src.connect(g); g.connect(G.bus); g.gain.setValueAtTime(0.42, when);
  src.start(when); src.stop(when + 2.3); G.bl.push(src);
}
function gholdResume(s, g) { G.hw = null; E.t = g.t + s.audioOffset; startSrc(E.ctx.currentTime + 0.02); G.lastTs = g.t; G.bi = s.ev.findIndex(e => e.t0 > g.t + 0.012); if (G.bi < 0) G.bi = s.ev.length; }
function gholdFrame(s, t, ts) {
  const now = E.ctx.currentTime - G.lat, d = G.det; DET.feed(d, G.buf, now);
  if (!E.playing && !G.hw) { if (G.bl.length) gbotStop(); return; }      // paused by the player
  if (E.playing && E.ctx.currentTime < E.c0) return;                      // count-in
  if (!G.run || G.run.song !== s.id || (!G.hw && ts < G.lastTs - 0.25)) grunStart(s, ts);
  if (!G.hw) G.lastTs = ts;
  const r = G.run, w = G.hw; if (r.done) return;
  if (G.mic === 'bot' && !w) gbotSched(s, t);
  const g = r.g[r.i];
  if (!w && ts < g.t - g.w) return;
  if (g.open == null) { g.open = now; g.base = null; }
  const T = g.t; g.t = g.open + g.w + 0.02; const th = DET.heard(r, g, d, G.buf, now); g.t = T;   // only sound made since the window opened counts
  if (th != null) {
    g.st = 1; for (const e of g.ev) e.gs = 1; d.attackT = -9;
    atMark(g.ev[0].bar, g.ev[0].pos / 4, w ? 'at-late' : 'at-ok'); G.pop = { j: 0, dt: 0, held: !!w, at: performance.now() };
    if (++r.i >= r.g.length) r.done = true;
    if (w) gholdResume(s, g);
    return;
  }
  if (!w && ts >= g.t + 0.12 * rate()) {   // not played: stop on the note and wait
    E.t = g.t + s.audioOffset; stopSrc(); E.playing = false; E.countFrom = 0; G.hw = { at: now };
    gbotStop(); G.bi = s.ev.findIndex(e => e.t0 > g.t + 0.012); if (G.bi < 0) G.bi = s.ev.length;
  } else if (w && G.mic === 'bot' && !w.bot && now - w.at > 0.5) { w.bot = 1; for (const e of g.ev) gbotPluck(e, E.ctx.currentTime + 0.05); }   // the demo bot tries again
}
function gholdSkip() {
  const r = G.run, s = S.songId && song(); if (!r || r.done || !s) return;
  const g = r.g[r.i]; g.st = 2; for (const e of g.ev) e.gs = 2; atMark(g.ev[0].bar, g.ev[0].pos / 4, 'at-bad');
  if (++r.i >= r.g.length) r.done = true;
  if (G.hw) gholdResume(s, g);
}
// the audio reached the end: whatever was not played is a miss
function gameSongEnd(s) { if (gameOn(s) && G.run && !G.result && !S.loop) gameFinish(true); }
function gameFinish(fromEnd) {
  const r = G.run; if (!r || G.result) return;
  while (!r.done) { const g = r.g[r.i]; g.st = 2; g.j = 3; r.n[3]++; r.combo = 0; for (const e of g.ev) e.gs = 2; if (++r.i >= r.g.length) r.done = true; }
  const id = r.song, w = gweek(), acc = DET.acc(r), stars = DET.stars(acc), fc = r.n[3] === 0;
  const res = { id, score: r.score, max: r.max, acc, stars, n: r.n.slice(), maxCombo: r.maxCombo, total: r.g.length, avg: r.hits ? r.sumDt / r.hits : 0,
    ranked: r.ranked, why: r.why, bot: r.bot, fc, lines: [], earn: 0, note: '', pb: false, rank0: 0, rank: 0, n0: 0 };
  if (r.ranked) {
    const prev = gbest(id), entry = { score: r.score, acc, stars, at: Date.now() };
    res.rank0 = grank(id); res.pb = !prev || r.score > prev.score;
    if (res.pb) (GS.best[id] = GS.best[id] || {})[w.id] = entry;
    if (!GS.all[id] || r.score > GS.all[id].score) GS.all[id] = entry;
    res.rank = grank(id); res.n0 = gboard(id, 'week').length;
    if (GS.day.d !== w.day) GS.day = { d: w.day, coins: 0, runs: {} };
    const nth = GS.day.runs[id] = (GS.day.runs[id] || 0) + 1, fk = w.id + '/' + id;
    if (!stars) res.note = 'ต้องได้อย่างน้อย 1 ดาว (ความแม่น 60%) จึงจะได้เหรียญ';
    else if (nth > G_COIN.runsPerDay) res.note = `เพลงนี้ได้เหรียญครบ ${G_COIN.runsPerDay} รอบของวันนี้แล้ว — คะแนนยังนับอันดับตามปกติ`;
    else {
      res.lines.push([`ผ่าน ${stars} ดาว`, G_COIN.stars[stars]]);
      if (fc) res.lines.push(['Full Combo', G_COIN.fc]);
      if (!GS.first[fk]) { GS.first[fk] = 1; res.lines.push(['เคลียร์เพลงนี้ครั้งแรกของสัปดาห์', G_COIN.first]); }
      if (res.pb && prev) res.lines.push(['ทำลายสถิติตัวเอง', G_COIN.pb]);
      const sum = res.lines.reduce((a, x) => a + x[1], 0), room = Math.max(0, G_COIN.dayCap - GS.day.coins);
      res.earn = Math.min(sum, room); if (res.earn < sum) res.note = `ถึงเพดาน ${G_COIN.dayCap} เหรียญต่อวันแล้ว`;
      GS.day.coins += res.earn; GS.coins += res.earn;
    }
    gsave();
  }
  G.result = res; G.panel = { kind: 'result' };
  if (fromEnd) setTimeout(render); else pause();
}

/* ---------- drawn on the Hero canvas: the judgement that just happened ---------- */
function gameDraw(c, W, H, bTop, gap) {
  const p = G.pop; if (!p) return; const q = (performance.now() - p.at) / 620; if (q >= 1) return;
  const [txt, col] = G_J[p.j], fs = Math.max(18, Math.min(34, W * 0.034)) * (1 + 0.25 * Math.max(0, 1 - q * 5));
  c.globalAlpha = 1 - q * q; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${fs}px ${FONT}`;
  c.shadowColor = col; c.shadowBlur = 18; c.fillStyle = col; c.fillText(txt, W / 2, bTop - gap * 1.5 - q * 10); c.shadowBlur = 0;
  if (p.j < 3 && Math.abs(p.dt) > 0.03) { c.font = `700 ${fs * 0.42}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText(p.dt < 0 ? 'เร็วไป' : 'ช้าไป', W / 2, bTop - gap * 1.5 + fs * 0.72 - q * 10); }
  c.globalAlpha = 1;
}

/* ---------- views ---------- */
const gstars = (n, cls = '') => `<span class="g-stars ${cls}">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}">${ic('star', 1)}</i>`).join('')}</span>`;
function gameSeg(s) {
  if (!GAME_SONGS[s.id]) return '';
  return `<div class="seg g-seg"><button class="${G.mode === 'jam' ? 'on' : ''}" data-act="gmode" data-v="jam">Jam · เล่นตามสบาย</button><button class="${G.mode === 'game' ? 'on' : ''}" data-act="gmode" data-v="game">${ic('trophy')} Ranked · เก็บคะแนน</button></div>`;
}
// READY overlay, Ranked: what the game listens to, and where the player stands this week
function gameReady(s) {
  const b = gbest(s.id), rank = grank(s.id);
  const mic = G.mic === 'on' ? `<span class="chip lime">${ic('mic')} ไมค์พร้อม · ได้ยิน <b data-live="gmic">–</b><i class="g-lv"><i data-live="glevel"></i></i></span>`
    : G.mic === 'bot' ? `<span class="chip or">${ic('bot')} เดโม: บอท${BOT[G.botLv].label}เล่นแทน<i class="g-lv"><i data-live="glevel"></i></i></span>`
      : `<button class="btn sm pri" data-act="gmic">${ic('mic')} เปิดไมค์</button>`;
  return `<div class="g-ready">
      <div class="h-row">${mic}
        <button class="btn sm ${G.mic === 'bot' && G.botLv === 'pro' ? 'on' : ''}" data-act="gbot" data-v="pro" title="สำหรับรีวิวโดยไม่มีกีตาร์: ระบบสังเคราะห์เสียงกีตาร์เล่นตาม tab แล้วส่งเข้าตัวตรวจโน้ตตัวเดียวกับไมค์">${ic('bot')} บอทมือโปร</button>
        <button class="btn sm ${G.mic === 'bot' && G.botLv === 'mid' ? 'on' : ''}" data-act="gbot" data-v="mid">${ic('bot')} บอทมือกลาง</button></div>
      ${G.mic === 'denied' ? `<p class="h-note" style="color:var(--red)">เบราว์เซอร์ไม่อนุญาตให้ใช้ไมค์ — อนุญาตที่แถบที่อยู่ แล้วกด “เปิดไมค์” อีกครั้ง หรือใช้บอทเดโม</p>` : ''}
      <div class="h-row g-me"><span>${ic('trophy')} สัปดาห์นี้: ${b ? `<b>#${rank}</b> · ${gnum(b.score)} ${gstars(b.stars, 'sm')}` : 'ยังไม่มีคะแนน'}</span>
        <button class="lnk" data-act="gboard" data-id="${s.id}">Leaderboard</button><button class="lnk" data-act="gshop">${gcoin(GS.coins)} ร้านแลกของ</button></div>
    </div>`;
}
const gameNote = s => `Ranked · เล่นทั้งเพลงที่ 100% ไม่หยุดกลางเพลง จึงนับอันดับและได้เหรียญ · ${s.stems.length === 1 ? 'เพลงนี้เล่นกับ metronome' : 'เสียงกีตาร์นำถูกปิดให้คุณเล่นแทน'} · ใส่หูฟังเพื่อไม่ให้เสียงเพลงเข้าไมค์`;
const gameHud = () => `<div class="h-sc"><b data-live="gscore">0</b><small><span data-live="gcombo"></span><span data-live="gacc">–</span></small></div>`;

function gresultHTML() {
  const r = G.result, s = SONGS[r.id], kind = r.ranked ? (r.bot ? 'RANKED · DEMO BOT' : 'RANKED') : 'PRACTICE SCORE';
  const coins = !r.ranked ? `<div class="g-box"><b>รอบนี้ไม่นับอันดับ</b> (${esc(r.why)}) — ไม่ได้เหรียญ เล่นทั้งเพลงที่ 100% โดยไม่หยุดเพื่อเก็บคะแนน Ranked</div>`
    : `<div class="g-box">${r.lines.map(x => `<div class="g-ln"><span>${x[0]}</span><b>+${x[1]}</b></div>`).join('')}
        ${r.note ? `<div class="g-ln muted"><span>${r.note}</span></div>` : ''}
        <div class="g-ln tot"><span>ได้รับ</span>${gcoin(r.earn)}</div><div class="g-ln muted"><span>กระเป๋าเหรียญ</span>${gcoin(GS.coins)}</div></div>
      <div class="g-box"><div class="g-ln"><span>อันดับสัปดาห์นี้</span><b>#${r.rank} <small>จาก ${r.n0}</small>${r.rank0 && r.rank0 > r.rank ? ` <em>▲ ${r.rank0 - r.rank}</em>` : ''}</b></div>
        <div class="g-ln muted"><span>ถ้าคงอันดับนี้ถึงสิ้นสัปดาห์ (อีก ${gweek().left})</span>${gcoin(gprize(r.rank, r.n0))}</div></div>`;
  return `<div class="h-brand">${kind}</div><div class="g-title ell">${esc(s.title)}</div>${gstars(r.stars)}
    <div class="g-score">${gnum(r.score)}${r.ranked && r.pb ? '<small>NEW BEST</small>' : ''}</div>
    <div class="g-stat"><span>ความแม่น <b>${(r.acc * 100).toFixed(1)}%</b></span><span>คอมโบสูงสุด <b>${r.maxCombo}</b>${r.fc ? ' · <b style="color:var(--lime)">FULL COMBO</b>' : ''}</span><span>จังหวะเฉลี่ย <b>${Math.abs(r.avg * 1000) < 8 ? 'ตรง' : (r.avg < 0 ? 'เร็ว ' : 'ช้า ') + Math.abs(r.avg * 1000).toFixed(0) + ' ms'}</b></span></div>
    <div class="g-j">${G_J.map((j, i) => `<span style="color:${j[1]}">${j[0]} <b>${r.n[i]}</b></span>`).join('')}</div>
    ${coins}
    <div class="h-row"><button class="btn pri" data-act="gagain">${ic('play', 1)} เล่นอีกครั้ง</button><button class="btn" data-act="gboard" data-id="${r.id}">${ic('trophy')} Leaderboard</button>
      <button class="btn" data-act="gshop">${ic('coin')} ร้านแลกของ</button><button class="btn" data-act="gclose">ปิด</button></div>`;
}
function gboardHTML(p) {
  const s = SONGS[p.id], tab = p.tab || 'week', rows = gboard(p.id, tab), me = rows.find(x => x.me), n = rows.length;
  const show = rows.filter(x => x.rank <= 8 || (me && Math.abs(x.rank - me.rank) <= 1));
  let prev = 0, list = '';
  for (const x of show) {
    if (x.rank - prev > 1) list += `<div class="g-gap">···</div>`; prev = x.rank;
    list += `<div class="g-row ${x.me ? 'me' : ''}"><b class="rk ${x.rank <= 3 ? 'pod' : ''}">${x.rank}</b><span class="grow ell">${esc(x.n)}</span><span class="muted">${(x.acc * 100).toFixed(1)}%</span><b class="sc">${gnum(x.score)}</b>${tab === 'week' ? gcoin(gprize(x.rank, n)) : ''}</div>`;
  }
  return `<div class="row"><div class="grow"><div class="h-brand">${ic('trophy')} LEADERBOARD</div><div class="g-title ell">${esc(s.title)}</div></div><button class="ib" data-act="gback" aria-label="Close">${ic('x')}</button></div>
    <div class="seg" style="align-self:stretch"><button class="${tab === 'week' ? 'on' : ''}" data-act="gtab" data-v="week">สัปดาห์นี้</button><button class="${tab === 'all' ? 'on' : ''}" data-act="gtab" data-v="all">ตลอดกาล</button></div>
    <p class="h-note">${tab === 'week' ? `รีเซ็ตทุกวันจันทร์ 00:00 · เหลือ ${gweek().left} · คอลัมน์ขวาคือเหรียญที่ได้เมื่อจบสัปดาห์` : 'สถิติสูงสุดตลอดกาลของเพลงนี้ · ไม่มีเหรียญ'}</p>
    <div class="g-list">${list}${me ? '' : `<div class="g-row me"><b class="rk">–</b><span class="grow">คุณ · ยังไม่มีคะแนน${tab === 'week' ? 'สัปดาห์นี้' : ''}</span></div>`}</div>
    <p class="h-note">รางวัลรายสัปดาห์ต่อเพลง: อันดับ 1 = 500 · 2–3 = 300 · 4–10 = 150 · 25% แรก = 60 · ติดตาราง = 20 เหรียญ</p>
    <div class="h-row"><button class="btn pri" data-act="hgame" data-id="${p.id}">${ic('play', 1)} เล่น Ranked เพลงนี้</button></div>`;
}
function gshopHTML() {
  return `<div class="row"><div class="grow"><div class="h-brand">${ic('coin')} REWARD SHOP</div><div class="g-title">ร้านแลกของ</div></div>${gcoin(GS.coins)}<button class="ib" data-act="gback" aria-label="Close">${ic('x')}</button></div>
    <p class="h-note">เหรียญได้จากการเล่น Ranked เท่านั้น · ใช้แลกของในแอป ไม่มีมูลค่าเป็นเงิน โอนหรือแลกคืนไม่ได้</p>
    <div class="g-shop">${G_SHOP.map(x => { const own = GS.owned.includes(x.id); return `<div class="g-item ${own ? 'own' : ''}"><small>${x.k}</small><b>${x.n}</b>
      ${own ? `<span class="chip lime">มีแล้ว</span>` : `<button class="btn sm ${GS.coins >= x.c ? 'pri' : ''}" data-act="gbuy" data-id="${x.id}" ${GS.coins >= x.c ? '' : 'disabled'}>${ic('coin')} ${x.c}</button>`}</div>`; }).join('')}</div>
    <p class="h-note">ต้นแบบ: กดแลกแล้วหักเหรียญและขึ้น “มีแล้ว” — ยังไม่ได้เปลี่ยนสกินหรือสิทธิ์จริง</p>`;
}
const gpanelBody = p => p.kind === 'result' ? gresultHTML() : p.kind === 'board' ? gboardHTML(p) : gshopHTML();
// inside Hero Mode the panel covers the stage; on the home screens it is a sheet (app) or a modal (web)
const gameHeroPanel = () => G.panel ? `<div class="h-ov"><div class="g-pan" data-keep="g-pan">${gpanelBody(G.panel)}</div></div>` : '';
function gamePanel(sf) {
  const p = G.panel; if (!p || p.sf !== sf || S[sf].screen === 'hero') return '';
  return sf === 'app' ? `<div class="sheet-bg" data-act="gback"><div class="sheet g-pan flat" data-stop><div class="grab"></div>${gpanelBody(p)}</div></div>`
    : `<div class="modal-bg" data-act="gback"><div class="modal g-pan flat" data-stop>${gpanelBody(p)}</div></div>`;
}
// Official Tabs home: this week's Ranked songs
function gameShelf(sf) {
  const w = gweek(), ids = Object.keys(GAME_SONGS);
  return `<div class="h2"><h3>${ic('trophy')} Ranked ประจำสัปดาห์<small>เล่นเก็บคะแนน ติดอันดับ รับเหรียญ · รีเซ็ตใน ${w.left}</small></h3><button class="lnk" data-act="gshop">${gcoin(GS.coins)} ร้านแลกของ</button></div>
    <div class="g-shelf">${ids.map(id => { const s = SONGS[id], b = gbest(id), rk = grank(id), n = gboard(id, 'week').length;
      return `<div class="g-card">${coverHTML(s, '', false)}<div class="grow" style="min-width:0"><div class="ell t">${esc(s.title)}</div>
        <div class="muted ell">${b ? `อันดับ <b>#${rk}</b> จาก ${n} · ${gnum(b.score)}` : 'ยังไม่ได้เล่นสัปดาห์นี้'}</div>
        <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm pri" data-act="hgame" data-id="${id}">${ic('play', 1)} เล่น</button><button class="btn sm" data-act="gboard" data-id="${id}">${ic('trophy')} อันดับ</button>${b ? gstars(b.stars, 'sm') : ''}</div></div></div>`; }).join('')}</div>`;
}
// song detail: the Ranked strip under the three main actions
function gameDetail(s) {
  if (!GAME_SONGS[s.id]) return '';
  const b = gbest(s.id);
  return `<div class="g-strip"><span class="grow">${ic('trophy')} <b>Ranked</b> · ${b ? `สัปดาห์นี้ #${grank(s.id)} · ${gnum(b.score)}` : 'เล่นเก็บคะแนน ติดอันดับรายสัปดาห์ รับเหรียญ'}</span>
    <button class="btn sm" data-act="gboard" data-id="${s.id}">อันดับ</button><button class="btn sm pri" data-act="hgame" data-id="${s.id}">${ic('play', 1)} เล่น Ranked</button></div>`;
}

/* ---------- Practice › ตรวจโน้ต ---------- */
const listenTog = () => `<button class="tog ${G.listen ? 'on' : ''}" data-act="plisten" aria-pressed="${G.listen}" title="ฟังกีตาร์ผ่านไมค์ แล้วบอกว่าเล่นถูกหรือพลาดทีละโน้ต · ไม่มีคะแนน">${ic('mic')}<span>ตรวจโน้ต</span></button>`;
const listenInfo = () => !G.listen ? '' : `<span class="pl-info">${ic(G.mic === 'bot' ? 'bot' : 'mic')} <b data-live="gmic">–</b><i class="g-lv"><i data-live="glevel"></i></i><b data-live="pjudge"></b>${G.hold ? '<button class="lnk" data-act="pskip" title="ข้ามโน้ตที่กำลังรอ">ข้ามโน้ต</button>' : ''}</span>`;
const holdTog = () => `<button class="tog ${G.hold ? 'on' : ''}" data-act="phold" aria-pressed="${G.hold}" title="เพลงหยุดรอที่โน้ต จนกว่าจะเล่นถูกจึงไปโน้ตต่อไป">${ic('pause', 1)}<span>Hold-On</span></button>`;
async function gholdToggle() {
  if (G.hold) { G.hold = false; G.hw = null; G.run = null; render(); return; }
  if (!G.listen) { await glistenToggle(); if (!G.listen) return; }
  G.hold = true; G.run = null; G.hw = null; atMarkClear(); render();
  toast('Hold-On เปิดแล้ว · เพลงจะหยุดรอที่โน้ตจนกว่าจะเล่นถูก · <b style="color:#22c55e">เขียว</b> = ถูกตามจังหวะ <b style="color:#F5B14A">ส้ม</b> = ถูกหลังรอ');
}
async function glistenToggle() {
  if (G.listen) { G.listen = false; G.hold = false; G.hw = null; G.run = null; gbotStop(); atMarkClear(); render(); return; }
  if (G_BOTQ && BOT[G_BOTQ]) await gbotOn(G_BOTQ); else if (!gready()) await gmicOn();
  if (!gready()) { toast('ใช้ไมค์ไม่ได้ — อนุญาตไมค์ที่แถบที่อยู่ของเบราว์เซอร์ แล้วกด “ตรวจโน้ต” อีกครั้ง'); return; }
  G.listen = true; G.run = null; atMarkClear(); render();
  toast('ตรวจโน้ตเปิดแล้ว · โน้ตที่เล่นถูกเป็น<b style="color:#22c55e">สีเขียว</b> พลาดเป็น<b style="color:#FF6B6B">สีแดง</b> · ไม่มีคะแนน · ใส่หูฟังหรือปิดเสียง Guide');
}

/* ---------- actions (called first by the click handler in app.js; true = handled) ---------- */
function gameAction(a, d, sf) {
  switch (a) {
    case 'plisten': glistenToggle(); return true;
    case 'phold': gholdToggle(); return true;
    case 'pskip': gholdSkip(); return true;
    case 'gmode': gameSet(d.v); render(); return true;
    case 'gmic': gmicOn(); return true;
    case 'gbot': if (G.mic === 'bot' && G.botLv === d.v) { G.mic = 'off'; gbotStop(); render(); } else gbotOn(d.v); return true;
    case 'hgame': G.panel = null; enterHero(d.id, sf); gameSet('game'); render(); return true;
    case 'gboard': if (E.playing) pause(); G.panel = { kind: 'board', sf, id: d.id, tab: 'week', back: G.panel && G.panel.kind === 'result' ? G.panel : null }; render(); return true;
    case 'gshop': if (E.playing) pause(); G.panel = { kind: 'shop', sf, back: G.panel && G.panel.kind === 'result' ? G.panel : null }; render(); return true;
    case 'gtab': G.panel.tab = d.v; render(); return true;
    case 'gback': G.panel = G.panel && G.panel.back || null; render(); return true;
    case 'gclose': G.panel = null; render(); return true;
    case 'gbuy': { const x = G_SHOP.find(i => i.id === d.id); if (x && GS.coins >= x.c && !GS.owned.includes(x.id)) { GS.coins -= x.c; GS.owned.push(x.id); gsave(); toast(`แลก <b>${esc(x.n)}</b> แล้ว · เหลือ ${gnum(GS.coins)} เหรียญ`); } render(); return true; }
    case 'gagain': G.panel = null; G.result = null; G.run = null; seek(S.loop ? barTime(S.loop.a) : 0, false); render(); play(); return true;
    case 'toggle': if (G.hw) { G.hw = null; render(); return true; }   // pressing pause while the song waits on a note really pauses
      if (S.songId && gameOn(song()) && S[sf].screen === 'hero' && !E.playing && !gready()) { toast('เปิดไมค์ก่อนเริ่ม Ranked (หรือเลือกบอทเดโม)'); return true; } return false;
    case 'hrestart': G.run = null; G.result = null; return false;
    case 'hero': if (G.mode === 'game') gameSet('jam'); return false;                 // the plain Hero button is always Jam
    case 'hexit': case 'htab': case 'back': case 'open': if (G.mode === 'game') gameSet('jam'); return false;
  }
  return false;
}
