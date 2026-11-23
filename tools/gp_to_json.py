#!/usr/bin/env python3
"""
gp_to_json.py — convert every Guitar Pro 7/8 ``.gp`` file in ``dataset/gp`` into a
structured JSON ground-truth file in ``dataset/json`` (one JSON per .gp, same stem).

Usage
-----
    python3 _tools/gp_to_json.py                 # parse all gp/*.gp -> json/*.json
    python3 _tools/gp_to_json.py --only XN0001   # only stems starting with XN0001
    python3 _tools/gp_to_json.py --gp-dir gp --out-dir json

Exit code is 1 if any file failed to parse; failures are listed on stderr and in
``json/_parse_report.json`` (never silently skipped).

What a .gp file is
------------------
A ``.gp`` (GP7/GP8) file is a zip; the score lives in ``Content/score.gpif`` (XML).
All 594 X-note files were written by GP 8.0.2 (GPRevision 13002).  Relevant layout:

    <Score>           Title / Artist / SubTitle ...
    <MasterTrack>     <Automations><Automation><Type>Tempo</Type><Bar>b</Bar>
                       <Position>p</Position><Linear>bool</Linear><Value>BPM UNIT</Value>
    <Tracks><Track>   Name, <Staves><Staff><Properties>: CapoFret, Tuning (Pitches, low
                       string first), DiagramCollection (chord id -> name) ...
    <MasterBars><MasterBar>   Time "n/d", Key, Repeat(start,end,count), TripletFeel,
                       DoubleBar, Fermatas, <Bars>id per track</Bars>
    <Bars><Bar id>    Clef, <Voices>v0 v1 v2 v3</Voices> (-1 = unused voice)
    <Voices><Voice id><Beats>beat ids in time order</Beats>
    <Beats><Beat id>  <Rhythm ref>, <Notes>note ids</Notes> (absent => rest), Dynamic,
                       Chord (diagram id), Lyrics, Arpeggio, Properties (Brush, ...)
    <Notes><Note id>  Properties: String (0 = lowest string), Fret, Midi, HopoOrigin,
                       HopoDestination, Slide(Flags), Harmonic/HarmonicType/HarmonicFret,
                       Muted, PalmMuted, Bended + Bend*, LeftHandTapped;
                       child tags: Tie(origin,destination), Vibrato, AntiAccent, Ornament
    <Rhythms><Rhythm id>  NoteValue (Whole..64th), AugmentationDot count, PrimaryTuplet num/den

Assumptions / conventions (verified on the corpus, see dataset_stats.md)
------------------------------------------------------------------------
* Beats unit: "beats" everywhere in the output means QUARTER NOTES (like MIDI ticks /
  music21 quarterLength), independent of the time signature.  A 6/8 bar is 3.0 beats.
* String numbering: gpif ``String`` is 0 = lowest (6th, E2) ... 5 = highest.  The output
  ``string`` is tab convention 1 = high e ... 6 = low E (``string = 6 - gp_string``);
  ``gp_string`` is also kept.
* Sounding pitch ``midi = tuning[gp_string] + capo + fret``.  This equals the file's own
  ``Midi`` property for 100% of single-track notes (26,192 checked); a mismatch is
  reported as a warning.  ``midi_sounding`` additionally applies the harmonic
  transposition for natural/artificial harmonics (HarmonicFret 12 -> +12, 7 -> +19,
  5 -> +24, 3.2/4 -> +28, 2.4 -> +31, 9/16 -> +28/+24, 19 -> +19, 24 -> +12).  The
  file's Midi property stores the *fretted* pitch for harmonics, not the sounding one.
* Tempo: ``Value`` is "BPM UNIT"; UNIT 2 = quarter note (only unit seen).  Units 1,3,4,5
  (eighth, dotted quarter, half, dotted half) are converted to quarter-note BPM.
  ``Position`` is the fraction of the bar (0..1) where the change happens.  ``Linear``
  = true (a ramp from the previous tempo) occurs twice in the corpus and is approximated
  as a step at that position (warning "linear_tempo_ramp").  If no tempo automation
  exists at bar 0 the GP default 120 BPM is assumed (warning).
* Repeats: ``Repeat start``/``end``/``count``.  No alternate endings, no D.S./Coda
  directions exist in this corpus, so expansion is the simple textbook rule: an end
  bar with count N makes the section from the last start bar (or bar 0) play N times
  in total.  Expanded order is given by ``bar_playback`` (0-based playback index) and
  ``repeat_pass``; the un-expanded score index is ``bar``.  Tempo changes inside a
  repeated section re-apply on every pass.
* TripletFeel (swing, "Triplet8th", 39 bars in 11 files): ``onset_beats`` stays
  nominal (straight); ``onset_sec``/``duration_sec`` apply the swing (the 2nd eighth of
  each quarter is moved from 0.5 to 2/3 of the quarter).
* Voices: a bar can hold up to 4 voices, each a sequential beat list starting at the bar
  start.  A secondary voice that is shorter than the bar is normal (GP allows it).  A
  voice that is LONGER than the bar is kept (notes are still timed from the bar start)
  but reported as warning "voice_overfull".
* Rests (beats without <Notes>) are not emitted as notes; they are counted in
  ``n_rests``.  They still advance time.
* Ties: a note with Tie destination=true is a continuation of the previous note on the
  same track/string.  It IS emitted (flag ``tie_destination``) so beat-level data stays
  complete, and its duration is added to the chain origin's ``duration_beats_tied`` /
  ``duration_sec_tied``.  For audio-transcription training use the origin notes and
  drop ``tie_destination`` notes.
* Grace notes (``<GraceNotes>``), LetRing, and alternate endings never occur in this
  corpus; the flags ``grace`` / ``let_ring`` are emitted (always false) for schema
  stability.
* Dynamics: every beat in the corpus is MF; ``velocity`` is the GP MIDI mapping of the
  dynamic (MF = 79) and therefore carries no information here.
* Slide ``Flags`` bitmask (GP7 convention): 1 shift, 2 legato, 4 out-down, 8 out-up,
  16 in-below (from below), 32 in-above, 64 pick slide.
* Bend values are copied raw (GP units: 100 = full/whole-tone bend, offsets 0..100 along
  the note).  66 bends exist in the corpus.
* ``chord`` is the chord-diagram name attached to the beat (if any), useful as weak
  harmonic labels; ``lyric`` is the syllable attached to the beat.
* Multi-track files (4 files have 9 tracks: Vocals/E.Guitar/Trumpet/.../Drums — a band
  template in which only "E.Guitar I (Rhythm)" actually contains notes) are parsed in
  full with ``track`` indexes; ``primary_track`` and the file-level ``capo``/``tuning``
  come from the 6-string track with the most notes.  Drums (tuning all 0) notes would
  get ``midi`` from the Midi property.
"""
import argparse
import csv
import json
import os
import re
import sys
import zipfile
from fractions import Fraction
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
DATASET = os.path.dirname(HERE)

