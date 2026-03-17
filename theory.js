// theory.js — Music theory engine.
// Pure data + functions; no DOM, no storage, no side-effects.
// Swift equivalent: a stateless utility namespace

const Theory = {

  _SHARP_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  _FLAT_NAMES:  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],

  // Keys that conventionally use flat accidentals
  _USES_FLATS: new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']),

  // Map any enharmonic spelling to a 0–11 pitch class
  _NOTE_PITCH: {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  },

  // Scale intervals in semitones from root (all modes supported by the app)
  _SCALE_INTERVALS: {
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  },

  // Triad quality suffix for each scale degree (I ii iii IV V vi vii)
  _TRIAD_QUALITIES: {
    major:      ['',  'm', 'm', '',  '',  'm', 'dim'],
    minor:      ['m', 'dim', '', 'm', 'm', '',  ''  ],
    dorian:     ['m', 'm',  '',  '',  'm', 'dim', '' ],
    mixolydian: ['',  'm',  'dim', '', 'm', 'm',  '' ],
  },

  // Borrowed / chromatic chords beyond the diatonic set.
  // Each entry: { i: semitones from root, q: quality suffix string }
  // Entries already matching a diatonic chord are filtered out at runtime.
  _BORROWED: {
    major: [
      { i: 10, q: ''    },  // ♭VII  (e.g. Bb in C major — Mixolydian borrow)
      { i: 8,  q: ''    },  // ♭VI   (e.g. Ab in C major — minor borrow)
      { i: 5,  q: 'm'   },  // iv    (e.g. Fm in C major — minor subdominant)
      { i: 7,  q: '7'   },  // V7    (e.g. G7 — dominant 7th)
      { i: 0,  q: '7'   },  // I7    (e.g. C7 — tonic dominant, → IV)
      { i: 2,  q: ''    },  // II    (e.g. D  — secondary dominant setup)
    ],
    minor: [
      { i: 7,  q: ''    },  // V     (e.g. G  in Cm — harmonic minor major V)
      { i: 7,  q: '7'   },  // V7    (e.g. G7 in Cm)
      { i: 2,  q: ''    },  // II    (e.g. D  in Cm — common chromatic chord)
      { i: 10, q: 'maj7'},  // ♭VIImaj7 (e.g. Bbmaj7 in Cm)
      { i: 3,  q: 'maj7'},  // ♭IIImaj7 (e.g. Ebmaj7 in Cm)
      { i: 0,  q: 'm7'  },  // im7   (e.g. Cm7)
    ],
    dorian: [
      { i: 10, q: ''    },  // ♭VII  (e.g. C  in Dm Dorian)
      { i: 7,  q: ''    },  // V     (e.g. A  in Dm Dorian — raised V)
      { i: 7,  q: '7'   },  // V7    (e.g. A7 in Dm Dorian)
      { i: 0,  q: 'm7'  },  // im7   (e.g. Dm7)
      { i: 5,  q: '7'   },  // IV7   (e.g. G7 in Dm Dorian)
      { i: 3,  q: ''    },  // ♭III  (e.g. F  in Dm Dorian)
    ],
    mixolydian: [
      { i: 5,  q: 'm'   },  // iv    (e.g. Cm in G Mixolydian)
      { i: 8,  q: ''    },  // ♭VI   (e.g. Eb in G Mixolydian)
      { i: 3,  q: ''    },  // ♭III  (e.g. Bb in G Mixolydian)
      { i: 0,  q: '7'   },  // I7    (e.g. G7)
      { i: 2,  q: 'm'   },  // IIm   (e.g. Am in G Mixolydian)
      { i: 9,  q: ''    },  // VI    (e.g. E  in G Mixolydian)
    ],
  },

  // ── Internal helpers ────────────────────────────────────────────────────

  _noteName(pitch, useFlats) {
    return useFlats
      ? this._FLAT_NAMES[((pitch % 12) + 12) % 12]
      : this._SHARP_NAMES[((pitch % 12) + 12) % 12];
  },

  _chordName(rootPitch, intervalSemitones, qualitySuffix, useFlats) {
    const note = this._noteName((rootPitch + intervalSemitones) % 12, useFlats);
    return note + qualitySuffix;
  },

  // ── Public API ──────────────────────────────────────────────────────────

  // Returns the 7 diatonic triad names for the given key + mode.
  // e.g. getDiatonicChords('C', 'major') → ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']
  getDiatonicChords(key, mode) {
    const root     = this._NOTE_PITCH[key] ?? 0;
    const useFlats = this._USES_FLATS.has(key);
    const intervals  = this._SCALE_INTERVALS[mode]  || this._SCALE_INTERVALS.major;
    const qualities  = this._TRIAD_QUALITIES[mode]  || this._TRIAD_QUALITIES.major;
    return intervals.map((semitones, i) =>
      this._chordName(root, semitones, qualities[i], useFlats)
    );
  },

  // Returns { diatonic: string[7], borrowed: string[~6] }.
  // borrowed filters out any name already in the diatonic set (avoids duplicates).
  // Borrowed chords always use flat accidentals — they come from the "flat side"
  // (parallel minor, Mixolydian, etc.) so Bb/Ab/Eb are always correct over A#/G#/D#.
  getPalette(key, mode) {
    const root      = this._NOTE_PITCH[key] ?? 0;
    const diatonic  = this.getDiatonicChords(key, mode);
    const diaSet    = new Set(diatonic);
    const borrowed  = (this._BORROWED[mode] || this._BORROWED.major)
      .map(({ i, q }) => this._chordName(root, i, q, true)) // always flat for borrowed
      .filter((name) => !diaSet.has(name));
    // Remove internal dupes (can happen with borrowed list)
    const seen = new Set();
    return {
      diatonic,
      borrowed: borrowed.filter((n) => seen.has(n) ? false : (seen.add(n), true)),
    };
  },

  // Parses the root note letter (+ accidental) from a chord name.
  // e.g. getRoot('Amaj7') → 'A', getRoot('Bb') → 'Bb', getRoot('F#m7b5') → 'F#'
  getRoot(name) {
    const m = (name || '').match(/^([A-G][b#]?)/);
    return m ? m[1] : '';
  },

  // Returns true if chordName is a member of the diatonic set for key + mode.
  isChordInKey(name, key, mode) {
    return this.getDiatonicChords(key, mode).includes(name);
  },

  // ── Phase 5: Roman numeral helpers ──────────────────────────────────────

  // Roman numerals for each scale degree, per mode.
  // Index 0 = I (tonic), index 6 = VII.
  _SCALE_DEGREE_NUMERALS: {
    major:      ['I',  'ii',  'iii',  'IV',  'V',  'vi',  'vii°'],
    minor:      ['i',  'ii°', 'III',  'iv',  'v',  'VI',  'VII' ],
    dorian:     ['i',  'ii',  'III',  'IV',  'v',  'vi°', 'VII' ],
    mixolydian: ['I',  'ii',  'iii°', 'IV',  'v',  'vi',  'VII' ],
  },

  // Returns the Roman numeral string for the nth scale degree of a given mode.
  getDiatonicNumeral(mode, scaleIndex) {
    const arr = this._SCALE_DEGREE_NUMERALS[mode] || this._SCALE_DEGREE_NUMERALS.major;
    return arr[scaleIndex] || '';
  },

  // Returns a Roman numeral (with accidentals if needed) for a borrowed/chromatic chord
  // relative to the given key root.
  getBorrowedNumeral(chordName, key) {
    const rootMatch = chordName.match(/^([A-G][b#]?)/);
    if (!rootMatch) return '?';
    const chordRoot = this._NOTE_PITCH[rootMatch[1]];
    const keyRoot   = this._NOTE_PITCH[key];
    if (chordRoot === undefined || keyRoot === undefined) return '?';
    const interval = (chordRoot - keyRoot + 12) % 12;
    const quality  = chordName.slice(rootMatch[1].length);
    const isMinor  = quality.startsWith('m') && !quality.startsWith('maj');
    const isDim    = quality.includes('dim') || quality.endsWith('°');
    const NUMERAL_MAP = {
      0:  ['I',   'i'  ], 1:  ['bII',  'bii' ], 2:  ['II',  'ii' ],
      3:  ['bIII','biii'], 4:  ['III',  'iii' ], 5:  ['IV',  'iv' ],
      6:  ['#IV', '#iv'], 7:  ['V',    'v'   ], 8:  ['bVI', 'bvi'],
      9:  ['VI',  'vi' ], 10: ['bVII', 'bvii'], 11: ['VII', 'vii'],
    };
    const pair = NUMERAL_MAP[interval] || ['?', '?'];
    let numeral = (isMinor || isDim) ? pair[1] : pair[0];
    if (isDim) numeral += '°';
    return numeral;
  },
};
