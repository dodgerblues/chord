// data.js — All localStorage access.
// The only file that touches storage. Maps directly to future Swift data models.
//
// Swift equivalent: SwiftData @Model classes with @Query for sorted fetch

const DATA_KEY = 'chord_songs';

// crypto.randomUUID() requires a secure context (HTTPS/localhost).
// This fallback handles plain HTTP on a local network (e.g. iPhone testing via IP).
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const Data = {
  _read() {
    try {
      return JSON.parse(localStorage.getItem(DATA_KEY) || '[]');
    } catch {
      return [];
    }
  },

  _write(songs) {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(songs));
    } catch (e) {
      // localStorage quota exceeded
      if (e.name === 'QuotaExceededError') {
        window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
      }
    }
  },

  // Returns all songs sorted by updatedAt descending.
  // Swift: @Query(sort: \Song.updatedAt, order: .reverse) var songs: [Song]
  getSongs() {
    return this._read().sort((a, b) => b.updatedAt - a.updatedAt);
  },

  // Returns a single song by id, or null.
  // Swift: modelContext.fetch(FetchDescriptor<Song>(predicate: #Predicate { $0.id == id }))
  getSong(id) {
    return this._read().find((s) => s.id === id) || null;
  },

  // Creates a new song. Generates id, sets timestamps, initialises empty sections.
  // Swift: let song = Song(title:, key:, mode:, bpm:); modelContext.insert(song)
  createSong({ title, key, mode, bpm, drumPattern }) {
    const songs = this._read();
    const now = Date.now();
    const song = {
      id: generateId(),
      title: title.trim(),
      key,
      mode,
      bpm: Math.min(200, Math.max(40, parseInt(bpm, 10) || 90)),
      drumPattern: drumPattern || 'none',
      createdAt: now,
      updatedAt: now,
      sections: [],
    };
    songs.push(song);
    this._write(songs);
    return song;
  },

  // Merges partial data into an existing song and bumps updatedAt.
  // Swift: song.title = ...; try modelContext.save()
  updateSong(id, data) {
    const songs = this._read();
    const idx = songs.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    songs[idx] = { ...songs[idx], ...data, updatedAt: Date.now() };
    this._write(songs);
    return songs[idx];
  },

  // Removes a song by id.
  // Swift: modelContext.delete(song)
  deleteSong(id) {
    this._write(this._read().filter((s) => s.id !== id));
  },

  // ── Section CRUD ─────────────────────────────────────────────────────
  // All helpers load → mutate → save. Sections live inside song.sections[].
  // Swift equivalent: @Relationship var sections: [Section], managed by SwiftData

  // Appends a new section to the end of a song's sections array.
  // Swift: song.sections.append(Section(label:, bars:))
  addSection(songId, overrides = {}) {
    const song = this.getSong(songId);
    if (!song) return null;
    const section = {
      id: generateId(),
      label: 'Section',
      bars: 8,
      chords: [],
      ...overrides,
    };
    const sections = [...(song.sections || []), section];
    this.updateSong(songId, { sections });
    return section;
  },

  // Inserts a new section at a specific index.
  // Swift: song.sections.insert(Section(label:, bars:), at: index)
  addSectionAt(songId, index, overrides = {}) {
    const song = this.getSong(songId);
    if (!song) return null;
    const section = {
      id: generateId(),
      label: 'Section',
      bars: 8,
      chords: [],
      ...overrides,
    };
    const sections = [...(song.sections || [])];
    sections.splice(index, 0, section);
    this.updateSong(songId, { sections });
    return section;
  },

  // Merges partial data into a matching section.
  // Swift: if let idx = song.sections.firstIndex(where: { $0.id == id }) { ... }
  updateSection(songId, sectionId, data) {
    const song = this.getSong(songId);
    if (!song) return null;
    const sections = (song.sections || []).map((s) =>
      s.id === sectionId ? { ...s, ...data } : s
    );
    this.updateSong(songId, { sections });
    return sections.find((s) => s.id === sectionId) || null;
  },

  // Removes a section by id.
  // Swift: song.sections.removeAll { $0.id == id }
  deleteSection(songId, sectionId) {
    const song = this.getSong(songId);
    if (!song) return;
    const sections = (song.sections || []).filter((s) => s.id !== sectionId);
    this.updateSong(songId, { sections });
  },

  // Re-orders sections to match the supplied id array.
  // Swift: song.sections = newIds.compactMap { id in song.sections.first { $0.id == id } }
  reorderSections(songId, newSectionIds) {
    const song = this.getSong(songId);
    if (!song) return;
    const map = Object.fromEntries((song.sections || []).map((s) => [s.id, s]));
    const sections = newSectionIds.map((id) => map[id]).filter(Boolean);
    this.updateSong(songId, { sections });
  },

  // Deep-copies a section and inserts it immediately after the source.
  // Swift: let copy = source.copy(); song.sections.insert(copy, at: idx + 1)
  duplicateSection(songId, sectionId) {
    const song = this.getSong(songId);
    if (!song) return null;
    const sections = [...(song.sections || [])];
    const idx = sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) return null;
    const copy = { ...sections[idx], id: generateId(), chords: [...(sections[idx].chords || [])] };
    sections.splice(idx + 1, 0, copy);
    this.updateSong(songId, { sections });
    return copy;
  },

  // ── Chord CRUD ────────────────────────────────────────────────────────

  // Appends a chord to a section's chord list.
  // Returns the new chord object { id, name } or null on failure.
  addChord(songId, sectionId, name) {
    const song = this.getSong(songId);
    if (!song) return null;
    const sections = [...(song.sections || [])];
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return null;
    if (!section.chords) section.chords = [];
    const chord = { id: generateId(), name };
    section.chords.push(chord);
    this.updateSong(songId, { sections });
    return chord;
  },

  // Removes a chord by id from a section.
  removeChord(songId, sectionId, chordId) {
    const song = this.getSong(songId);
    if (!song) return;
    const sections = [...(song.sections || [])];
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.chords = (section.chords || []).filter((c) => c.id !== chordId);
    this.updateSong(songId, { sections });
  },

  // ─────────────────────────────────────────────────────────────────────

  // Returns a plain-text chord sheet for sharing. Phase 5 expands this.
  // Swift: ShareLink(item: song.textRepresentation)
  exportSongAsText(song) {
    const lines = [`${song.title}`, `Key: ${song.key} ${song.mode}  BPM: ${song.bpm}`, ''];
    (song.sections || []).forEach((section) => {
      const chordNames = (section.chords || []).map((c) => c.name).join('  ');
      lines.push(`[${section.label}]  ${section.bars} bars`);
      if (chordNames) lines.push(chordNames);
      lines.push('');
    });
    return lines.join('\n').trim();
  },
};
