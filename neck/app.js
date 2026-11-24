/* GlowTab — App Play Mode × Web · Prototype V1
 * One shared state + one audio engine ("BandPlayer" stand-in) rendered twice:
 *   #app-root  = Litejam App › Play › GlowTab (portrait phone)
 *   #web-root  = glowtab.litejam.com (desktop)
 * Audio is the master clock (Surface Map R4): tab cursor, LED preview and section state all
 * derive from the audio position. The tab is drawn by alphaTab (tab.js); this file owns the clock.
 * Scoring exists only in Hero Mode › Ranked (game.js); Practice and Jam stay score-free (R1).
 */
'use strict';
const SONGS = window.GT_SONGS;
const ORDER = Object.keys(SONGS);   // the four packaged songs, then the demo songs of data/songs_demo.js (tools/add_demo_songs.js)
const TUNING = [64, 59, 55, 50, 45, 40]; // string 1..6
const STEM_COLOR = { drums: '#F5B14A', bass: '#6FB1FF', synth: '#B48CFF', rhythm: '#FF8A6B', guide: '#A3E635', artist: '#A3E635', backing: '#6FB1FF', tabsynth: '#B48CFF' };
// cover art style for Classics: a = Neon Duotone (default), b = Pop Poster, c = Old Master — try with ?art=b (tools/make_art.py draws them)
const ART = (() => { let v = new URLSearchParams(location.search).get('art'); try { if (v) localStorage.setItem('gt-art', v); else v = localStorage.getItem('gt-art'); } catch (e) {} return ['a', 'b', 'c'].includes(v) ? v : 'a'; })();
const COVER = {
  LJS001: { bg: 'linear-gradient(135deg,#3b1d6e,#16213e 55%,#0f3d3e)', big: '', fs: 30, img: `media/LJS001/cover${ART === 'a' ? '' : '_' + ART}.jpg`, hero: 'media/LJS001/hero.jpg' },
  ART001: { bg: 'linear-gradient(135deg,#5a3a12,#2c1b10 60%,#1b1b1b)', big: 'In My<br>Life', fs: 26 },
  VT001: { bg: 'linear-gradient(135deg,#123a5a,#1b1b1b)', big: '', fs: 26 },
  FS001: { bg: 'linear-gradient(135deg,#0f3d3e,#1d2b1a 60%,#1b1b1b)', big: 'Finger<br>style', fs: 24 },
};

/* ---------- prepare score events ---------- */
for (const id of ORDER) {
  const s = SONGS[id];
  const spb = 60 / s.bpm;
  s.ev = s.notes.map(n => {
    const t0 = (n[0] * 4 + n[1]) * spb;
    return { bar: n[0], pos: n[1], dur: n[2], str: n[3], fret: n[4], tech: n[5], t0, t1: t0 + Math.max(n[2] * spb, 0.1) };
  });
  s.onsets = [...new Set(s.ev.filter(e => !e.tech.includes('t')).map(e => +e.t0.toFixed(4)))].sort((a, b) => a - b);
  s.chordAt = {};
  for (const c of s.chords) (s.chordAt[c[0]] = s.chordAt[c[0]] || []).push(c);
  s.secOfBar = b => s.sections.find(x => b >= x.start && b <= x.end) || null;
  s.maxFret = Math.max(15, s.fretRange[1] + 1);
}

/* ---------- state ---------- */
const S = {
  view: 'both',
  songId: null,
  app: { screen: 'home', seg: 'glowtab', sheet: null, land: false },
  web: { screen: 'home', modal: null },
  speed: 100, loop: null /* {a,b,secId} bars inclusive */, countIn: true, metro: false, follow: true,
  mix: {}, led: false, last: 'LJS001', theme: 'dark',
};
try { S.theme = localStorage.getItem('gt-theme') === 'light' ? 'light' : 'dark'; } catch (e) {}
const E = { ctx: null, master: null, gains: {}, srcs: [], buf: {}, playing: false, t: 0, t0: 0, c0: 0, dur: 0, loading: false, pct: 0, token: 0, lastK: -1, countFrom: 0 };
const song = () => SONGS[S.songId];
const rate = () => S.speed / 100;

