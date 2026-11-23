#!/usr/bin/env python3
"""
build_media.py — turn the three sample song packages into what the prototype loads.

    python3 tools/build_media.py <download_dir> [--audio] [--check]

<download_dir> holds the raw files fetched from Drive / Dropbox (not kept in this
folder because they are ~300 MB):

    fs.gp                                  (X-note XN0100 fingerstyle — tab only, no audio)
    bach.gp  bach_drums.wav  bach_bass.wav  bach_synth.wav  bach_rhythm.wav  bach_guide.mp3
    iml.gp   iml.wav                       (Sebastian Hansson — In My Life)
    mts.gp   mts.mp3  mts_cover.png        (Vinai T — Move The Sky, Ch01 Full Song)

Outputs
    data/songs.js              window.GT_SONGS = { LJS001: {...}, ... }  (manifest + score events)
    media/<id>/<stem>_<speed>.m4a   speeds 100 / 75 / 50 % (pitch-preserving, ffmpeg atempo)
    media/<id>/cover.jpg

Score events follow Content Manifest v1: string 1 = high e, bar 1 = count-in, audio frame 0 =
bar 1 (plus `audio_offset_s` where the recording does not start on the bar line).
Needs: gp_to_json.py (X-note dataset tools) next to this file, and `pip install imageio-ffmpeg`.
"""
import json, os, re, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import gp_to_json as g  # noqa: E402

SPEEDS = [100, 75, 50]

SONGS = [
    dict(
        id='LJS001', gp='bach.gp', kind='stems', tier='pro',
        title='Prelude in C major, BWV 846', subtitle='Neo-Classic Rock', artist='Litejam Official',
        composer='J.S. Bach', level='Intermediate', difficulty=3, key='C major',
        audio_offset_s=0.857143,  # measured: delivered WAVs have a 2-beat pre-roll before bar 1 (pitch + drum-grid check)
        stems=[
            dict(id='drums', label='Drums', role='drums', src='bach_drums.wav'),
            dict(id='bass', label='Bass', role='bass', src='bach_bass.wav'),
            dict(id='synth', label='Synth', role='synth', src='bach_synth.wav'),
            dict(id='rhythm', label='Power Chords', role='rhythm_guitar', src='bach_rhythm.wav'),
            dict(id='guide', label='Guide Melody', role='guide', src='bach_guide.mp3'),
        ],
        sections=[('S1', 'Theme 1', 2, 9, 2), ('S2', 'Theme 2', 10, 17, 2), ('S3', 'Descent', 18, 25, 3),
                  ('S4', 'Chromatic', 26, 33, 3), ('S5', 'Low turn', 34, 41, 3), ('S6', 'Tension', 42, 49, 4),
                  ('S7', 'Pedal G', 50, 57, 3), ('S8', 'Pedal G 2', 58, 65, 3), ('S9', 'Coda', 66, 72, 4)],
        chords=[(2, 'C'), (4, 'Dm7/C'), (6, 'G7/B'), (8, 'C'), (10, 'Am/C'), (12, 'D7/C'), (14, 'G/B'), (16, 'Cmaj7/B')],
        learn=None, jam_hero=True,
        rights='Composition: public domain · Recording: work for hire',
    ),
    dict(
        id='ART001', gp='iml.gp', kind='performance', tier='pro',
        title='In My Life', subtitle='Solo guitar arrangement', artist='Sebastian Hansson',
        composer='Lennon–McCartney', level='Intermediate', difficulty=3, key='A major',
        audio_offset_s=0.0,
        stems=[dict(id='artist', label="Sebastian's guitar", role='guide', src='iml.wav', stereo=True)],
        sections=None, chords=[], learn=None, jam_hero=False,
        rights='Composition: copyrighted (The Beatles) — licence NOT confirmed. Demo only, not publishable.',
    ),
    dict(
        id='VT001', gp='mts.gp', kind='backing', tier='free',
        title='Move The Sky', subtitle='Full song', artist='Vinai T',
        composer='Vinai T', level='Intermediate', difficulty=3, key='D major',
        audio_offset_s=3.09,  # MTS_Chapters_Sync.csv: "GP bar 1 starts at 3.09 s"
        stems=[dict(id='backing', label='Backing Track', role='backing', src='mts.mp3', stereo=True)],
        sections='gp', chords='gp',
        learn=dict(course='Move The Sky — Vinai T', chapters=10, done=4), jam_hero=True,
        rights='Artist course asset — GlowTab / Jam Hero rights to confirm (Surface Map Q2)',
        cover='mts_cover.png',
    ),
    dict(
        id='FS001', gp='fs.gp', kind='tab', tier='free',  # X-note XN0100 — tab only, no audio
        title='ฉันดีใจที่มีเธอ', subtitle='Fingerstyle solo', artist='X-note arrangement',
        composer='บอย โกสิยพงษ์', level='Beginner+', difficulty=2, key='—',
        audio_offset_s=0.0,
        stems=[dict(id='tabsynth', label='Tab sound', role='synth_tab')],  # no src: synthesised in the client
        sections=None, chords=[], learn=None, jam_hero=False,
        rights='Arrangement: X-note (in-house) · Composition licence to confirm before publishing',
    ),
]


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def gp_sections(xml):
    """[(label, bar_index0)] from <MasterBar><Section><Text>."""
    out = []
    for i, mb in enumerate(re.findall(r'<MasterBar>(.*?)</MasterBar>', xml, re.S)):
        m = re.search(r'<Section>.*?<Text>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</Text>', mb, re.S)
        if m and m.group(1).strip():
            out.append((m.group(1).strip(), i))
    return out


