#!/usr/bin/env node
/* add_demo_songs.js — turn a folder of Guitar Pro files (.gp3 / .gp4 / .gp5 / .gp) into playable demo songs.
 *
 *     node tools/add_demo_songs.js "<folder with the GP files>" [--audio <path to ffmpeg>]
 *
 * The four original songs come from build_media.py (GP7 only, needs the Drive packages). This one reads any
 * Guitar Pro version with the vendored alphaTab — the same parser the page draws the tab with — so the notes
 * the game judges are exactly the notes on screen.
 *
 * Writes
 *     data/songs_demo.js          Object.assign(window.GT_SONGS, {...})   (loaded after data/songs.js)
 *     data/gp/<id>.gp             a copy of each source file (alphaTab detects the real format from the bytes)
 *     media/<id>/backing_<100|75|50>.m4a   with --audio, for the songs that have a backing track
 *
 * Model limits of the prototype (checked here, the script stops if a file breaks them): 4/4 throughout, one
 * tempo, standard tuning, no capo. Repeats are played straight through once, as the tab is drawn.
 * Swing ("triplet feel") is applied to the note times, because a backing track plays it that way.
 */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), A = require(path.join(ROOT, 'vendor/alphatab/alphaTab.min.js'));
const SRC = process.argv[2], ai = process.argv.indexOf('--audio'), FFMPEG = ai > 0 ? process.argv[ai + 1] : null;
if (!SRC) { console.error('usage: node tools/add_demo_songs.js "<folder with the GP files>" [--audio <ffmpeg>]'); process.exit(1); }

const THIRD = 'Third-party tab, used only to try the game — no licence. Not for release.';
// track = index of the part the player plays. offset = seconds from the start of the audio to bar 1 (see README).
const SONGS = [
  { id: 'DMO01', gp: 'megaman-airman_theme_from_megaman_2.gp4', track: 0, title: 'Air Man Theme', subtitle: 'Mega Man 2 · lead guitar', artist: 'Capcom', composer: 'Takashi Tateishi', level: 'Advanced', difficulty: 4, key: '—', rights: THIRD },
  { id: 'DMO02', gp: 'Rockman/MEGAMAN 3 - Theme Snake Man.gp', track: 0, title: 'Snake Man Theme', subtitle: 'Mega Man 3 · fingerstyle', artist: 'arr. Luck Vacharavat Termvivat', composer: 'Capcom', level: 'Intermediate', difficulty: 3, key: '—', rights: THIRD },
  { id: 'LJS004', gp: 'Jack Thammarat/Falling-In-Love-Again.gp', track: 0, title: 'Falling In Love Again', subtitle: 'Full song', artist: 'Jack Thammarat', composer: 'Jack Thammarat', level: 'Advanced', difficulty: 4, key: 'E major',
    audio: 'Jack Thammarat/03 JTB - Falling in Love Again (Backing Track).wav', offset: 1.87, rights: 'Artist song and backing track — contract pending. Demo only.' },
  { id: 'LJS005', gp: 'Jack Thammarat/Jack-Thammarat-Band-On-The-Way-Guitar-Pro.gp', track: 1, title: 'On The Way', subtitle: 'Full song · overdriven guitar', artist: 'Jack Thammarat', composer: 'Jack Thammarat', level: 'Advanced', difficulty: 5, key: 'D major',
    audio: 'Jack Thammarat/02 JTB - Still On the Way - On the Way (Backing Track).wav', offset: 3.745, rights: 'Artist song and backing track — contract pending. Demo only.' },
  { id: 'DMO03', gp: 'green_day-holiday.gp4', track: 2, title: 'Holiday', subtitle: 'Rhythm guitar 1', artist: 'Green Day', composer: 'Green Day', level: 'Intermediate', difficulty: 2, key: 'F minor', rights: THIRD },
  { id: 'DMO04', gp: 'clapton-eric-wonderful_tonight.gp3', track: 0, title: 'Wonderful Tonight', subtitle: 'Lead guitar', artist: 'Eric Clapton', composer: 'Eric Clapton', level: 'Beginner', difficulty: 2, key: 'G major', rights: THIRD },
  { id: 'LJS007', gp: '1.Canon Fingerpicking tab/Canon LV1.gp', track: 0, title: 'Canon · LV1', subtitle: 'Graded fingerstyle', artist: 'Litejam Official', composer: 'J. Pachelbel', level: 'Beginner', difficulty: 1, key: 'C major', rights: 'Composition: public domain · Arrangement: in-house' },
  { id: 'LJS013', gp: '1.Canon Fingerpicking tab/Canon LV2.gp', track: 0, title: 'Canon · LV2', subtitle: 'Graded fingerstyle', artist: 'Litejam Official', composer: 'J. Pachelbel', level: 'Beginner', difficulty: 2, key: 'C major', rights: 'Composition: public domain · Arrangement: in-house' },
  { id: 'DMO05', gp: 'the-eagles-hotel_california.gp3', track: 0, title: 'Hotel California', subtitle: 'Guitar 1 · arpeggio', artist: 'Eagles', composer: 'Felder / Henley / Frey', level: 'Intermediate', difficulty: 3, key: 'B minor', rights: THIRD },
  { id: 'DMO06', gp: 'the-eagles-desperado.gp4', track: 0, title: 'Desperado', subtitle: 'Vocal melody on guitar', artist: 'Eagles', composer: 'Henley / Frey', level: 'Beginner', difficulty: 2, key: 'G major', rights: THIRD },
];

