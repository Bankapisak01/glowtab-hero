/* GlowTab — tab surface drawn by alphaTab, the library (and version, 1.6.3) glowtab.litejam.com uses.
 *
 * alphaTab only draws here: its own player is off, because in Official Tabs the recorded audio is the
 * master clock (Surface Map R4). So the playhead, the note highlight, the loop fill and the loop
 * handles are ours, placed from alphaTab's `boundsLookup` — the same numbers it puts its own cursor on.
 *
 * Loop is always whole bars (S.loop = {a, b} bar indices, inclusive) and can be set three ways:
 *   1. A / B buttons — mark the bar the playhead is in as the start / the end
 *   2. hold on the score, then drag — every bar the drag passes over (a mouse may drag straight away)
 *   3. drag a handle of an existing loop — moves that end bar by bar
 * A plain tap still seeks to the note under the pointer.
 */
'use strict';
const AT = { s: {}, gp: {}, drag: null, pendA: null };
/* Sheet colours per theme. Light is alphaTab's own print look (what the live site shows); dark follows the app CI. */
const AT_THEME = {
  dark: { staffLineColor: '#4A4A4A', barSeparatorColor: '#7A7A7A', mainGlyphColor: '#F2F2F2', secondaryGlyphColor: '#9A9A9A', scoreInfoColor: '#F2F2F2', barNumberColor: '#A3E635' },
  light: { staffLineColor: '#A5A5A5', barSeparatorColor: '#222211', mainGlyphColor: '#000000', secondaryGlyphColor: '#00000066', scoreInfoColor: '#000000', barNumberColor: '#C80000' },
};
const AT_HOLD_MS = 320, AT_SLOP_PX = 8, AT_EDGE_PX = 50, AT_EDGE_STEP = 16;

const atSlot = (sf, layout, style) => `<div class="at-slot" data-atslot="${sf}" data-layout="${layout}" style="${style || ''}"></div>`;

function atSurface(sf) {
  if (AT.s[sf]) return AT.s[sf];
  const wrap = document.createElement('div'); wrap.className = 'at-scroll';
  wrap.innerHTML = '<div class="at-inner"><div class="at-host"></div><div class="at-ov"><div class="at-lp"></div><i class="at-cur"></i></div></div>';
  const o = AT.s[sf] = {
    sf, wrap, inner: wrap.firstChild, host: wrap.querySelector('.at-host'), lp: wrap.querySelector('.at-lp'), cur: wrap.querySelector('.at-cur'),
    api: null, key: '', layout: '', bars: [], ready: false, loopKey: '', hl: null, lastT: -1, rowY: -1, scroll: [0, 0],
  };
  atBind(o);
  return o;
}

/* The surfaces live outside render(): it rebuilds the page from strings, and a score that takes a
 * moment to lay out cannot be rebuilt on every click. Each render leaves an empty slot and the
 * surface is moved back into it. */
function atMount() {
  for (const sf of ['app', 'web']) {
    const slot = document.querySelector(`#${sf}-root [data-atslot]`);
    if (!slot || !slot.getClientRects().length || !S.songId) continue;
    const o = atSurface(sf);
    slot.appendChild(o.wrap);
    o.wrap.scrollLeft = o.scroll[0]; o.wrap.scrollTop = o.scroll[1];
    o.loopKey = '!';
    atLoad(o, S.songId, slot.dataset.layout);
  }
}

async function atLoad(o, id, layout) {
  const key = id + '|' + layout + '|' + S.theme; // colours are baked into the drawing, so a theme change re-renders
  if (o.key === key) return;
  o.key = key; o.layout = layout; o.ready = false; o.bars = []; o.hl = null; o.lp.innerHTML = ''; o.scroll = [0, 0];
  o.wrap.classList.add('loading'); o.wrap.scrollLeft = o.wrap.scrollTop = 0;
  if (o.api) { try { o.api.destroy(); } catch (e) {} }
  const host = document.createElement('div'); host.className = 'at-host'; o.host.replaceWith(host); o.host = host;
  const A = window.alphaTab, page = layout === 'page';
  const api = o.api = new A.AlphaTabApi(host, {
    core: { fontDirectory: 'vendor/alphatab/font/', useWorkers: false, enableLazyLoading: false },
    display: {
      layoutMode: page ? A.LayoutMode.Page : A.LayoutMode.Horizontal,
      // the web page shows notation + tab like the live site; the phone has room for the tab staff only
      staveProfile: page ? A.StaveProfile.ScoreTab : A.StaveProfile.Tab,
      resources: AT_THEME[S.theme],
      scale: page ? 0.95 : layout === 'horizontal-s' ? 0.8 : 0.9,
      ...(page ? {} : { padding: [14, 4] }), // the phone strip has no room for the sheet's page margins
    },
    player: { enablePlayer: false, enableCursor: false, enableUserInteraction: false },
  });
  // a frame late: the handler runs before the browser has laid the new partials out
  api.postRenderFinished.on(() => requestAnimationFrame(() => { if (o.api === api) atMeasure(o); }));
  api.error.on(e => console.error('[alphaTab]', e));
  try {
    const buf = AT.gp[id] || (AT.gp[id] = await (await fetch(`data/gp/${id}.gp`)).arrayBuffer());
    if (o.api !== api) return;
    const score = A.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buf), api.settings);
    // same clean-up as the live site: the header above the score already names the song
    for (const k of ['title', 'subTitle', 'artist', 'album', 'words', 'music', 'copyright', 'tab', 'instructions', 'notices']) score[k] = '';
    api.renderScore(score, [Math.min(SONGS[id].gpTrack || 0, score.tracks.length - 1)]);
  } catch (e) { console.error('[alphaTab] load', e); o.wrap.classList.remove('loading'); toast('เปิดไฟล์ tab ไม่ได้ — ตรวจโฟลเดอร์ data/gp'); }
}

