/* GlowTab — Hero Mode ("Litejam Hero")
 * Same song, same audio engine and same clock as Practice; only the picture changes:
 * a fretboard across the bottom, notes flying in from the back along their fret lane,
 * coloured by string, with a bracket showing the hand position.
 * Layout follows the live Jam Hero game (jamhero.litejam.com). Jam = no score, no miss marks; Ranked (game.js) adds both.
 * Loaded before app.js; everything here is called at render / frame time.
 */
'use strict';
const HSTR = ['#FFD21A', '#B44CFF', '#FF7A1A', '#2F7BFF', '#27D645', '#FF3347']; // string 1 (high e) .. 6 (low E)
const HNAME = ['e', 'B', 'G', 'D', 'A', 'E'];
const HV = { cam: null, lo: 1, hi: 4, tlo: 1, thi: 4, song: null, last: 0 };
const HFRETS = 24;
// string order on the board: false = low E on top (the Jam Hero game), true = high e on top (the way a tab is written)
// the 3D guitar follows it (g3Mirror in guitar3d.js)
let HFLIP = false; try { HFLIP = localStorage.getItem('gt-hero-flip') === '1'; } catch (e) {}
function heroFlip() { HFLIP = !HFLIP; try { localStorage.setItem('gt-hero-flip', HFLIP ? '1' : '0'); } catch (e) {} }
const hFlipBtn = cls => `<button class="${cls}" data-act="hflip" aria-pressed="${HFLIP}" title="สลับลำดับสาย: ตอนนี้${HFLIP ? 'สาย 1 (e) อยู่บน แบบ tab' : 'สาย 6 (E) อยู่บน แบบ Jam Hero'}">${ic('flip')} ${HFLIP ? 'e→E' : 'E→e'}</button>`;

function heroHTML(sf) {
  const s = song();
  const start = S.loop ? barTime(S.loop.a) : 0, fresh = Math.abs(E.t - start) < 0.06;
  const hb = COVER[s.id].hero || s.cover || COVER[s.id].img;
  const bg = hb ? `background-image:url(${hb})` : `background:${COVER[s.id].bg}`;
  const gm = gameOn(s);
  const ov = gm && G.panel ? gameHeroPanel() : !E.playing && !E.loading ? `<div class="h-ov">
      <div class="h-brand">LITEJAM HERO</div>
      <div class="h-ttl">${fresh ? 'READY' : 'PAUSED'}</div>
      ${gameSeg(s)}${gm ? gameReady(s) : ''}
      <div class="h-row">
        <button class="btn pri" data-act="toggle" ${gm && !gready() ? 'disabled' : ''}>${ic('play', 1)} ${fresh ? 'Start' : 'Resume'}</button>
        ${fresh ? '' : `<button class="btn" data-act="hrestart">${ic('prev')} Restart</button>`}
        <button class="btn" data-act="htab">${ic('chord')} Practice (Tab)</button>
        ${hFlipBtn('btn')}
        ${g3Btn('btn')}
        <button class="btn" data-act="hexit">${ic('x')} ออก</button>
      </div>
      <div class="h-opt">${toggles(s, 'land')}</div>
      <div class="secs h-secs" data-keep="h-secs-${sf}">${sectionChips(s)}</div>
      <p class="h-note">${gm ? gameNote(s) : `Jam mode · ไม่มีคะแนน — เล่นตามโน้ตที่วิ่งเข้ามา ${S.led ? 'ไฟบนคอกีตาร์ติดตามสีสาย' : 'ต่อกีตาร์เพื่อให้ไฟบนคอติดตามสีสาย'}`}</p>
    </div>` : '';
  const port = sf === 'app' && !S.app.land;
  return `<div class="hero ${sf} ${port ? 'port' : ''}">
    <div class="h-bg" style="${bg}"></div><div class="h-beam"></div><div class="h-beam b2"></div>
    <canvas data-hero></canvas>
    ${g3Slot(sf)}
    <div class="h-prog">${progress(s)}</div>
    <div class="h-hud">
      <button class="h-btn" data-act="toggle" aria-label="Play / Pause">${ic(E.playing ? 'pause' : 'play', 1)}</button>
      <div class="h-card"><b class="ell">${esc(s.title)}</b><small class="ell">${esc(s.artist)}</small>
        <div>BPM: <b>${s.bpm | 0}</b><i></i>Key: <b>${esc(s.key)}</b>${S.speed !== 100 ? `<i></i>${S.speed}%` : ''}</div></div>
      <div class="h-now"><span data-live="secname">–</span><b data-live="hchord"></b></div>
      ${gm ? gameHud() : ''}
      <span class="grow"></span>
      <span class="h-tag ${gm ? 'rk' : ''}">${ic(gm ? 'trophy' : 'bolt', gm ? 0 : 1)} HERO · ${gm ? 'RANKED' : 'JAM'}</span>${ledChip()}
      ${g3Btn('btn sm g3')}
      ${hFlipBtn('btn sm flip')}
      <button class="btn sm" data-act="htab" title="กลับไปดู Tab ที่ตำแหน่งเดิม">${ic('chord')} Tab</button>
      ${sf === 'app' ? `<button class="ib rot" data-act="rotate" aria-label="Rotate screen" title="หมุนจอ">${ic('rot')}</button>` : ''}
      <button class="ib ex" data-act="hexit" aria-label="Exit Hero Mode">${ic('x')}</button>
    </div>
    <div class="count" data-live="count"></div>${loader()}${ov}</div>`;
}

