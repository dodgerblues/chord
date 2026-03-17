// app.js — Event handlers and orchestration.
// Calls Data, updates State, triggers UI renders.
// Swift equivalent: @Observable ViewModels + NavigationStack coordinator

const App = {

  init() {
    // Register service worker (requires HTTPS or localhost)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./sw.js')
        .catch((err) => console.warn('Service worker registration failed:', err));
    }

    // Load songs into state
    State.songs = Data.getSongs();

    // Build app shell
    UI.renderApp();
    UI.renderSongList(State.songs);

    // Bind all event listeners
    this._bindListEvents();
    this._bindSheetEvents();
    this._bindNavEvents();
    this._bindStorageEvents();
  },

  // ── Song list events ──────────────────────────────────────────────────

  _bindListEvents() {
    // FAB → open new song sheet
    document.getElementById('fab-new-song').addEventListener('click', () => {
      UI.openNewSongSheet();
    });

    // Song list: open song or confirm-delete via event delegation
    document.getElementById('song-list').addEventListener('click', (e) => {
      const openTarget   = e.target.closest('[data-action="open-song"]');
      const deleteTarget = e.target.closest('[data-action="delete-song"]');

      if (deleteTarget) {
        this._confirmDeleteSong(deleteTarget.dataset.songId);
        return;
      }

      if (openTarget) {
        // If a card is swiped open, a tap on it should snap it back rather than navigate
        if (UI._currentSwipedCard) {
          UI.closeOpenSwipe();
          return;
        }
        this._openSong(openTarget.dataset.songId);
      }
    });

    // Close any open swipe card when tapping elsewhere in the document
    document.addEventListener('touchstart', (e) => {
      if (!UI._currentSwipedCard) return;
      if (!document.getElementById('song-list')?.contains(e.target)) {
        UI.closeOpenSwipe();
      }
    }, { passive: true });
  },

  _openSong(id) {
    const song = Data.getSong(id);
    if (!song) return;

    if (Audio.isPlaying()) this._stopPlayback();

    State.currentSongId     = id;
    State.currentView       = 'song';
    State.activeSong        = song;
    State.expandedSectionId = null;
    State.activeSectionId   = null;
    State.activePaletteId   = null;

    history.pushState({ view: 'song', songId: id }, '', `#${id}`);
    UI.showSongScreen(song);
    this._bindSongViewEvents(id);
    UI.updatePlayFabState(song);
  },

  _confirmDeleteSong(id) {
    const song = Data.getSong(id);
    if (!song) return;

    UI.closeOpenSwipe();

    // Using native confirm for Phase 1; Phase 5 will use a custom action sheet
    if (confirm(`Delete "${song.title}"?\nThis cannot be undone.`)) {
      Data.deleteSong(id);
      State.songs = Data.getSongs();
      UI.renderSongList(State.songs);
    }
  },

  // ── New song sheet events ─────────────────────────────────────────────

  _bindSheetEvents() {
    // Key selection
    document.getElementById('key-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.key-btn');
      if (!btn) return;
      document.querySelectorAll('.key-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });

    // Mode selection
    document.getElementById('mode-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.mode-chip');
      if (!chip) return;
      document.querySelectorAll('.mode-chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
    });

    // Drum pattern selection
    document.getElementById('drum-pattern-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-action="set-drum-pattern"]');
      if (!chip) return;
      document.querySelectorAll('[data-action="set-drum-pattern"]').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
    });

    // BPM − button
    document.getElementById('bpm-minus').addEventListener('click', () => {
      const input = document.getElementById('input-bpm');
      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val > 40) input.value = val - 1;
    });

    // BPM + button
    document.getElementById('bpm-plus').addEventListener('click', () => {
      const input = document.getElementById('input-bpm');
      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val < 200) input.value = val + 1;
    });

    // BPM input: clamp on blur
    document.getElementById('input-bpm').addEventListener('blur', () => {
      const input = document.getElementById('input-bpm');
      let val = parseInt(input.value, 10);
      if (isNaN(val) || val < 40)  val = 40;
      if (val > 200)                val = 200;
      input.value = val;
    });

    // Create song button
    document.getElementById('btn-create-song').addEventListener('click', () => {
      this._handleCreateSong();
    });

    // Cancel button
    document.getElementById('btn-cancel-sheet').addEventListener('click', () => {
      UI.closeNewSongSheet();
    });

    // Tap overlay backdrop to dismiss
    document.getElementById('sheet-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'sheet-overlay') {
        UI.closeNewSongSheet();
      }
    });

    // Enter in title field submits
    document.getElementById('input-title').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleCreateSong();
    });

    // Clear error state as user types
    document.getElementById('input-title').addEventListener('input', () => {
      document.getElementById('input-title').classList.remove('error');
      document.getElementById('title-error').classList.remove('visible');
    });
  },

  _handleCreateSong() {
    const titleInput = document.getElementById('input-title');
    const title = titleInput.value.trim();

    if (!title) {
      titleInput.classList.add('error');
      document.getElementById('title-error').classList.add('visible');
      titleInput.focus();
      return;
    }

    const key         = document.querySelector('.key-btn.selected')?.dataset.key   || 'C';
    const mode        = document.querySelector('.mode-chip.selected')?.dataset.mode || 'major';
    const bpm         = parseInt(document.getElementById('input-bpm').value, 10) || 90;
    const drumPattern = document.querySelector('[data-action="set-drum-pattern"].selected')?.dataset.value || 'none';

    const createBtn = document.getElementById('btn-create-song');
    const editSongId = createBtn?._editSongId;

    if (editSongId) {
      // Editing an existing song
      delete createBtn._editSongId;
      createBtn.textContent = 'Create Song';
      document.querySelector('#new-song-sheet .sheet-title').textContent = 'New Song';

      Data.updateSong(editSongId, { title, key, mode, bpm, drumPattern });
      State.activeSong = Data.getSong(editSongId);
      State.songs = Data.getSongs();
      UI.renderSongList(State.songs);
      UI.updateSongHeader(State.activeSong);
      UI.closeNewSongSheet();
    } else {
      // Creating a new song — auto-add the first section
      const song = Data.createSong({ title, key, mode, bpm, drumPattern });
      const firstSection = Data.addSection(song.id);
      State.songs = Data.getSongs();
      UI.renderSongList(State.songs);
      UI.closeNewSongSheet();

      // Navigate to the new song after the sheet finishes closing, then open the section sheet
      setTimeout(() => {
        this._openSong(song.id);
        if (firstSection) {
          setTimeout(() => this._openSectionSheet(song.id, firstSection.id), 60);
        }
      }, 380);
    }
  },

  // ── Song view events ──────────────────────────────────────────────────

  _bindSongViewEvents(songId) {
    const screen = document.getElementById('screen-song');
    if (!screen) return;

    // ── Edit mode toggle ────────────────────────────────────────────
    document.getElementById('btn-edit-mode')?.addEventListener('click', () => {
      // Close open section sheet when entering edit mode
      if (State.activeSectionId) this._closeSectionSheet();
      State.editMode = !State.editMode;
      screen.classList.toggle('edit-mode', State.editMode);
      const btn = document.getElementById('btn-edit-mode');
      if (btn) btn.textContent = State.editMode ? 'Done' : 'Edit';
    });

    // ── Edit song metadata ──────────────────────────────────────────
    document.getElementById('btn-edit-meta')?.addEventListener('click', () => {
      this._openEditMetaSheet(songId);
    });

    // ── Section overview bar — tap to open section sheet ────────────
    document.getElementById('section-overview')?.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-action="select-section-overview"]');
      if (!seg) return;
      this._openSectionSheet(songId, seg.dataset.sectionId);
    });

    // ── Play FAB ────────────────────────────────────────────────────
    document.getElementById('btn-play-fab')?.addEventListener('click', () => {
      if (Audio.isPlaying()) {
        this._stopPlayback();
      } else {
        this._startPlayback(songId);
      }
    });

    // Bind section list interactions
    this._bindSectionListEvents(songId);
  },

  // Binds event delegation on #section-list (called after every render).
  // In Phase 5 this is intentionally thin — section editing lives in the section sheet.
  _bindSectionListEvents(songId) {
    const list = document.getElementById('section-list');
    if (!list) return;

    if (list._sectionHandler) {
      list.removeEventListener('click', list._sectionHandler);
    }

    list._sectionHandler = (e) => {
      const action = e.target.closest('[data-action]')?.dataset?.action;

      if (!action) {
        // Tap on a section card header (no inner action element hit) — open the sheet
        const hdr = e.target.closest('.section-card-header');
        if (hdr) this._openSectionSheet(songId, hdr.dataset.sectionId);
        return;
      }

      const sectionId = e.target.closest('[data-section-id]')?.dataset?.sectionId
                     || e.target.closest('[data-action]')?.dataset?.sectionId;

      switch (action) {
        case 'open-section':
          this._openSectionSheet(songId, sectionId);
          break;

        case 'add-section': {
          const section = Data.addSection(songId);
          if (!section) return;
          State.activeSong = Data.getSong(songId);
          UI.renderSectionList(State.activeSong);
          UI.renderOverviewBar(State.activeSong);
          UI.updatePlayFabState(State.activeSong);
          this._bindSectionListEvents(songId);
          this._openSectionSheet(songId, section.id);
          break;
        }

        case 'insert-section': {
          const idx = parseInt(e.target.closest('[data-insert-index]')?.dataset?.insertIndex, 10);
          const section = Data.addSectionAt(songId, idx);
          if (section) {
            State.activeSong = Data.getSong(songId);
            UI.renderSectionList(State.activeSong);
            UI.renderOverviewBar(State.activeSong);
            this._bindSectionListEvents(songId);
            this._openSectionSheet(songId, section.id);
          }
          break;
        }
      }
    };

    list.addEventListener('click', list._sectionHandler);

    // Drag handles
    list.querySelectorAll('[data-drag-handle]').forEach((handle) => {
      this._attachDragReorder(handle, songId);
    });
  },

  // ── Phase 5: Section Sheet ─────────────────────────────────────────────

  _openSectionSheet(songId, sectionId) {
    State.activeSectionId = sectionId;
    State.activePaletteId = null;  // reset palette state when opening a new section
    UI.populateSectionSheet(songId, sectionId);
    UI.openSectionSheet();
    this._bindSectionSheetEvents(songId, sectionId);
  },

  _closeSectionSheet() {
    State.activeSectionId = null;
    State.activePaletteId = null;
    UI.closeSectionSheet();
  },

  // Re-populates the sheet content in place (no open animation — sheet stays open).
  _refreshSectionSheet(songId, sectionId) {
    UI.populateSectionSheet(songId, sectionId);
    this._bindSectionSheetEvents(songId, sectionId);
  },

  // Lightweight update of a section card's header text in the list.
  _updateSectionCardInList(songId, sectionId) {
    const song = Data.getSong(songId);
    if (!song) return;
    const section = (song.sections || []).find((s) => s.id === sectionId);
    if (!section) return;

    const wrapper = document.querySelector(`.section-card-wrapper[data-section-id="${sectionId}"]`);
    if (wrapper) {
      const lbl = wrapper.querySelector('.section-card-label');
      if (lbl) lbl.textContent = section.label || 'Section';
      const bars = wrapper.querySelector('.section-card-bars');
      if (bars) bars.textContent = `· ${section.bars || 8} bars`;
      const chords = wrapper.querySelector('.section-card-chords');
      if (chords) chords.textContent = (section.chords || []).map((c) => c.name).join('  ') || '—';
    }

    UI._updateBarFooter(song.sections || []);
    UI.renderOverviewBar(song);
  },

  _duplicateSection(songId, sectionId) {
    const copy = Data.duplicateSection(songId, sectionId);
    if (!copy) return;
    State.activeSong = Data.getSong(songId);
    this._closeSectionSheet();
    UI.renderSectionList(State.activeSong);
    UI.renderOverviewBar(State.activeSong);
    UI.updatePlayFabState(State.activeSong);
    this._bindSectionListEvents(songId);
    // Open the duplicated section's sheet
    setTimeout(() => this._openSectionSheet(songId, copy.id), 50);
  },

  _deleteSection(songId, sectionId) {
    const song = Data.getSong(songId);
    const sec = (song?.sections || []).find((s) => s.id === sectionId);
    if (!sec) return;
    if (!confirm(`Delete "${sec.label}"?\nThis cannot be undone.`)) return;

    Data.deleteSection(songId, sectionId);
    State.activeSong = Data.getSong(songId);
    this._closeSectionSheet();
    UI.renderSectionList(State.activeSong);
    UI.renderOverviewBar(State.activeSong);
    UI.updatePlayFabState(State.activeSong);
    this._bindSectionListEvents(songId);
  },

  // Binds all events on the section sheet overlay.
  // Called after every populateSectionSheet().
  _bindSectionSheetEvents(songId, sectionId) {
    const overlay = document.getElementById('section-sheet-overlay');
    const sheet   = document.getElementById('section-sheet');
    if (!overlay || !sheet) return;

    // Replace old handler
    if (overlay._sheetHandler) overlay.removeEventListener('click', overlay._sheetHandler);

    overlay._sheetHandler = (e) => {
      // Tap on the dimmed backdrop → close
      if (e.target === overlay) {
        this._closeSectionSheet();
        return;
      }

      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (!action) return;

      switch (action) {

        case 'close-section-sheet':
          this._closeSectionSheet();
          break;

        case 'set-label': {
          const label = e.target.closest('[data-label]')?.dataset?.label;
          if (!label) break;
          State.recentLabels = [label, ...State.recentLabels.filter((r) => r !== label)].slice(0, 3);
          Data.updateSection(songId, sectionId, { label });
          State.activeSong = Data.getSong(songId);
          this._updateSectionCardInList(songId, sectionId);
          this._refreshSectionSheet(songId, sectionId);
          break;
        }

        case 'show-custom-label': {
          const wrap = document.getElementById(`custom-label-wrap-${sectionId}`);
          if (wrap) {
            wrap.classList.add('visible');
            document.getElementById(`custom-label-input-${sectionId}`)?.focus();
          }
          break;
        }

        case 'apply-custom-label': {
          const input = document.getElementById(`custom-label-input-${sectionId}`);
          const val = (input?.value || '').trim();
          if (!val) break;
          State.recentLabels = [val, ...State.recentLabels.filter((r) => r !== val)].slice(0, 3);
          Data.updateSection(songId, sectionId, { label: val });
          State.activeSong = Data.getSong(songId);
          this._updateSectionCardInList(songId, sectionId);
          this._refreshSectionSheet(songId, sectionId);
          break;
        }

        case 'set-bars-quick': {
          const n = parseInt(e.target.closest('[data-bars]')?.dataset?.bars, 10);
          if (isNaN(n)) break;
          Data.updateSection(songId, sectionId, { bars: Math.min(64, Math.max(1, n)) });
          State.activeSong = Data.getSong(songId);
          this._updateSectionCardInList(songId, sectionId);
          this._refreshSectionSheet(songId, sectionId);
          break;
        }

        case 'bars-minus': {
          const song = Data.getSong(songId);
          const sec = (song?.sections || []).find((s) => s.id === sectionId);
          if (sec && sec.bars > 1) {
            Data.updateSection(songId, sectionId, { bars: sec.bars - 1 });
            State.activeSong = Data.getSong(songId);
            this._updateSectionCardInList(songId, sectionId);
            this._refreshSectionSheet(songId, sectionId);
          }
          break;
        }

        case 'bars-plus': {
          const song = Data.getSong(songId);
          const sec = (song?.sections || []).find((s) => s.id === sectionId);
          if (sec && sec.bars < 64) {
            Data.updateSection(songId, sectionId, { bars: sec.bars + 1 });
            State.activeSong = Data.getSong(songId);
            this._updateSectionCardInList(songId, sectionId);
            this._refreshSectionSheet(songId, sectionId);
          }
          break;
        }

        case 'toggle-palette': {
          const isOpen = State.activePaletteId === sectionId;
          State.activePaletteId = isOpen ? null : sectionId;
          // Rebuild the chords row section of the sheet (shows/hides Add Chords vs strip)
          this._refreshSectionSheet(songId, sectionId);
          // Scroll palette into view on open
          if (!isOpen) {
            requestAnimationFrame(() =>
              document.getElementById(`chord-palette-${sectionId}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            );
          }
          break;
        }

        case 'add-chord': {
          const chordName = e.target.closest('[data-chord-name]')?.dataset?.chordName;
          if (!chordName) break;
          Data.addChord(songId, sectionId, chordName);
          State.activeSong = Data.getSong(songId);
          this._refreshSectionSheet(songId, sectionId);
          this._updateSectionCardInList(songId, sectionId);
          UI.updatePlayFabState(State.activeSong);
          requestAnimationFrame(() =>
            document.getElementById(`chord-palette-${sectionId}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          );
          break;
        }

        case 'remove-chord': {
          const chordId = e.target.closest('[data-chord-id]')?.dataset?.chordId;
          if (!chordId) break;
          Data.removeChord(songId, sectionId, chordId);
          State.activeSong = Data.getSong(songId);
          this._refreshSectionSheet(songId, sectionId);
          this._updateSectionCardInList(songId, sectionId);
          UI.updatePlayFabState(State.activeSong);
          break;
        }

        case 'play-section': {
          if (Audio.isPlaying()) {
            this._stopPlayback();
          } else {
            this._startSectionPlayback(songId, sectionId);
          }
          break;
        }

        case 'duplicate-section':
          this._duplicateSection(songId, sectionId);
          break;

        case 'delete-section':
          this._deleteSection(songId, sectionId);
          break;
      }
    };

    overlay.addEventListener('click', overlay._sheetHandler);

    // Bar input: commit on blur
    sheet.querySelectorAll('.bpm-input[data-section-id]').forEach((input) => {
      input.addEventListener('blur', () => {
        let val = parseInt(input.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 64) val = 64;
        Data.updateSection(songId, sectionId, { bars: val });
        State.activeSong = Data.getSong(songId);
        this._updateSectionCardInList(songId, sectionId);
        this._refreshSectionSheet(songId, sectionId);
      });
    });
  },

  // ── Phase 4: Playback ─────────────────────────────────────────────────

  _startPlayback(songId) {
    const song = Data.getSong(songId);
    if (!song) return;
    State.isPlaying = true;
    UI.updatePlaybackUI(true, null);
    Audio.playSong(song, {
      onSection: (sectionId) => {
        State.playbackSectionId = sectionId;
        UI.updatePlaybackUI(true, sectionId);
      },
      onStop: () => this._stopPlayback(),
    });
  },

  _stopPlayback() {
    Audio.stop();
    State.isPlaying = false;
    State.playbackSectionId = null;
    UI.updatePlaybackUI(false, null);
  },

  _startSectionPlayback(songId, sectionId) {
    const song = Data.getSong(songId);
    if (!song) return;
    State.isPlaying = true;
    State.playbackSectionId = sectionId;
    UI.updatePlaybackUI(true, sectionId);
    Audio.playSection(song, sectionId, {
      onStop: () => this._stopPlayback(),
    });
  },

  // ── Drag-to-reorder ───────────────────────────────────────────────────

  _attachDragReorder(handle, songId) {
    let activeDrag = null;

    const getWrappers = () =>
      [...document.querySelectorAll('#section-list .section-card-wrapper:not(.dragging)')];

    handle.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      const wrapper = handle.closest('.section-card-wrapper');
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const touch = e.touches[0];

      // Create placeholder same height
      const placeholder = document.createElement('div');
      placeholder.className = 'section-placeholder';
      placeholder.style.height = `${rect.height}px`;
      wrapper.after(placeholder);

      wrapper.classList.add('dragging');
      wrapper.style.top    = `${rect.top}px`;
      wrapper.style.width  = `${rect.width}px`;
      wrapper.style.left   = `${rect.left}px`;

      activeDrag = {
        wrapper,
        placeholder,
        startY: touch.clientY,
        origTop: rect.top,
        sectionId: wrapper.dataset.sectionId,
      };
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      if (!activeDrag) return;
      e.preventDefault();

      const touch = e.touches[0];
      const dy = touch.clientY - activeDrag.startY;
      activeDrag.wrapper.style.top = `${activeDrag.origTop + dy}px`;

      // Find where placeholder should go
      const wrappers = getWrappers();
      const dragMid = touch.clientY;

      for (const w of wrappers) {
        const wRect = w.getBoundingClientRect();
        const wMid = wRect.top + wRect.height / 2;
        if (dragMid < wMid) {
          w.before(activeDrag.placeholder);
          return;
        }
      }
      // Below all — put at end
      const list = document.getElementById('section-list');
      const footer = document.getElementById('section-list-footer');
      if (footer) list.insertBefore(activeDrag.placeholder, footer);
      else list.appendChild(activeDrag.placeholder);
    }, { passive: false });

    const endDrag = () => {
      if (!activeDrag) return;
      const { wrapper, placeholder, sectionId } = activeDrag;
      activeDrag = null;

      // Snap card into placeholder
      wrapper.classList.remove('dragging');
      wrapper.style.top   = '';
      wrapper.style.width = '';
      wrapper.style.left  = '';

      placeholder.replaceWith(wrapper);

      // Collect new order from DOM
      const newIds = [...document.querySelectorAll('#section-list .section-card-wrapper')]
        .map((w) => w.dataset.sectionId);

      Data.reorderSections(songId, newIds);
      State.activeSong = Data.getSong(songId);
      UI.renderOverviewBar(State.activeSong);
    };

    handle.addEventListener('touchend',    endDrag);
    handle.addEventListener('touchcancel', () => {
      if (!activeDrag) return;
      const { wrapper, placeholder } = activeDrag;
      activeDrag = null;
      wrapper.classList.remove('dragging');
      wrapper.style.top   = '';
      wrapper.style.width = '';
      wrapper.style.left  = '';
      placeholder.replaceWith(wrapper);
    });
  },

  // ── Edit song metadata sheet ──────────────────────────────────────────

  _openEditMetaSheet(songId) {
    const song = Data.getSong(songId);
    if (!song) return;

    // Pre-fill the new-song sheet with this song's values, then repurpose it
    const overlay = document.getElementById('sheet-overlay');
    const sheet   = document.getElementById('new-song-sheet');
    if (!overlay || !sheet) return;

    // Update sheet title
    sheet.querySelector('.sheet-title').textContent = 'Edit Song';

    // Pre-fill fields
    const titleInput = document.getElementById('input-title');
    if (titleInput) titleInput.value = song.title;

    document.querySelectorAll('.key-btn').forEach((b) => {
      b.classList.toggle('selected', b.dataset.key === song.key);
    });
    document.querySelectorAll('.mode-chip').forEach((c) => {
      c.classList.toggle('selected', c.dataset.mode === song.mode);
    });
    const bpmInput = document.getElementById('input-bpm');
    if (bpmInput) bpmInput.value = song.bpm;

    const drumVal = song.drumPattern || 'none';
    document.querySelectorAll('[data-action="set-drum-pattern"]').forEach((c) => {
      c.classList.toggle('selected', c.dataset.value === drumVal);
    });

    // Swap create button to save
    const createBtn = document.getElementById('btn-create-song');
    if (createBtn) {
      createBtn.textContent = 'Save Changes';
      createBtn._editSongId = songId;  // Store which song we're editing
    }

    overlay.classList.add('visible');
    sheet.classList.add('open');
    setTimeout(() => titleInput?.focus(), 360);
  },

  // ── Navigation ────────────────────────────────────────────────────────

  _bindNavEvents() {
    window.addEventListener('popstate', (e) => {
      this._handlePopState(e.state);
    });
  },

  _handlePopState(histState) {
    if (histState?.view === 'song' && histState?.songId) {
      const song = Data.getSong(histState.songId);
      if (song) {
        State.currentView   = 'song';
        State.currentSongId = histState.songId;
        State.activeSong    = song;
        State.expandedSectionId = null;
        UI.showSongScreen(song);
        this._bindSongViewEvents(histState.songId);
        return;
      }
    }
    // No valid song in history state → show list
    if (Audio.isPlaying()) this._stopPlayback();
    State.currentView     = 'list';
    State.currentSongId   = null;
    State.activeSong      = null;
    State.activeSectionId = null;
    State.activePaletteId = null;
    UI.showListScreen();
    // Refresh list in case something changed while on song view
    State.songs = Data.getSongs();
    UI.renderSongList(State.songs);
  },

  // ── Storage events ────────────────────────────────────────────────────

  _bindStorageEvents() {
    window.addEventListener('storage-quota-exceeded', () => {
      alert('Storage is almost full. Please delete some songs to free up space.');
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