const STD = [64, 59, 55, 50, 45, 40], r4 = x => Math.round(x * 1e4) / 1e4;
function swing(pos, feel) {   // alphaTab TripletFeel: 1 = triplet 16ths, 2 = triplet 8ths (the others are left straight)
  const unit = feel === 2 ? 1 : feel === 1 ? 0.5 : 0; if (!unit) return pos;
  const base = Math.floor(pos / unit + 1e-9) * unit, f = (pos - base) / unit;
  return base + unit * (f < 0.5 ? f * 4 / 3 : 2 / 3 + (f - 0.5) * 2 / 3);
}
function convert(c) {
  const file = path.join(SRC, c.gp), bytes = new Uint8Array(fs.readFileSync(file));
  const score = A.importer.ScoreLoader.loadScoreFromBytes(bytes, new A.Settings()), mbs = score.masterBars, tr = score.tracks[c.track], st = tr.staves[0];
  const fail = m => { throw new Error(`${c.gp}: ${m}`); };
  if (mbs.some(m => m.timeSignatureNumerator !== 4 || m.timeSignatureDenominator !== 4)) fail('not 4/4 throughout');
  if (st.tuning.join() !== STD.join() || st.capo) fail('not standard tuning without capo');
  const tempos = mbs.flatMap(m => (m.tempoAutomations || []).map(a => [m.index, a.value]));
  if (tempos.some(t => t[0] < mbs.length - 6 && t[1] !== score.tempo)) fail('tempo changes inside the song: ' + JSON.stringify(tempos));
  const notes = [], chords = [], tech = {};
  for (const bar of st.bars) {
    const feel = mbs[bar.index].tripletFeel;
    for (const v of bar.voices) for (const b of v.beats) {
      if (b.graceType !== 0) continue;                       // grace notes take no time of their own
      const pos = r4(swing(b.playbackStart / 960, feel)), dur = r4(b.playbackDuration / 960);
      if (b.chordId != null && st.chords && st.chords.get(b.chordId)) chords.push([bar.index, pos, st.chords.get(b.chordId).name]);
      for (const n of b.notes) {
        let t = '';
        if (n.isDead) t += 'x';
        if (n.hammerPullOrigin) t += 'h';                    // this note is the destination of a hammer-on / pull-off
        if (n.slideInType !== 0 || (n.slideOrigin && n.slideOrigin.slideOutType !== 0)) t += 's';
        if (n.hasBend) t += 'b';
        if (n.vibrato !== 0 || b.vibrato !== 0) t += 'v';
        if (n.isPalmMute) t += 'p';
        if (n.harmonicType !== 0) t += 'o';
        if (n.isTieDestination) t += 't';
        for (const ch of t) tech[ch] = (tech[ch] || 0) + 1;
        notes.push([bar.index, pos, dur, st.tuning.length - n.string + 1, n.fret, t]);   // alphaTab counts strings from the lowest; ours 1 = high e
      }
    }
  }
  notes.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[3] - b[3]);
  // sections: the file's own markers when it has a few, otherwise eight-bar parts
  const marks = mbs.filter(m => m.section && m.section.text && !/@/.test(m.section.text)).map(m => [m.index, m.section.text.trim()]);
  let sections;
  if (marks.length >= 3) sections = marks.map((m, i) => ({ id: 'S' + (i + 1), label: m[1].replace(/\s*\(.*\)\s*$/, '').slice(0, 18) || 'Part ' + (i + 1), start: m[0], end: (i + 1 < marks.length ? marks[i + 1][0] : mbs.length) - 1, diff: c.difficulty }));
  else { sections = []; for (let b = 0, i = 1; b < mbs.length; b += 8, i++) sections.push({ id: 'S' + i, label: 'Part ' + i, start: b, end: Math.min(mbs.length, b + 8) - 1, diff: c.difficulty }); }
  const frets = notes.filter(n => !n[5].includes('t')).map(n => n[4]), beats = new Map();
  for (const n of notes) if (!n[5].includes('t')) beats.set(n[0] + '/' + n[1], (beats.get(n[0] + '/' + n[1]) || 0) + 1);
  const chordBeats = [...beats.values()].filter(x => x > 1).length;
  fs.copyFileSync(file, path.join(ROOT, 'data/gp', c.id + '.gp'));
  const bpm = score.tempo;
  return {
    id: c.id, kind: c.audio ? 'backing' : 'tab', tier: 'free', title: c.title, subtitle: c.subtitle, artist: c.artist, composer: c.composer, level: c.level, difficulty: c.difficulty, key: c.key,
    bpm, bars: mbs.length, beatsPerBar: 4, countInBars: 0, secPerBar: Math.round(240 / bpm * 1e6) / 1e6, audioOffset: c.audio ? c.offset : 0,
    stems: c.audio ? [{ id: 'backing', label: 'Backing Track', role: 'backing' }] : [{ id: 'tabsynth', label: 'Tab sound', role: 'synth_tab' }],
    sections, chords, notes, fretRange: [Math.min(...frets), Math.max(...frets)], learn: null, jamHero: false, rights: c.rights, cover: null, gpTrack: c.track, demo: true,
    techniques: tech, nNotes: notes.length, chordShare: Math.round(chordBeats / beats.size * 1000) / 1000,
  };
}