/* ---------- icons ---------- */
const P = {
  play: '<path d="M7 4.5v15l13-7.5z"/>', pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  prev: '<path d="M6 5v14M19 5.5v13L9 12z"/>', next: '<path d="M18 5v14M5 5.5v13L15 12z"/>',
  loop: '<path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
  metro: '<path d="M8 3h8l4 18H4zM12 14l6-8M6.5 15h11"/>', count: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', mixer: '<path d="M5 3v8M5 15v6M12 3v3M12 10v11M19 3v11M19 18v3M2.5 11h5M9.5 6h5M16.5 14h5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  bt: '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>', up: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  learn: '<path d="M2 8l10-5 10 5-10 5zM6 10.5V16c2 2 10 2 12 0v-5.5"/>', trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4c0 3 1.5 4.5 4 5M16 6h4c0 3-1.5 4.5-4 5M12 13v4M8 21h8M10 17h4"/>',
  guitar: '<path d="M14 4l6 6M17 7l-6 6M11 13a4 4 0 1 1-5.5 5.5A4 4 0 0 1 5 13c2 0 3-1 3-3a3 3 0 0 1 4 0"/>',
  chord: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.5h16M4 15h16M9.5 4v16M15 4v16"/>',
  scale: '<path d="M3 18h4v-4h4v-4h4V6h6"/>', device: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  cube: '<path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3zM3.5 7.3L12 12l8.5-4.7M12 12v9.5"/>',
  flip: '<path d="M7 4v16M7 4L3.5 7.5M7 4l3.5 3.5M17 20V4M17 20l-3.5-3.5M17 20l3.5-3.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', rot: '<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M3 10a9 9 0 0 1 3-6M3 4v3h3M21 14a9 9 0 0 1-3 6M21 20v-3h-3"/>', follow: '<circle cx="12" cy="12" r="8"/><path d="M15 9l-2 5-4 1 2-5z"/>',
};
Object.assign(P, LIB_ICONS, GAME_ICONS);
const ic = (n, f) => `<svg class="ic${f ? ' f' : ''}" viewBox="0 0 24 24">${P[n]}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// demo songs have no artwork: a coloured card with the title, the hue taken from the id
for (const id of ORDER) if (!COVER[id]) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360; const t = SONGS[id].title; COVER[id] = { bg: `linear-gradient(135deg,hsl(${h} 46% 27%),hsl(${(h + 50) % 360} 38% 12%))`, big: esc(t).replace(' · ', '<br>').replace(/^(\S+ \S+) (.+)$/, '$1<br>$2'), fs: t.length > 16 ? 19 : 23 }; }
const fmt = t => { t = Math.max(0, t); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };

/* ---------- time helpers (audio seconds at 100 % <-> bars) ---------- */
const barTime = (b, s = song()) => s.audioOffset + b * s.secPerBar;
const barPos = (t, s = song()) => (t - s.audioOffset) / s.secPerBar; // fractional bar index (0-based)
const curT = () => E.playing ? Math.min(E.dur, E.t0 + Math.max(0, E.ctx.currentTime - E.c0) * rate()) : E.t;

/* ---------- audio engine ---------- */
async function ensureCtx() {
  if (!E.ctx) {
    E.ctx = new (window.AudioContext || window.webkitAudioContext)();
    E.master = E.ctx.createGain(); E.master.connect(E.ctx.destination);
  }
  if (E.ctx.state === 'suspended') await E.ctx.resume();
}
async function loadSong(id, speed) {
  const tok = ++E.token, s = SONGS[id];
  E.loading = true; E.pct = 0; render();
  await ensureCtx();
  if (s.kind === 'tab') { if (tok !== E.token) return false; E.dur = barTime(s.bars, s); E.loading = false; return true; } // no audio files: synthesised from the tab
  const keys = s.stems.map(st => `${id}/${st.id}_${speed}`);
  for (const k in E.buf) if (!keys.includes(k)) delete E.buf[k];
  let done = 0;
  await Promise.all(s.stems.map(async (st, i) => {
    const k = keys[i];
    if (!E.buf[k]) {
      const ab = await (await fetch(`media/${k}.m4a`)).arrayBuffer();
      const buf = await E.ctx.decodeAudioData(ab);
      if (tok !== E.token) return;
      E.buf[k] = buf;
    }
    E.pct = ++done / s.stems.length;
    document.querySelectorAll('[data-live=load]').forEach(el => el.style.width = (E.pct * 100) + '%');
  }));
  if (tok !== E.token) return false;
  E.dur = Math.max(...keys.map(k => E.buf[k].duration)) * speed / 100;
  E.dur = Math.min(E.dur, barTime(s.bars) + 2.5);
  E.loading = false;
  return true;
}
function applyMix() {
  if (!E.ctx || !S.songId) return;
  const m = S.mix[S.songId], anySolo = Object.values(m).some(x => x.solo);
  for (const st of song().stems) {
    const g = E.gains[st.id]; if (!g) continue;
    const x = m[st.id], v = x.mute || (anySolo && !x.solo) ? 0 : x.vol;
    g.gain.setTargetAtTime(v, E.ctx.currentTime, 0.015);
  }
}
function stopSrc() { for (const s of E.srcs) { try { s.stop(); } catch (e) {} s.disconnect(); } E.srcs = []; }
function startSrc(when) {
  stopSrc();
  const s = song();
  for (const st of s.stems) {
    if (!E.gains[st.id]) { E.gains[st.id] = E.ctx.createGain(); E.gains[st.id].connect(E.master); }
    const b = E.buf[`${s.id}/${st.id}_${S.speed}`]; if (!b) continue;
    const src = E.ctx.createBufferSource(); src.buffer = b; src.connect(E.gains[st.id]);
    src.start(when, Math.min(b.duration, E.t / rate()));
    E.srcs.push(src);
  }
  applyMix();
  E.c0 = when; E.t0 = E.t; E.playing = true;
  E.ni = s.ev.findIndex(e => e.t0 >= E.t - s.audioOffset - 0.001); if (E.ni < 0) E.ni = s.ev.length;
  E.lastK = Math.ceil(barPos(E.t0) * 4 - 1e-6) - 1;
}
// tab-only songs: Karplus-Strong plucked string, one cached buffer per pitch
const PL = {};
function pluck(midi) {
  if (PL[midi]) return PL[midi];
  const sr = E.ctx.sampleRate, N = Math.round(sr / (440 * Math.pow(2, (midi - 69) / 12))), len = Math.floor(sr * 2.4);
  const b = E.ctx.createBuffer(1, len, sr), d = b.getChannelData(0), ring = new Float32Array(N);
  let prev = 0; for (let i = 0; i < N; i++) { prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5; ring[i] = prev; }
  for (let i = 0; i < len; i++) { const j = i % N; d[i] = ring[j]; ring[j] = (ring[j] + ring[(j + 1) % N]) * 0.4985; }
  return PL[midi] = b;
}
function scheduleTab(s, t) {
  const ahead = t - s.audioOffset + 0.2 * rate();
  while (E.ni < s.ev.length && s.ev[E.ni].t0 < ahead) {
    const e = s.ev[E.ni++]; if (e.tech.includes('t')) continue;
    const when = E.c0 + (e.t0 + s.audioOffset - E.t0) / rate(); if (when < E.ctx.currentTime - 0.02) continue;
    const src = E.ctx.createBufferSource(), g = E.ctx.createGain(), dead = e.tech.includes('x');
    src.buffer = pluck(TUNING[e.str - 1] + e.fret); src.connect(g); g.connect(E.gains.tabsynth);
    g.gain.setValueAtTime(0.55, when); if (dead) g.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    src.start(when); src.stop(when + (dead ? 0.1 : 2.3)); E.srcs.push(src);
  }
  if (E.srcs.length > 240) E.srcs = E.srcs.slice(-120);
}
function click(when, accent) {
  const o = E.ctx.createOscillator(), g = E.ctx.createGain();
  o.frequency.value = accent ? 1600 : 1100; o.connect(g); g.connect(E.master);
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.35, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
  o.start(when); o.stop(when + 0.08);
}
async function play(withCount = true) {
  if (!S.songId || E.loading) return;
  await ensureCtx();
  // a deep link opens the player without loading: audio songs lack their buffers, tab-only songs their length
  if (song().kind === 'tab' ? !E.dur : !E.buf[`${S.songId}/${song().stems[0].id}_${S.speed}`]) { if (!await loadSong(S.songId, S.speed)) return; }
  if (E.t >= E.dur - 0.05) E.t = S.loop ? barTime(S.loop.a) : 0;
  let when = E.ctx.currentTime + 0.07;
  E.countFrom = 0;
  // the recordings carry their own count-in bar; add one only when starting later in the song
  if (withCount && S.countIn && barPos(E.t) >= song().countInBars - 0.02) {
    const bd = 60 / song().bpm / rate();
    for (let i = 0; i < 4; i++) click(when + i * bd, i === 0);
    E.countFrom = when; E.countBeat = bd; when += 4 * bd;
  }
  startSrc(when); render();
}
function pause() { if (!E.playing) return; E.t = curT(); E.playing = false; stopSrc(); E.countFrom = 0; render(); }
function seek(t, keep = true) {
  const was = E.playing; if (was) { E.t = curT(); stopSrc(); E.playing = false; }
  E.t = Math.max(0, Math.min(E.dur || 1e9, t)); E.countFrom = 0; gameSeek();
  if (was && keep) startSrc(E.ctx.currentTime + 0.03);
}
async function setSpeed(sp) {
  if (sp === S.speed || E.loading) return;
  const was = E.playing; if (was) { E.t = curT(); stopSrc(); E.playing = false; }
  S.speed = sp;
  if (S.songId) { const ok = await loadSong(S.songId, sp); if (ok && was) startSrc(E.ctx.currentTime + 0.05); }
  render();
}
async function openSong(id, surface, secId) {
  if (E.playing) pause();
  if (S.songId !== id) { E.t = 0; S.loop = null; AT.pendA = null; }
  S.songId = id; S.last = id;
  if (!S.mix[id]) { S.mix[id] = {}; for (const st of SONGS[id].stems) S.mix[id][st.id] = { vol: 0.85, mute: false, solo: false }; }
  S.app.sheet = null; S.web.modal = null; S[surface].screen = 'player';
  if (secId) setSection(secId, false);
  render();
  try { await loadSong(id, S.speed); } catch (e) { E.loading = false; toast('โหลดเสียงไม่ได้ — เปิดผ่าน local server (ดู README)'); }
  render();
}
function setSection(secId, doSeek = true) {
  const s = song();
  if (!secId || (S.loop && S.loop.secId === secId)) { S.loop = null; return; }
  const sec = s.sections.find(x => x.id === secId);
  S.loop = { a: sec.start, b: sec.end, secId };
  if (doSeek) seek(barTime(sec.start), false); else E.t = barTime(sec.start);
}

/* ---------- views ---------- */
function coverHTML(s, cls = '', tags = true, extra = '') {
  const c = COVER[s.id], img = s.cover || c.img;
  const bg = img ? `background-image:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.65)),url(${img})` : `background:${c.bg}`;
  return `<div class="cover ${cls}" style="${bg};${extra}">${c.big ? `<div class="big" style="font-size:${c.fs}px">${c.big}</div>` : ''}${tags ? `<div class="tags">${badges(s)}</div>` : ''}</div>`;
}
function badges(s) {
  let h = '';
  if (s.kind === 'stems') h += `<span class="chip lime">${s.stems.length} STEMS</span>`;
  if (s.kind === 'performance') h += `<span class="chip lime">ARTIST AUDIO</span><span class="chip red">DEMO</span>`;
  if (s.kind === 'backing') h += `<span class="chip lime">BACKING</span>`;
  if (s.kind === 'tab') h += `<span class="chip">TAB ONLY</span>`;
  if (s.learn) h += `<span class="chip or">COURSE</span>`;
  if (s.demo && s.rights.startsWith('Third-party')) h += `<span class="chip red">DEMO</span>`;
  if (GAME_SONGS[s.id]) h += `<span class="chip rk">${ic('trophy')} RANKED</span>`;
  if (s.tier === 'pro') h += `<span class="chip pro">${ic('lock')} PRO</span>`;
  return h;
}
const dots = n => `<span class="dots">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
function songCard(s) {
  return `<button class="scard" data-act="detail" data-id="${s.id}">${coverHTML(s)}
    <div><div class="t ell">${esc(s.title)}</div><div class="a ell">${esc(s.artist)}</div></div>
    <div class="m"><span>${s.bpm | 0} BPM</span><span>${esc(s.key)}</span><span>${dots(s.difficulty)}</span></div></button>`;
}
function detailHTML(s) {
  const what = s.kind === 'tab' ? `Tab + LED · ไม่มีเสียงประกอบ — ฟังเสียงสังเคราะห์จาก tab หรือปิดแล้วเล่นกับ metronome` : s.kind === 'stems' ? `Tab + LED · วงเต็ม ${s.stems.length} แทร็ก ปิด/เปิดทีละชิ้นได้`
    : s.kind === 'performance' ? `Tab + LED · เสียงเล่นจริงของศิลปิน 1 แทร็ก (ฟังเทียบ / ปิดแล้วเล่นเอง)`
      : `Tab + LED · Backing track 1 แทร็ก · มีบทเรียนใน Learn`;
  return `<div class="row" style="align-items:flex-start;gap:14px">
      ${coverHTML(s, '', false, 'width:96px;height:96px;flex:none')}
      <div class="grow"><div style="font-size:18px;font-weight:700;line-height:1.2">${esc(s.title)}</div>
        <div class="muted" style="margin:2px 0 8px">${esc(s.artist)} · ${esc(s.subtitle)}</div>
        <div class="row" style="flex-wrap:wrap;gap:5px">${badges(s)}</div></div>
      <button class="ib" data-act="closeDetail" aria-label="Close">${ic('x')}</button></div>
    <div class="row muted" style="margin-top:12px;font-size:12.5px;gap:14px;flex-wrap:wrap"><span>${s.bpm | 0} BPM</span><span>${esc(s.key)}</span><span>${s.bars - s.countInBars} bars</span><span>${esc(s.level)} ${dots(s.difficulty)}</span></div>
    ${odetailExtra(s.id)}
    <p style="margin:10px 0 0;font-size:13px">${what}</p>
    ${s.kind === 'performance' || s.kind === 'tab' || s.demo ? `<p class="muted" style="margin:6px 0 0;font-size:11.5px">⚠︎ ${esc(s.rights)}</p>` : ''}
    <div class="acts">
      <button class="btn" data-act="learn" data-id="${s.id}" ${s.learn ? '' : 'disabled'}>${ic('learn')}Learn<small>${s.learn ? `บทเรียน ${s.learn.done}/${s.learn.chapters}` : 'ยังไม่มี course'}</small></button>
      <button class="btn pri" data-act="open" data-id="${s.id}">${ic('play', 1)}Practice<small>เล่นกับ tab + LED</small></button>
      <button class="btn hb" data-act="hero" data-id="${s.id}">${ic('bolt', 1)}Hero Mode<small>Litejam Hero</small></button>
    </div>
    ${gameDetail(s)}
    <div class="h2" style="margin-top:16px"><h3 style="font-size:14px">ซ้อมเป็นท่อน</h3><span>${s.sections.length} ท่อน</span></div>
    <div class="secl">${s.sections.map(x => `<button class="sec" data-act="open" data-id="${s.id}" data-sec="${x.id}"><span>${esc(x.label)} <small>bar ${x.start + 1}–${x.end + 1}</small></span>${dots(x.diff)}</button>`).join('')}</div>`;
}
function sectionChips(s) {
  return `<button class="sec ${S.loop ? '' : 'sel'}" data-act="sec" data-sec="">ทั้งเพลง</button>` +
    s.sections.map(x => `<button class="sec ${S.loop && S.loop.secId === x.id ? 'sel' : ''}" data-act="sec" data-sec="${x.id}" data-secid="${x.id}">${esc(x.label)}</button>`).join('');
}
function stemRows(s) {
  const m = S.mix[s.id];
  const role = { drums: 'กลอง', bass: 'เบส', synth: 'ซินธ์', rhythm: 'กีตาร์ริธึม', guide: 'ทำนองนำ = ส่วนที่คุณเล่น', artist: 'เสียงเล่นจริงของศิลปิน', backing: 'ดนตรีประกอบ (ไม่มีกีตาร์นำ)', tabsynth: 'เสียงสังเคราะห์จาก tab' };
  return s.stems.map(st => { const x = m[st.id]; return `<div class="stem ${x.mute ? 'off' : ''}">
    <span class="dot" style="background:${STEM_COLOR[st.id]}"></span><span class="nm">${esc(st.label)}<small>${role[st.id] || ''}</small></span>
    <input type="range" min="0" max="100" value="${Math.round(x.vol * 100)}" data-vol="${st.id}" aria-label="${esc(st.label)} volume">
    <button class="ms m ${x.mute ? 'on' : ''}" data-act="mute" data-stem="${st.id}" title="Mute">M</button>
    ${s.stems.length > 1 ? `<button class="ms s ${x.solo ? 'on' : ''}" data-act="solo" data-stem="${st.id}" title="Solo">S</button>` : ''}</div>`; }).join('');
}
function presets(s) {
  if (s.kind === 'stems') return `<div class="presets"><button class="btn sm" data-act="preset" data-p="full">Full band</button><button class="btn sm" data-act="preset" data-p="minus">Minus guitar</button><button class="btn sm" data-act="preset" data-p="rhythm">Drums + Bass</button></div>`;
  const on = !S.mix[s.id][s.stems[0].id].mute;
  return `<div class="presets"><button class="btn sm ${on ? '' : 'pri'}" data-act="mute" data-stem="${s.stems[0].id}">${on ? 'ปิดเสียงแล้วเล่นเอง (เปิด Metronome)' : 'เปิดเสียงกลับ'}</button></div>`;
}
function toggles(s, web) {
  const sp = `<div class="seg sp" style="${web === 'land' ? 'width:150px;flex:none' : web ? 'width:190px' : 'flex:1.6'}" role="group" aria-label="Speed">${[50, 75, 100].map(v => `<button class="${S.speed === v ? 'on' : ''}" data-act="speed" data-v="${v}">${v}%</button>`).join('')}</div>`;
  const t = (act, on, icn, label) => `<button class="tog ${on ? 'on' : ''}" data-act="${act}" aria-pressed="${on}">${ic(icn)}<span>${label}</span></button>`;
  return sp + t('loop', !!S.loop, 'loop', 'Loop') + (web === true ? abHTML() : '') + t('countin', S.countIn, 'count', 'Count-in') + t('metro', S.metro, 'metro', 'Metronome');
}
function progress(s) {
  const d = E.dur || barTime(s.bars);
  const tk = s.sections.map(x => `<i class="tk" style="left:${barTime(x.start) / d * 100}%"></i>`).join('');
  const lp = S.loop ? `<i class="lp" style="left:${barTime(S.loop.a) / d * 100}%;width:${(S.loop.b + 1 - S.loop.a) * s.secPerBar / d * 100}%"></i>` : '';
  return `<div class="prog" data-prog><div class="tr">${lp}<i class="fl" data-live="fill"></i></div>${tk}</div>`;
}
const loader = () => E.loading ? `<div class="loadbar">กำลังโหลดเสียง ${S.speed}%<div class="b"><i data-live="load" style="width:${E.pct * 100}%"></i></div></div>` : '';
const ledChip = () => `<button class="chip ${S.led ? 'lime' : ''}" data-act="led" style="padding:6px 10px">${ic('bt')} ${S.led ? 'RGB24 · LED on' : 'Connect guitar'}</button>`;