/* One entry per bar: its rectangle, and where each beat sits inside it (fraction of the bar → x). */
function atMeasure(o) {
  const lk = o.api.renderer.boundsLookup; if (!lk) return;
  const surf = o.host.firstElementChild;
  const dx = o.host.offsetLeft + (surf ? surf.offsetLeft : 0), dy = o.host.offsetTop + (surf ? surf.offsetTop : 0);
  const bars = [];
  for (const sys of (lk.staffSystems || lk.staveGroups || [])) for (const mb of sys.bars) {
    const v = mb.visualBounds, r = mb.realBounds, pts = [];
    for (const bb of mb.bars) for (const b of bb.beats) {
      const dur = b.beat.voice.bar.masterBar.calculateDuration() || 3840;
      pts.push([Math.max(0, b.beat.playbackStart / dur), dx + (b.onNotesX || b.visualBounds.x), b.beat.id]);
    }
    pts.sort((p, q) => p[0] - q[0]);
    bars[mb.index] = { x: dx + v.x, y: dy + v.y, w: v.w, h: v.h, x1: dx + r.x + r.w, pts };
  }
  o.bars = bars; o.ready = bars.length > 0; o.loopKey = '!'; o.lastT = -1; o.rowY = -1;
  o.wrap.classList.remove('loading');
}
function atX(b, f) {
  const p = b.pts; if (!p.length) return b.x + f * b.w;
  let i = 0; while (i + 1 < p.length && p[i + 1][0] <= f) i++;
  if (f <= p[i][0]) return p[i][1];
  let j = i + 1; while (j < p.length && p[j][1] <= p[i][1]) j++; // skip a second voice on the same spot
  const n = p[j] || [1, b.x1];
  return p[i][1] + (n[1] - p[i][1]) * (f - p[i][0]) / Math.max(1e-6, n[0] - p[i][0]);
}

/* Called from the frame loop with the audio position. */
function atFrame(s, t) {
  for (const sf in AT.s) {
    const o = AT.s[sf]; if (!o.ready || !o.wrap.isConnected) continue;
    const bp = Math.max(0, Math.min(s.bars - 1e-6, barPos(t, s))), bi = Math.min(Math.floor(bp), o.bars.length - 1), b = o.bars[bi];
    if (!b) continue;
    const f = bp - bi, x = atX(b, f);
    o.cur.style.transform = `translate(${(x - 1.5).toFixed(1)}px,${b.y - 6}px)`; o.cur.style.height = (b.h + 12) + 'px';
    let id = null; for (const p of b.pts) { if (p[0] <= f + 1e-4) id = p[2]; else break; }
    if (id !== o.hl) {
      o.host.querySelectorAll('.at-highlight').forEach(el => el.classList.remove('at-highlight'));
      if (id != null && t > 0) o.host.querySelectorAll('.b' + id).forEach(el => el.classList.add('at-highlight'));
      o.hl = id;
    }
    const moved = t !== o.lastT, jumped = Math.abs(t - o.lastT) > 0.4;
    if (moved && !AT.drag) {
      if (o.layout === 'page') {
        if (S.follow && (o.rowY !== b.y || jumped)) { o.wrap.scrollTo({ top: Math.max(0, b.y - 36), behavior: jumped ? 'auto' : 'smooth' }); o.rowY = b.y; }
      } else o.wrap.scrollLeft = Math.max(0, x - o.wrap.clientWidth * 0.26);
    }
    o.lastT = t;
    atLoopDraw(o);
  }
}