NOTE_VALUE_QN = {
    'Whole': Fraction(4), 'Half': Fraction(2), 'Quarter': Fraction(1), 'Eighth': Fraction(1, 2),
    '16th': Fraction(1, 4), '32nd': Fraction(1, 8), '64th': Fraction(1, 16), '128th': Fraction(1, 32),
}
TEMPO_UNIT_QN = {1: Fraction(1, 2), 2: Fraction(1), 3: Fraction(3, 2), 4: Fraction(2), 5: Fraction(3)}
DYNAMIC_VELOCITY = {'PPP': 15, 'PP': 31, 'P': 47, 'MP': 63, 'MF': 79, 'F': 95, 'FF': 111, 'FFF': 127}
SLIDE_FLAGS = [(1, 'shift'), (2, 'legato'), (4, 'out_down'), (8, 'out_up'), (16, 'in_below'), (32, 'in_above'), (64, 'pick')]
HARMONIC_OFFSET = {12.0: 12, 7.0: 19, 5.0: 24, 4.0: 28, 3.2: 28, 2.4: 31, 9.0: 28, 16.0: 24, 19.0: 19, 24.0: 12, 2.7: 34, 3.0: 31}
STANDARD_TUNING = [40, 45, 50, 55, 59, 64]
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MAX_EXPANSION_FACTOR = 12  # guard against runaway repeat expansion

