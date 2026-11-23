/* GlowTab — Hero Mode gameplay concept "Neck 3D"  (branch concept/neck-gameplay)
 *
 * The classic highway asks a guitarist to translate: a lane is a fret, a colour is a string, depth is time.
 * Here the 3D neck IS the playfield, so "where" needs no translation:
 *   WHERE  a gem drops straight onto the real string/fret of the 3D neck; a target ring on the fretboard closes in
 *          as it falls, and the lamp lights when it lands. The camera rides along with the hand position, and a
 *          white box marks the frets the hand should cover.
 *   WHEN   height above the fretboard = time left. A scrolling tab strip under the neck (six strings, fret numbers
 *          moving to a "now" line) gives the rhythm and the notes after next, in the notation players already read.
 *   GAME   everything else stays: score, combo, PERFECT / GREAT pops, hit bursts, Ranked, Hold-On.
 * Classic stays one tap away (the "Neck 3D / Classic" button) for comparison.
 * Uses the stage of guitar3d.js: objects are added to the model's own group, so they follow the string-order mirror.
 */
'use strict';
let HVIEW = 'neck'; try { if (localStorage.getItem('gt-hero-view') === 'classic') HVIEW = 'classic'; } catch (e) {}
const hNeckOn = () => HVIEW === 'neck' && G3.on;
const hViewBtn = cls => `<button class="${cls} hv ${HVIEW === 'neck' ? 'on' : ''}" data-act="hview" title="สลับหน้าจอเกม: โน้ตตกลงบนคอกีตาร์ 3D หรือทางวิ่งโน้ตแบบเดิม">${ic('guitar')} ${HVIEW === 'neck' ? 'Neck 3D' : 'Classic'}</button>`;
function hViewToggle() {
  HVIEW = HVIEW === 'neck' ? 'classic' : 'neck'; try { localStorage.setItem('gt-hero-view', HVIEW); } catch (e) {}
  if (HVIEW === 'neck' && !G3.on) g3Toggle();   // the concept needs the 3D guitar
  for (const sf in G3.s) { const o = G3.s[sf]; nkDetach(o); o.nc = null; }
}
const NK = { look: 1.5, el: 0.66, az: 0.05, rise: 7.5, pool: 40 };

/* ---------- the game objects on the neck ---------- */
function nkDetach(o) {
  const nk = o.nk; if (!nk) return; o.nk = null;
  if (nk.grp.parent) nk.grp.parent.remove(nk.grp);
  nk.grp.traverse(x => { if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } }); for (const g of nk.geo) g.dispose();
}
function nkAttach(o) {
  const T = G3.T, m = o.stage.model; if (o.nk && o.nk.model === m) return o.nk;
  nkDetach(o);
  const mounts = {}; for (const x of m.leds.diagnostics().mounts) mounts[x.string + ':' + x.fret] = { p: new T.Vector3(...x.position), n: new T.Vector3(...x.normal) };
  const a = mounts['1:5'], b = mounts['2:5'], sp = a && b ? a.p.distanceTo(b.p) : 0.09;   // string spacing = the unit everything is sized in
  const grp = new T.Group(); m.group.add(grp);
  const gGem = new T.SphereGeometry(1, 20, 14), gRing = new T.RingGeometry(0.8, 1, 44), gStem = new T.CylinderGeometry(1, 1, 1, 6), gBar = new T.BoxGeometry(1, 1, 1);
  gStem.rotateX(Math.PI / 2);
  const mat = (o2 = {}) => new T.MeshBasicMaterial(Object.assign({ transparent: true, toneMapped: false, depthWrite: false }, o2));
  const mk = (geo, o2) => { const x = new T.Mesh(geo, mat(o2)); x.visible = false; x.renderOrder = 5; grp.add(x); return x; };
  const pool = []; for (let i = 0; i < NK.pool; i++) pool.push({ gem: mk(gGem, { depthWrite: true }), ring: mk(gRing, { side: T.DoubleSide }), stem: mk(gStem) });
  const bars = []; for (let i = 0; i < 6; i++) bars.push(mk(gBar));
  const box = new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(15), 3)), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
  box.frustumCulled = false; box.renderOrder = 4; grp.add(box);
  // fret numbers along the edge of the neck nearest the camera, as on the classic board
  const nums = [], fr = m.report.fretComponents, lay = m.leds.layout;
  for (let f = 1; f < fr.length; f++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    c.font = '800 40px Inter,system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(String(f), 32, 34);
    if ([3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(f)) { c.beginPath(); c.arc(32, 58, 4, 0, 7); c.fill(); }
    const tex = new T.CanvasTexture(cv), sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
    const x = (fr[f - 1].center[0] + fr[f].center[0]) / 2, b = lay.boundsAt(x);
    sprite.userData = { x, lo: b.min, hi: b.max, f }; sprite.scale.setScalar(sp * 1.5); sprite.renderOrder = 6; grp.add(sprite); nums.push(sprite);
  }
  return o.nk = { model: m, grp, mounts, sp, pool, bars, box, nums, geo: [gGem, gRing, gStem, gBar, box.geometry] };
}
const nkFretX = (fr, f) => { f = Math.max(0, Math.min(fr.length - 1, f)); const i = Math.floor(f), j = Math.min(fr.length - 1, i + 1); return fr[i].center[0] + (fr[j].center[0] - fr[i].center[0]) * (f - i); };