/* --- APP --- */
function appHTML() {
  const a = S.app;
  const status = `<div class="a-status"><span>9:41</span><span style="opacity:.8">5G ▮▮▮</span></div>`;
  const nav = `<div class="a-nav">${[['chord', 'Chord'], ['scale', 'Scale'], ['guitar', 'Play'], ['learn', 'Learn'], ['device', 'Device']].map(([i, l]) => `<button class="${l === 'Play' ? 'on' : ''}" data-act="${l === 'Play' ? 'home' : 'othertab'}" data-l="${l}">${ic(i)}${l}</button>`).join('')}</div>`;
  if (a.screen === 'hero' && S.songId) return heroHTML('app');
  if (a.screen === 'player' && S.songId) return (a.land ? '' : status) + appPlayer();
  const lu = LU.app;
  const glow = `<div class="subtabs"><button class="${lu.page === 'official' ? 'on' : ''}" data-act="page" data-v="official">Official Tabs</button><button class="${lu.page === 'library' ? 'on' : ''}" data-act="page" data-v="library">My Library</button></div>` + libHome('app');
  const songs = `<p class="muted" style="margin-top:30px;text-align:center">คลังเพลง Songs (Chord / Tab) เดิมของแอป<br>ไม่เปลี่ยนในงานออกแบบนี้</p>`;
  const sheet = a.sheet ? `<div class="sheet-bg" data-act="closeDetail"><div class="sheet" data-stop><div class="grab"></div>${detailHTML(SONGS[a.sheet])}</div></div>` : '';
  return status + `<div class="a-head"><h2>Play</h2>${ledChip()}</div>
    <div style="padding:0 16px 6px"><div class="seg"><button class="${a.seg === 'songs' ? 'on' : ''}" data-act="seg" data-v="songs">Songs</button><button class="${a.seg === 'glowtab' ? 'on' : ''}" data-act="seg" data-v="glowtab">GlowTab</button></div></div>
    <div class="a-body" data-keep="a-home-${a.seg === 'glowtab' ? lu.page : 'songs'}">${a.seg === 'glowtab' ? glow : songs}</div>${nav}${sheet}${libOverlay('app')}${gamePanel('app')}`;
}
function appPlayer() {
  const s = song(), m = S.mix[s.id];
  const pills = s.stems.map(st => `<button class="pill ${m[st.id].mute ? 'off' : ''}" data-act="mute" data-stem="${st.id}"><i style="background:${STEM_COLOR[st.id]}"></i>${esc(st.label)}</button>`).join('');
  const rotBtn = `<button class="ib hb" data-act="hero" data-id="${s.id}" aria-label="Hero Mode" title="Hero Mode">${ic('bolt', 1)}</button><button class="ib" data-act="rotate" aria-label="Rotate screen" title="หมุนจอ">${ic('rot')}</button>`;
  const sheet = S.app.sheet === 'mixer' ? `<div class="sheet-bg ${S.app.land ? 'side' : ''}" data-act="closeDetail"><div class="sheet" data-stop><div class="grab"></div>
      <div class="h2" style="margin-top:0"><h3>Band</h3><button class="ib" data-act="closeDetail">${ic('x')}</button></div>${presets(s)}${stemRows(s)}</div></div>` : '';
  if (S.app.land) return `<div class="a-ll">
    <div class="a-ph"><button class="ib" data-act="back" data-surface="app" aria-label="Back">${ic('back')}</button>
      <div class="ttl ell" style="max-width:170px;flex:none">${esc(s.title)}<small class="ell">${esc(s.artist)} · ${s.bpm | 0} BPM</small></div>
      <div class="secs grow" data-keep="a-secs">${sectionChips(s)}</div>${ledChip()}${rotBtn}</div>
    <div class="tabwrap">${atSlot('app', 'horizontal-s', 'height:166px')}<div class="count" data-live="count"></div>${loader()}</div>
    <div class="row" style="padding:5px 14px 3px;gap:12px"><div class="grow"><canvas data-fret style="height:72px"></canvas></div>
      <div style="flex:none;width:104px;font-size:11px" class="muted">Bar <b data-live="bar" style="color:var(--text)">–</b> / ${s.bars}<br><span data-live="secname">–</span><div style="margin-top:5px">${abHTML()}</div></div></div>
    <div class="dock">
      <button class="ib" data-act="prev" aria-label="Previous section">${ic('prev')}</button>
      <button class="playb" data-act="toggle" aria-label="Play / Pause">${ic(E.playing || (G.hold && G.hstep) ? 'pause' : 'play', 1)}</button>
      <button class="ib" data-act="next" aria-label="Next section">${ic('next')}</button>
      <span class="time" data-live="time">0:00</span><div class="grow">${progress(s)}</div>
      ${toggles(s, 'land')}${listenTog()}${holdTog()}
      <button class="tog" data-act="mixer">${ic('mixer')}<span>${s.stems.length > 1 ? 'Band' : 'Audio'}</span></button>
    </div></div>${sheet}`;
  return `<div class="a-pl">
    <div class="a-ph"><button class="ib" data-act="back" data-surface="app" aria-label="Back">${ic('back')}</button>
      <div class="ttl grow ell">${esc(s.title)}<small class="ell">${esc(s.artist)} · ${s.bpm | 0} BPM · ${esc(s.key)}</small></div>${ledChip()}${rotBtn}</div>
    <div class="blk" style="padding-top:2px"><div class="secs" data-keep="a-secs">${sectionChips(s)}</div></div>
    <div class="tabwrap">${atSlot('app', 'horizontal', 'height:196px')}<div class="count" data-live="count"></div>${loader()}</div>
    <div class="readout"><span>Bar <b data-live="bar">–</b> / ${s.bars} · <span data-live="secname">–</span></span>${listenInfo()}${abHTML()}</div>
    <div class="blk" style="padding-top:4px"><canvas data-fret height="104" style="height:104px"></canvas></div>
    <div class="blk row" style="padding-top:2px"><div class="pills grow">${pills}</div>${s.stems.length > 1 ? `<button class="btn sm" data-act="mixer">${ic('mixer')} Mixer</button>` : ''}</div>
    <div class="foot">
      <div class="row" style="gap:6px">${toggles(s, false)}${listenTog()}${holdTog()}</div>
      <div style="margin-top:8px">${progress(s)}<div class="row" style="justify-content:space-between"><span class="time" data-live="time">0:00</span><span class="time">${fmt(E.dur || barTime(s.bars))}</span></div></div>
      <div class="row" style="justify-content:center;gap:26px;margin-top:2px">
        <button class="ib" data-act="prev" aria-label="Previous section">${ic('prev')}</button>
        <button class="playb" data-act="toggle" aria-label="Play / Pause">${ic(E.playing || (G.hold && G.hstep) ? 'pause' : 'play', 1)}</button>
        <button class="ib" data-act="next" aria-label="Next section">${ic('next')}</button></div>
    </div></div>${sheet}`;
}