def tech(n):
    t = ''
    if n.get('dead'): t += 'x'
    if n.get('hammer_pull_destination'): t += 'h'
    if n.get('slide'): t += 's'
    if n.get('bend'): t += 'b'
    if n.get('vibrato'): t += 'v'
    if n.get('palm_mute'): t += 'p'
    if n.get('harmonic'): t += 'o'
    if n.get('tie_destination'): t += 't'
    return t


def build_song(spec, dl):
    raw = zipfile.ZipFile(os.path.join(dl, spec['gp'])).read('Content/score.gpif')
    r = g.parse_gpif(raw, spec['id'])
    xml = raw.decode('utf8')
    bpm = r['tempo_initial_bpm']
    nbars = r['n_bars']
    notes, chords_gp, last = [], [], None
    for n in r['notes']:
        notes.append([n['bar'], round(n['pos_in_bar_beats'], 4), round(n['duration_beats'], 4),
                      n['string'], n['fret'], tech(n)])
        c = n.get('chord')
        if c and (c, n['bar']) != last:
            if not chords_gp or chords_gp[-1][2] != c or chords_gp[-1][0] != n['bar']:
                chords_gp.append([n['bar'], round(n['pos_in_bar_beats'], 2), c])
            last = (c, n['bar'])
    notes.sort(key=lambda x: (x[0], x[1], x[3]))
    first_bar = min(n[0] for n in notes)

    if spec['sections'] == 'gp':
        marks = [m for m in gp_sections(xml) if m[1] > 0] or []
        secs = []
        for i, (label, b0) in enumerate(marks):
            end = (marks[i + 1][1] if i + 1 < len(marks) else nbars) - 1
            label = re.sub(r'(?<=[a-z])(?=\d)', ' ', label)
            secs.append(dict(id='S%d' % (i + 1), label=label, start=b0, end=end, diff=3))
    elif spec['sections']:
        secs = [dict(id=i, label=l, start=a - 1, end=b - 1, diff=d) for i, l, a, b, d in spec['sections']]
    else:  # no section marks in the file -> neutral 8-bar parts
        secs, b, k = [], first_bar, 1
        while b < nbars:
            e = min(b + 8, nbars) - 1
            secs.append(dict(id='S%d' % k, label='Part %d' % k, start=b, end=e, diff=3))
            b, k = e + 1, k + 1

    if spec['chords'] == 'gp':
        chords = chords_gp
    else:
        chords = [[b - 1, 0, s] for b, s in spec['chords']]

    frets = [n[4] for n in notes]
    return dict(
        id=spec['id'], kind=spec['kind'], tier=spec['tier'], title=spec['title'], subtitle=spec['subtitle'],
        artist=spec['artist'], composer=spec['composer'], level=spec['level'], difficulty=spec['difficulty'],
        key=spec['key'], bpm=bpm, bars=nbars, beatsPerBar=4, countInBars=first_bar,
        secPerBar=round(240.0 / bpm, 6), audioOffset=spec['audio_offset_s'],
        stems=[dict(id=s['id'], label=s['label'], role=s['role']) for s in spec['stems']],
        sections=secs, chords=chords, notes=notes, fretRange=[min(frets), max(frets)],
        learn=spec['learn'], jamHero=spec['jam_hero'], rights=spec['rights'],
        cover=('media/%s/cover.jpg' % spec['id']) if spec.get('cover') else None,
        techniques=r['technique_counts'], nNotes=len(notes),
    )