function atLoopDraw(o) {
  const L = AT.drag || S.loop, pend = !L && AT.pendA != null ? AT.pendA : null;
  const key = L ? L.a + '-' + L.b + (AT.drag ? 'd' : '') : pend != null ? 'p' + pend : '';
  if (key === o.loopKey) return;
  o.loopKey = key;
  let h = '';
  if (L && o.bars[L.a] && o.bars[L.b]) {
    for (let i = L.a; i <= L.b;) { // one fill per system the loop crosses
      const b0 = o.bars[i]; let j = i; while (j + 1 <= L.b && o.bars[j + 1] && o.bars[j + 1].y === b0.y) j++;
      const b1 = o.bars[j];
      h += `<i class="at-sel" style="left:${b0.x}px;top:${b0.y}px;width:${b1.x + b1.w - b0.x}px;height:${b0.h}px"></i>`;
      i = j + 1;
    }
    const A = o.bars[L.a], B = o.bars[L.b];
    h += `<b class="at-mark" data-h="a" style="left:${A.x}px;top:${A.y}px;height:${A.h}px"><u></u><em>Loop ${L.a + 1}${L.b > L.a ? '–' + (L.b + 1) : ''}</em></b>`;
    h += `<b class="at-mark end" data-h="b" style="left:${B.x + B.w}px;top:${B.y}px;height:${B.h}px"><u></u></b>`;
  } else if (pend != null && o.bars[pend]) {
    const A = o.bars[pend];
    h += `<b class="at-mark idle" style="left:${A.x}px;top:${A.y}px;height:${A.h}px"><u></u><em>A · bar ${pend + 1} — กด B เพื่อปิด loop</em></b>`;
  }
  o.lp.innerHTML = h;
}

/* Practice › ตรวจโน้ต: colour the beat at (bar, fraction of the bar) on every surface. The marks stay until the
 * note is judged again (next loop pass) or the player seeks. */
function atMark(bar, f, cls) {
  for (const sf in AT.s) {
    const o = AT.s[sf], b = o.ready && o.bars[bar]; if (!b) continue;
    const p = b.pts.find(x => Math.abs(x[0] - f) < 0.012); if (!p) continue;
    o.host.querySelectorAll('.b' + p[2]).forEach(el => { el.classList.remove('at-ok', 'at-bad'); el.classList.add(cls); });
  }
}
function atMarkClear() { for (const sf in AT.s) AT.s[sf].host.querySelectorAll('.at-ok,.at-bad').forEach(el => el.classList.remove('at-ok', 'at-bad')); }

/* Pointer position → the bar under it (nearest system first, then nearest bar on it). */
function atHit(o, ev) {
  const r = o.inner.getBoundingClientRect(), k = o.inner.offsetWidth / r.width; // the stage is scaled to fit the window
  const x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
  let bar = -1, best = Infinity;
  o.bars.forEach((b, i) => {
    const d = (y < b.y ? b.y - y : y > b.y + b.h ? y - b.y - b.h : 0) * 1e4 + (x < b.x ? b.x - x : x > b.x + b.w ? x - b.x - b.w : 0);
    if (d < best) { best = d; bar = i; }
  });
  return { bar, x, y };
}