STEM_RE = re.compile(r'^(XN\d{4})_(.+?)(?:__([A-Za-z0-9]+))?$')


def midi_name(m):
    return f'{NOTE_NAMES[m % 12]}{m // 12 - 1}'


def f2(x):
    """Fraction -> float rounded for JSON."""
    return round(float(x), 6)


def text(el, tag, default=None):
    if el is None:
        return default
    x = el.find(tag)
    if x is None or x.text is None:
        return default
    return x.text.strip()


def props_of(el):
    p = el.find('Properties') if el is not None else None
    if p is None:
        return {}
    return {x.get('name'): x for x in p.findall('Property')}


def rhythm_qn(r):
    d = NOTE_VALUE_QN[text(r, 'NoteValue')]
    dot = r.find('AugmentationDot')
    if dot is not None:
        n = int(dot.get('count', '1'))
        d = d * (2 - Fraction(1, 2 ** n))
    tup = r.find('PrimaryTuplet')
    if tup is not None:
        d = d * Fraction(int(tup.get('den')), int(tup.get('num')))
    return d


def swing_map(pos, feel):
    """Map a nominal in-bar position (quarter notes) to swung position."""
    if feel in ('Triplet8th', 'Dotted8th', 'Scottish8th'):
        q = pos // 1
        frac = pos - q
        if feel == 'Triplet8th' and frac == Fraction(1, 2):
            return q + Fraction(2, 3)
        if feel == 'Dotted8th' and frac == Fraction(1, 2):
            return q + Fraction(3, 4)
        if feel == 'Scottish8th' and frac == Fraction(1, 2):
            return q + Fraction(1, 4)
    elif feel in ('Triplet16th', 'Dotted16th', 'Scottish16th'):
        q = pos // Fraction(1, 2)
        base = q * Fraction(1, 2)
        frac = pos - base
        if feel == 'Triplet16th' and frac == Fraction(1, 4):
            return base + Fraction(1, 3)
        if feel == 'Dotted16th' and frac == Fraction(1, 4):
            return base + Fraction(3, 8)
        if feel == 'Scottish16th' and frac == Fraction(1, 4):
            return base + Fraction(1, 8)
    return pos


class TempoMap:
    """Piecewise-constant tempo over playback time (quarter notes -> seconds)."""

    def __init__(self, events):
        # events: list of (onset_qn: Fraction, bpm: float), sorted, first at 0
        self.events = sorted(events, key=lambda e: e[0])
        if not self.events or self.events[0][0] != 0:
            self.events.insert(0, (Fraction(0), 120.0))
        # dedupe same position: last wins
        ded = {}
        for q, b in self.events:
            ded[q] = b
        self.events = sorted(ded.items())
        self.sec_at = []
        t = 0.0
        for i, (q, bpm) in enumerate(self.events):
            self.sec_at.append(t)
            if i + 1 < len(self.events):
                t += float(self.events[i + 1][0] - q) * 60.0 / bpm

    def seconds(self, qn):
        # binary search last event <= qn
        lo, hi = 0, len(self.events) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if self.events[mid][0] <= qn:
                lo = mid
            else:
                hi = mid - 1
        q, bpm = self.events[lo]
        return self.sec_at[lo] + float(qn - q) * 60.0 / bpm


def expand_repeats(masterbars):
    """Return list of (score_bar_index, repeat_pass) in playback order."""
    n = len(masterbars)
    order = []
    i = 0
    start = 0
    passes = {}      # end bar index -> passes done
    visits = {}      # score bar -> times played so far
    limit = n * MAX_EXPANSION_FACTOR + 10
    while i < n and len(order) < limit:
        mb = masterbars[i]
        if mb['repeat_start']:
            start = i
        visits[i] = visits.get(i, 0) + 1
        order.append((i, visits[i] - 1))
        if mb['repeat_end']:
            cnt = mb['repeat_count'] if mb['repeat_count'] and mb['repeat_count'] >= 2 else 2
            passes[i] = passes.get(i, 0) + 1
            if passes[i] < cnt:
                i = start
                continue
            passes[i] = 0
        i += 1
    truncated = len(order) >= limit
    return order, truncated