/* The camera rides with the hand: it looks at the middle of the hand window from a little below the neck, close
 * enough to count frets, and eases to the next position instead of cutting. */
function nkCam(o) {
  const st = o.stage, cam = st.camera, fr = st.model.report.fretComponents, r = o.canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const c = (HV.lo - 1 + HV.hi) / 2, asp = r.width / r.height, th = Math.tan(cam.fov * Math.PI / 360);
  const nF = Math.max(asp < 0.9 ? 5.5 : 11, HV.hi - HV.lo + 1 + (asp < 0.9 ? 1.5 : 6));   // frets across the screen
  const span = Math.abs(nkFretX(fr, c + 0.5) - nkFretX(fr, c - 0.5)) * nF, dT = span / 2 / (th * asp), xT = nkFretX(fr, c);
  if (!o.nc) o.nc = { x: xT, d: dT }; else { o.nc.x += (xT - o.nc.x) * 0.09; o.nc.d += (dT - o.nc.d) * 0.06; }
  const x = o.nc.x, d = o.nc.d, y = fr[0].center[1], z = 0.05;
  st.controls.target.set(x, y, z); cam.up.set(0, 1, 0);
  cam.position.set(x - d * Math.sin(NK.az) * Math.cos(NK.el), y - d * Math.sin(NK.el), z + d * Math.cos(NK.az) * Math.cos(NK.el));
  cam.lookAt(st.controls.target);
  cam.setViewOffset(r.width, r.height, 0, -r.height * (asp < 0.9 ? 0.06 : 0.05), r.width, r.height);   // the neck sits below centre: the room above is where the gems fall
  o.dist = d;
}

