const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (t) => Math.max(0, Math.min(1, t));

// Measured nut and final-fret endpoints define the trapezoid and its centerline.
// Shared by hardware, generated strings and note anchors so they cannot drift apart.
export function createFingerboardLayout(report) {
  const frets = report.fretComponents,
    xs = frets.map((f) => f.center[0]),
    last = xs.length - 1;
  function boundsAt(x) {
    // Interior fret-mesh bevel bounds have small irregularities. A straight
    // endpoint taper avoids making taut strings kink at those measurement seams.
    const t = clamp((x - xs[0]) / (xs[last] - xs[0]));
    const min = lerp(frets[0].min[1], frets[last].min[1], t),
      max = lerp(frets[0].max[1], frets[last].max[1], t);
    return { min, max, center: (min + max) / 2, width: max - min };
  }
  function laneY(lane, x) {
    if (report.calibratedStrings) {
      const s = report.strings[lane];
      return lerp(
        s.nut[1],
        s.bridge[1],
        clamp((x - xs[0]) / (s.bridge[0] - xs[0])),
      );
    }
    const b = boundsAt(x);
    return b.center + b.width * 0.83 * (0.5 - lane / 5);
  }
  function stringY(lane, x) {
    const { head, bridge } = report.strings[lane];
    if (x < xs[0])
      return lerp(
        head[1],
        laneY(lane, xs[0]),
        clamp((x - head[0]) / (xs[0] - head[0])),
      );
    if (x > xs[last] && !report.calibratedStrings)
      return lerp(
        laneY(lane, xs[last]),
        bridge[1],
        clamp((x - xs[last]) / (bridge[0] - xs[last])),
      );
    return laneY(lane, x);
  }
  function rowAt(fret) {
    // Some models contain real drilled seats; preserve each measured center.
    const measured = report.ledRows?.[fret];
    if (measured) {
      const x = measured.reduce((sum, p) => sum + p[0], 0) / 6;
      return {
        x,
        ...boundsAt(x),
        xs: measured.map((p) => p[0]),
        ys: measured.map((p) => p[1]),
      };
    }
    const inset = (xs[1] - xs[0]) * 0.12;
    const x =
      fret === 0
        ? xs[0] + inset
        : fret === 1
          ? xs[1] - inset
          : (xs[fret - 1] + xs[fret]) / 2;
    return {
      x,
      ...boundsAt(x),
      ys: Array.from({ length: 6 }, (_, lane) => laneY(lane, x)),
    };
  }
  function stringZ(lane, x) {
    if (!report.calibratedStrings) return 0.116;
    const s = report.strings[lane],
      a = x < xs[0] ? s.head : s.nut,
      b = x < xs[0] ? s.nut : s.bridge;
    return lerp(a[2], b[2], clamp((x - a[0]) / (b[0] - a[0])));
  }
  return { boundsAt, stringY, stringZ, rowAt };
}