function atBind(o) {
  const w = o.wrap; let st = null;
  w.addEventListener('scroll', () => { if (w.isConnected) o.scroll = [w.scrollLeft, w.scrollTop]; });
  const extend = ev => {
    const b = atHit(o, ev).bar, d = AT.drag; if (b < 0 || !d) return;
    d.a = Math.min(d.anchor, b); d.b = Math.max(d.anchor, b);
  };
  const grab = () => { // from here on the gesture is a selection, not a tap or a scroll
    st.sel = true; clearTimeout(st.timer);
    try { w.setPointerCapture(st.id); } catch (e) {}
    w.classList.add('selecting');
    try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.isActive) navigator.vibrate(10); } catch (e) {}
    st.auto = setInterval(() => { // keep the score moving while the pointer is held near an edge
      if (!st || !st.last) return;
      const r = w.getBoundingClientRect();
      const step = (p, lo, hi) => p < lo + AT_EDGE_PX ? -Math.min(1, (lo + AT_EDGE_PX - p) / AT_EDGE_PX) * AT_EDGE_STEP : p > hi - AT_EDGE_PX ? Math.min(1, (p - hi + AT_EDGE_PX) / AT_EDGE_PX) * AT_EDGE_STEP : 0;
      const d = o.layout === 'page' ? step(st.last.clientY, r.top, r.bottom) : step(st.last.clientX, r.left, r.right);
      if (!d) return;
      if (o.layout === 'page') w.scrollTop += d; else w.scrollLeft += d;
      extend(st.last);
    }, 16);
  };
  w.addEventListener('pointerdown', ev => {
    if (!o.ready || !S.songId || E.loading || ev.button) return;
    const hit = atHit(o, ev); if (hit.bar < 0) return;
    const hd = ev.target.closest('[data-h]');
    st = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, hit, mouse: ev.pointerType === 'mouse', sel: false, handle: !!hd, last: ev };
    if (hd && S.loop) { // an end of the existing loop: the other end stays where it is
      AT.drag = { anchor: hd.dataset.h === 'a' ? S.loop.b : S.loop.a, a: S.loop.a, b: S.loop.b };
      grab(); ev.preventDefault(); return;
    }
    st.timer = setTimeout(() => { if (st && !st.sel) { AT.drag = { anchor: st.hit.bar, a: st.hit.bar, b: st.hit.bar }; grab(); } }, AT_HOLD_MS);
  });
  w.addEventListener('pointermove', ev => {
    if (!st || ev.pointerId !== st.id) return;
    st.last = ev;
    if (!st.sel) {
      if (Math.hypot(ev.clientX - st.x, ev.clientY - st.y) <= AT_SLOP_PX) return;
      if (!st.mouse) { clearTimeout(st.timer); st = null; return; } // a finger that moves before the hold is scrolling
      AT.drag = { anchor: st.hit.bar, a: st.hit.bar, b: st.hit.bar }; grab();
    }
    extend(ev); ev.preventDefault();
  });
  const finish = (ev, cancelled) => {
    if (!st || ev.pointerId !== st.id) return;
    const s0 = st, d = AT.drag; st = null; AT.drag = null;
    clearTimeout(s0.timer); clearInterval(s0.auto); w.classList.remove('selecting');
    for (const k in AT.s) AT.s[k].loopKey = '!';
    if (cancelled) return;
    if (s0.sel && d) { setLoopBars(d.a, d.b, !s0.handle); render(); return; }
    // tap: go to the note under the pointer
    const b = o.bars[s0.hit.bar]; let f = 0;
    for (const p of b.pts) { if (p[1] <= s0.hit.x + 6) f = p[0]; else break; }
    seek(barTime(s0.hit.bar) + f * song().secPerBar);
  };
  w.addEventListener('pointerup', ev => finish(ev, false));
  w.addEventListener('pointercancel', ev => finish(ev, true));
  w.addEventListener('touchmove', ev => { if (st && st.sel) ev.preventDefault(); }, { passive: false });
  w.addEventListener('contextmenu', ev => ev.preventDefault()); // a long press must not open the browser's menu
}

/* ---------- loop by bars ---------- */
function setLoopBars(a, b, restart) {
  const s = song(); a = Math.max(0, Math.min(s.bars - 1, a)); b = Math.max(a, Math.min(s.bars - 1, b));
  const sec = s.sections.find(x => x.start === a && x.end === b);
  S.loop = { a, b, secId: sec ? sec.id : null }; AT.pendA = null;
  if (restart) seek(barTime(a)); // a fresh selection starts from its own downbeat, as on the live site
}
function loopAB(which) {
  const s = song(), cur = Math.max(0, Math.min(s.bars - 1, Math.floor(barPos(curT()) + 1e-3)));
  if (which === 'x') { S.loop = null; AT.pendA = null; return; }
  if (S.loop) { // re-mark one end of the loop that is running
    let { a, b } = S.loop;
    if (which === 'a') { a = cur; if (b < a) b = a; } else { b = cur; if (a > b) a = b; }
    setLoopBars(a, b, false);
  } else if (which === 'a') { AT.pendA = cur; toast(`A = bar ${cur + 1} · เล่นต่อไปถึงจุดจบแล้วกด <b>B</b>`); }
  else { const a0 = AT.pendA == null ? cur : AT.pendA; setLoopBars(Math.min(a0, cur), Math.max(a0, cur), false); }
}
function abHTML() {
  const L = S.loop, pa = L ? L.a : AT.pendA;
  return `<span class="ab" role="group" aria-label="Loop A/B">
    <button class="${pa != null ? 'on' : ''}" data-act="loopA" title="ตั้งจุดเริ่ม loop ที่ bar ที่กำลังเล่น">A<small>${pa != null ? pa + 1 : '–'}</small></button>
    <button class="${L ? 'on' : ''}" data-act="loopB" title="ตั้งจุดจบ loop ที่ bar ที่กำลังเล่น">B<small>${L ? L.b + 1 : '–'}</small></button>
    ${L || pa != null ? `<button class="x" data-act="loopX" aria-label="ล้าง loop" title="ล้าง loop">${ic('x')}</button>` : ''}</span>`;
}