def encode(spec, dl):
    ff = ffmpeg()
    out_dir = os.path.join(ROOT, 'media', spec['id'])
    os.makedirs(out_dir, exist_ok=True)
    for s in spec['stems']:
        if not s.get('src'): continue
        for sp in SPEEDS:
            dst = os.path.join(out_dir, '%s_%d.m4a' % (s['id'], sp))
            stereo = s.get('stereo') and sp == 100
            cmd = [ff, '-y', '-v', 'error', '-i', os.path.join(dl, s['src'])]
            if sp != 100:
                cmd += ['-af', 'atempo=%.2f' % (sp / 100.0)]
            cmd += ['-ac', '2' if stereo else '1', '-ar', '44100', '-c:a', 'aac',
                    '-b:a', '128k' if stereo else '96k', dst]
            subprocess.check_call(cmd)
            print('  ', os.path.relpath(dst, ROOT), os.path.getsize(dst) // 1024, 'KB')
    if spec.get('cover'):
        subprocess.check_call(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-Z', '960',
                               os.path.join(dl, spec['cover']), '--out', os.path.join(out_dir, 'cover.jpg')],
                              stdout=subprocess.DEVNULL)


def check_sync(spec, song, dl):
    """Correlate the audio onset envelope with the score's note onsets; print the best offset."""
    import numpy as np, librosa, tempfile
    ref = spec['stems'][-1]['src']  # guide / artist / backing
    tmp = os.path.join(tempfile.gettempdir(), 'gt_check.wav')
    subprocess.check_call([ffmpeg(), '-y', '-v', 'error', '-i', os.path.join(dl, ref), '-ac', '1', '-ar', '22050', '-t', '90', tmp])
    y, sr = librosa.load(tmp, sr=22050)
    hop = 256
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    fps = sr / hop
    spb = 60.0 / song['bpm']
    imp = np.zeros(len(env))
    for b, pos, *_ in song['notes']:
        i = int(round((b * 4 + pos) * spb * fps))
        if i < len(imp): imp[i] = 1
    best = (-1, 0)
    for k in range(int(-1.0 * fps), int(5.0 * fps)):
        if k >= 0: v = float(np.dot(env[k:], imp[:len(env) - k]))
        else: v = float(np.dot(env[:k], imp[-k:]))
        if v > best[0]: best = (v, k)
    print('  sync check %s: best audio offset %.3f s (configured %.3f s)' % (spec['id'], best[1] / fps, spec['audio_offset_s']))


def main():
    dl = sys.argv[1]
    out = {}
    for spec in SONGS:
        print(spec['id'], spec['title'])
        song = build_song(spec, dl)
        out[spec['id']] = song
        print('   bars %d  bpm %s  notes %d  sections %d  chords %d  count-in bars %d' % (
            song['bars'], song['bpm'], song['nNotes'], len(song['sections']), len(song['chords']), song['countInBars']))
        if '--check' in sys.argv and spec['stems'][-1].get('src'): check_sync(spec, song, dl)
        if '--audio' in sys.argv: encode(spec, dl)
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    with open(os.path.join(ROOT, 'data', 'songs.js'), 'w', encoding='utf8') as f:
        f.write('window.GT_SONGS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('wrote data/songs.js')


if __name__ == '__main__':
    main()
