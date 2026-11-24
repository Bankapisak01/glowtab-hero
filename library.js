/* GlowTab library layer (loaded before app.js; uses its helpers at call time)
 *  1. Official Tabs — browse a catalogue of 1,000+ tabs: shelves (Signature · Backing Track · Fingerstyle · Classics
 *                     + a starter shelf), search, and a filter panel with live counts (Style, Scale, Key, …)
 *  2. My Library    — folders + list, mirroring glowtab.litejam.com/library (My Folder / My List,
 *                     All · Uploaded · Favourite, search by name or artist, sort, filter, move to folder)
 * Data (LIB) is shared by the App and the Web surface = one account; view state (LU) is per surface.
 */
'use strict';
// same vocabulary as the live web library (src/features/library/filters.ts)
const GENRES_POP = ['Rock', 'Pop', 'Metal', 'Blues', 'Jazz', 'Folk', 'Country', 'Classical', 'Funk', 'R&B', 'Reggae', 'Acoustic'];
const GENRES_MORE = ['Soft Rock', 'Alternative', 'Latin', 'Punk', 'Indie', 'Hard Rock', 'Progressive', 'Soul', 'Disco', 'World', 'Electronic', 'Hip Hop', 'Other'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const AUDIO = [['stems', 'Play with band'], ['performance', 'Artist audio'], ['backing', 'Backing track'], ['tab', 'Tab only']];
const AUDIO_LABEL = Object.fromEntries(AUDIO);
const LIB_ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  filter: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" style="fill:var(--bg)"/><circle cx="15" cy="12" r="2" style="fill:var(--bg)"/><circle cx="8" cy="18" r="2" style="fill:var(--bg)"/>',
  sort: '<path d="M8 4v16M8 4L4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
  dl: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>', folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', check: '<path d="M5 12l5 5 9-10"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
};

/* ---------- Official Tabs vocabulary (spec 2026-11-23, Q1–Q30) ----------
 * Shelves ("collections") are what a user picks first; a tab can sit on several and has one primary.
 * Everything else is a filter. Lists are locked: the admin page offers these values and nothing else. */