def parse_gpif(xml_bytes, stem):
    root = ET.fromstring(xml_bytes)
    warnings = []
    out = {}
    m = STEM_RE.match(stem)
    out['source_file'] = stem + '.gp'
    out['song_id'] = m.group(1) if m else stem[:6]
    out['variant'] = (m.group(3) or '') if m else ''
    score = root.find('Score')
    out['title'] = text(score, 'Title', '')
    out['artist'] = text(score, 'Artist', '')
    out['subtitle'] = text(score, 'SubTitle', '')
    out['gp_version'] = text(root, 'GPVersion', '')

    # ---------------- tracks ----------------
    tracks = []
    for ti, tr in enumerate(root.find('Tracks').findall('Track')):
        staff = tr.find('Staves').find('Staff') if tr.find('Staves') is not None else None
        sp = props_of(staff)
        capo = int(text(sp.get('CapoFret'), 'Fret', '0')) if 'CapoFret' in sp else 0
        tuning = [int(v) for v in text(sp.get('Tuning'), 'Pitches', '').split()] if 'Tuning' in sp else []
        chords = {}
        dc = sp.get('DiagramCollection')
        if dc is not None and dc.find('Items') is not None:
            for it in dc.find('Items').findall('Item'):
                chords[it.get('id')] = it.get('name')
        tracks.append({
            'index': ti, 'name': text(tr, 'Name', ''), 'capo': capo, 'tuning': tuning,
            'n_strings': len(tuning), 'standard_tuning': tuning == STANDARD_TUNING,
            'chord_names': chords,
        })
    out['n_tracks'] = len(tracks)
    out['tracks'] = tracks
    if len(tracks) != 1:
        warnings.append({'type': 'multi_track', 'detail': [t['name'] for t in tracks]})

    # ---------------- master bars ----------------
    masterbars = []
    for bi, mb in enumerate(root.find('MasterBars').findall('MasterBar')):
        num, den = [int(x) for x in text(mb, 'Time', '4/4').split('/')]
        rep = mb.find('Repeat')
        key = mb.find('Key')
        tf = text(mb, 'TripletFeel')
        masterbars.append({
            'index': bi, 'time': f'{num}/{den}', 'numerator': num, 'denominator': den,
            'length_beats': Fraction(num * 4, den),
            'repeat_start': rep is not None and rep.get('start') == 'true',
            'repeat_end': rep is not None and rep.get('end') == 'true',
            'repeat_count': int(rep.get('count', '0')) if rep is not None else 0,
            'triplet_feel': tf if tf and tf != 'NoTripletFeel' else None,
            'double_bar': mb.find('DoubleBar') is not None,
            'fermata': mb.find('Fermatas') is not None,
            'key_accidentals': int(text(key, 'AccidentalCount', '0')) if key is not None else 0,
            'key_mode': text(key, 'Mode', '') if key is not None else '',
            'bar_ids': text(mb, 'Bars', '').split(),
        })
    n_bars = len(masterbars)

    # ---------------- tempo automations (score positions) ----------------
    tempo_score = []
    mt = root.find('MasterTrack')
    autos = mt.find('Automations') if mt is not None else None
    if autos is not None:
        for a in autos.findall('Automation'):
            if text(a, 'Type') != 'Tempo':
                continue
            val = text(a, 'Value', '120 2').split()
            bpm = float(val[0])
            unit = int(val[1]) if len(val) > 1 else 2
            bpm_qn = bpm * float(TEMPO_UNIT_QN.get(unit, 1))
            bar = int(text(a, 'Bar', '0'))
            pos = Fraction(text(a, 'Position', '0')).limit_denominator(64)
            linear = text(a, 'Linear', 'false') == 'true'
            if linear:
                warnings.append({'type': 'linear_tempo_ramp', 'detail': {'bar': bar, 'bpm': bpm_qn}})
            if bar >= n_bars:
                warnings.append({'type': 'tempo_event_out_of_range', 'detail': {'bar': bar}})
                continue
            tempo_score.append({'bar': bar, 'position': f2(pos), 'position_frac': pos, 'bpm': bpm_qn,
                                'bpm_raw': bpm, 'unit': unit, 'linear': linear})
    tempo_score.sort(key=lambda e: (e['bar'], e['position_frac']))
    if not any(e['bar'] == 0 and e['position_frac'] == 0 for e in tempo_score):
        warnings.append({'type': 'no_initial_tempo_default_120', 'detail': None})
        tempo_score.insert(0, {'bar': 0, 'position': 0.0, 'position_frac': Fraction(0), 'bpm': 120.0,
                               'bpm_raw': 120.0, 'unit': 2, 'linear': False})

    # ---------------- rhythms / beats / notes / voices / bars ----------------
    rhythms = {r.get('id'): rhythm_qn(r) for r in root.find('Rhythms').findall('Rhythm')}
    bars = {b.get('id'): b for b in root.find('Bars').findall('Bar')}
    voices = {v.get('id'): v for v in root.find('Voices').findall('Voice')}
    beats = {b.get('id'): b for b in root.find('Beats').findall('Beat')}
    notes_xml = {n.get('id'): n for n in root.find('Notes').findall('Note')}

    # ---------------- playback order ----------------
    order, truncated = expand_repeats(masterbars)
    if truncated:
        warnings.append({'type': 'repeat_expansion_truncated', 'detail': len(order)})
    playback = []
    tempo_events = []
    score_bar_onset = []
    q = Fraction(0)
    for bi in range(n_bars):
        score_bar_onset.append(q)
        q += masterbars[bi]['length_beats']
    q = Fraction(0)
    for pi, (bi, rp) in enumerate(order):
        mb = masterbars[bi]
        playback.append({'bar_playback': pi, 'bar': bi, 'repeat_pass': rp, 'onset_beats_frac': q,
                         'length_beats': mb['length_beats']})
        for e in tempo_score:
            if e['bar'] == bi:
                tempo_events.append((q + e['position_frac'] * mb['length_beats'], e['bpm']))
        q += mb['length_beats']
    total_beats = q
    tmap = TempoMap(tempo_events)

    # ---------------- notes ----------------
    notes_out = []
    n_rests = 0
    open_ties = {}   # (track, gp_string) -> index into notes_out of chain origin
    beat_counts = {}  # polyphony: (track, onset) -> n notes
    tech_counter = {}
    for pb in playback:
        bi = pb['bar']
        mb = masterbars[bi]
        feel = mb['triplet_feel']
        bar_q = pb['onset_beats_frac']
        bar_len = mb['length_beats']
        pb['onset_beats'] = f2(bar_q)
        pb['onset_sec'] = round(tmap.seconds(bar_q), 6)
        pb['length_beats'] = f2(bar_len)
        for ti, bar_id in enumerate(mb['bar_ids']):
            bar = bars.get(bar_id)
            if bar is None:
                warnings.append({'type': 'missing_bar', 'detail': {'bar': bi, 'track': ti}})
                continue
            track = tracks[ti]
            tuning = track['tuning']
            capo = track['capo']
            voice_ids = text(bar, 'Voices', '').split()
            for vi, vid in enumerate(voice_ids):
                if vid == '-1':
                    continue
                voice = voices.get(vid)
                if voice is None:
                    continue
                pos = Fraction(0)
                beat_ids = text(voice, 'Beats', '').split()
                for bj, beat_id in enumerate(beat_ids):
                    beat = beats[beat_id]
                    dur = rhythms[beat.find('Rhythm').get('ref')]
                    nids = text(beat, 'Notes', '')
                    if not nids:
                        n_rests += 1
                        pos += dur
                        continue
                    bprops = props_of(beat)
                    dyn = text(beat, 'Dynamic', 'MF')
                    chord_id = text(beat, 'Chord')
                    chord = track['chord_names'].get(chord_id) if chord_id is not None else None
                    lyr = beat.find('Lyrics')
                    lyric = None
                    if lyr is not None:
                        lines = [l.text.strip() for l in lyr.findall('Line') if l.text and l.text.strip()]
                        lyric = ' / '.join(lines) if lines else None
                    brush = text(bprops.get('Brush'), 'Direction') if 'Brush' in bprops else None
                    arp = text(beat, 'Arpeggio')
                    onset_nom = bar_q + pos
                    onset_sw = bar_q + swing_map(pos, feel)
                    end_sw = bar_q + swing_map(pos + dur, feel)
                    onset_sec = tmap.seconds(onset_sw)
                    dur_sec = tmap.seconds(end_sw) - onset_sec
                    for nid in nids.split():
                        nx = notes_xml.get(nid)
                        if nx is None:
                            warnings.append({'type': 'missing_note', 'detail': nid})
                            continue
                        p = props_of(nx)
                        gps = int(text(p.get('String'), 'String', '-1')) if 'String' in p else -1
                        fret = int(text(p.get('Fret'), 'Fret', '-1')) if 'Fret' in p else -1
                        midi_prop = int(text(p.get('Midi'), 'Number', '-1')) if 'Midi' in p else -1
                        if 0 <= gps < len(tuning) and fret >= 0 and any(tuning):
                            midi = tuning[gps] + capo + fret
                            if midi_prop >= 0 and midi != midi_prop:
                                warnings.append({'type': 'midi_mismatch', 'detail': {'bar': bi, 'note': nid, 'computed': midi, 'file': midi_prop}})
                        else:
                            midi = midi_prop
                        # techniques
                        slide_flags = int(text(p.get('Slide'), 'Flags', '0')) if 'Slide' in p else 0
                        slide = [name for bit, name in SLIDE_FLAGS if slide_flags & bit]
                        harmonic = text(p.get('HarmonicType'), 'HType') if 'Harmonic' in p else None
                        hfret = float(text(p.get('HarmonicFret'), 'HFret', '0')) if 'HarmonicFret' in p else None
                        midi_sounding = midi
                        if harmonic and hfret is not None:
                            off = HARMONIC_OFFSET.get(round(hfret, 1))
                            if off is None:
                                warnings.append({'type': 'unknown_harmonic_fret', 'detail': hfret})
                            else:
                                base = (tuning[gps] + capo) if (harmonic == 'Natural' and 0 <= gps < len(tuning)) else midi
                                midi_sounding = base + off
                        bend = None
                        if 'Bended' in p:
                            bend = {k[4:]: float(text(p[k], 'Float', '0')) for k in p if k.startswith('Bend') and k != 'Bended'}
                        tie = nx.find('Tie')
                        tie_o = tie is not None and tie.get('origin') == 'true'
                        tie_d = tie is not None and tie.get('destination') == 'true'
                        rec = {
                            'track': ti, 'bar': bi, 'bar_playback': pb['bar_playback'], 'repeat_pass': pb['repeat_pass'],
                            'voice': vi, 'beat_in_bar': bj, 'beat_id': int(beat_id), 'note_id': int(nid),
                            'pos_in_bar_beats': f2(pos),
                            'onset_beats': f2(onset_nom), 'onset_sec': round(onset_sec, 6),
                            'duration_beats': f2(dur), 'duration_sec': round(dur_sec, 6),
                            'string': 6 - gps if 0 <= gps < 6 else None, 'gp_string': gps, 'fret': fret,
                            'midi': midi, 'midi_sounding': midi_sounding,
                            'pitch': midi_name(midi) if midi >= 0 else None,
                            'dynamic': dyn, 'velocity': DYNAMIC_VELOCITY.get(dyn, 79),
                            'chord': chord, 'lyric': lyric,
                            'hammer_pull_origin': 'HopoOrigin' in p, 'hammer_pull_destination': 'HopoDestination' in p,
                            'slide': slide, 'harmonic': harmonic, 'harmonic_fret': hfret,
                            'palm_mute': 'PalmMuted' in p, 'let_ring': 'LetRing' in p or nx.find('LetRing') is not None,
                            'tie_origin': tie_o, 'tie_destination': tie_d,
                            'dead': 'Muted' in p, 'vibrato': text(nx, 'Vibrato'),
                            'bend': bend, 'grace': beat.find('GraceNotes') is not None,
                            'ghost': nx.find('AntiAccent') is not None, 'accent': text(nx, 'Accent'),
                            'tapped': 'LeftHandTapped' in p or 'Tapped' in p, 'ornament': text(nx, 'Ornament'),
                            'brush': brush, 'arpeggio': arp,
                            'duration_beats_tied': f2(dur), 'duration_sec_tied': round(dur_sec, 6),
                            'tie_origin_index': None,
                        }
                        rec['ins'] = len(notes_out)
                        idx = len(notes_out)
                        key = (ti, gps)
                        if tie_d and key in open_ties:
                            oi = open_ties[key]
                            notes_out[oi]['duration_beats_tied'] = f2(Fraction(notes_out[oi]['duration_beats_tied']).limit_denominator(4096) + dur)
                            notes_out[oi]['duration_sec_tied'] = round(notes_out[oi]['duration_sec_tied'] + dur_sec, 6)
                            rec['tie_origin_index'] = oi
                            rec['duration_beats_tied'] = 0.0
                            rec['duration_sec_tied'] = 0.0
                            if not tie_o:
                                del open_ties[key]
                        elif tie_d:
                            warnings.append({'type': 'tie_without_origin', 'detail': {'bar': bi, 'note': nid}})
                            if tie_o:
                                open_ties[key] = idx
                        elif tie_o:
                            open_ties[key] = idx
                        notes_out.append(rec)
                        for k in ('hammer_pull_origin', 'palm_mute', 'tie_destination', 'dead', 'ghost', 'tapped', 'grace', 'let_ring'):
                            if rec[k]:
                                tech_counter[k] = tech_counter.get(k, 0) + 1
                        if slide:
                            tech_counter['slide'] = tech_counter.get('slide', 0) + 1
                        if harmonic:
                            tech_counter['harmonic'] = tech_counter.get('harmonic', 0) + 1
                        if bend:
                            tech_counter['bend'] = tech_counter.get('bend', 0) + 1
                        if rec['vibrato']:
                            tech_counter['vibrato'] = tech_counter.get('vibrato', 0) + 1
                        bk = (ti, onset_nom)
                        beat_counts[bk] = beat_counts.get(bk, 0) + 1
                    pos += dur
                if pos > bar_len + Fraction(1, 1024):
                    warnings.append({'type': 'voice_overfull', 'detail': {'bar': bi, 'track': ti, 'voice': vi, 'beats': f2(pos), 'bar_length': f2(bar_len)}})
    notes_out.sort(key=lambda r: (r['onset_beats'], r['track'], r['voice'], -r['midi'] if r['midi'] is not None else 0))
    _fix_tie_indexes(notes_out)

    # primary (guitar) track: the 6-string track with the most notes (ties -> lowest index)
    per_track = {}
    for r in notes_out:
        per_track[r['track']] = per_track.get(r['track'], 0) + 1
    cands = [t for t in tracks if t['n_strings'] == 6 and any(t['tuning'])] or tracks
    primary = max(cands, key=lambda t: (per_track.get(t['index'], 0), -t['index']))
    out['primary_track'] = primary['index']
    out['capo'] = primary['capo']
    out['tuning'] = primary['tuning']
    out['standard_tuning'] = primary['standard_tuning']
    if not primary['standard_tuning']:
        warnings.append({'type': 'non_standard_tuning', 'detail': primary['tuning']})

    # leading whole-bar brushed chord bars (chord chart "intro")
    lead = 0
    for bi in range(n_bars):
        bar_notes = [r for r in notes_out if r['bar'] == bi and r['repeat_pass'] == 0 and r['track'] == primary['index']]
        if not bar_notes:
            break
        if all(r['chord'] and r['duration_beats'] == f2(masterbars[bi]['length_beats']) and r['pos_in_bar_beats'] == 0 for r in bar_notes):
            lead += 1
        else:
            break
    if lead:
        warnings.append({'type': 'leading_whole_bar_chords', 'detail': lead})
    if not notes_out:
        warnings.append({'type': 'zero_notes', 'detail': None})

    # ---------------- assemble ----------------
    sig_changes = []
    last = None
    for mb in masterbars:
        if mb['time'] != last:
            sig_changes.append({'bar': mb['index'], 'time': mb['time'], 'numerator': mb['numerator'], 'denominator': mb['denominator']})
            last = mb['time']
    out['time_signatures'] = sig_changes
    out['tempo_map'] = [{'bar': e['bar'], 'position': e['position'], 'bpm': e['bpm'], 'bpm_raw': e['bpm_raw'], 'unit': e['unit'], 'linear': e['linear']} for e in tempo_score]
    out['tempo_map_playback'] = [{'onset_beats': f2(q), 'onset_sec': round(tmap.seconds(q), 6), 'bpm': b} for q, b in tmap.events]
    out['tempo_initial_bpm'] = tmap.events[0][1]
    out['tempo_min_bpm'] = min(b for _, b in tmap.events)
    out['tempo_max_bpm'] = max(b for _, b in tmap.events)
    out['bars'] = [{k: (f2(v) if isinstance(v, Fraction) else v) for k, v in mb.items() if k != 'bar_ids'} for mb in masterbars]
    for mb, q0 in zip(out['bars'], score_bar_onset):
        mb['onset_beats_score'] = f2(q0)
    out['playback_bars'] = [{k: v for k, v in pb.items() if k != 'onset_beats_frac'} for pb in playback]
    out['n_bars'] = n_bars
    out['n_bars_playback'] = len(playback)
    out['has_repeats'] = len(playback) != n_bars
    out['duration_beats'] = f2(total_beats)
    out['duration_sec'] = round(tmap.seconds(total_beats), 6)
    out['n_notes'] = len(notes_out)
    out['n_notes_primary_track'] = sum(1 for r in notes_out if r['track'] == primary['index'])
    out['n_notes_no_tie_continuation'] = sum(1 for r in notes_out if not r['tie_destination'])
    out['n_rests'] = n_rests
    out['n_unique_note_events_in_score'] = sum(1 for r in notes_out if r['repeat_pass'] == 0)
    out['technique_counts'] = dict(sorted(tech_counter.items()))
    out['polyphony_max'] = max(beat_counts.values()) if beat_counts else 0
    out['polyphony_mean'] = round(sum(beat_counts.values()) / len(beat_counts), 4) if beat_counts else 0
    out['warnings'] = warnings
    out['notes'] = notes_out
    return out


