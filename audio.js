// audio.js — Web Audio API chord playback engine.
// No dependencies on other modules. Loaded before data.js.

const Audio = {

  _ctx: null,
  _isPlaying: false,
  _timeouts: [],
  _nodes: [],    // all live OscillatorNodes/BufferSourceNodes; stopped immediately on Audio.stop()
  _noiseBuffer: null,

  // 16th-note grid patterns (16 slots = 1 bar). 1 = hit, 0 = rest.
  _DRUM_PATTERNS: {
    rock: {
      kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    },
    reggae: {
      kick:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    },
    halftime: {
      kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    },
    funk: {
      kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    },
  },

  // Semitone offsets for note names (C = 0)
  _SEMITONES: {
    'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,
    'F':5,'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11
  },

  // ── Lazy AudioContext ────────────────────────────────────────────────

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._noiseBuffer = null; // invalidate any stale buffer from a previous context
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  },

  // Lazy half-second white noise buffer, shared across all drum hits.
  // BufferSourceNodes are read-only so sharing the buffer is safe.
  _getNoiseBuffer(ctx) {
    if (this._noiseBuffer) return this._noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buf    = ctx.createBuffer(1, length, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  },

  // ── Drum synthesizers ────────────────────────────────────────────────

  _scheduleKick(ctx, master, t) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain); gain.connect(master);
    osc.start(t); osc.stop(t + 0.22);
    this._nodes.push(osc);
  },

  _scheduleSnare(ctx, master, t) {
    const noiseBuf = this._getNoiseBuffer(ctx);
    // Noise layer
    const noise = ctx.createBufferSource();
    const ng    = ctx.createGain();
    noise.buffer = noiseBuf;
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.5, t + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(ng); ng.connect(master);
    noise.start(t); noise.stop(t + 0.17);
    this._nodes.push(noise);
    // Tone body layer
    const osc = ctx.createOscillator();
    const og  = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = 200;
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.3, t + 0.002);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(og); og.connect(master);
    osc.start(t); osc.stop(t + 0.1);
    this._nodes.push(osc);
  },

  _scheduleHihat(ctx, master, t) {
    const noise = ctx.createBufferSource();
    const hpf   = ctx.createBiquadFilter();
    const gain  = ctx.createGain();
    noise.buffer = this._getNoiseBuffer(ctx);
    hpf.type = 'highpass'; hpf.frequency.value = 8000;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.connect(hpf); hpf.connect(gain); gain.connect(master);
    noise.start(t); noise.stop(t + 0.08);
    this._nodes.push(noise);
  },

  // Schedule one bar of drums using the given pattern (16-slot grid).
  _scheduleDrumBar(ctx, master, pattern, barStart, barDuration) {
    const step = barDuration / 16;
    for (let i = 0; i < 16; i++) {
      const t = barStart + i * step;
      if (pattern.kick[i])  this._scheduleKick(ctx, master, t);
      if (pattern.snare[i]) this._scheduleSnare(ctx, master, t);
      if (pattern.hihat[i]) this._scheduleHihat(ctx, master, t);
    }
  },

  // ── Synthesis helpers ────────────────────────────────────────────────

  // Returns frequency in Hz for a given semitone (0–11) and octave.
  // A4 (MIDI 69) = 440 Hz; midi = semitone + (octave + 1) * 12
  _hz(semitone, octave) {
    const midi = semitone + (octave + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  },

  // Returns { root: semitone 0–11, quality: string } for a chord name.
  // e.g. "F#m" → { root: 6, quality: 'm' }, "Bb" → { root: 10, quality: '' }
  _parseChord(name) {
    if (!name) return { root: 0, quality: '' };
    let root, quality;
    if (name.length >= 2 && (name[1] === '#' || name[1] === 'b')) {
      root = this._SEMITONES[name.slice(0, 2)] ?? 0;
      quality = name.slice(2);
    } else {
      root = this._SEMITONES[name[0]] ?? 0;
      quality = name.slice(1);
    }
    return { root, quality };
  },

  // Returns semitone intervals above root for each chord quality.
  _intervals(quality) {
    switch (quality) {
      case 'm':    return [0, 3, 7];
      case 'dim':  return [0, 3, 6];
      case '7':    return [0, 4, 7, 10];
      case 'm7':   return [0, 3, 7, 10];
      case 'maj7': return [0, 4, 7, 11];
      default:     return [0, 4, 7]; // major triad
    }
  },

  // Master gain (0.75) → DynamicsCompressor → ctx.destination.
  // Prevents clipping when multiple notes play simultaneously.
  _buildMaster(ctx) {
    const gain = ctx.createGain();
    gain.gain.value = 0.75;
    const comp = ctx.createDynamicsCompressor();
    gain.connect(comp);
    comp.connect(ctx.destination);
    return gain;
  },

  // Schedule all notes of a chord to play at startTime for duration seconds.
  // Root note in octave 3; upper voices in octave 4.
  _scheduleChord(ctx, master, chordName, startTime, duration) {
    const { root, quality } = this._parseChord(chordName);
    const intervals = this._intervals(quality);
    const decay = Math.min(duration * 0.88, 3.0);

    intervals.forEach((interval, i) => {
      const semitone = (root + interval) % 12;
      const octave   = i === 0 ? 3 : 4; // root in octave 3, upper voices in octave 4
      const freq     = this._hz(semitone, octave);

      // Triangle oscillator — body of the tone
      const triOsc  = ctx.createOscillator();
      triOsc.type             = 'triangle';
      triOsc.frequency.value  = freq;
      const triGain = ctx.createGain();
      triGain.gain.setValueAtTime(0, startTime);
      triGain.gain.linearRampToValueAtTime(0.25, startTime + 0.015);
      triGain.gain.exponentialRampToValueAtTime(0.001, startTime + decay);
      triOsc.connect(triGain);
      triGain.connect(master);
      triOsc.start(startTime);
      triOsc.stop(startTime + decay + 0.05);
      this._nodes.push(triOsc);

      // Sine oscillator at 2× frequency — shimmer / upper partial
      const sineOsc = ctx.createOscillator();
      sineOsc.type             = 'sine';
      sineOsc.frequency.value  = freq * 2;
      const sineGain = ctx.createGain();
      sineGain.gain.setValueAtTime(0, startTime);
      sineGain.gain.linearRampToValueAtTime(0.25 * 0.28, startTime + 0.015);
      sineGain.gain.exponentialRampToValueAtTime(0.001, startTime + decay);
      sineOsc.connect(sineGain);
      sineGain.connect(master);
      sineOsc.start(startTime);
      sineOsc.stop(startTime + decay + 0.05);
      this._nodes.push(sineOsc);
    });
  },

  // ── Public API ───────────────────────────────────────────────────────

  // Play all sections from the beginning.
  // callbacks: { onSection(sectionId), onStop() }
  playSong(song, { onSection, onStop } = {}) {
    if (this._isPlaying) this.stop();
    this._isPlaying = true;
    this._nodes = [];

    const ctx         = this._getCtx();
    const master      = this._buildMaster(ctx);
    const bpm         = song.bpm || 90;
    const barDuration = (60 / bpm) * 4; // 4/4 time
    const sections    = song.sections || [];

    let t           = ctx.currentTime + 0.1; // small lead-in
    let elapsedSecs = 0;

    for (const section of sections) {
      const bars       = section.bars || 8;
      const chords     = section.chords || [];
      const sectionDur = bars * barDuration;

      // Fire onSection to match when audio actually starts (+0.1 lead-in)
      const offsetMs = Math.round((elapsedSecs + 0.1) * 1000);
      const tid = setTimeout(() => {
        if (this._isPlaying && onSection) onSection(section.id);
      }, offsetMs);
      this._timeouts.push(tid);

      // Schedule chord slots: 1 per bar, repeating
      if (chords.length > 0) {
        const numSlots = Math.ceil(bars);
        for (let i = 0; i < numSlots; i++) {
          const chord = chords[i % chords.length];
          this._scheduleChord(ctx, master, chord.name, t + i * barDuration, barDuration);
        }
      }

      // Schedule drums for each bar of this section
      const drumPattern = song.drumPattern && song.drumPattern !== 'none'
        ? this._DRUM_PATTERNS[song.drumPattern] : null;
      if (drumPattern) {
        for (let i = 0; i < bars; i++) {
          this._scheduleDrumBar(ctx, master, drumPattern, t + i * barDuration, barDuration);
        }
      }

      t           += sectionDur;
      elapsedSecs += sectionDur;
    }

    // onStop after all sections finish
    const stopTid = setTimeout(() => {
      if (this._isPlaying) {
        this._isPlaying = false;
        if (onStop) onStop();
      }
    }, Math.round((elapsedSecs + 0.1) * 1000) + 100);
    this._timeouts.push(stopTid);
  },

  // Play a single section.
  // callbacks: { onStop() }
  playSection(song, sectionId, { onStop } = {}) {
    if (this._isPlaying) this.stop();
    this._isPlaying = true;
    this._nodes = [];

    const section = (song.sections || []).find((s) => s.id === sectionId);
    if (!section) {
      this._isPlaying = false;
      if (onStop) onStop();
      return;
    }

    const ctx         = this._getCtx();
    const master      = this._buildMaster(ctx);
    const bpm         = song.bpm || 90;
    const barDuration = (60 / bpm) * 4;
    const bars        = section.bars || 8;
    const chords      = section.chords || [];
    const sectionDur  = bars * barDuration;
    const t           = ctx.currentTime + 0.1;

    if (chords.length > 0) {
      const numSlots = Math.ceil(bars);
      for (let i = 0; i < numSlots; i++) {
        const chord = chords[i % chords.length];
        this._scheduleChord(ctx, master, chord.name, t + i * barDuration, barDuration);
      }
    }

    // Schedule drums for each bar of this section
    const drumPattern = song.drumPattern && song.drumPattern !== 'none'
      ? this._DRUM_PATTERNS[song.drumPattern] : null;
    if (drumPattern) {
      for (let i = 0; i < bars; i++) {
        this._scheduleDrumBar(ctx, master, drumPattern, t + i * barDuration, barDuration);
      }
    }

    const stopTid = setTimeout(() => {
      if (this._isPlaying) {
        this._isPlaying = false;
        if (onStop) onStop();
      }
    }, Math.round((sectionDur + 0.1) * 1000) + 100);
    this._timeouts.push(stopTid);
  },

  // Stop all playback and silence any scheduled oscillators immediately.
  stop() {
    this._isPlaying = false;
    for (const tid of this._timeouts) clearTimeout(tid);
    this._timeouts = [];
    // Stop every oscillator node right now — clears the AudioContext timeline
    if (this._ctx) {
      const now = this._ctx.currentTime;
      for (const node of this._nodes) {
        try { node.stop(now); } catch (_) { /* already stopped naturally */ }
      }
    }
    this._nodes = [];
  },

  isPlaying() {
    return this._isPlaying;
  },
};