const COLS = [
  ['signature', 'Signature', 'เพลงกีตาร์โซโลที่ศิลปินแต่งเอง'],
  ['backing', 'Backing Track', 'วงประกอบ + Lick สำหรับฝึกและด้นสด'],
  ['fingerstyle', 'Fingerstyle', 'เล่นคนเดียวจบทั้งเพลง'],
  ['classics', 'Classics', 'เพลงอมตะที่ทุกคนรู้จัก'],
];
const STARTER = ['starter', 'เริ่มต้นที่นี่', 'เพลงสั้น ระดับ Beginner เล่นได้เลยด้วยสายมาตรฐาน'];
const COL_LABEL = Object.fromEntries(COLS.concat([STARTER]).map(c => [c[0], c[1]]));
// 8 styles. Values are spelled as in My Library's list above; "Country / Folk" is one button over two of them.
const OSTYLES = ['Rock', 'Blues', 'Jazz', 'Metal', 'Pop', 'Funk', 'Classical', 'Country / Folk'];
const OSTYLE_MATCH = { 'Country / Folk': ['Country', 'Folk'] };
// same names as the Scale menu of the Litejam app (assets/translations/en_US/scale.json), so a scale links straight to its practice page
const OSCALES = ['Major', 'Natural minor', 'Harmonic minor', 'Melodic minor', 'Pentatonic Major', 'Pentatonic minor', 'Pentatonic Blues', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian'];
const TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const OPLAY = [['lead', 'Lead'], ['rhythm', 'Rhythm']];
const OTUNE = [['standard', 'สายมาตรฐาน'], ['special', 'จูนพิเศษ']];
const OMODE = [['major', 'Major'], ['minor', 'Minor']];
const OGROUPS = ['genres', 'scales', 'keyT', 'keyM', 'play', 'tuning', 'levels', 'access', 'audio'];
const emptyOf = () => Object.fromEntries(OGROUPS.map(g => [g, []]));
const okey = c => c.kt ? c.kt + (c.km === 'minor' ? ' minor' : ' major') : '';
const ostarter = c => c.primary !== 'backing' && c.level === 'Beginner' && c.len <= 90 && c.tun === 'standard' && c.vis === 'published';

/* ---------- official catalogue: real items + generated placeholders ----------
 * Real: 3 playable demo songs, the 13 graded fingerstyle tabs and the 10 Jam Tracks (metadata only), 3 signature
 * songs shown as "coming soon". In My Life (cover, no licence) and Freight Train are hidden, as decided. */
const CAT = (() => {
  let seed = 20261123; const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, pick = a => a[Math.floor(r() * a.length)];
  const G = window.GT_SONGS, base = { fs: null, lv: 0, genres: [], scales: [], kt: '', km: '', tun: 'standard', tunName: '', capo: 0, play: null, vis: 'published', len: 180, licks: 0 };
  const out = [
    { id: 'LJS001', real: true, artistId: 'litejam', cols: ['classics'], genres: ['Classical'], kt: 'C', km: 'major', play: 'lead', level: 'Intermediate', kind: 'stems', pro: false, pop: 99, added: 3, len: 131 },
    { id: 'VT001', real: true, artistId: 'vinai-t', cols: ['signature'], genres: ['Rock', 'Pop'], scales: ['Major', 'Pentatonic minor'], kt: 'D', km: 'major', play: 'lead', level: 'Intermediate', kind: 'backing', pro: false, pop: 98, added: 40, len: 245 },
    { id: 'FS001', real: true, artistId: 'x-note', cols: ['fingerstyle'], fs: 'arr', genres: ['Pop'], level: 'Beginner', kind: 'tab', pro: false, pop: 96, added: 2, len: 224 },
    // demo songs for trying the game (data/songs_demo.js). The two Jack Thammarat songs and the two Canons replace their placeholders below.
    { id: 'LJS005', real: true, artistId: 'jack-thammarat', cols: ['signature'], genres: ['Rock'], scales: ['Major', 'Pentatonic Major'], kt: 'D', km: 'major', play: 'lead', level: 'Advanced', kind: 'backing', pro: false, pop: 95, added: 1, len: 302 },
    { id: 'LJS004', real: true, artistId: 'jack-thammarat', cols: ['signature'], genres: ['Rock', 'Blues'], scales: ['Major', 'Pentatonic Major'], kt: 'E', km: 'major', play: 'lead', level: 'Advanced', kind: 'backing', pro: false, pop: 94, added: 1, len: 266 },
    { id: 'DMO01', real: true, artistId: 'capcom', cols: ['classics'], genres: ['Rock'], play: 'lead', level: 'Advanced', kind: 'tab', pro: false, pop: 93, added: 1, len: 87 },
    { id: 'DMO04', real: true, artistId: 'eric-clapton', cols: ['classics'], genres: ['Rock', 'Blues'], kt: 'G', km: 'major', play: 'lead', level: 'Beginner', kind: 'tab', pro: false, pop: 92, added: 1, len: 218 },
    { id: 'DMO06', real: true, artistId: 'eagles', cols: ['classics'], genres: ['Country'], kt: 'G', km: 'major', play: 'lead', level: 'Beginner', kind: 'tab', pro: false, pop: 91, added: 1, len: 200 },
    { id: 'DMO05', real: true, artistId: 'eagles', cols: ['classics'], genres: ['Rock'], kt: 'B', km: 'minor', play: 'rhythm', level: 'Intermediate', kind: 'tab', pro: false, pop: 90, added: 1, len: 168 },
    { id: 'DMO03', real: true, artistId: 'green-day', cols: ['classics'], genres: ['Rock'], kt: 'F', km: 'minor', play: 'rhythm', level: 'Intermediate', kind: 'tab', pro: false, pop: 89, added: 1, len: 237 },
    { id: 'DMO02', real: true, artistId: 'luck-v', cols: ['fingerstyle'], fs: 'arr', genres: ['Rock'], level: 'Intermediate', kind: 'tab', pro: false, pop: 88, added: 1, len: 54 },
    { id: 'LJS007', real: true, artistId: 'litejam', cols: ['fingerstyle', 'classics'], fs: 'graded', lv: 1, genres: ['Classical'], kt: 'C', km: 'major', level: 'Beginner', kind: 'tab', pro: false, pop: 87, added: 5, len: 48 },
    { id: 'LJS013', real: true, artistId: 'litejam', cols: ['fingerstyle', 'classics'], fs: 'graded', lv: 2, genres: ['Classical'], kt: 'C', km: 'major', level: 'Beginner', kind: 'tab', pro: false, pop: 86, added: 6, len: 52 },
  ].map(c => ({ ...base, ...c, title: G[c.id].title, artist: G[c.id].artist, bpm: G[c.id].bpm | 0 }));
  for (const c of out) G[c.id].tier = c.pro ? 'pro' : 'free'; // Free/PRO now follows the shelf rule (Classics free, one free taster per artist)
  // graded fingerstyle set (keys = my reading of the GP key signatures, used as is — Q17)
  [['Canon', 1, 'C', 'major', 65, 'Classical', 60], ['Happy Birthday', 1, 'C', 'major', 80, 'Folk', 40], ['Jingle Bells', 1, 'C', 'major', 110, 'Folk', 45], ['Lightly Row', 1, 'G', 'major', 80, 'Folk', 50],
    ['Amazing Grace', 2, 'G', 'major', 85, 'Folk', 75], ['Canon', 2, 'C', 'major', 60, 'Classical', 95], ['Für Elise', 2, 'A', 'minor', 100, 'Classical', 70], ['Ode to Joy', 2, 'C', 'major', 90, 'Classical', 55, ['Major']], ['Spring', 2, 'A', 'major', 75, 'Classical', 80],
    ['Auld Lang Syne', 3, 'G', 'major', 100, 'Folk', 85], ['Canon', 3, 'C', 'major', 60, 'Classical', 120], ['Red River Valley', 3, 'D', 'major', 120, 'Country', 70], ["Romance d'Amour", 3, 'E', 'minor', 100, 'Classical', 110],
  ].forEach(([t, lv, kt, km, bpm, g, len, sc], i) => out.push({ ...base, id: 'LJS' + String(i < 5 ? 7 + i : 8 + i).padStart(3, '0'), title: `${t} · LV${lv}`, artist: 'Litejam Official', artistId: 'litejam', cols: ['fingerstyle', 'classics'], fs: 'graded', lv,
    genres: [g], scales: sc || [], kt, km, level: lv === 1 ? 'Beginner' : lv === 2 ? 'Beginner' : 'Intermediate', kind: 'tab', pro: lv > 1, pop: 95 - i, added: 5 + i, bpm, len, hue: 150 + lv * 28 }));
  // Jam Tracks made by Litejam (Play With Track LJ001–LJ010)
  [['Slow Blues', 'A', 'major', 70, ['Blues'], ['Pentatonic Blues', 'Mixolydian'], 3], ['Classic Rock', 'E', 'minor', 110, ['Rock'], ['Pentatonic minor', 'Natural minor'], 3], ['Modern Pop', 'C', 'major', 100, ['Pop'], ['Major', 'Pentatonic Major'], 4],
    ['Funk Groove', 'D', 'minor', 105, ['Funk'], ['Dorian', 'Pentatonic minor'], 4], ['Neo Soul', 'A', 'minor', 85, ['Jazz', 'Funk'], ['Dorian', 'Pentatonic minor'], 4], ['Jazz Swing', 'G', 'major', 120, ['Jazz'], ['Major', 'Mixolydian'], 4],
    ['Metal', 'E', 'minor', 140, ['Metal'], ['Phrygian', 'Natural minor'], 4], ['Latin Bossa', 'C', 'major', 110, ['Jazz'], ['Major'], 4], ['Ambient Ballad', 'A', 'minor', 65, ['Pop'], ['Natural minor', 'Pentatonic minor'], 4], ['Pop Rock', 'G', 'major', 115, ['Rock', 'Pop'], ['Mixolydian', 'Pentatonic Major'], 4],
  ].forEach(([t, kt, km, bpm, genres, scales, licks], i) => out.push({ ...base, id: 'LJ' + String(i + 1).padStart(3, '0'), title: `${t} in ${kt}${km === 'minor' ? 'm' : ''}`, artist: 'Litejam Official', artistId: 'litejam', cols: ['backing'], genres, scales, kt, km,
    play: 'lead', level: i % 3 === 1 ? 'Intermediate' : 'Beginner', kind: 'backing', pro: i > 0, pop: 94 - i, added: 8 + i * 3, bpm, len: 16 * 240 / bpm, licks, hue: 20 + i * 33 }));
  // signature songs waiting for their contracts: shown as "coming soon" (in the real product only after the artist agrees — Q29)
  [['Amen', 'Vinai T', 'vinai-t', 'D', 'major', 80, ['Rock']], ['Falling In Love Again', 'Jack Thammarat', 'jack-thammarat', 'E', 'major', 96, ['Rock', 'Blues']], ['On The Way', 'Jack Thammarat', 'jack-thammarat', 'D', 'major', 160, ['Rock']]]
    .forEach(([title, artist, artistId, kt, km, bpm, genres], i) => out.push({ ...base, id: 'LJS00' + (3 + i), title, artist, artistId, cols: ['signature'], genres, scales: ['Major', 'Pentatonic Major'], kt, km, play: 'lead', level: 'Intermediate', kind: 'backing', pro: true, vis: 'soon', pop: 93 - i, added: 1, bpm, len: 240, hue: 200 + i * 40 }));
  { const seen = new Set(); for (let i = 0; i < out.length; i++) if (seen.has(out[i].id)) out.splice(i--, 1); else seen.add(out[i].id); }   // a real song wins over its placeholder
  for (const c of out) c.primary = c.cols[0];

  const A = ['Midnight', 'Golden', 'Paper', 'Silver', 'Quiet', 'Electric', 'Summer', 'Broken', 'Little', 'Open', 'Northern', 'Velvet', 'Neon', 'Lonely', 'Wild', 'Blue', 'Morning', 'Last', 'Sweet', 'Distant', 'Crimson', 'Empty', 'Rainy', 'Hidden', 'Slow', 'Bright'];
  const B = ['Road', 'Lights', 'River', 'Letter', 'Garden', 'Signal', 'Harbor', 'Echo', 'Window', 'Season', 'Avenue', 'Lullaby', 'Horizon', 'Promise', 'Fire', 'Shadow', 'Parade', 'Memory', 'Station', 'Waltz', 'Skyline', 'Motel', 'Anthem', 'Tide', 'Carousel', 'Postcard'];
  const SIG = [['Studio North', 'studio-north'], ['Nara Strings', 'nara-strings'], ['Kite & Co.', 'kite-co'], ['Mono Harbor', 'mono-harbor'], ['The Lanterns', 'the-lanterns'], ['P. Arun', 'p-arun'], ['Six Maple', 'six-maple'], ['Juno Rae', 'juno-rae'], ['Low Sun', 'low-sun']];
  const GEN = { signature: ['Rock', 'Rock', 'Blues', 'Metal', 'Jazz', 'Funk', 'Pop'], backing: ['Blues', 'Rock', 'Funk', 'Jazz', 'Metal', 'Pop'], fingerstyle: ['Pop', 'Pop', 'Folk', 'Country', 'Jazz', 'Blues'], classics: ['Classical', 'Classical', 'Folk'] };
  const SC = { major: ['Major', 'Pentatonic Major', 'Mixolydian', 'Lydian'], minor: ['Pentatonic minor', 'Natural minor', 'Pentatonic Blues', 'Dorian', 'Harmonic minor', 'Phrygian'] };
  const KT = ['C', 'G', 'D', 'A', 'E', 'A', 'E', 'D', 'G', 'F', 'B', 'Bb', 'Eb', 'F#', 'C#', 'Ab'];
  for (let i = 1; i <= 1210; i++) {
    const x = r(), primary = x < .2 ? 'signature' : x < .35 ? 'backing' : x < .75 ? 'fingerstyle' : 'classics', y = r();
    const cols = primary === 'classics' && y < .5 ? ['classics', 'fingerstyle'] : [primary], isFs = cols.includes('fingerstyle'), lead = primary === 'signature' || primary === 'backing';
    const km = r() < .55 ? 'major' : 'minor', kt = pick(KT), sp = r() < .1, [artist, artistId] = primary === 'signature' ? pick(SIG) : primary === 'fingerstyle' && y > .5 ? ['X-note', 'x-note'] : ['Litejam Official', 'litejam'];
    const lv = isFs && r() < .3 ? 1 + Math.floor(r() * 3) : 0, level = lv ? (lv < 3 ? 'Beginner' : 'Intermediate') : pick(['Beginner', 'Beginner', 'Intermediate', 'Intermediate', 'Advanced']);
    const scales = lead ? [pick(SC[km])].concat(r() < .4 ? [pick(SC[km])] : []).filter((v, k, a) => a.indexOf(v) === k) : (r() < .08 ? [km === 'major' ? 'Major' : 'Natural minor'] : []);
    const kind = primary === 'backing' ? 'backing' : primary === 'signature' ? (y < .5 ? 'backing' : y < .8 ? 'stems' : 'tab') : (y < .88 ? 'tab' : 'performance');
    const g1 = pick(GEN[primary]), g2 = r() < .25 ? pick(GEN[primary]) : g1, bpm = 60 + Math.floor(r() * 110);
    out.push({ ...base, id: 'OT' + String(i).padStart(4, '0'), title: primary === 'backing' ? `${g1} Jam in ${kt}${km === 'minor' ? 'm' : ''} · ${bpm}` : pick(A) + ' ' + pick(B), artist, artistId, cols, primary, fs: isFs ? (lv ? 'graded' : 'arr') : null, lv,
      genres: g1 === g2 ? [g1] : [g1, g2], scales, kt, km, tun: sp ? 'special' : 'standard', tunName: sp ? pick(['Drop D', 'DADGAD', 'ลดครึ่งเสียง (Eb)']) : '', capo: !sp && isFs && r() < .15 ? 1 + Math.floor(r() * 4) : 0, play: lead ? (r() < .75 ? 'lead' : 'rhythm') : null,
      level, kind, pro: primary === 'signature' || primary === 'backing' ? r() > .08 : primary === 'classics' ? false : lv ? lv > 1 : r() < .6, pop: Math.floor(r() * 90), added: Math.floor(r() * r() * 420), bpm,
      len: 40 + Math.floor(r() * r() * 260), licks: primary === 'backing' ? 4 : 0, hue: Math.floor(r() * 360) });
  }
  return out;
})();
const CAT_BY = Object.fromEntries(CAT.map(c => [c.id, c]));

/* ---------- the user's library (same shape as the web's LibraryTab / LibraryFolder) ---------- */
const DAY = 864e5, NOW = Date.now();
const LIB = {
  folders: [{ id: 'f1', name: 'Fingerstyle', createdAt: NOW - 30 * DAY }, { id: 'f2', name: 'วงวันเสาร์', createdAt: NOW - 12 * DAY }, { id: 'f3', name: 'แบบฝึกหัด', createdAt: NOW - 5 * DAY }],
  tabs: [
    { id: 't1', name: 'Canon in D — fingerstyle', artist: 'arr. ของฉัน', genres: ['Classical'], difficulty: 'Beginner', createdAt: NOW - 2 * DAY, lastPlayedAt: NOW - 1 * DAY, folderId: 'f1', favourite: true, dur: 208, prog: 62 },
    { id: 't2', name: 'ฉันดีใจที่มีเธอ', artist: 'X-note arrangement', genres: ['Pop'], difficulty: 'Beginner', createdAt: NOW - 1 * DAY, lastPlayedAt: NOW - 3600e3, folderId: 'f1', favourite: true, dur: 224, prog: 40, official: 'FS001' },
    { id: 't3', name: 'Travis picking drill', artist: 'Unknown', genres: ['Folk'], difficulty: 'Beginner', createdAt: NOW - 20 * DAY, lastPlayedAt: NOW - 9 * DAY, folderId: 'f3', dur: 74, prog: 74 },
    { id: 't4', name: 'Pentatonic run 120 bpm', artist: 'Unknown', genres: ['Rock'], difficulty: 'Intermediate', createdAt: NOW - 18 * DAY, lastPlayedAt: NOW - 4 * DAY, folderId: 'f3', dur: 48, prog: 20 },
    { id: 't5', name: 'Rehearsal — song 2 (solo)', artist: 'วงวันเสาร์', genres: ['Rock', 'Pop'], difficulty: 'Intermediate', createdAt: NOW - 6 * DAY, lastPlayedAt: NOW - 2 * DAY, folderId: 'f2', dur: 251, prog: 130 },
    { id: 't6', name: 'Blues lick practice', artist: 'Unknown', genres: ['Blues'], difficulty: 'Beginner', createdAt: NOW - 3 * DAY, lastPlayedAt: NOW - 3 * DAY, folderId: null, dur: 82, prog: 25 },
    { id: 't7', name: 'Wedding set — intro', artist: 'arr. ของฉัน', genres: ['Pop', 'Acoustic'], difficulty: 'Intermediate', createdAt: NOW - 9 * DAY, lastPlayedAt: NOW - 8 * DAY, folderId: null, favourite: true, dur: 123, prog: 122 },
    { id: 't8', name: 'Solo idea in Am', artist: 'Unknown', genres: [], difficulty: 'Advanced', createdAt: NOW - 0.3 * DAY, folderId: null, dur: 0, prog: 0 },
    { id: 't9', name: 'Prelude in C major, BWV 846', artist: 'Litejam Official', genres: ['Classical'], difficulty: 'Intermediate', createdAt: NOW - 4 * DAY, lastPlayedAt: NOW - 0.5 * DAY, folderId: null, dur: 131, prog: 33, official: 'LJS001' },
  ],
  ofav: new Set(['LJS001', 'FS001']), seq: 20,
  level: null, // the user's own level: decides the order of the shelves; null = not chosen yet (treated as Beginner)
};
const mkU = () => ({ page: 'official', oq: '', ocol: 'all', ofs: 'all', oartist: '', oall: false, of: emptyOf(), osort: 'popular', olim: 30, opanel: false,
  lq: '', lchip: 'All', lf: { genres: [], levels: [] }, lsort: 'newest', lpanel: false, folder: null, grid: false, dlg: null });
const LU = { app: mkU(), web: mkU() };
const nfmt = n => n.toLocaleString('en-US');
const ago = t => { if (!t) return 'ยังไม่เคยเล่น'; const d = (Date.now() - t) / DAY; return d < 1 / 24 ? 'Played just now' : d < 1 ? `Played ${Math.max(1, Math.round(d * 24))} hours ago` : d < 2 ? 'Played yesterday' : `Played ${Math.round(d)} days ago`; };
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

/* ---------- shared bits ---------- */
const lvBadge = l => `<span class="lv ${l[0]}">${l}</span>`;
const searchBox = (inp, val, ph) => `<label class="srch">${ic('search')}<input data-inp="${inp}" value="${esc(val)}" placeholder="${ph}" autocomplete="off">${val ? `<button data-act="clearq" data-inp-id="${inp}" aria-label="Clear search">${ic('x')}</button>` : ''}</label>`;
function fgroup(title, scope, group, opts, sel) {
  return `<div class="fg"><div class="fgt">${title}</div><div class="fcs">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<button class="fc ${sel.includes(v) ? 'on' : ''}" data-act="ftog" data-scope="${scope}" data-group="${group}" data-v="${esc(v)}">${l}</button>`; }).join('')}</div></div>`;
}
function ocover(c, size) {
  if (c.real) return coverHTML(SONGS[c.id], '', false, `width:${size}px;height:${size}px;flex:none;border-radius:10px;padding:0`).replace(/font-size:\d+px/, `font-size:${Math.round(size / 4.4)}px`);
  return `<div class="cover" style="width:${size}px;height:${size}px;flex:none;border-radius:10px;padding:0;background:linear-gradient(135deg,hsl(${c.hue} 45% 28%),hsl(${(c.hue + 60) % 360} 35% 14%))"><div class="big" style="font-size:${Math.round(size / 3)}px;opacity:.75">${esc(c.title[0])}</div></div>`;
}
// what a card or row says under the title: at most three facts (key · style · shelf)
const ometa = c => [okey(c), c.genres[0], COL_LABEL[c.primary] + (c.lv ? ' LV' + c.lv : '')].filter(Boolean).join(' · ');
const osoon = c => c.vis === 'soon' ? `<span class="chip or">เร็ว ๆ นี้</span>` : '';
function orow(c) {
  return `<div class="trow ${c.vis === 'soon' ? 'soon' : ''}"><button class="tmain" data-act="otab" data-id="${c.id}">${ocover(c, 44)}<span class="grow"><div class="ell tt">${esc(c.title)}</div><div class="ell ts">${esc(c.artist)} · ${ometa(c)}</div></span></button>
    ${osoon(c)}${c.pro ? `<span class="chip pro">${ic('lock')} PRO</span>` : ''}${lvBadge(c.level)}
    <button class="rb ${LIB.ofav.has(c.id) ? 'fav' : ''}" data-act="ofav" data-id="${c.id}" aria-label="Favourite">${ic('heart', LIB.ofav.has(c.id))}</button>
    <button class="rb" data-act="omenu" data-id="${c.id}" aria-label="More">${ic('more', 1)}</button></div>`;
}
function ocard(c) {
  if (c.real) return songCard(SONGS[c.id]);
  return `<button class="scard ${c.vis === 'soon' ? 'soon' : ''}" data-act="otab" data-id="${c.id}"><div class="cover" style="background:linear-gradient(135deg,hsl(${c.hue} 45% 28%),hsl(${(c.hue + 60) % 360} 35% 14%))"><div class="big" style="font-size:30px;opacity:.7">${esc(c.title[0])}</div>
      <div class="tags">${osoon(c)}${c.primary === 'backing' ? `<span class="chip lime">${c.licks} LICKS</span>` : ''}${c.pro ? `<span class="chip pro">${ic('lock')} PRO</span>` : ''}</div></div>
    <div><div class="t ell">${esc(c.title)}</div><div class="a ell">${esc(c.artist)}</div></div><div class="m"><span class="ell">${ometa(c)}</span></div></button>`;
}

/* ---------- 1. Official Tabs ---------- */
// one predicate per filter group: values inside a group are OR-ed, groups are AND-ed (Q21)
const OTEST = {
  genres: (c, v) => v.some(s => (OSTYLE_MATCH[s] || [s]).some(g => c.genres.includes(g))),
  scales: (c, v) => v.some(s => c.scales.includes(s)),   // any scale the tab uses, not only the main one (Q11)
  keyT: (c, v) => v.includes(c.kt),                      // main key only (Q15)
  keyM: (c, v) => v.includes(c.km),
  play: (c, v) => v.includes(c.play),
  tuning: (c, v) => v.includes(c.tun),
  levels: (c, v) => v.includes(c.level),
  access: (c, v) => v.includes(c.pro ? 'pro' : 'free'),
  audio: (c, v) => v.includes(c.kind),
};
function omatch(c, u, skip) {
  if (u.ocol === 'starter' ? !ostarter(c) : u.ocol !== 'all' && !c.cols.includes(u.ocol)) return false;
  if (u.ocol === 'fingerstyle' && u.ofs !== 'all' && c.fs !== u.ofs) return false;
  if (u.oartist && c.artistId !== u.oartist) return false;
  const q = u.oq.trim().toLowerCase(); if (q && !c.title.toLowerCase().includes(q) && !c.artist.toLowerCase().includes(q)) return false;
  for (const g of OGROUPS) if (g !== skip && u.of[g].length && !OTEST[g](c, u.of[g])) return false;
  return true;
}
function ofiltered(u) {
  const a = CAT.filter(c => omatch(c, u));
  a.sort(u.osort === 'popular' ? (x, y) => y.pop - x.pop : u.osort === 'newest' ? (x, y) => x.added - y.added : (x, y) => x.title.localeCompare(y.title));
  return a;
}
const ofcount = u => OGROUPS.reduce((n, g) => n + u.of[g].length, 0);
/* A filter group with live counts. An option nobody can reach is hidden, and a group left with fewer than two
 * options is not drawn at all — with a small catalogue a full list would mostly lead to empty pages (Q26). */
function ofacet(u, title, group, opts) {
  const pool = CAT.filter(c => omatch(c, u, group)), sel = u.of[group];
  const rows = opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return [v, l, pool.reduce((n, c) => n + (OTEST[group](c, [v]) ? 1 : 0), 0)]; }).filter(x => x[2] || sel.includes(x[0]));
  if (rows.length < 2 && !sel.length) return '';
  return `<div class="fg"><div class="fgt">${title}</div><div class="fcs ${group === 'keyT' ? 'keys' : ''}">${rows.map(([v, l, n]) => `<button class="fc ${sel.includes(v) ? 'on' : ''}" data-act="ftog" data-scope="o" data-group="${group}" data-v="${esc(v)}">${l}<small>${nfmt(n)}</small></button>`).join('')}</div></div>`;
}
/* Quick filters that belong to one shelf, drawn right under its title: the question people ask first there.
 * Signature = who wrote it · Backing Track = what style to jam in · Fingerstyle = set + arranger · Classics = style. */
const OQUICK = { signature: ['artist'], backing: ['genres'], fingerstyle: ['artist'], classics: ['genres'] };
function oquick(u) {
  return (OQUICK[u.ocol] || []).map(kind => {
    let rows, title;
    if (kind === 'artist') {
      const m = new Map(); title = 'ศิลปิน';
      for (const c of CAT) if (omatch(c, { ...u, oartist: '' })) { const x = m.get(c.artistId) || [c.artistId, c.artist, 0]; x[2]++; m.set(c.artistId, x); }
      rows = [...m.values()].sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1])).map(([v, l, n]) => [v, l, n, u.oartist === v, `data-act="oartq" data-v="${esc(v)}"`]);
    } else {
      const pool = CAT.filter(c => omatch(c, u, 'genres')), sel = u.of.genres; title = 'Style';
      rows = OSTYLES.map(v => [v, v, pool.reduce((n, c) => n + (OTEST.genres(c, [v]) ? 1 : 0), 0), sel.includes(v), `data-act="ftog" data-scope="o" data-group="genres" data-v="${esc(v)}"`]).filter(x => x[2] || x[3]);
    }
    if (rows.length < 2 && !rows.some(x => x[3])) return '';
    return `<div class="qf"><span>${title}</span><div class="qfs">${rows.map(([, l, n, on, attr]) => `<button class="fc ${on ? 'on' : ''}" ${attr}>${esc(l)}<small>${nfmt(n)}</small></button>`).join('')}</div></div>`;
  }).join('');
}
const OVAL_LABEL = v => COL_LABEL[v] || AUDIO_LABEL[v] || ({ free: 'Free', pro: 'PRO', lead: 'Lead', rhythm: 'Rhythm', standard: 'สายมาตรฐาน', special: 'จูนพิเศษ', major: 'Major', minor: 'Minor' })[v] || v;
// shelf order follows the user's level (Q19): beginners meet the easy shelves first
const oshelfOrder = () => LIB.level && LIB.level !== 'Beginner' ? ['signature', 'backing', 'fingerstyle', 'classics'] : ['starter', 'classics', 'fingerstyle', 'signature', 'backing'];
const oshelfList = col => CAT.filter(c => col === 'starter' ? ostarter(c) : c.cols.includes(col)).sort((a, b) => b.pop - a.pop);

function officialHTML(sf) {
  const u = LU[sf], web = sf === 'web', nf = ofcount(u), browsing = u.oq.trim() || u.ocol !== 'all' || nf || u.oall || u.oartist;
  let h = `<div class="row" style="gap:8px">${searchBox('oq', u.oq, 'ค้นหาชื่อเพลงหรือศิลปิน ใน ' + nfmt(CAT.length) + ' tabs')}
      <button class="ib ${u.opanel || nf ? 'on' : ''}" data-act="opanel" aria-label="Filter" title="Filter">${ic('filter')}${nf ? `<b class="nb">${nf}</b>` : ''}</button></div>
    <div class="secs" style="margin:10px 0 2px"><button class="sec ${u.ocol === 'all' ? 'sel' : ''}" data-act="ocol" data-v="all">ทั้งหมด</button>${COLS.map(s => `<button class="sec ${u.ocol === s[0] ? 'sel' : ''}" data-act="ocol" data-v="${s[0]}">${s[1]}</button>`).join('')}</div>`;
  if (u.opanel) h += `<div class="fpanel">${ofacet(u, 'Style', 'genres', OSTYLES)}${ofacet(u, 'Scale', 'scales', OSCALES)}${ofacet(u, 'Key', 'keyT', TONICS)}${ofacet(u, 'Major / Minor', 'keyM', OMODE)}
      ${ofacet(u, 'วิธีเล่น', 'play', OPLAY)}${ofacet(u, 'Tuning', 'tuning', OTUNE)}${ofacet(u, 'Level', 'levels', LEVELS)}${ofacet(u, 'สิทธิ์การเล่น', 'access', [['free', 'Free'], ['pro', 'PRO']])}${ofacet(u, 'เสียงประกอบ', 'audio', AUDIO)}
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn sm ghost" data-act="oclear">ล้างตัวกรอง</button><button class="btn sm pri" data-act="opanel">ดูผลลัพธ์</button></div></div>`;
  if (!browsing) {
    const last = SONGS[S.last];
    const shelf = (title, sub, list, act, all) => !list.length ? '' : `<div class="h2"><h3>${title}${sub ? `<small>${sub}</small>` : ''}</h3>${act || ''}</div><div class="${web ? 'w-grid' : 'hscroll'}">${(all ? list : list.slice(0, web ? 5 : 6)).map(ocard).join('')}</div>`;
    h += `<div class="lvpick"><span>${LIB.level ? 'ระดับของฉัน' : 'เลือกระดับของคุณ'}</span>${LEVELS.map(l => `<button class="${(LIB.level || '') === l ? 'on' : ''}" data-act="olevel" data-v="${l}">${l}</button>`).join('')}</div>
      <button class="cont" data-act="open" data-id="${last.id}">${coverHTML(last, '', false)}
        <div class="grow"><div class="muted" style="font-size:11px">เล่นต่อ</div><div class="ell" style="font-weight:650">${esc(last.title)}</div><div class="muted ell" style="font-size:12px">${esc(last.artist)}</div></div>
        <span class="playb" style="width:40px;height:40px;font-size:16px">${ic('play', 1)}</span></button>`
      + gameShelf(sf)
      + shelf('แนะนำ', 'เล่นได้จริงใน prototype · ' + CAT.filter(c => c.real).length + ' เพลง', CAT.filter(c => c.real), '', true)
      + oshelfOrder().map(col => { const s = col === 'starter' ? STARTER : COLS.find(x => x[0] === col), list = oshelfList(col);
        return shelf(s[1], s[2], list, `<button class="lnk" data-act="ocol" data-v="${col}">ดูทั้งหมด ${nfmt(list.length)} ${ic('chev')}</button>`); }).join('')
      + `<button class="btn" style="width:100%;margin-top:16px" data-act="oallsort" data-v="popular">ดู Official Tabs ทั้งหมด ${nfmt(CAT.length)} tabs</button>`;
  } else {
    const res = ofiltered(u), sl = { popular: 'ยอดนิยม', newest: 'ใหม่ล่าสุด', az: 'A–Z' };
    const qk = OQUICK[u.ocol] || [];   // what the shelf's own quick bar already shows is not repeated as a chip below
    const act = [].concat(...OGROUPS.filter(g => !qk.includes(g)).map(g => u.of[g].map(v => [g, v, OVAL_LABEL(v)])));
    const cur = u.ocol === 'starter' ? STARTER : COLS.find(x => x[0] === u.ocol), artist = !qk.includes('artist') && u.oartist && (CAT.find(c => c.artistId === u.oartist) || {}).artist;
    if (cur) h += `<p class="muted" style="margin:10px 0 0;font-size:12.5px"><b style="color:var(--text)">${cur[1]}</b> · ${cur[2]}</p>`;
    if (u.ocol === 'fingerstyle') h += `<div class="seg" style="margin-top:8px;max-width:420px">${[['all', 'ทั้งหมด'], ['graded', 'ชุดฝึก LV1–LV3'], ['arr', 'เพลงเรียบเรียง']].map(([v, l]) => `<button class="${u.ofs === v ? 'on' : ''}" data-act="ofs" data-v="${v}">${l}</button>`).join('')}</div>`;
    h += oquick(u);
    h += `<div class="row" style="margin:12px 0 6px;gap:8px"><b class="grow">${nfmt(res.length)} tabs</b><button class="lnk" data-act="oclear">ล้างทั้งหมด</button>
        <button class="btn sm" data-act="osort" title="Sort">${ic('sort')} ${sl[u.osort]}</button></div>
      ${act.length || artist ? `<div class="fcs" style="margin-bottom:8px">${artist ? `<button class="fc on" data-act="oartist" data-v="">ศิลปิน: ${esc(artist)} ${ic('x')}</button>` : ''}${act.map(([g, v, l]) => `<button class="fc on" data-act="ftog" data-scope="o" data-group="${g}" data-v="${esc(v)}">${l} ${ic('x')}</button>`).join('')}</div>` : ''}
      <div class="${web ? 'rgrid' : ''}">${res.slice(0, u.olim).map(orow).join('')}</div>
      ${!res.length ? `<p class="muted" style="text-align:center;margin:30px 0">ไม่พบ tab ที่ตรงเงื่อนไข — ลองลดตัวกรอง</p>` : ''}
      ${res.length > u.olim ? `<button class="btn" style="width:100%;margin-top:12px" data-act="omore">แสดงเพิ่ม (เหลืออีก ${nfmt(res.length - u.olim)})</button>` : ''}`;
  }
  return h;
}
/* Scale / tuning line for a detail page. A scale is a link to its practice page in the app (Q12). */
function odetailExtra(id) {
  const c = CAT_BY[id]; if (!c) return '';
  const sc = c.scales.map((s, i) => `<button class="fc ${i ? '' : 'on'}" data-act="oscale" data-v="${esc((c.kt ? c.kt + ' ' : '') + s)}" title="ไปซ้อมสเกลนี้ในแอป">${c.kt ? c.kt + ' ' : ''}${s}</button>`).join('');
  const tun = c.tun === 'special' ? `<span class="chip or">${esc(c.tunName)}</span>` : c.capo ? `<span class="chip or">Capo ${c.capo}</span>` : `<span class="chip">สายมาตรฐาน</span>`;
  return `<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:10px"><span class="chip lime">${COL_LABEL[c.primary]}</span>${c.genres.map(g => `<span class="chip">${g}</span>`).join('')}${tun}</div>
    ${sc ? `<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px"><span class="muted" style="font-size:11.5px">สเกลในเพลง · กดเพื่อไปซ้อม</span>${sc}</div>` : ''}`;
}

