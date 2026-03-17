// state.js — In-memory app state.
// No localStorage access here. No DOM access here.
// Swift equivalent: @Observable ViewModels

const State = {
  songs: [],              // Song[] — loaded from Data on boot, kept in sync
  currentView: 'list',    // 'list' | 'song'
  currentSongId: null,    // string | null
  activeSong: null,       // Song | null — the fully loaded current song object

  // Phase 2 — Arrangement core
  expandedSectionId: null, // string | null — only one section expanded at a time
  editMode: false,         // boolean — shows drag handles and insert affordances
  recentLabels: [],        // string[], max 3, most recently used labels first

  // Phase 3 — Chord entry
  activePaletteId: null,   // string | null — sectionId whose chord palette is open

  // Phase 4 — Playback
  isPlaying: false,
  playbackSectionId: null,

  // Phase 5 — Section sheet
  activeSectionId: null,   // string | null — sectionId whose sheet is open
};