const out = {};
for (const c of SONGS) {
  const s = out[c.id] = convert(c);
  console.log(`${c.id}  ${s.title.padEnd(24)} ${s.kind.padEnd(8)} ${String(s.bpm).padStart(3)} bpm  ${String(s.bars).padStart(3)} bars  ${String(s.nNotes).padStart(4)} notes  chords ${(s.chordShare * 100).toFixed(1).padStart(5)}%  ${s.sections.length} sections`);
  if (c.audio && FFMPEG) {
    const dir = path.join(ROOT, 'media', c.id); fs.mkdirSync(dir, { recursive: true });
    for (const sp of [100, 75, 50]) {
      const args = ['-v', 'error', '-y', '-i', path.join(SRC, c.audio), '-ac', '2', '-ar', '44100'];
      if (sp !== 100) args.push('-filter:a', 'atempo=' + sp / 100);
      execFileSync(FFMPEG, args.concat(['-c:a', 'aac', '-b:a', '112k', path.join(dir, `backing_${sp}.m4a`)]));
    }
    console.log('       audio → media/' + c.id + '/backing_{100,75,50}.m4a');
  }
}
fs.writeFileSync(path.join(ROOT, 'data/songs_demo.js'), '/* generated by tools/add_demo_songs.js — do not edit */\nObject.assign(window.GT_SONGS, ' + JSON.stringify(out) + ');\n');
console.log('wrote data/songs_demo.js (' + Object.keys(out).length + ' songs)');