/* ---------- 2. My Library (folders) ---------- */
const lfcount = u => u.lf.genres.length + u.lf.levels.length;
function lfiltered(u, pool) {
  const q = u.lq.trim().toLowerCase();
  let a = pool.filter(t => (!q || t.name.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
    && (u.lchip === 'All' || (u.lchip === 'Uploaded' ? !t.official : t.favourite))
    && (!u.lf.genres.length || u.lf.genres.some(g => t.genres.includes(g))) && (!u.lf.levels.length || u.lf.levels.includes(t.difficulty)));
  const k = u.lsort; a.sort((x, y) => k === 'newest' ? y.createdAt - x.createdAt : k === 'oldest' ? x.createdAt - y.createdAt : (y.lastPlayedAt || 0) - (x.lastPlayedAt || 0));
  return a;
}
function lcover(t, size) {
  if (t.official) return ocover(CAT_BY[t.official], size);
  return `<span class="gpic" style="width:${size}px;height:${size}px">GP</span>`;
}
function lrow(t, showFolder) {
  const f = showFolder && t.folderId ? LIB.folders.find(x => x.id === t.folderId) : null;
  return `<div class="trow"><button class="tmain" data-act="ltab" data-id="${t.id}">${lcover(t, 44)}<span class="grow"><div class="ell tt">${esc(t.name)}</div>
      <div class="ell ts">${esc(t.artist)} · ${ago(t.lastPlayedAt)}${t.dur ? ` · ${mmss(t.prog)} / ${mmss(t.dur)}` : ''}</div></span></button>
    ${f ? `<span class="chip">${ic('folder')} ${esc(f.name)}</span>` : ''}${t.official ? `<span class="chip lime">OFFICIAL</span>` : ''}${lvBadge(t.difficulty)}
    <button class="rb ${t.favourite ? 'fav' : ''}" data-act="lfav" data-id="${t.id}" aria-label="${t.favourite ? 'Remove from favourites' : 'Add to favourites'}">${ic('heart', t.favourite)}</button>
    <button class="rb" data-act="lmenu" data-id="${t.id}" aria-label="More">${ic('more', 1)}</button></div>`;
}
function lcard(t) {
  return `<div class="scard" style="position:relative"><button data-act="ltab" data-id="${t.id}" style="text-align:left;display:flex;flex-direction:column;gap:8px">
    <div class="cover" style="height:96px;background:#232323;align-items:center;justify-content:center">${lcover(t, 56)}</div>
    <div><div class="t ell">${esc(t.name)}</div><div class="a ell">${esc(t.artist)}</div></div></button>
    <div class="row" style="gap:4px">${lvBadge(t.difficulty)}<span class="grow"></span><button class="rb ${t.favourite ? 'fav' : ''}" data-act="lfav" data-id="${t.id}">${ic('heart', t.favourite)}</button><button class="rb" data-act="lmenu" data-id="${t.id}">${ic('more', 1)}</button></div></div>`;
}
function libraryHTML(sf) {
  const u = LU[sf], web = sf === 'web', nf = lfcount(u), sl = { newest: 'Newest', oldest: 'Oldest', lastPlayed: 'Last played' };
  const folder = u.folder && LIB.folders.find(f => f.id === u.folder);
  const flat = !!(u.lq.trim() || u.lchip !== 'All' || nf);
  const list = arr => !arr.length ? `<p class="muted" style="margin:18px 0;text-align:center">ยังไม่มี tab ตรงนี้</p>` : u.grid && web ? `<div class="w-grid">${arr.map(lcard).join('')}</div>` : `<div class="${web ? 'rgrid' : ''}">${arr.map(t => lrow(t, flat && !folder)).join('')}</div>`;
  let h = folder
    ? `<div class="row" style="gap:8px;margin-bottom:10px"><button class="ib" data-act="fback" aria-label="Back to My Library">${ic('back')}</button><span style="font-size:22px;color:var(--limeText)">${ic('folder', 1)}</span>
        <h3 class="grow ell" style="margin:0;font-size:18px">${esc(folder.name)}</h3><button class="rb" data-act="frename" data-id="${folder.id}" aria-label="Rename folder">${ic('edit')}</button><button class="rb dn" data-act="fdel" data-id="${folder.id}" aria-label="Delete folder">${ic('trash')}</button></div>`
    : (web ? `<h2 style="text-align:center;font-size:26px;margin:10px 0 14px">My Library</h2>` : '');
  h += `<div style="${web ? 'max-width:760px;margin:0 auto' : ''}">${searchBox('lq', u.lq, 'Search by Name or Artist')}
      <div class="row" style="margin:10px 0 4px;gap:6px"><div class="secs grow">${['All', 'Uploaded', 'Favourite'].map(c => `<button class="sec ${u.lchip === c ? 'sel' : ''}" data-act="lchip" data-v="${c}">${c}</button>`).join('')}</div>
        ${web ? `<button class="ib ${u.grid ? '' : 'on'}" data-act="lgrid" data-v="0" title="List view">${ic('list')}</button><button class="ib ${u.grid ? 'on' : ''}" data-act="lgrid" data-v="1" title="Grid view">${ic('grid')}</button>` : ''}
        <button class="ib" data-act="lsort" title="${sl[u.lsort]}">${ic('sort')}</button>
        <button class="ib ${u.lpanel || nf ? 'on' : ''}" data-act="lpanel" title="Filter">${ic('filter')}${nf ? `<b class="nb">${nf}</b>` : ''}</button></div>
      <div class="muted" style="font-size:11px;text-align:right">เรียง: ${sl[u.lsort]}</div></div>`;
  if (u.lpanel) h += `<div class="fpanel">${fgroup('Genres', 'l', 'genres', GENRES_POP.concat(GENRES_MORE), u.lf.genres)}${fgroup('Level', 'l', 'levels', LEVELS, u.lf.levels)}
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn sm ghost" data-act="lclear">ล้างตัวกรอง</button><button class="btn sm pri" data-act="lpanel">ดูผลลัพธ์</button></div></div>`;
  if (folder) {
    const arr = lfiltered(u, LIB.tabs.filter(t => t.folderId === folder.id));
    h += `<div class="h2"><h3>${arr.length} Item${arr.length === 1 ? '' : 's'}</h3><button class="btn sm pri" data-act="upload">${ic('up')} Upload Tabs</button></div>` + list(arr);
  } else if (flat) {
    const arr = lfiltered(u, LIB.tabs);
    h += `<div class="h2"><h3>${arr.length} ผลลัพธ์</h3><button class="lnk" data-act="lclear">ล้างทั้งหมด</button></div>` + list(arr);
  } else {
    h += `<div class="h2"><h3>My Folder</h3><button class="btn sm pri" data-act="fnew">${ic('plus')} New Folder</button></div>
      <div class="${web ? 'fgrid' : ''}">${LIB.folders.map(f => { const n = LIB.tabs.filter(t => t.folderId === f.id).length; return `<div class="frow"><button class="tmain" data-act="fopen" data-id="${f.id}"><span class="fic">${ic('folder', 1)}</span><span class="grow"><div class="ell tt">${esc(f.name)}</div><div class="ts">${n} Item${n === 1 ? '' : 's'}</div></span></button>
        <button class="rb" data-act="frename" data-id="${f.id}" aria-label="Rename ${esc(f.name)}">${ic('edit')}</button><button class="rb dn" data-act="fdel" data-id="${f.id}" aria-label="Delete ${esc(f.name)}">${ic('trash')}</button></div>`; }).join('') || `<p class="muted">ยังไม่มีโฟลเดอร์</p>`}</div>
      <div class="h2"><h3>My List</h3><button class="btn sm pri" data-act="upload">${ic('up')} Upload Tabs</button></div>` + list(lfiltered(u, LIB.tabs.filter(t => !t.folderId)));
  }
  return h + `<p class="muted" style="font-size:11.5px;margin:14px 0 0;text-align:center">บัญชีเดียวกัน — โฟลเดอร์ รายการ และ Favourite ตรงกันระหว่าง Litejam App กับ glowtab.litejam.com</p>`;
}
function libHome(sf) { return LU[sf].page === 'official' ? officialHTML(sf) : libraryHTML(sf); }

/* ---------- dialogs: action menu, folder name, confirm ---------- */
function libOverlay(sf) {
  const u = LU[sf], d = u.dlg; if (!d) return '';
  const item = (act, icn, label, extra = '', cls = '') => `<button class="mi ${cls}" data-act="${act}" ${extra}>${ic(icn)}<span class="grow">${label}</span></button>`;
  const folders = cur => LIB.folders.map(f => `<button class="mi sub" data-act="dmove" data-folder="${f.id}">${ic('folder')}<span class="grow ell">${esc(f.name)}</span>${cur === f.id ? ic('check') : ''}</button>`).join('') + item('dnewfolder', 'plus', 'New Folder…', '', 'sub');
  let body = '';
  if (d.type === 'lmenu') {
    const t = LIB.tabs.find(x => x.id === d.id);
    body = `<div class="dt ell">${esc(t.name)}</div><div class="dg">Move to folder</div>${folders(t.folderId)}
      ${t.folderId ? item('dunfile', 'x', 'Remove from folder (กลับไป My List)') : ''}${t.official ? '' : item('dedit', 'edit', 'Edit Tab information') + item('ddl', 'dl', 'Download')}
      ${item('ddelete', 'trash', t.official ? 'Remove from My Library' : 'Delete', '', 'dn')}`;
  } else if (d.type === 'omenu') {
    const c = CAT_BY[d.id], saved = LIB.tabs.find(t => t.official === d.id);
    body = `<div class="dt ell">${esc(c.title)}</div>${item('dofav', 'heart', LIB.ofav.has(c.id) ? 'Remove from favourites' : 'Add to favourites')}${item('oartist', 'search', 'ดูเพลงทั้งหมดของ ' + esc(c.artist), `data-v="${c.artistId}"`)}
      <div class="dg">${saved ? 'Move to folder' : 'Save to My Library › folder'}</div>${folders(saved && saved.folderId)}${saved ? '' : item('dmove', 'list', 'Save to My List (ไม่ใส่โฟลเดอร์)', 'data-folder=""', 'sub')}`;
  } else if (d.type === 'bt') { // a Jam Track has no full-song tab: the user picks how to use it (Q3)
    const c = CAT_BY[d.id], lk = ['Beginner', 'Beginner', 'Intermediate', 'Intermediate'];
    body = `<div class="row" style="gap:12px;align-items:flex-start">${ocover(c, 72)}<div class="grow"><div class="dt" style="margin:0">${esc(c.title)}</div>
        <div class="muted" style="font-size:12.5px">${esc(c.artist)} · ${c.bpm} BPM · ${okey(c)} · ${c.genres.join(' / ')}</div>
        <div class="row" style="gap:5px;margin-top:6px;flex-wrap:wrap"><span class="chip lime">Backing Track</span>${c.pro ? `<span class="chip pro">${ic('lock')} PRO</span>` : `<span class="chip">Free</span>`}</div></div>
        <button class="ib" data-act="dclose" aria-label="Close">${ic('x')}</button></div>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:12px"><span class="muted" style="font-size:11.5px">สเกลที่ใช้ด้น · กดเพื่อไปซ้อม</span>${c.scales.map((s, i) => `<button class="fc ${i ? '' : 'on'}" data-act="oscale" data-v="${esc(c.kt + ' ' + s)}">${c.kt} ${s}</button>`).join('')}</div>
      <div class="acts" style="grid-template-columns:1fr 1fr"><button class="btn pri" data-act="btlick" data-v="1">${ic('chord')}ฝึก Lick<small>มี tab · เปิดใน GlowTab</small></button>
        <button class="btn" data-act="btjam" data-id="${c.id}">${ic('guitar')}ด้นสด<small>ไม่มี tab · Play With Track</small></button></div>
      <div class="dg">Lick สำหรับฝึก ${c.licks} ชุด</div>${Array.from({ length: c.licks }, (_, i) => `<button class="mi sub" data-act="btlick" data-v="${i + 1}">${ic('chord')}<span class="grow">Lick ${i + 1} · 2 bars</span>${lvBadge(lk[i])}</button>`).join('')}`;
  } else if (d.type === 'soon') {
    const c = CAT_BY[d.id];
    body = `<div class="row" style="gap:12px;align-items:flex-start">${ocover(c, 72)}<div class="grow"><div class="dt" style="margin:0">${esc(c.title)}</div>
        <div class="muted" style="font-size:12.5px">${esc(c.artist)} · ${c.bpm} BPM · ${okey(c)}</div><div class="row" style="gap:5px;margin-top:6px"><span class="chip lime">${COL_LABEL[c.primary]}</span><span class="chip or">เร็ว ๆ นี้</span></div></div></div>
      <p class="muted" style="margin:12px 0;font-size:12.5px">เพลงนี้กำลังเตรียมอยู่ ยังเปิดเล่นไม่ได้</p>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn sm ghost" data-act="dclose">ปิด</button><button class="btn sm pri" data-act="onotify">แจ้งเตือนเมื่อพร้อม</button></div>`;
  } else if (d.type === 'folder') {
    body = `<div class="dt">${d.id ? 'Rename folder' : 'New Folder'}</div><label class="muted" style="font-size:12px">Name</label>
      <label class="srch" style="margin:4px 0 14px"><input data-inp="fname" value="${esc(d.name)}" placeholder="Folder" maxlength="40" autocomplete="off"></label>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn sm ghost" data-act="dclose">Cancel</button><button class="btn sm pri" data-act="fsave">${d.id ? 'Save' : 'Create'}</button></div>`;
  } else if (d.type === 'confirm') {
    body = `<div class="dt">${d.title}</div><p style="margin:0 0 14px;color:var(--soft)">${d.text}</p>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn sm ghost" data-act="dclose">Cancel</button><button class="btn sm" style="background:var(--redBg);border-color:var(--red);color:var(--red)" data-act="dconfirm">${d.ok}</button></div>`;
  }
  return sf === 'app' ? `<div class="sheet-bg" data-act="dclose"><div class="sheet dlg" data-stop><div class="grab"></div>${body}</div></div>`
    : `<div class="modal-bg" data-act="dclose"><div class="modal dlg" style="width:${d.type === 'bt' ? 460 : 400}px" data-stop>${body}</div></div>`;
}

/* ---------- actions (return true when handled) ---------- */
function saveOfficial(id, folderId) {
  let t = LIB.tabs.find(x => x.official === id);
  if (!t) { const c = CAT_BY[id]; t = { id: 't' + (++LIB.seq), name: c.title, artist: c.artist, genres: c.genres.slice(), difficulty: c.level, createdAt: Date.now(), folderId: null, favourite: LIB.ofav.has(id), dur: 0, prog: 0, official: id }; LIB.tabs.push(t); }
  t.folderId = folderId || null; return t;
}
function libAction(a, d, sf) {
  const u = LU[sf], tog = (arr, v) => { const i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1); };
  const fname = id => { const f = LIB.folders.find(x => x.id === id); return f ? f.name : 'My List'; };
  switch (a) {
    case 'page': u.page = d.v; u.dlg = null; if (sf === 'web') S.web.screen = 'home'; return true;
    case 'ocol': u.ocol = d.v; u.ofs = 'all'; u.oartist = ''; u.olim = 30; return true;
    case 'oartq': u.oartist = u.oartist === d.v ? '' : d.v; u.olim = 30; return true;
    case 'ofs': u.ofs = d.v; u.olim = 30; return true;
    case 'olevel': LIB.level = d.v; return true;
    case 'oartist': u.oartist = d.v; u.dlg = null; u.olim = 30; return true;
    case 'oscale': toast(`ไปที่ Scale › <b>${esc(d.v)}</b> ในแอป พร้อมไฟบนคอ<br><code>litejam://scale/${esc(d.v.toLowerCase().replace(/[^a-z0-9#]+/g, '-'))}</code>`); return true;
    case 'btlick': toast(`เปิดใน GlowTab — tab ของ Lick ${esc(d.v)} พร้อมวงประกอบวนให้ฝึก`); return true;
    case 'btjam': u.dlg = null; toast(`ไป Play With Track › Scale Mode เพื่อด้นสด (ไม่มี tab)<br><code>litejam://playwithtrack/${esc(d.id)}</code>`); return true;
    case 'onotify': u.dlg = null; toast('จะแจ้งเตือนเมื่อเพลงนี้พร้อมเล่น'); return true;
    case 'oallsort': u.oall = true; u.osort = d.v; u.olim = 30; return true;
    case 'osort': u.osort = { popular: 'newest', newest: 'az', az: 'popular' }[u.osort]; return true;
    case 'omore': u.olim += 30; return true;
    case 'opanel': u.opanel = !u.opanel; return true;
    case 'oclear': u.of = emptyOf(); u.oq = ''; u.ocol = 'all'; u.ofs = 'all'; u.oartist = ''; u.oall = false; u.opanel = false; u.olim = 30; return true;
    case 'ftog': tog((d.scope === 'o' ? u.of : u.lf)[d.group], d.v); u.olim = 30; return true;
    case 'clearq': u[d.inpId] = ''; return true;
    case 'otab': { const c = CAT_BY[d.id]; if (c.real) { if (sf === 'app') S.app.sheet = c.id; else S.web.modal = c.id; } else if (c.vis === 'soon') u.dlg = { type: 'soon', id: c.id }; else if (c.primary === 'backing') u.dlg = { type: 'bt', id: c.id }; else toast(`<b>${esc(c.title)}</b> เป็นรายการตัวอย่างเพื่อทดสอบการจัดหมวด — เปิดเล่นได้เฉพาะเพลงในแถว “แนะนำ”`); return true; }
    case 'ofav': { const on = !LIB.ofav.has(d.id); on ? LIB.ofav.add(d.id) : LIB.ofav.delete(d.id); const t = LIB.tabs.find(x => x.official === d.id); if (t) t.favourite = on; else if (on) saveOfficial(d.id, null).favourite = true; toast(on ? 'เพิ่มใน Favourite แล้ว — ดูได้ที่ My Library › Favourite' : 'เอาออกจาก Favourite แล้ว'); return true; }
    case 'omenu': u.dlg = { type: 'omenu', id: d.id }; return true;
    case 'lchip': u.lchip = d.v; return true;
    case 'lsort': u.lsort = { newest: 'oldest', oldest: 'lastPlayed', lastPlayed: 'newest' }[u.lsort]; return true;
    case 'lgrid': u.grid = d.v === '1'; return true;
    case 'lpanel': u.lpanel = !u.lpanel; return true;
    case 'lclear': u.lf = { genres: [], levels: [] }; u.lq = ''; u.lchip = 'All'; u.lpanel = false; return true;
    case 'fopen': u.folder = d.id; return true;
    case 'fback': u.folder = null; return true;
    case 'fnew': u.dlg = { type: 'folder', id: null, name: '' }; return true;
    case 'frename': u.dlg = { type: 'folder', id: d.id, name: fname(d.id) }; return true;
    case 'fdel': { const n = LIB.tabs.filter(t => t.folderId === d.id).length; u.dlg = { type: 'confirm', what: 'folder', id: d.id, title: `Delete “${esc(fname(d.id))}”?`, text: n ? `tab ${n} รายการในโฟลเดอร์นี้จะไม่ถูกลบ แต่จะย้ายกลับไปที่ My List` : 'โฟลเดอร์นี้ว่างอยู่', ok: 'Delete folder' }; return true; }
    case 'fsave': {
      const name = (u.dlg.name || '').trim(); if (!name) { toast('ใส่ชื่อโฟลเดอร์ก่อน'); return true; }
      if (u.dlg.id) LIB.folders.find(f => f.id === u.dlg.id).name = name;
      else { const f = { id: 'f' + (++LIB.seq), name, createdAt: Date.now() }; LIB.folders.unshift(f); if (u.dlg.then) { const p = u.dlg.then; (p.cat ? saveOfficial(p.cat, f.id) : LIB.tabs.find(t => t.id === p.tab)).folderId = f.id; toast(`ย้ายไปที่ “${esc(name)}” แล้ว`); } }
      u.dlg = null; return true;
    }
    case 'lfav': { const t = LIB.tabs.find(x => x.id === d.id); t.favourite = !t.favourite; if (t.official) t.favourite ? LIB.ofav.add(t.official) : LIB.ofav.delete(t.official); return true; }
    case 'lmenu': u.dlg = { type: 'lmenu', id: d.id }; return true;
    case 'ltab': { const t = LIB.tabs.find(x => x.id === d.id); if (t.official && CAT_BY[t.official].real) { if (sf === 'app') S.app.sheet = t.official; else S.web.modal = t.official; } else toast('tab ที่อัปโหลดเองเปิดด้วยเครื่องเล่นเดียวกัน แบบ Tab only (เสียงสังเคราะห์จาก tab)'); return true; }
    case 'dclose': u.dlg = null; return true;
    case 'dmove': {
      const dl = u.dlg, t = dl.type === 'omenu' ? saveOfficial(dl.id, d.folder) : LIB.tabs.find(x => x.id === dl.id);
      t.folderId = d.folder || null; u.dlg = null; toast(`${dl.type === 'omenu' ? 'บันทึก' : 'ย้าย'}ไปที่ “${esc(fname(d.folder))}” แล้ว`); return true;
    }
    case 'dnewfolder': u.dlg = { type: 'folder', id: null, name: '', then: u.dlg.type === 'omenu' ? { cat: u.dlg.id } : { tab: u.dlg.id } }; return true;
    case 'dunfile': LIB.tabs.find(x => x.id === u.dlg.id).folderId = null; u.dlg = null; toast('ย้ายกลับไป My List แล้ว'); return true;
    case 'dedit': u.dlg = null; toast('Edit Tab information — ใช้ฟอร์มเดิมของเว็บ (Album cover · Name · Artist · Genre · Difficulty)'); return true;
    case 'ddl': u.dlg = null; toast('Download — ดาวน์โหลดไฟล์ tab ต้นฉบับ'); return true;
    case 'ddelete': { const t = LIB.tabs.find(x => x.id === u.dlg.id); u.dlg = { type: 'confirm', what: 'tab', id: t.id, title: t.official ? 'Remove from My Library?' : `Delete “${esc(t.name)}”?`, text: t.official ? 'tab นี้ยังอยู่ใน Official Tabs เปิดเล่นได้ตามเดิม' : 'ไฟล์ tab จะถูกลบออกจากทั้ง App และ Web', ok: t.official ? 'Remove' : 'Delete' }; return true; }
    case 'dofav': { const id = u.dlg.id; u.dlg = null; return libAction('ofav', { id }, sf); }
    case 'dconfirm': {
      const c = u.dlg;
      if (c.what === 'folder') { LIB.tabs.forEach(t => { if (t.folderId === c.id) t.folderId = null; }); LIB.folders = LIB.folders.filter(f => f.id !== c.id); for (const k of ['app', 'web']) if (LU[k].folder === c.id) LU[k].folder = null; toast('ลบโฟลเดอร์แล้ว'); }
      else { const t = LIB.tabs.find(x => x.id === c.id); if (t.official) LIB.ofav.delete(t.official); LIB.tabs = LIB.tabs.filter(x => x.id !== c.id); toast('ลบแล้ว'); }
      u.dlg = null; return true;
    }
  }
  return false;
}
function libInput(inp, val, sf) { const u = LU[sf]; if (inp === 'fname') u.dlg.name = val; else { u[inp] = val; u.olim = 30; } }
