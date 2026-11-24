/* GlowTab — 3D guitar in Hero Mode
 *
 * The LiteJam 3D guitar module (vendor/guitar3d, byte-identical copy of litejam-3d-guitar-module)
 * placed in the sky above the note highway: the LEDs on its neck light what is sounding now, in the
 * same string colours as the highway, and the strings vibrate with the notes.
 *
 * Model follows the kind of song: fingerstyle (tab-only) tabs get the acoustic LiteJam A1,
 * everything else the LiteJam RGB24.
 *
 * three.js + a model are several megabytes, so the module is imported only when Hero Mode is first
 * opened, and the stage is disposed as soon as a surface leaves Hero Mode. No bundler here: the
 * import map in index.html resolves "three" and "three/addons/".
 */
'use strict';
const G3 = { s: {}, T: null, view: 'full', on: true };
try { G3.on = localStorage.getItem('gt-g3d-on') !== '0'; } catch (e) {}
// Hero Mode's 3D on/off switch. Off leaves no slot in the page, so g3Mount disposes the stages.
function g3Toggle() { G3.on = !G3.on; try { localStorage.setItem('gt-g3d-on', G3.on ? '1' : '0'); } catch (e) {} }
const g3Btn = cls => `<button class="${cls} ${G3.on ? 'on' : ''}" data-act="h3d" aria-pressed="${G3.on}" title="${G3.on ? 'ซ่อนกีตาร์ 3D' : 'แสดงกีตาร์ 3D'}">${ic('cube')} 3D</button>`;
const G3_MARGIN = 1.07; // breathing room around what a view frames
/* Camera presets, picked from the strip under the guitar so nobody has to rotate or zoom by hand.
 *   on    what is framed: the whole guitar or the fretted part of the neck
 *   az    radians the camera swings round towards the headstock (0 = square on)
 *   el    radians it drops below the face of the fretboard (0 = straight at it, ~1.3 = along the strings)
 *   k     distance as a fraction of the "just fits the box" distance (smaller = closer)
 *   right push the picture to the right edge, so the body sits in the tall right-hand part of the area */
const G3_VIEWS = [
  { id: 'full', label: 'Full', tip: 'ทั้งตัว', on: 'guitar', az: 0, el: 0.31, k: 1, right: true },
  { id: 'neck', label: 'Neck', tip: 'ซูมคอกีตาร์', on: 'neck', az: 0.05, el: 0.45, k: 1.02 },
  { id: 'angle', label: '3/4', tip: 'เฉียงจากหัวกีตาร์', on: 'guitar', az: 0.5, el: 0.4, k: 1.0 },
  { id: 'player', label: 'Player', tip: 'มุมผู้เล่น มองไล่ไปตามสาย', on: 'neck', az: 0.28, el: 1.2, k: 0.98 },
];
try { const v = localStorage.getItem('gt-g3d-view'); if (G3_VIEWS.some(x => x.id === v)) G3.view = v; } catch (e) {}
const g3ViewBtns = () => G3_VIEWS.map(v => `<button class="${v.id === G3.view ? 'on' : ''}" data-g3v="${v.id}" title="${v.tip}">${v.label}</button>`).join('');
function g3SetView(id) {
  G3.view = id; try { localStorage.setItem('gt-g3d-view', id); } catch (e) {}
  for (const sf in G3.s) { const o = G3.s[sf]; o.views.innerHTML = g3ViewBtns(); if (o.ready) g3Fit(o); }
}
const G3_TICKS = 1920; // ticks per second handed to the stage: only its vibration phase uses it
const G3_MODEL = { a1: 'LiteJam A1 · Acoustic', rgb24: 'LiteJam RGB24' };
const g3Slot = sf => G3.on ? `<div class="h-g3d" data-g3dslot="${sf}"></div>` : '';
const g3ModelFor = s => s.kind === 'tab' ? 'a1' : 'rgb24';

/* Like the tab surface, the stage lives outside render(): each render leaves an empty slot and the
 * element is moved back into it. A surface with no slot has left Hero Mode, so its stage goes. */
