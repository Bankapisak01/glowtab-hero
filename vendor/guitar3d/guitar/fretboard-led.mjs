import { upperBound, pitchAt } from "../music/timeline.mjs";

// Lane order follows alphaTab: low E first. Public snapshots use familiar 6..1 strings.
export const STRING_COLORS = Object.freeze([
  0xe8b65b, 0xea8298, 0x8bb8f7, 0x65d5be, 0xc4a1fa, 0xe8dca7,
]);
export const FINGER_COLORS = Object.freeze({
  1: "#ff4040",
  2: "#36df69",
  3: "#4385ff",
  4: "#ffe14a",
});
const hex = (color) => `#${color.toString(16).padStart(6, "0")}`;

export function resolveLedColor(note, lane) {
  if (note?.fret === 0)
    return { finger: null, color: "#ffffff", colorSource: "open" };
  let origin = note,
    finger = origin?.leftHandFinger;
  const visited = new Set();
  while (
    (finger == null || finger === -2) &&
    origin?.isTieDestination &&
    origin.tieOrigin &&
    !visited.has(origin)
  ) {
    visited.add(origin);
    origin = origin.tieOrigin;
    finger = origin.leftHandFinger;
  }
  if (Number.isInteger(finger) && FINGER_COLORS[finger])
    return { finger, color: FINGER_COLORS[finger], colorSource: "finger" };
  return {
    finger: null,
    color: hex(STRING_COLORS[lane] ?? STRING_COLORS[0]),
    colorSource: "string",
  };
}

/** Complete visible-light snapshot. No score engine, audio voice or hardware dependencies. */
export function sampleLedFrame(
  part,
  tick,
  { phase = "playing", enabled = true, fretCount = 24 } = {},
) {
  const frame = {
    tick: Number.isFinite(tick) ? tick : 0,
    phase,
    enabled: Boolean(enabled),
    lights: [],
    skipped: { invalid: 0, outOfRange: 0, dead: 0 },
  };
  if (
    !enabled ||
    !["playing", "paused"].includes(phase) ||
    !Array.isArray(part) ||
    !Number.isFinite(tick) ||
    tick < 0
  )
    return frame;
  for (let laneIndex = 0; laneIndex < 6; laneIndex++) {
    const lane = part[laneIndex];
    if (!lane) continue;
    if (!Array.isArray(lane.sounds) || !Array.isArray(lane.segments)) {
      frame.skipped.invalid++;
      continue;
    }
    const sound = lane.sounds[upperBound(lane.sounds, tick, "start") - 1];
    if (!sound) continue;
    if (
      !Number.isFinite(sound.start) ||
      !Number.isFinite(sound.end) ||
      sound.end <= sound.start
    ) {
      frame.skipped.invalid++;
      continue;
    }
    if (tick >= sound.end) continue;
    const segment =
      lane.segments[upperBound(lane.segments, tick, "start") - 1] ?? sound;
    const note = segment.note,
      capo = note?.beat?.voice?.bar?.staff?.capo ?? 0;
    if (
      !note ||
      note.string !== laneIndex + 1 ||
      !Number.isInteger(note.fret) ||
      note.fret < 0 ||
      !Number.isInteger(capo) ||
      capo < 0
    ) {
      frame.skipped.invalid++;
      continue;
    }
    if (note.isDead) {
      frame.skipped.dead++;
      continue;
    }
    let physicalFret = note.fret + capo;
    const curves = Array.isArray(lane.curves) ? lane.curves : [];
    if (!note.hasBend && (note.slideInType || note.slideOutType)) {
      const curve = curves[upperBound(curves, tick, "tick") - 1];
      // Match the timeline's segment-local slide origin, never a previous slide's offset.
      if (curve?.start === segment.start) physicalFret += pitchAt(curves, tick);
    }
    if (!Number.isFinite(physicalFret)) {
      frame.skipped.invalid++;
      continue;
    }
    if (physicalFret < 0 || physicalFret > fretCount) {
      frame.skipped.outOfRange++;
      continue;
    }
    frame.lights.push({
      string: 6 - laneIndex,
      fret: Math.round(physicalFret),
      ...resolveLedColor(note, laneIndex),
    });
  }
  frame.lights.sort((a, b) => a.string - b.string);
  return frame;
}