function nkFrame(o, s, ts) {
  const T = G3.T, nk = nkAttach(o), sp = nk.sp, GM = gameOn(s) || G.listen, max = o.stage.fretCount;
  const fr = o.stage.model.report.fretComponents, lay = o.stage.model.leds.layout;
  let k = 0; const open = [0, 0, 0, 0, 0, 0, 0];
  const col = new T.Color(), v = new T.Vector3();
  for (let i = hLower(s.ev, ts - 0.4); i < s.ev.length && k < nk.pool.length; i++) {
    const e = s.ev[i]; if (e.t0 > ts + NK.look) break;
    if (e.tech.includes('t') || e.fret > max) continue;
    const dt = e.t0 - ts, dead = e.tech.includes('x'), isOpen = e.fret === 0 && !dead;
    // an open string has no fret to land on: it lands beside the hand, and the whole string lights up in the window
    const f = isOpen ? Math.max(0, Math.round(HV.lo) - 1) : e.fret, m = nk.mounts[e.str + ':' + f]; if (!m) continue;
    col.set(GM && e.gs === 2 ? '#5b5b62' : dead ? '#cfcfcf' : HSTR[e.str - 1]);
    const it = nk.pool[k];
    if (dt < 0) {   // landed: a burst on the fretboard (in a scored mode only for notes that were hit)
      const q = -dt / 0.32; if (q >= 1 || (GM && e.gs !== 1)) continue;
      it.gem.visible = it.stem.visible = false; it.ring.visible = true;
      it.ring.position.copy(m.p).addScaledVector(m.n, 0.006); it.ring.scale.setScalar(sp * (0.6 + q * 1.9));
      it.ring.material.color.set(GM ? '#ffffff' : col); it.ring.material.opacity = 1 - q; k++; continue;
    }
    const d = dt / NK.look, h = sp * NK.rise * d, a = Math.min(1, (1 - d) / 0.18);
    if (isOpen) open[e.str] = Math.max(open[e.str], 1 - d);
    it.gem.visible = it.ring.visible = it.stem.visible = true;
    it.gem.position.copy(m.p).addScaledVector(m.n, h + sp * 0.36); it.gem.scale.setScalar(sp * (isOpen ? 0.3 : 0.42)); it.gem.material.color.copy(col); it.gem.material.opacity = a;
    it.ring.position.copy(m.p).addScaledVector(m.n, 0.006); it.ring.scale.setScalar(sp * (0.56 + 1.7 * d)); it.ring.material.color.copy(col); it.ring.material.opacity = a * (0.95 - d * 0.5);
    it.stem.position.copy(m.p).addScaledVector(m.n, h / 2 + sp * 0.1); it.stem.scale.set(sp * 0.035, sp * 0.035, Math.max(1e-4, h)); it.stem.material.color.copy(col); it.stem.material.opacity = a * 0.4;
    k++;
  }
  for (; k < nk.pool.length; k++) { const it = nk.pool[k]; it.gem.visible = it.ring.visible = it.stem.visible = false; }
  // open strings: a bar along the string across the hand window, brighter as the note comes down
  const lo = Math.max(0, HV.lo - 1), hi = Math.min(max, HV.hi), xa = nkFretX(fr, lo), xb = nkFretX(fr, hi);
  for (let str = 1; str <= 6; str++) {
    const bar = nk.bars[str - 1], on = open[str]; bar.visible = on > 0; if (!on) continue;
    const m = nk.mounts[str + ':' + Math.max(1, Math.round((lo + hi) / 2))]; if (!m) { bar.visible = false; continue; }
    bar.position.set((xa + xb) / 2, m.p.y, m.p.z + sp * 0.12); bar.scale.set(Math.abs(xb - xa), sp * 0.22, sp * 0.1);
    bar.material.color.set(HSTR[str - 1]); bar.material.opacity = 0.2 + 0.7 * on * on;
  }
  // hand box: the frets the fretting hand covers now
  const p = nk.box.geometry.attributes.position, ba = lay.boundsAt(xa), bb = lay.boundsAt(xb), mz = nk.mounts['3:' + Math.max(1, Math.round(HV.lo))], z = (mz ? mz.p.z : 0.1) + 0.014, pad = sp * 0.35;
  const pts = [[xa, ba.min - pad], [xb, bb.min - pad], [xb, bb.max + pad], [xa, ba.max + pad], [xa, ba.min - pad]];
  pts.forEach((q, i) => p.setXYZ(i, q[0], q[1], z)); p.needsUpdate = true;
  // the group is mirrored for e-on-top, so "nearest the camera" is the other edge then
  const rl = Math.round(HV.lo), rh = Math.round(HV.hi);
  for (const n of nk.nums) { const u = n.userData, inw = u.f >= rl && u.f <= rh; n.position.set(u.x, o.flip ? u.hi + sp * 1.25 : u.lo - sp * 1.25, z); n.material.opacity = inw ? 1 : 0.38; }
}