function g3Mount() {
  for (const sf of ['app', 'web']) {
    const slot = document.querySelector(`#${sf}-root [data-g3dslot]`);
    if (!slot || !slot.getClientRects().length || !S.songId) { if (G3.s[sf]) g3Dispose(sf); continue; }
    const o = G3.s[sf] || g3Create(sf);
    if (o.el.parentElement !== slot) slot.appendChild(o.el);
    const want = g3ModelFor(song());
    if (o.want !== want) { o.want = want; g3Apply(o); }
    else if (o.ready && o.flip !== HFLIP) { g3Mirror(o); g3Fit(o); } // the string-order switch was pressed
  }
}
function g3Create(sf) {
  const el = document.createElement('div'); el.className = 'h-g3d-in';
  el.innerHTML = `<canvas class="g3d-cv"></canvas><span class="g3d-name"></span><div class="g3d-views" role="group" aria-label="มุมมองกีตาร์ 3D">${g3ViewBtns()}</div><span class="g3d-wait">กำลังโหลดกีตาร์ 3D…</span>`;
  el.addEventListener('click', ev => { const b = ev.target.closest('[data-g3v]'); if (b) g3SetView(b.dataset.g3v); });
  const o = G3.s[sf] = { sf, el, canvas: el.firstChild, name: el.querySelector('.g3d-name'), views: el.querySelector('.g3d-views'), stage: null, want: null, ready: false, dead: false };
  document.querySelector(`#${sf}-root [data-g3dslot]`).appendChild(el); // the stage needs a canvas that already has a size
  Promise.all([import('../vendor/guitar3d/guitar/guitar-stage.mjs'), import('three')])
    .then(([m, T]) => { G3.T = T; return m.createGuitarStage(o.canvas, { labels: true }); })
    .then(stage => {
      if (o.dead) { g3Release(stage); return; }
      o.stage = stage;
      stage.controls.enabled = false; // the module's orbit control stops at the poles; g3Bind turns the model freely instead
      g3Bind(o);
      // created after the stage's own observer, so it runs after it: the stage re-frames the neck on
      // every resize and this puts the whole-guitar fit back, which is what makes the model stretch with its box
      o.ro = new ResizeObserver(() => { if (o.ready) g3Fit(o); }); o.ro.observe(o.canvas);
      g3Apply(o);
    })
    .catch(err => { console.error('[guitar3d]', err); if (!o.dead) el.querySelector('.g3d-wait').textContent = 'โหลดกีตาร์ 3D ไม่ได้'; });
  return o;
}
/* The module always starts on its Stratocaster; the canvas stays hidden until the wanted model is in. */
function g3Apply(o) {
  if (!o.stage) return;
  const want = o.want; o.ready = false; o.el.classList.remove('ready');
  o.stage.setModel(want).then(() => {
    if (o.dead || o.want !== want || o.stage.modelId !== want) return;
    g3Mirror(o); g3Fit(o); o.name.textContent = G3_MODEL[want];
    o.ready = true; o.el.classList.add('ready');
  }).catch(err => console.error('[guitar3d] model', err));
}
function g3Release(stage) {
  stage.dispose();
  try { stage.renderer.forceContextLoss(); } catch (e) {} // dispose keeps the WebGL context; browsers cap how many may be alive
}
function g3Dispose(sf) {
  const o = G3.s[sf]; if (!o) return; nkDetach(o);
  o.dead = true; if (o.ro) o.ro.disconnect(); if (o.stage) g3Release(o.stage);
  o.el.remove(); delete G3.s[sf];
}

/* String order follows the board (HFLIP in hero.js), and the body is drawn the way that order really
 * looks with the headstock on the left:
 *   e on top (tab order)  = a right-handed guitar seen from the front — the model as it ships
 *   E on top (Jam Hero)   = its mirror image, controls and cutaway on the treble side below
 * The module itself puts its lamps and live strings E-on-top over the unmirrored body, so two mirrors
 * across the centre line of the neck sort it out: the body mesh (first child of the bundle's group) is
 * always mirrored inside the group, and the whole group — body, lamps, strings, labels — is mirrored
 * again for e-on-top. The fretboard is symmetric about that line, so the lamps stay on their frets.
 * Runtime transforms only; the model files are untouched. Fret badges are sprites and still read normally. */
function g3Mirror(o) {
  const g = o.stage.model.group, c = o.stage.model.report.fretComponents[0].center[1], body = g.children[0];
  if (body && !body.userData.g3Mirrored) { body.userData.g3Mirrored = true; body.scale.y *= -1; body.position.y = 2 * c - body.position.y; }
  o.flip = HFLIP;
  g.scale.y = HFLIP ? -1 : 1; g.position.y = HFLIP ? 2 * c : 0;
  g.updateMatrixWorld(true);
}

/* Put the camera on the chosen preset, sized to the box whatever its shape. Re-run on every resize
 * (that is what makes the model stretch with its area) and on a double click, as "reset view". */
function g3Fit(o) {
  const st = o.stage, cam = st.camera, rp = st.model.report, b = rp.guitarBounds, fr = rp.fretComponents, r = o.canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  if (hNeckOn()) { o.nc = null; return nkCam(o); }   // Neck 3D gameplay drives the camera itself
  cam.clearViewOffset();
  const v = G3_VIEWS.find(x => x.id === G3.view) || G3_VIEWS[0], neckY = fr[0].center[1];
  const asp = r.width / r.height, th = Math.tan(cam.fov * Math.PI / 360);
  let cx, cy, cz, sx, sy, depth;
  if (v.on === 'neck') { // from the nut to the last fret, a little of the headstock and body either side
    const x0 = fr[0].center[0], x1 = fr[fr.length - 1].center[0];
    cx = (x0 + x1) / 2; cy = neckY; cz = 0; sx = (x1 - x0) * 1.16; sy = sx * 0.2; depth = 0;
  } else {
    cx = (b.min[0] + b.max[0]) / 2; cy = (b.min[1] + b.max[1]) / 2; cz = (b.min[2] + b.max[2]) / 2;
    if (!o.flip) cy = 2 * neckY - cy; // E on top shows the body mirrored (see g3Mirror): so is its centre
    sx = b.max[0] - b.min[0]; sy = b.max[1] - b.min[1]; depth = b.max[2] - b.min[2];
  }
  const fit = Math.max(sx / 2 / (th * asp), sy / 2 / th) * G3_MARGIN + depth / 2, d = fit * v.k;
  st.controls.target.set(cx, cy, cz);
  cam.up.set(0, 1, 0);
  cam.position.set(cx - d * Math.sin(v.az) * Math.cos(v.el), cy - d * Math.sin(v.el), cz + d * Math.cos(v.az) * Math.cos(v.el));
  if (v.el > 1) cam.up.set(0, 0, 1); // looking along the strings: "up" is out of the fretboard, not across it
  cam.lookAt(st.controls.target);
  const shown = sx / (2 * d * th * asp) * r.width; // width on screen, px
  const shift = v.right ? Math.max(0, (r.width - shown) / 2 - r.width * 0.025) : 0;
  cam.setViewOffset(r.width, r.height, -shift, 0, r.width, r.height);
  o.dist = d;
}