function enterHero(id, sf) {
  S.app.sheet = null; S.web.modal = null;
  if (S.songId === id && E.dur > 0 && !E.loading) { S[sf].screen = 'hero'; render(); return; } // from Practice: keep position and keep playing
  openSong(id, sf); S[sf].screen = 'hero'; render();
}

const hLower = (ev, t) => { let lo = 0, hi = ev.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t0 < t) lo = m + 1; else hi = m; } return lo; };
// hand position: the fretted notes sounding now and in the next 1.6 s decide a window of at least 4 frets
function heroWindow(s, ts) {
  let lo = 99, hi = 0;
  for (let i = hLower(s.ev, ts - 3); i < s.ev.length; i++) {
    const e = s.ev[i]; if (e.t0 > ts + 1.6) break;
    if (e.fret <= 0 || e.t1 < ts - 0.15) continue;
    if (e.fret < lo) lo = e.fret; if (e.fret > hi) hi = e.fret;
  }
  if (hi === 0) return [HV.tlo, HV.thi];
  if (hi - lo < 3) hi = lo + 3;
  if (hi > HFRETS) { hi = HFRETS; lo = Math.min(lo, hi - 3); }
  return [lo, hi];
}
function hPill(c, x, y, w, h) { rr(c, x - w / 2, y - h / 2, w, h, Math.min(h / 2, w / 2)); }
function hAlpha(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

function drawHero(cv, s, t) {
  const [c, W, H] = setup(cv); c.clearRect(0, 0, W, H);
  const ts = t - s.audioOffset, spb = 60 / s.bpm;
  // portrait phone: fewer frets across (zooms out when the hand window is wide), longer runway above the board
  const port = H > W * 1.15, span = HV.cam == null || HV.song !== s.id ? 4 : HV.hi - HV.lo + 1;
  const cell = port ? (W - 36) / Math.max(4.7, span + 1.5) : W / 10.4;
  const bTop = H * (port ? 0.66 : 0.6), bBot = H * (port ? 0.875 : 0.885), gap = (bBot - bTop) / 5, vpX = W / 2, vpY = H * (port ? 0.3 : 0.4);
  const LOOK = Math.min(3.4, Math.max(2.2, s.secPerBar));
  const kOf = d => 1 / (1 + Math.max(0, d) * 3.2), kFar = kOf(1);
  const pr = (x, y, k) => [vpX + (x - vpX) * k, vpY + (y - vpY) * k];
  const yOf = str => bTop + (HFLIP ? str - 1 : 6 - str) * gap;

  // camera + hand window (eased once per animation frame, both surfaces share it)
  const [tlo, thi] = heroWindow(s, ts); HV.tlo = tlo; HV.thi = thi;
  const half = (W / 2 - (port ? 34 : 52)) / cell, camT = Math.max(half, Math.min(HFRETS - half + 0.4, (tlo - 1 + thi) / 2));
  const now = performance.now();
  if (HV.cam == null || HV.song !== s.id) { HV.cam = camT; HV.lo = tlo; HV.hi = thi; HV.song = s.id; HV.last = now; }
  else if (now - HV.last > 4) {
    const a = 1 - Math.exp(-Math.min(0.1, (now - HV.last) / 1000) * 5.5); HV.last = now;
    HV.cam += (camT - HV.cam) * a; HV.lo += (tlo - HV.lo) * a * 1.4; HV.hi += (thi - HV.hi) * a * 1.4;
  }
  const xOf = f => W / 2 + (f - HV.cam) * cell; // x of fret wire f; fret f is the cell between wires f-1 and f
  const f0 = Math.max(0, Math.floor(HV.cam - half - 2)), f1 = Math.min(HFRETS, Math.ceil(HV.cam + half + 2));
  const inWin = f => f >= Math.round(HV.lo) && f <= Math.round(HV.hi);

  // floor: fret wires running into the distance + beat lines coming towards the player
  c.lineWidth = 1;
  for (let f = f0; f <= f1; f++) { const [x1, y1] = pr(xOf(f), bBot, kFar); c.strokeStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.moveTo(xOf(f), bTop); c.lineTo(x1, y1 - (bBot - bTop) * kFar); c.stroke(); c.beginPath(); c.moveTo(xOf(f), bBot); c.lineTo(x1, y1); c.stroke(); }
  for (let i = Math.max(0, Math.ceil(ts / spb)); i * spb < ts + LOOK; i++) {
    const d = (i * spb - ts) / LOOK, k = kOf(d), [xa, y] = pr(xOf(f0), bBot, k), [xb] = pr(xOf(f1), bBot, k);
    c.strokeStyle = `rgba(255,255,255,${(i % 4 === 0 ? 0.2 : 0.08) * (1 - d * 0.7)})`; c.beginPath(); c.moveTo(xa, y); c.lineTo(xb, y); c.stroke();
  }

  // collect notes: flying (not yet due), sounding, and just finished
  const fly = [], on = [];
  for (let i = hLower(s.ev, ts - 6); i < s.ev.length; i++) {
    const e = s.ev[i]; if (e.t0 > ts + LOOK) break;
    if (e.tech.includes('t')) continue;
    if (e.t0 > ts) fly.push(e); else if (ts < e.t1 + 0.16) on.push(e);
  }
  const mid = (HV.lo - 1 + HV.hi) / 2, xN = e => e.fret > 0 ? xOf(e.fret - 0.5) : xOf(mid);

  // board
  const g = c.createLinearGradient(0, bTop - gap, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.18, 'rgba(0,0,0,.62)'); g.addColorStop(1, 'rgba(0,0,0,.88)');
  c.fillStyle = g; c.fillRect(0, bTop - gap, W, H - bTop + gap);
  // lanes on the floor and lit cells for what is coming / sounding
  for (const e of fly) {
    if (e.fret <= 0) continue; const d = (e.t0 - ts) / LOOK; if (d > 0.62) continue;
    const k = kOf(d), col = HSTR[e.str - 1], a = 0.26 * (1 - d / 0.62);
    const [ax, ay] = pr(xOf(e.fret - 1), bBot, k), [bx] = pr(xOf(e.fret), bBot, k);
    c.fillStyle = hAlpha(col, a); c.beginPath(); c.moveTo(xOf(e.fret - 1), bBot); c.lineTo(xOf(e.fret), bBot); c.lineTo(bx, ay); c.lineTo(ax, ay); c.closePath(); c.fill();
    if (d < 0.3) { c.fillStyle = hAlpha(col, 0.3 * (1 - d / 0.3)); c.fillRect(xOf(e.fret - 1), bTop, cell, bBot - bTop); }
  }
  for (const e of on) if (e.fret > 0) { const fade = ts < e.t1 ? 1 : 1 - (ts - e.t1) / 0.16; c.fillStyle = hAlpha(HSTR[e.str - 1], 0.34 * fade); c.fillRect(xOf(e.fret - 1), bTop, cell, bBot - bTop); }
  // fret wires, inlays, strings
  for (let f = f0; f <= f1; f++) { c.strokeStyle = f === 0 ? '#e8e8e8' : 'rgba(255,255,255,.3)'; c.lineWidth = f === 0 ? 4 : 1.2; c.beginPath(); c.moveTo(xOf(f), bTop - 2); c.lineTo(xOf(f), bBot + 2); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,.28)';
  for (const f of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]) if (f >= f0 && f <= f1) {
    const x = xOf(f - 0.5), r = Math.max(4, gap * 0.24);
    if (f % 12 === 0) { c.beginPath(); c.arc(x, bTop + gap * 1.5, r, 0, 7); c.fill(); c.beginPath(); c.arc(x, bTop + gap * 3.5, r, 0, 7); c.fill(); }
    else { c.beginPath(); c.arc(x, bTop + gap * 2.5, r, 0, 7); c.fill(); }
  }
  const openOn = {}; for (const e of on) if (e.fret === 0 && ts < e.t1 && !e.tech.includes('x')) openOn[e.str] = 1;
  for (let str = 6; str >= 1; str--) {
    const y = yOf(str), col = HSTR[str - 1];
    if (openOn[str]) { c.shadowColor = col; c.shadowBlur = 16; c.strokeStyle = '#fff'; c.lineWidth = 4; } else { c.strokeStyle = hAlpha(col, 0.9); c.lineWidth = 1.4 + (str - 1) * 0.38; }
    c.beginPath(); c.moveTo(Math.max(0, xOf(0)), y); c.lineTo(W, y); c.stroke(); c.shadowBlur = 0;
  }
  // fret numbers
  const fs = Math.max(11, Math.min(17, cell * 0.14)); c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let f = Math.max(1, f0); f <= f1; f++) {
    const x = xOf(f - 0.5), w = inWin(f);
    c.font = `${w ? 700 : 500} ${fs}px ${FONT}`; c.fillStyle = w ? '#fff' : 'rgba(255,255,255,.34)'; c.fillText(String(f), x, bBot + fs * 1.45);
    if ([3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(f)) { c.beginPath(); c.arc(x, bBot + fs * 0.55, 1.8, 0, 7); c.fill(); }
  }
  // hand bracket
  const xa = xOf(HV.lo - 1) - 5, xb = xOf(HV.hi) + 5, ya = bTop - gap * 0.3, yb = bBot + gap * 0.3, tk = Math.min(16, cell * 0.16);
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3.5; c.lineJoin = c.lineCap = 'round';
  c.beginPath(); c.moveTo(xa + tk, ya); c.lineTo(xa, ya); c.lineTo(xa, yb); c.lineTo(xa + tk, yb); c.stroke();
  c.beginPath(); c.moveTo(xb - tk, ya); c.lineTo(xb, ya); c.lineTo(xb, yb); c.lineTo(xb - tk, yb); c.stroke();

  // notes: far first — in Ranked a missed note goes grey and a hit note bursts white
  const GM = gameOn(s);
  const pw = cell * (port ? 0.66 : 0.46), ph = Math.min(gap * 0.8, cell * (port ? 0.42 : 0.26));
  const noteAt = (e, k, a, lit) => {
    const dead = e.tech.includes('x'), open = e.fret === 0 && !dead, col = GM && e.gs === 2 ? '#5b5b62' : dead ? '#cfcfcf' : HSTR[e.str - 1];
    const [x, y] = pr(xN(e), yOf(e.str), k), w = (open ? (HV.hi - HV.lo + 1) * cell * 0.92 : pw) * k, h = ph * k;
    c.globalAlpha = a;
    if (e.t1 - e.t0 > 0.45) { // sustain tail along the lane
      const k1 = kOf((Math.min(e.t1, ts + LOOK) - ts) / LOOK), [x1, y1] = pr(xN(e), yOf(e.str), k1);
      c.strokeStyle = hAlpha(col, 0.75); c.lineWidth = Math.max(1.5, h * 0.34); c.lineCap = 'butt'; c.beginPath(); c.moveTo(x, y); c.lineTo(x1, y1); c.stroke();
    }
    if (lit) { c.shadowColor = col; c.shadowBlur = 20; }
    c.fillStyle = open ? hAlpha(col, 0.55) : col; hPill(c, x, y, Math.max(5, w), Math.max(3, h)); c.fill(); c.shadowBlur = 0;
    if (lit || k > 0.86) { c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = lit ? 2.2 : 1.4; hPill(c, x, y, Math.max(5, w), Math.max(3, h)); c.stroke(); }
    if (h >= 8) {
      c.font = `700 ${Math.max(7, h * 0.72)}px ${FONT}`; c.fillStyle = e.str === 1 || dead ? '#111' : '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const mk = e.tech.includes('b') ? '↑' : e.tech.includes('s') ? '⟋' : e.tech.includes('v') ? '~' : '';
      c.fillText((dead ? 'X' : String(e.fret)) + (k > 0.7 ? mk : ''), x, y + 0.5);
    }
    c.globalAlpha = 1;
  };
  for (let i = fly.length - 1; i >= 0; i--) { const e = fly[i], d = (e.t0 - ts) / LOOK; noteAt(e, kOf(d), Math.min(1, (1 - d) / 0.14), false); }
  for (const e of on) {
    const live = ts < e.t1, a = live ? 1 : 1 - (ts - e.t1) / 0.16; noteAt(e, 1, a, live);
    const q = (ts - e.t0) / 0.28; if (q < 1 && !(GM && e.gs !== 1)) { const x = xN(e), y = yOf(e.str); c.strokeStyle = GM ? `rgba(255,255,255,${1 - q})` : hAlpha(HSTR[e.str - 1], 1 - q); c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, ph * (0.6 + q * 1.5), 0, 7); c.stroke(); }
  }

  if (GM) gameDraw(c, W, H, bTop, gap);

  // string names (fixed at the left edge)
  const lw = port ? 28 : 40; c.fillStyle = 'rgba(16,16,18,.9)'; rr(c, -8, bTop - gap * 0.62, lw + 8, gap * 6.24, 8); c.fill(); c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1; c.stroke();
  c.font = `700 ${Math.max(11, Math.min(18, gap * 0.62))}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let str = 6; str >= 1; str--) {
    const y = yOf(str); if (openOn[str]) { c.fillStyle = hAlpha(HSTR[str - 1], 0.35); c.beginPath(); c.arc(lw / 2, y, gap * 0.42, 0, 7); c.fill(); }
    c.fillStyle = HSTR[str - 1]; c.fillText(HNAME[str - 1], lw / 2, y + 0.5);
  }

  // current chord in the HUD
  if (!s.chordT) s.chordT = s.chords.map(x => [(x[0] * 4 + x[1]) * spb, x[2]]);
  let ch = ''; for (const x of s.chordT) { if (x[0] > ts + 0.02) break; ch = x[1]; }
  const el = cv.parentElement.querySelector('[data-live=hchord]'); if (el && el.textContent !== ch) el.textContent = ch;
}