/* ---------- 2D overlay: the scrolling tab strip + judgement pops (the highway itself is not drawn) ---------- */
function drawHeroNeck(cv, s, t) {
  const [c, W, H] = setup(cv); c.clearRect(0, 0, W, H);
  const ts = t - s.audioOffset, spb = 60 / s.bpm, port = H > W * 1.15;
  // hand window, eased once per animation frame (the camera and the hand box read it)
  const [tlo, thi] = heroWindow(s, ts); HV.tlo = tlo; HV.thi = thi;
  const now = performance.now();
  if (HV.cam == null || HV.song !== s.id) { HV.cam = 0; HV.lo = tlo; HV.hi = thi; HV.song = s.id; HV.last = now; }
  else if (now - HV.last > 4) { const a = 1 - Math.exp(-Math.min(0.1, (now - HV.last) / 1000) * 5.5); HV.last = now; HV.lo += (tlo - HV.lo) * a * 1.4; HV.hi += (thi - HV.hi) * a * 1.4; }

  // tab strip
  const sh = Math.max(76, Math.min(118, H * 0.17)), x0 = port ? 6 : 14, y0 = H - sh - (port ? 10 : 14), w = W - x0 * 2, lw = port ? 26 : 34;
  const g = sh / 6.6, yOf = str => y0 + g * 0.8 + (HFLIP ? str - 1 : 6 - str) * g, nowX = x0 + lw + w * (port ? 0.16 : 0.12), LOOKT = Math.max(2.4, Math.min(4.2, s.secPerBar * 2));
  const xOf = tt => nowX + (tt - ts) / LOOKT * (x0 + w - nowX - 8);
  c.fillStyle = 'rgba(6,6,10,.78)'; rr(c, x0, y0, w, sh, 12); c.fill(); c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 1; c.stroke();
  c.save(); rr(c, x0, y0, w, sh, 12); c.clip();
  for (let i = Math.max(0, Math.ceil((ts - 0.3) / spb)); i * spb < ts + LOOKT; i++) {   // beats, bar lines stronger
    const x = xOf(i * spb); if (x < x0 + lw) continue;
    c.strokeStyle = `rgba(255,255,255,${i % 4 === 0 ? 0.22 : 0.07})`; c.beginPath(); c.moveTo(x, y0 + g * 0.3); c.lineTo(x, y0 + sh - g * 0.3); c.stroke();
  }
  for (let str = 1; str <= 6; str++) { c.strokeStyle = hAlpha(HSTR[str - 1], 0.55); c.lineWidth = 1 + (str - 1) * 0.22; c.beginPath(); c.moveTo(x0 + lw, yOf(str)); c.lineTo(x0 + w, yOf(str)); c.stroke(); }
  const GM = gameOn(s) || G.listen, fs = Math.max(10, Math.min(15, g * 0.95)); c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = hLower(s.ev, ts - 0.5); i < s.ev.length; i++) {
    const e = s.ev[i]; if (e.t0 > ts + LOOKT) break; if (e.tech.includes('t')) continue;
    const past = ts - e.t0, a = past > 0 ? Math.max(0, 1 - past / 0.3) : 1; if (a <= 0) continue;
    const dead = e.tech.includes('x'), col = GM && e.gs === 2 ? '#5b5b62' : dead ? '#cfcfcf' : HSTR[e.str - 1], x = xOf(e.t0), y = yOf(e.str), txt = dead ? 'x' : String(e.fret);
    const pw = Math.max(fs * 1.5, fs * 0.72 * txt.length + fs * 0.9), near = e.t0 - ts < 0.12;
    c.globalAlpha = a; if (near) { c.shadowColor = col; c.shadowBlur = 12; }
    c.fillStyle = col; rr(c, x - pw / 2, y - g * 0.46, pw, g * 0.92, g * 0.46); c.fill(); c.shadowBlur = 0;
    c.font = `800 ${fs}px ${FONT}`; c.fillStyle = e.str === 1 || dead ? '#111' : '#fff'; c.fillText(txt, x, y + 0.5);
    c.globalAlpha = 1;
  }
  c.restore();
  // string names + the "now" line
  c.fillStyle = 'rgba(16,16,18,.94)'; rr(c, x0, y0, lw, sh, 12); c.fill();
  c.font = `700 ${Math.max(9.5, Math.min(13, g * 0.9))}px ${FONT}`;
  for (let str = 1; str <= 6; str++) { c.fillStyle = HSTR[str - 1]; c.fillText(HNAME[str - 1], x0 + lw / 2, yOf(str) + 0.5); }
  c.shadowColor = '#fff'; c.shadowBlur = 10; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(nowX, y0 + 3); c.lineTo(nowX, y0 + sh - 3); c.stroke(); c.shadowBlur = 0;

  if (GM) gameDraw(c, W, H, H * (port ? 0.3 : 0.36), 14);

  if (!s.chordT) s.chordT = s.chords.map(x => [(x[0] * 4 + x[1]) * spb, x[2]]);
  let ch = ''; for (const x of s.chordT) { if (x[0] > ts + 0.02) break; ch = x[1]; }
  const el = cv.parentElement.querySelector('[data-live=hchord]'); if (el && el.textContent !== ch) el.textContent = ch;
}