/* Free rotation. Dragging turns the camera about its own up and right axes and carries its up vector
 * along, so there is no pole to stop at; Shift-drag (or the right button) rolls; the wheel zooms;
 * a double click puts the fitted view back. */
function g3Bind(o) {
  const cv = o.canvas; let p = null;
  cv.addEventListener('pointerdown', ev => {
    if (!o.ready || hNeckOn()) return;
    p = { x: ev.clientX, y: ev.clientY, roll: ev.shiftKey || ev.button === 2 };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
    cv.classList.add('grab'); ev.preventDefault();
  });
  cv.addEventListener('pointermove', ev => {
    if (!p) return;
    g3Rotate(o, ev.clientX - p.x, ev.clientY - p.y, p.roll); p.x = ev.clientX; p.y = ev.clientY;
  });
  const end = () => { p = null; cv.classList.remove('grab'); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', ev => ev.preventDefault());
  cv.addEventListener('dblclick', () => { if (o.ready) g3Fit(o); });
  cv.addEventListener('wheel', ev => {
    if (!o.ready || hNeckOn()) return; ev.preventDefault();
    const cam = o.stage.camera, tg = o.stage.controls.target, off = cam.position.clone().sub(tg);
    const len = Math.max(o.dist * 0.25, Math.min(o.dist * 2.5, off.length() * Math.exp(ev.deltaY * 0.0012)));
    cam.position.copy(tg).add(off.setLength(len));
  }, { passive: false });
}
function g3Rotate(o, dx, dy, roll) {
  const T = G3.T, cam = o.stage.camera, tg = o.stage.controls.target, k = 0.0085;
  const off = cam.position.clone().sub(tg), fwd = off.clone().normalize().negate(), up = cam.up.clone().normalize();
  const right = new T.Vector3().crossVectors(fwd, up).normalize(), q = new T.Quaternion();
  if (roll) q.setFromAxisAngle(fwd, dx * k);
  else q.setFromAxisAngle(up, -dx * k).multiply(new T.Quaternion().setFromAxisAngle(right, -dy * k));
  off.applyQuaternion(q); up.applyQuaternion(q);
  cam.position.copy(tg).add(off); cam.up.copy(up).normalize(); cam.lookAt(tg);
}

/* Called from the frame loop with the audio position: what sounds now → lamps + string poses. */
function g3Frame(s, t) {
  let frame = null;
  for (const sf in G3.s) {
    const o = G3.s[sf]; if (!o.ready || !o.el.isConnected) continue;
    if (!frame) frame = g3Sample(s, t - s.audioOffset);
    const max = o.stage.fretCount; // A1 has 20 frets, RGB24 has 24
    if (hNeckOn()) { nkCam(o); nkFrame(o, s, t - s.audioOffset); } else if (o.nk) { nkDetach(o); g3Fit(o); }
    o.stage.update(frame.states, frame.tick, { lights: frame.lights.filter(l => l.fret <= max) });
  }
}
function g3Sample(s, ts) {
  const lights = [], states = Array(6).fill(null), tick = performance.now() / 1000 * G3_TICKS;
  for (let i = hLower(s.ev, ts - 8); i < s.ev.length; i++) {
    const e = s.ev[i]; if (e.t0 > ts) break;
    if (ts >= e.t1) continue;
    const dead = e.tech.includes('x'), age = ts - e.t0;
    // module numbering matches ours: string 1 = high e … 6 = low E; lane 0 = low E
    lights.push({ string: e.str, fret: e.fret, color: dead ? '#cfcfcf' : HSTR[e.str - 1] });
    states[6 - e.str] = {
      fret: e.fret,
      bend: e.tech.includes('b') ? Math.min(1, age / 0.25) : 0, // the data has no bend amount: show a half-step-ish push
      ageTicks: age * G3_TICKS,
      sound: { velocity: 90 },
      note: { fret: e.fret, isDead: dead, slideTarget: null },
      sliding: false,
    };
  }
  return { lights, states, tick };
}