/* --- WEB --- */
function webHTML() {
  const w = S.web;
  const nav = `<div class="w-nav"><div class="w-logo"><i></i>GlowTab</div>
    <button class="lk ${w.screen === 'home' && LU.web.page === 'official' ? 'on' : ''}" data-act="page" data-v="official">Official Tabs</button><button class="lk ${w.screen === 'home' && LU.web.page === 'library' ? 'on' : ''}" data-act="page" data-v="library">My Library</button>
    <span class="grow"></span>${ledChip()}<button class="btn sm" data-act="upload">${ic('up')} Upload Tab</button><span class="gpic" style="border-radius:50%">BK</span></div>`;
  if (w.screen === 'hero' && S.songId) return heroHTML('web');
  if (w.screen === 'player' && S.songId) return nav + webPlayer();
  const modal = w.modal ? `<div class="modal-bg" data-act="closeDetail"><div class="modal" data-stop>${detailHTML(SONGS[w.modal])}</div></div>` : '';
  return nav + `<div class="w-body" data-keep="w-home-${LU.web.page}">${libHome('web')}</div>${modal}${libOverlay('web')}${gamePanel('web')}`;
}
function webPlayer() {
  const s = song();
  return `<div class="w-pl">
    <div class="w-ph"><button class="ib" data-act="back" data-surface="web" aria-label="Back">${ic('back')}</button>
      <div class="ttl grow ell">${esc(s.title)}<small>${esc(s.artist)} · ${s.bpm | 0} BPM · ${esc(s.key)}</small></div>
      <span class="row" style="gap:5px">${badges(s)}</span>
      <button class="btn sm" data-act="learn" data-id="${s.id}" ${s.learn ? '' : 'disabled'}>${ic('learn')} Learn</button>
      <button class="btn sm hb" data-act="hero" data-id="${s.id}">${ic('bolt', 1)} Hero Mode</button></div>
    <div class="w-tabbox">${atSlot('web', 'page', 'position:absolute;inset:0')}<div class="count" data-live="count"></div>${loader()}</div>
    <div class="w-side">
      <h4>${s.kind === 'tab' ? 'เสียง · เพลงนี้ไม่มีวงประกอบ' : 'Band'}</h4>${presets(s)}${stemRows(s)}
      <h4 style="margin-top:16px">ท่อนเพลง <span style="text-transform:none;letter-spacing:0;font-weight:500">· กดเพื่อวน loop</span></h4>
      <p class="muted" style="margin:0 0 8px;font-size:11.5px;line-height:1.5">Loop เฉพาะ bar: กดค้างบนโน้ตแล้วลาก หรือกด A / B · ลากหมุดหัว-ท้ายเพื่อปรับ</p>
      <div class="secl"><button class="sec ${S.loop ? '' : 'sel'}" data-act="sec" data-sec="">ทั้งเพลง</button>
        ${s.sections.map(x => `<button class="sec ${S.loop && S.loop.secId === x.id ? 'sel' : ''}" data-act="sec" data-sec="${x.id}" data-secid="${x.id}"><span>${esc(x.label)} <small>bar ${x.start + 1}–${x.end + 1}</small></span>${dots(x.diff)}</button>`).join('')}</div>
    </div>
    <div class="w-fret"><div class="row" style="justify-content:space-between;margin-bottom:4px"><span class="muted" style="font-size:11.5px">LED preview · Bar <b data-live="bar" style="color:var(--text)">–</b> / ${s.bars} · <span data-live="secname">–</span></span>
      ${listenInfo()}<span class="legend"><span><i style="background:var(--lime)"></i>ตอนนี้</span><span><i style="background:var(--orange)"></i>ถัดไป</span>${G.listen ? '<span><i style="background:#22c55e"></i>ถูก</span><span><i style="background:#FF6B6B"></i>พลาด</span>' : ''}</span></div><canvas data-fret height="92" style="height:92px"></canvas></div>
    <div class="w-dock">
      <button class="ib" data-act="prev" aria-label="Previous section">${ic('prev')}</button>
      <button class="playb" data-act="toggle" aria-label="Play / Pause">${ic(E.playing || (G.hold && G.hstep) ? 'pause' : 'play', 1)}</button>
      <button class="ib" data-act="next" aria-label="Next section">${ic('next')}</button>
      <span class="time" data-live="time" style="width:34px;text-align:right">0:00</span><div class="grow">${progress(s)}</div><span class="time">${fmt(E.dur || barTime(s.bars))}</span>
      ${toggles(s, true)}
      <button class="tog ${S.follow ? 'on' : ''}" data-act="follow">${ic('follow')}<span>Follow</span></button>
      ${listenTog()}${holdTog()}
    </div></div>`;
}

