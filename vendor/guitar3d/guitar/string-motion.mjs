const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function createStringMotion(report, layout) {
  const frets = report.fretComponents.map((f) => f.center[0]),
    nut = frets[0],
    last = frets.length - 1;
  function fretX(fret) {
    const n = Math.floor(fret);
    return frets[n] + (frets[Math.min(last, n + 1)] - frets[n]) * (fret - n);
  }
  function pose(lane, state, tick) {
    const active =
      state &&
      Number.isFinite(state.fret) &&
      state.fret >= 0 &&
      state.fret <= last
        ? state
        : null;
    const fret = active?.fret ?? 0,
      contact = fretX(fret),
      bend = active
        ? clamp(active.bend * 0.06, -0.18, 0.22) * (lane < 3 ? -1 : 1)
        : 0;
    return {
      lane,
      active,
      tick,
      fret,
      contact,
      bend,
      nut,
      start: report.strings[lane].head[0],
      end: report.strings[lane].bridge[0],
    };
  }
  function point(p, x, out = {}) {
    let y = layout.stringY(p.lane, x),
      z = layout.stringZ(p.lane, x);
    if (p.active && x >= nut) {
      const tent = Math.max(
        0,
        x < p.contact
          ? (x - nut) / Math.max(0.001, p.contact - nut)
          : (p.end - x) / Math.max(0.001, p.end - p.contact),
      );
      y += p.bend * tent;
      if (p.fret > 0) {
        const f = Math.floor(p.fret),
          mix = p.fret - f,
          a = report.fretComponents[f].max[2],
          b = report.fretComponents[Math.min(last, f + 1)].max[2];
        const depression = report.calibratedStrings
          ? Math.max(
              0,
              layout.stringZ(p.lane, p.contact) - (a + (b - a) * mix + 0.009),
            )
          : 0.012;
        z -= depression * tent;
      }
      if (x > p.contact) {
        const t = (x - p.contact) / (p.end - p.contact);
        z +=
          0.022 *
          Math.sin(Math.PI * t) *
          Math.sin(p.tick * 0.06 - 7 * t) *
          Math.exp(-p.active.ageTicks / 1400) *
          (p.active.sound.velocity / 100);
      }
    }
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
  }
  function marker(p) {
    const x = p.fret > 0 ? p.contact - 0.04 : layout.rowAt(0).x;
    return {
      x,
      y: layout.stringY(p.lane, x) + p.bend,
      z: report.calibratedStrings ? layout.stringZ(p.lane, x) + 0.05 : 0.166,
    };
  }
  return { pose, point, marker };
}