def _fix_tie_indexes(notes_out):
    """tie_origin_index was assigned in insertion order ('ins'); remap it after sorting."""
    pos = {r['ins']: i for i, r in enumerate(notes_out)}
    for r in notes_out:
        if r['tie_origin_index'] is not None:
            r['tie_origin_index'] = pos[r['tie_origin_index']]
        del r['ins']


def convert_file(path, out_dir):
    stem = os.path.splitext(os.path.basename(path))[0]
    with zipfile.ZipFile(path) as z:
        xml_bytes = z.read('Content/score.gpif')
    data = parse_gpif(xml_bytes, stem)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, stem + '.json')
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=None, separators=(',', ':'))
    return data


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--gp-dir', default=os.path.join(DATASET, 'gp'))
    ap.add_argument('--out-dir', default=os.path.join(DATASET, 'json'))
    ap.add_argument('--only', default=None, help='only stems starting with this prefix')
    args = ap.parse_args()
    files = sorted(f for f in os.listdir(args.gp_dir) if f.lower().endswith('.gp'))
    if args.only:
        files = [f for f in files if f.startswith(args.only)]
    ok, failed, report = 0, [], []
    for f in files:
        p = os.path.join(args.gp_dir, f)
        try:
            d = convert_file(p, args.out_dir)
            ok += 1
            report.append({'file': f, 'status': 'ok', 'n_notes': d['n_notes'], 'n_bars': d['n_bars'],
                           'n_bars_playback': d['n_bars_playback'], 'duration_sec': d['duration_sec'],
                           'warnings': [w['type'] for w in d['warnings']]})
        except Exception as e:  # report, never skip silently
            import traceback
            failed.append((f, repr(e)))
            report.append({'file': f, 'status': 'FAILED', 'error': repr(e), 'traceback': traceback.format_exc()})
            print(f'FAILED {f}: {e!r}', file=sys.stderr)
    os.makedirs(args.out_dir, exist_ok=True)
    with open(os.path.join(args.out_dir, '_parse_report.json'), 'w', encoding='utf-8') as fh:
        json.dump({'n_files': len(files), 'n_ok': ok, 'n_failed': len(failed), 'files': report}, fh, ensure_ascii=False, indent=1)
    print(f'parsed {ok}/{len(files)} files, {len(failed)} failed -> {args.out_dir}')
    for f, e in failed:
        print(f'  FAILED {f}: {e}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
