// Version-locked adapter for @coderline/alphatab 1.9.0.
// alphaTab's public MIDI handler gives exact sound lengths/pitch curves but omits
// source string IDs. One isolated generator hook attaches the source note. Keep
// the dependency pinned and run timeline.test.mjs before upgrading alphaTab.
export function buildTimeline(alpha, score, settings) {
  const Generator = alpha.midi.MidiFileGenerator;
  if (typeof Generator.prototype._generateNote !== "function")
    throw new Error("Unsupported alphaTab MIDI generator version");
  const segments = [],
    sounds = [],
    curves = [];
  let context = null;
  class Handler extends alpha.midi.AlphaSynthMidiFileHandler {
    addNote(track, start, length, key, velocity, channel) {
      if (
        context &&
        context.note.isStringed &&
        !context.note.isPercussion &&
        length > 0
      )
        sounds.push({
          ...context,
          start,
          end: start + length,
          key,
          velocity,
          channel,
        });
      super.addNote(track, start, length, key, velocity, channel);
    }
    addNoteBend(track, tick, channel, key, value) {
      if (context) curves.push({ ...context, tick, value });
      super.addNoteBend(track, tick, channel, key, value);
    }
  }
  class GeneratorWithSource extends Generator {
    _generateNote(note, beatStart, duration, tempo, brush, rasgueado) {
      const staff = note.beat.voice.bar.staff;
      const offset =
        !rasgueado && note.isStringed && note.string <= brush.length
          ? brush[note.string - 1]
          : 0;
      context = {
        note,
        beatStart,
        track: staff.track.index,
        staff: staff.index,
        string: note.string,
        start: beatStart + offset,
        end: beatStart + duration,
      };
      segments.push(context);
      try {
        return super._generateNote(
          note,
          beatStart,
          duration,
          tempo,
          brush,
          rasgueado,
        );
      } finally {
        context = null;
      }
    }
  }
  const midiFile = new alpha.midi.MidiFile();
  const handler = new Handler(midiFile);
  const generator = new GeneratorWithSource(score, settings, handler);
  generator.generate();
  sounds.sort((a, b) => a.start - b.start);
  segments.sort((a, b) => a.start - b.start);
  curves.sort((a, b) => a.tick - b.tick);
  return {
    sounds,
    segments,
    curves,
    tickLookup: generator.tickLookup,
    midiFile,
    tickShift: handler.tickShift,
  };
}

export function upperBound(items, value, key) {
  let lo = 0,
    hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid][key] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function selectPart(timeline, track, staff) {
  return Array.from({ length: 6 }, (_, i) => {
    const match = (e) =>
      e.track === track && e.staff === staff && e.string === i + 1;
    const sounds = timeline.sounds.filter(match).map((e) => ({ ...e }));
    // A physical string cannot hold two newly attacked pitches simultaneously.
    for (let j = 0; j < sounds.length - 1; j++)
      sounds[j].end = Math.min(sounds[j].end, sounds[j + 1].start);
    return {
      sounds,
      segments: timeline.segments.filter(match),
      curves: timeline.curves.filter(match),
    };
  });
}

export function pitchAt(curves, tick) {
  const i = upperBound(curves, tick, "tick") - 1;
  if (i < 0) return 0;
  const a = curves[i],
    b = curves[i + 1];
  // Pitch-wheel range is +/-16 semitones in alphaTab 1.9.0. Use emitted
  // points, including its slide timing and bend style, instead of guessing.
  const value =
    b && b.start === a.start && b.tick > a.tick
      ? a.value + ((b.value - a.value) * (tick - a.tick)) / (b.tick - a.tick)
      : a.value;
  return (value - 8192) / 512;
}

export function samplePart(part, tick, playing) {
  if (!playing || !part) return Array(6).fill(null);
  return part.map((lane) => {
    const sound = lane.sounds[upperBound(lane.sounds, tick, "start") - 1];
    if (!sound || tick >= sound.end) return null;
    const segment =
      lane.segments[upperBound(lane.segments, tick, "start") - 1] || sound;
    const n = segment.note;
    const sliding = !n.hasBend && (n.slideInType !== 0 || n.slideOutType !== 0);
    const latestCurve = lane.curves[upperBound(lane.curves, tick, "tick") - 1];
    // A legato destination has a new base fret. The previous slide's final
    // offset must not be applied again before the next slide starts moving.
    const pitch =
      sliding && latestCurve?.start !== segment.start
        ? 0
        : pitchAt(lane.curves, tick);
    const bending =
      n.hasBend ||
      n.isContinuedBend ||
      n.bendOrigin ||
      (n.isTieDestination && n.tieOrigin?.hasBend) ||
      n.vibrato !== 0;
    return {
      note: n,
      sound,
      segment,
      fret: n.fret + n.beat.voice.bar.staff.capo + (sliding ? pitch : 0),
      bend: bending ? pitch : 0,
      sliding,
      ageTicks: Math.max(0, tick - sound.start),
      technique: sliding
        ? "Slide"
        : bending
          ? "Bend"
          : n.isPalmMute
            ? "Palm mute"
            : n.isDead
              ? "Muted"
              : "",
    };
  });
}