/* ---------- render ---------- */
const $app = document.getElementById('app-root'), $web = document.getElementById('web-root');
function render() {
  const keep = {};
  document.querySelectorAll('[data-keep]').forEach(el => keep[el.dataset.keep] = [el.scrollTop, el.scrollLeft]);
  $app.innerHTML = appHTML(); $web.innerHTML = webHTML();
  document.querySelectorAll('[data-keep]').forEach(el => { const k = keep[el.dataset.keep]; if (k) { el.scrollTop = k[0]; el.scrollLeft = k[1]; } });
  document.getElementById('vs').innerHTML = [['both', 'เทียบสองจอ'], ['app', 'App'], ['web', 'Web']].map(([v, l]) => `<button class="${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}">${l}</button>`).join('');
  document.documentElement.dataset.theme = S.theme;
  document.getElementById('ts').innerHTML = [['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => `<button class="${S.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`).join('');
  document.querySelector('.phone').classList.toggle('land', !!S.songId && S.app.land && S.app.screen !== 'home');
  document.getElementById('col-app').style.display = S.view === 'web' ? 'none' : '';
  document.getElementById('col-web').style.display = S.view === 'app' ? 'none' : '';
  document.getElementById('url').textContent = 'glowtab.litejam.com' + (S.web.screen !== 'home' && S.songId ? `/song/${S.songId}` + (S.web.screen === 'hero' ? '/hero' : '') + (S.loop ? (S.loop.secId ? `?section=${S.loop.secId}` : `?loop=${S.loop.a + 1}-${S.loop.b + 1}`) : '') : '');
  lastSec = null;
  fit(); atMount(); g3Mount(); frame(true);
}
function fit() {
  const f = document.getElementById('fit'), st = document.getElementById('stage');
  f.style.transform = 'none'; st.style.height = 'auto';
  const w = f.offsetWidth, h = f.offsetHeight, k = Math.min(1, (st.clientWidth - 36) / w);
  f.style.transform = `scale(${k})`; f.style.marginBottom = (-(1 - k) * h) + 'px';
  f.style.marginLeft = f.style.marginRight = (-(1 - k) * w / 2) + 'px';
}
addEventListener('resize', fit);
let toastT;
function toast(html) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = html; document.body.appendChild(d);
  clearTimeout(toastT); toastT = setTimeout(() => d.remove(), 3600);
}

/* ---------- canvas helpers (the tab itself is drawn by alphaTab — tab.js) ---------- */
function setup(cv, h) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth; h = h || cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, w, h];
}
const FONT = 'Inter,-apple-system,"Segoe UI",system-ui,sans-serif';
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
for (const id of ORDER) { const s = SONGS[id]; s.byBar = {}; for (const e of s.ev) (s.byBar[e.bar] = s.byBar[e.bar] || []).push(e); }

/* ---------- canvas: fretboard / LED preview ---------- */
function drawFret(cv, s, t) {
  const [c, W, H] = setup(cv); c.clearRect(0, 0, W, H);
  const nf = s.maxFret, x0 = 22, fw = (W - x0 - 6) / nf, y0 = 9, gap = (H - 26) / 5, ts = t - s.audioOffset;
  c.fillStyle = '#211a14'; rr(c, x0, y0 - 6, W - x0 - 6, gap * 5 + 12, 4); c.fill();
  for (let f = 0; f <= nf; f++) { c.strokeStyle = f === 0 ? '#d8d8d8' : '#4a4a4a'; c.lineWidth = f === 0 ? 3 : 1; c.beginPath(); c.moveTo(x0 + f * fw, y0 - 6); c.lineTo(x0 + f * fw, y0 + gap * 5 + 6); c.stroke(); }
  c.lineWidth = 1; c.fillStyle = '#3a3a3a'; c.font = '600 9.5px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  for (const f of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]) if (f <= nf) {
    c.fillStyle = '#3d342b'; c.beginPath(); c.arc(x0 + (f - .5) * fw, y0 + gap * 2.5, f === 12 || f === 24 ? 4 : 3, 0, 7); c.fill();
    c.fillStyle = '#8f8f8f'; c.fillText(String(f), x0 + (f - .5) * fw, H - 1);
  }
  for (let i = 0; i < 6; i++) { c.strokeStyle = '#7a7a7a'; c.lineWidth = .6 + i * .28; c.beginPath(); c.moveTo(x0, y0 + i * gap); c.lineTo(W - 6, y0 + i * gap); c.stroke(); }
  const px = e => [e.fret === 0 ? x0 - 10 : x0 + (e.fret - .5) * fw, y0 + (e.str - 1) * gap];
  // next onset group
  let lo = 0, hi = s.onsets.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s.onsets[m] > ts + 0.01) hi = m; else lo = m + 1; }
  const nt = s.onsets[lo], r = Math.min(8.5, gap * .48);
  if (nt != null && nt - ts < 4) for (const e of s.ev) { if (e.t0 > nt + 0.002) break; if (Math.abs(e.t0 - nt) < 0.002 && !e.tech.includes('t')) { const [x, y] = px(e); c.strokeStyle = '#F5B14A'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r - 1, 0, 7); c.stroke(); } }
  if (G.fx) { const q = (performance.now() - G.fx.at) / 450; if (q >= 1) G.fx = null; else for (const e of G.fx.ev) { const [x, y] = px(e); c.strokeStyle = `rgba(34,197,94,${1 - q})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r + q * 14, 0, 7); c.stroke(); c.fillStyle = `rgba(34,197,94,${0.8 * (1 - q)})`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } }
  for (const e of s.ev) { if (e.t0 > ts) break; if (ts < e.t1) { const [x, y] = px(e), col = !G.listen || !e.gs ? '#A3E635' : e.gs === 1 ? '#22c55e' : '#FF6B6B'; c.shadowColor = col; c.shadowBlur = 12; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.shadowBlur = 0; if (G.listen && e.gs === 1) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); } c.fillStyle = '#111'; c.font = '700 9.5px ' + FONT; c.textBaseline = 'middle'; c.fillText(e.tech.includes('x') ? 'x' : String(e.fret), x, y + .5); c.textBaseline = 'alphabetic'; } }
}

/* ---------- frame loop ---------- */
let lastSec = null, lastPlayIcon = null;
function frame(once) {
  if (S.songId && !E.loading) {
    const s = song(); let t = curT();
    if (E.playing) {
      if (S.loop && t >= barTime(S.loop.b + 1) - 0.005) { E.t = barTime(S.loop.a); startSrc(E.ctx.currentTime + 0.02); t = E.t; }
      else if (t >= E.dur - 0.02) { gameSongEnd(s); E.playing = false; stopSrc(); E.t = S.loop ? barTime(S.loop.a) : 0; t = E.t; setTimeout(render); }
      if (E.playing && s.kind === 'tab') scheduleTab(s, t);
      if (S.metro && E.playing) { // schedule metronome clicks a little ahead
        const k = Math.floor(barPos(t + 0.12 * rate()) * 4);
        while (E.lastK < k) { E.lastK++; const bt = s.audioOffset + E.lastK * s.secPerBar / 4; const when = E.c0 + (bt - E.t0) / rate(); if (when > E.ctx.currentTime - 0.01 && E.lastK >= 0) click(when, E.lastK % 4 === 0); }
      }
    }
    const bp = barPos(t), bi = Math.max(0, Math.min(s.bars - 1, Math.floor(bp))), sec = s.secOfBar(bi);
    gameFrame(s, t);
    atFrame(s, t);
    document.querySelectorAll('canvas[data-hero]').forEach(cv => { if (cv.clientWidth) drawHero(cv, s, t); });
    g3Frame(s, t);
    document.querySelectorAll('canvas[data-fret]').forEach(cv => { if (cv.clientWidth) drawFret(cv, s, t); });
    const d = E.dur || barTime(s.bars);
    document.querySelectorAll('[data-live=fill]').forEach(el => el.style.width = (t / d * 100) + '%');
    document.querySelectorAll('[data-live=time]').forEach(el => el.textContent = fmt(t));
    document.querySelectorAll('[data-live=bar]').forEach(el => el.textContent = bi + 1);
    const cnt = E.playing && E.countFrom && E.ctx.currentTime < E.c0 ? String(4 - Math.max(0, Math.floor((E.ctx.currentTime - E.countFrom) / E.countBeat))) : '';
    document.querySelectorAll('[data-live=count]').forEach(el => { if (el.textContent !== cnt) { el.textContent = cnt; el.classList.toggle('on', !!cnt); } });
    const sid = sec ? sec.id : (bi < s.countInBars ? 'count' : '');
    if (sid !== lastSec) {
      lastSec = sid;
      document.querySelectorAll('[data-live=secname]').forEach(el => el.textContent = sec ? sec.label : (sid === 'count' ? 'Count-in' : '–'));
      document.querySelectorAll('[data-secid]').forEach(el => { el.classList.toggle('cur', el.dataset.secid === sid); if (el.dataset.secid === sid && el.parentElement.classList.contains('secs')) el.parentElement.scrollLeft = el.offsetLeft - el.parentElement.offsetLeft - 40; });
    }
  }
  if (!once) requestAnimationFrame(() => frame());
}

/* ---------- events ---------- */
function surfaceOf(el) { return el.closest('#app-root') ? 'app' : 'web'; }
document.addEventListener('click', ev => {
  const stopEl = ev.target.closest('[data-stop]');
  const el = ev.target.closest('[data-act]'); if (!el) return;
  if (stopEl && !stopEl.contains(el)) return; // click inside sheet, action is the backdrop
  const a = el.dataset.act, sf = surfaceOf(el), d = el.dataset;
  const s = S.songId ? song() : null;
  if (gameAction(a, d, sf)) return;
  if (libAction(a, d, sf)) { render(); return; }
  switch (a) {
    case 'view': S.view = d.v; break;
    case 'theme': S.theme = d.v; try { localStorage.setItem('gt-theme', d.v); } catch (e) {} break;
    case 'seg': S.app.seg = d.v; break;
    case 'home': S.app.screen = 'home'; S.app.sheet = null; break;
    case 'whome': S.web.screen = 'home'; break;
    case 'othertab': toast(`แท็บ <b>${d.l}</b> อยู่นอกขอบเขตงานนี้`); return;
    case 'detail': if (sf === 'app') S.app.sheet = d.id; else S.web.modal = d.id; break;
    case 'closeDetail': S.app.sheet = null; S.web.modal = null; break;
    case 'open': openSong(d.id, sf, d.sec); return;
    case 'back': S[d.surface].screen = 'home'; if (S.app.screen === 'home' && S.web.screen === 'home') pause(); break;
    case 'hero': enterHero(d.id || S.songId, sf); return;
    case 'htab': S[sf].screen = 'player'; break;
    case 'hflip': heroFlip(); break;
    case 'h3d': g3Toggle(); break;
    case 'hview': hViewToggle(); break;
    case 'hexit': S[sf].screen = 'home'; if (S.app.screen === 'home' && S.web.screen === 'home') pause(); break;
    case 'hrestart': seek(S.loop ? barTime(S.loop.a) : 0, false); render(); play(); return;
    case 'learn': toast(`ไปที่ Learn › ${esc(SONGS[d.id].learn.course)}<br><code>litejam://learn/course/vinai-mts?song=${d.id}</code>`); return;
    case 'challenge': toast(`เปิด Jam Hero › Song Mode (คะแนน + leaderboard อยู่ที่นั่น)<br><code>litejam://jamhero/play/${d.id}</code>`); return;
    case 'upload': toast(LU[sf].folder ? 'Upload Tabs — ไฟล์ใหม่จะเข้าโฟลเดอร์นี้ทันที (เหมือนบนเว็บ)' : 'Upload Tabs — เลือกไฟล์ GP3 · GP4 · GP5 · GPX · GP · ALPHATAB แล้วเข้า My List'); return;
    case 'led': S.led = !S.led; toast(S.led ? 'เชื่อมต่อ RGB24 แล้ว — ไฟบนคอกีตาร์ตามเสียงเพลง' : 'ตัดการเชื่อมต่อกีตาร์ — ยังดู LED preview บนจอได้'); break;
    case 'toggle': E.playing ? pause() : play(); return;
    case 'mixer': S.app.sheet = 'mixer'; break;
    case 'rotate': S.app.land = !S.app.land; S.app.sheet = null; break;
    case 'mute': S.mix[s.id][d.stem].mute = !S.mix[s.id][d.stem].mute; if (s.stems.length === 1 && S.mix[s.id][d.stem].mute) S.metro = true; applyMix(); break;
    case 'solo': S.mix[s.id][d.stem].solo = !S.mix[s.id][d.stem].solo; applyMix(); break;
    case 'preset': {
      const m = S.mix[s.id];
      for (const st of s.stems) { m[st.id].solo = false; m[st.id].mute = d.p === 'minus' ? st.id === 'guide' : d.p === 'rhythm' ? !['drums', 'bass'].includes(st.id) : false; }
      applyMix(); break;
    }
    case 'speed': setSpeed(+d.v); return;
    case 'loop':
      if (S.loop) S.loop = null;
      else { const b = Math.max(0, Math.min(s.bars - 1, Math.floor(barPos(curT()) + 1e-3))); setLoopBars(b, b, false); } // the bar the playhead is in, as on the live site
      AT.pendA = null; break;
    case 'loopA': loopAB('a'); break;
    case 'loopB': loopAB('b'); break;
    case 'loopX': loopAB('x'); break;
    case 'countin': S.countIn = !S.countIn; break;
    case 'metro': S.metro = !S.metro; if (E.playing) E.lastK = Math.ceil(barPos(curT()) * 4 - 1e-6) - 1; break;
    case 'follow': S.follow = !S.follow; break;
    case 'sec': {
      const was = E.playing;
      if (!d.sec) S.loop = null;
      else { const sec = s.sections.find(x => x.id === d.sec); S.loop = { a: sec.start, b: sec.end, secId: sec.id }; seek(barTime(sec.start), false); if (was) { render(); play(true); return; } }
      break;
    }
    case 'prev': case 'next': {
      const bi = Math.floor(barPos(curT()) + 1e-3); let i = s.sections.findIndex(x => bi >= x.start && bi <= x.end);
      let tgt;
      if (a === 'prev') tgt = i <= 0 ? 0 : (barPos(curT()) - s.sections[i].start > 0.5 ? barTime(s.sections[i].start) : barTime(s.sections[i - 1].start));
      else tgt = i < 0 ? barTime(s.sections[0].start) : (i + 1 < s.sections.length ? barTime(s.sections[i + 1].start) : curT());
      if (S.loop) { const sec = s.secOfBar(Math.round(barPos(tgt))); if (sec) S.loop = { a: sec.start, b: sec.end, secId: sec.id }; }
      seek(tgt); break;
    }
  }
  render();
});
document.addEventListener('input', ev => {
  const inp = ev.target.dataset.inp;
  if (inp) { // search boxes + folder name: keep focus and caret across the re-render
    const sf = surfaceOf(ev.target), pos = ev.target.selectionStart; libInput(inp, ev.target.value, sf);
    if (inp !== 'fname') { render(); const n = document.querySelector(`#${sf}-root [data-inp="${inp}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }
    return;
  }
  const st = ev.target.dataset.vol; if (!st || !S.songId) return;
  S.mix[S.songId][st].vol = ev.target.value / 100; applyMix();
  document.querySelectorAll(`[data-vol="${st}"]`).forEach(x => { if (x !== ev.target) x.value = ev.target.value; });
});
// seek: progress bars + click on tab
function progSeek(el, ev) { const r = el.getBoundingClientRect(); seek((ev.clientX - r.left) / r.width * (E.dur || 1)); }
let dragEl = null;
document.addEventListener('pointerdown', ev => {
  const p = ev.target.closest('[data-prog]'); if (p && S.songId && !E.loading) { dragEl = p; progSeek(p, ev); ev.preventDefault(); return; }
});
document.addEventListener('pointermove', ev => { if (dragEl) progSeek(dragEl, ev); });
document.addEventListener('pointerup', () => { dragEl = null; });
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.inp === 'fname') { libAction('fsave', {}, surfaceOf(ev.target)); render(); } });
document.addEventListener('keydown', ev => { if (ev.code === 'Space' && S.songId && !/INPUT|TEXTAREA/.test(ev.target.tagName)) { ev.preventDefault(); if (G.hold && glistenOn()) gholdPlay(); else E.playing ? pause() : play(); } });

// deep link for review: ?view=web&song=LJS001
const q = new URLSearchParams(location.search);
if (q.get('view')) S.view = q.get('view');
if (q.get('theme') === 'light' || q.get('theme') === 'dark') S.theme = q.get('theme');
render();
if (q.get('song') && SONGS[q.get('song')]) { S.songId = q.get('song'); S.last = S.songId; S.mix[S.songId] = {}; for (const st of song().stems) S.mix[S.songId][st.id] = { vol: 0.85, mute: false, solo: false }; S.app.screen = S.web.screen = q.get('hero') ? 'hero' : 'player'; E.dur = 0; render(); }
requestAnimationFrame(() => frame());
