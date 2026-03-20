// ui.js — DOM rendering functions.
// Reads from State, never from Data directly.
// Swift equivalent: SwiftUI Views

const UI = {

  // ── Internal state for swipe tracking ────────────────────────────────
  _currentSwipedCard: null,

  // ── DOM helpers ───────────────────────────────────────────────────────

  el(tag, className, attrs = {}) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    for (const [k, v] of Object.entries(attrs)) {
      e.setAttribute(k, v);
    }
    return e;
  },

  // Creates an inline SVG element with the given path markup.
  svg(pathHTML, viewBox = '0 0 24 24') {
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', viewBox);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = pathHTML;
    return el;
  },

  // ── Formatters ────────────────────────────────────────────────────────

  timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 3600);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  modeLabel(mode) {
    return { major: 'Major', minor: 'Minor', dorian: 'Dorian', mixolydian: 'Mixolydian' }[mode] || mode;
  },

  // ── App boot render ───────────────────────────────────────────────────

  // Called once on init. Builds the full app shell.
  renderApp() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.appendChild(this._buildListScreen());
    app.appendChild(this._buildNewSongSheet());
  },

  // ── Song list screen ──────────────────────────────────────────────────

  _buildListScreen() {
    const screen = this.el('div', 'screen active');
    screen.id = 'screen-list';

    // Black status bar backing
    screen.appendChild(this.el('div', 'top-bar'));

    // Header
    const header = this.el('div', 'header');
    const titleEl = this.el('div', 'header-app-title');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = 'Chord ';
    const subSpan = this.el('span', 'header-app-subtitle');
    subSpan.textContent = 'pocket arranger';
    titleEl.appendChild(nameSpan);
    titleEl.appendChild(subSpan);
    header.appendChild(titleEl);
    screen.appendChild(header);

    // Scrollable content
    const content = this.el('div', 'scroll-content');
    const list = this.el('div', 'song-list');
    list.id = 'song-list';
    content.appendChild(list);
    screen.appendChild(content);

    // FAB — centered pill
    const fab = this.el('button', 'fab');
    fab.id = 'fab-new-song';
    fab.setAttribute('aria-label', 'New song');
    fab.appendChild(document.createTextNode('Add Song'));
    screen.appendChild(fab);

    return screen;
  },

  // Renders the song list (or empty state) into #song-list.
  renderSongList(songs) {
    const container = document.getElementById('song-list');
    if (!container) return;
    container.innerHTML = '';

    if (songs.length === 0) {
      container.appendChild(this._buildEmptyState());
      return;
    }

    for (const song of songs) {
      container.appendChild(this._buildSongCard(song));
    }
  },

  _buildSongCard(song) {
    const wrapper = this.el('div', 'song-card-wrapper');
    wrapper.dataset.songId = song.id;

    // Delete zone (behind the card, revealed on swipe)
    const deleteZone = this.el('div', 'song-card-delete-zone');
    deleteZone.textContent = 'Delete';
    deleteZone.setAttribute('role', 'button');
    deleteZone.setAttribute('aria-label', `Delete ${song.title}`);
    deleteZone.dataset.action = 'delete-song';
    deleteZone.dataset.songId = song.id;
    wrapper.appendChild(deleteZone);

    // Card
    const card = this.el('div', 'song-card');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open ${song.title}`);
    card.dataset.action = 'open-song';
    card.dataset.songId = song.id;

    const cardTitle = this.el('div', 'song-card-title');
    cardTitle.textContent = song.title;
    card.appendChild(cardTitle);

    const meta = this.el('div', 'song-card-meta');

    const badge = this.el('span', 'song-card-badge');
    badge.textContent = `${song.key} ${this.modeLabel(song.mode)}`;
    meta.appendChild(badge);

    const bpm = this.el('span', 'song-card-bpm');
    bpm.textContent = `${song.bpm} BPM`;
    meta.appendChild(bpm);

    const date = this.el('span', 'song-card-date');
    date.textContent = this.timeAgo(song.updatedAt);
    meta.appendChild(date);

    card.appendChild(meta);
    wrapper.appendChild(card);

    this._attachSwipeToDelete(card);
    return wrapper;
  },

  _buildEmptyState() {
    const el = this.el('div', 'empty-state');

    const iconWrap = this.el('div', 'empty-state-icon');
    iconWrap.appendChild(this.svg(
      '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      '0 0 24 24'
    ));
    el.appendChild(iconWrap);

    const title = this.el('div', 'empty-state-title');
    title.textContent = 'No songs yet';
    el.appendChild(title);

    const sub = this.el('div', 'empty-state-subtitle');
    sub.textContent = 'Tap + to start your first sketch.';
    el.appendChild(sub);

    return el;
  },

  // Touch-based swipe-to-delete. Translates the card left to reveal the delete zone.
  _attachSwipeToDelete(card) {
    let startX = 0, currentDx = 0, dragging = false;

    const snapBack = () => {
      card.style.transition = '';
      card.style.transform = '';
      card.classList.remove('swiped');
      if (UI._currentSwipedCard === card) UI._currentSwipedCard = null;
    };

    const snapOpen = () => {
      card.style.transition = '';
      card.style.transform = 'translateX(-80px)';
      card.classList.add('swiped');
      // Close any other open card first
      if (UI._currentSwipedCard && UI._currentSwipedCard !== card) {
        UI._currentSwipedCard.style.transition = '';
        UI._currentSwipedCard.style.transform = '';
        UI._currentSwipedCard.classList.remove('swiped');
      }
      UI._currentSwipedCard = card;
    };

    card._snapBack = snapBack;

    card.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      dragging = false;
      currentDx = 0;
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < 8) return;
        dragging = true;
      }
      // Only allow left swipe
      currentDx = Math.min(0, Math.max(-80, dx));
      card.style.transition = 'none';
      card.style.transform = `translateX(${currentDx}px)`;
    }, { passive: true });

    card.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      if (currentDx < -38) {
        snapOpen();
      } else {
        snapBack();
      }
    });
  },

  // Close any open swipe card. Called from app.js on outside taps.
  closeOpenSwipe() {
    if (UI._currentSwipedCard) {
      UI._currentSwipedCard._snapBack?.();
    }
  },

  // ── New Song Sheet ────────────────────────────────────────────────────

  _buildNewSongSheet() {
    const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const MODES = [
      { value: 'major',      label: 'Major'      },
      { value: 'minor',      label: 'Minor'      },
      { value: 'dorian',     label: 'Dorian'     },
      { value: 'mixolydian', label: 'Mixolydian' },
    ];

    const overlay = this.el('div', 'sheet-overlay');
    overlay.id = 'sheet-overlay';

    const sheet = this.el('div', 'bottom-sheet');
    sheet.id = 'new-song-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'New Song');

    // Handle
    const handle = this.el('div', 'sheet-handle');
    sheet.appendChild(handle);

    // Title
    const sheetTitle = this.el('div', 'sheet-title');
    sheetTitle.textContent = 'New Song';
    sheet.appendChild(sheetTitle);

    // ── Title field ──
    const titleField = this.el('div', 'form-field');
    const titleLabel = this.el('label', 'form-label');
    titleLabel.textContent = 'Title';
    titleLabel.setAttribute('for', 'input-title');
    titleField.appendChild(titleLabel);
    const titleInput = this.el('input', 'form-input');
    titleInput.id = 'input-title';
    titleInput.type = 'text';
    titleInput.placeholder = 'Untitled';
    titleInput.autocomplete = 'off';
    titleInput.setAttribute('autocorrect', 'off');
    titleInput.setAttribute('autocapitalize', 'words');
    titleInput.setAttribute('spellcheck', 'false');
    titleField.appendChild(titleInput);
    const titleError = this.el('div', 'form-error');
    titleError.id = 'title-error';
    titleError.textContent = 'Please enter a title';
    titleField.appendChild(titleError);
    sheet.appendChild(titleField);

    // ── Key field ──
    const keyField = this.el('div', 'form-field');
    const keyLabel = this.el('label', 'form-label');
    keyLabel.textContent = 'Key';
    keyField.appendChild(keyLabel);
    const keyGrid = this.el('div', 'key-grid');
    keyGrid.id = 'key-grid';
    for (const [i, key] of KEYS.entries()) {
      const btn = this.el('button', i === 0 ? 'key-btn selected' : 'key-btn');
      btn.dataset.key = key;
      btn.textContent = key;
      btn.type = 'button';
      keyGrid.appendChild(btn);
    }
    keyField.appendChild(keyGrid);
    sheet.appendChild(keyField);

    // ── Mode field ──
    const modeField = this.el('div', 'form-field');
    const modeLabel = this.el('label', 'form-label');
    modeLabel.textContent = 'Mode';
    modeField.appendChild(modeLabel);
    const modeChips = this.el('div', 'mode-chips');
    modeChips.id = 'mode-chips';
    for (const [i, mode] of MODES.entries()) {
      const chip = this.el('button', i === 0 ? 'mode-chip selected' : 'mode-chip');
      chip.dataset.mode = mode.value;
      chip.textContent = mode.label;
      chip.type = 'button';
      modeChips.appendChild(chip);
    }
    modeField.appendChild(modeChips);
    sheet.appendChild(modeField);

    // ── BPM field ──
    const bpmField = this.el('div', 'form-field');
    const bpmLabel = this.el('label', 'form-label');
    bpmLabel.textContent = 'Tempo';
    bpmField.appendChild(bpmLabel);
    const bpmStepper = this.el('div', 'bpm-stepper');

    const bpmMinus = this.el('button', 'bpm-stepper-btn');
    bpmMinus.id = 'bpm-minus';
    bpmMinus.type = 'button';
    bpmMinus.textContent = '−';
    bpmMinus.setAttribute('aria-label', 'Decrease BPM');
    bpmStepper.appendChild(bpmMinus);

    const bpmInput = this.el('input', 'bpm-input');
    bpmInput.id = 'input-bpm';
    bpmInput.type = 'number';
    bpmInput.value = '90';
    bpmInput.min = '40';
    bpmInput.max = '200';
    bpmInput.setAttribute('inputmode', 'numeric');
    bpmInput.setAttribute('aria-label', 'BPM');
    bpmStepper.appendChild(bpmInput);

    const bpmPlus = this.el('button', 'bpm-stepper-btn');
    bpmPlus.id = 'bpm-plus';
    bpmPlus.type = 'button';
    bpmPlus.textContent = '+';
    bpmPlus.setAttribute('aria-label', 'Increase BPM');
    bpmStepper.appendChild(bpmPlus);

    bpmField.appendChild(bpmStepper);
    sheet.appendChild(bpmField);

    // ── Drum Pattern field ──
    const DRUM_OPTS = [
      { value: 'none',     label: 'None'      },
      { value: 'rock',     label: 'Rock'      },
      { value: 'reggae',   label: 'Reggae'    },
      { value: 'halftime', label: 'Half-time' },
      { value: 'funk',     label: 'Funk'      },
    ];
    const drumField = this.el('div', 'form-field');
    const drumLbl   = this.el('label', 'form-label');
    drumLbl.textContent = 'Drum Pattern';
    drumField.appendChild(drumLbl);
    const drumChips = this.el('div', 'mode-chips');
    drumChips.id = 'drum-pattern-chips';
    for (const dp of DRUM_OPTS) {
      const chip = this.el('button', 'mode-chip');
      chip.dataset.action = 'set-drum-pattern';
      chip.dataset.value  = dp.value;
      chip.textContent    = dp.label;
      chip.type           = 'button';
      drumChips.appendChild(chip);
    }
    drumField.appendChild(drumChips);
    sheet.appendChild(drumField);

    // ── Actions ──
    const createBtn = this.el('button', 'btn-primary');
    createBtn.id = 'btn-create-song';
    createBtn.textContent = 'Create Song';
    createBtn.type = 'button';
    sheet.appendChild(createBtn);

    const cancelBtn = this.el('button', 'btn-secondary');
    cancelBtn.id = 'btn-cancel-sheet';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.type = 'button';
    sheet.appendChild(cancelBtn);

    overlay.appendChild(sheet);
    return overlay;
  },

  openNewSongSheet() {
    const overlay = document.getElementById('sheet-overlay');
    const sheet   = document.getElementById('new-song-sheet');
    if (!overlay || !sheet) return;
    // Reset drum pattern to 'none' for a new song
    document.querySelectorAll('[data-action="set-drum-pattern"]').forEach((c) => {
      c.classList.toggle('selected', c.dataset.value === 'none');
    });
    overlay.classList.add('visible');
    sheet.classList.add('open');
    setTimeout(() => document.getElementById('input-title')?.focus(), 360);
  },

  closeNewSongSheet() {
    const overlay = document.getElementById('sheet-overlay');
    const sheet   = document.getElementById('new-song-sheet');
    if (!overlay || !sheet) return;
    overlay.classList.remove('visible');
    sheet.classList.remove('open');
    setTimeout(() => this._resetNewSongForm(), 360);
  },

  _resetNewSongForm() {
    const titleInput = document.getElementById('input-title');
    const bpmInput   = document.getElementById('input-bpm');
    if (titleInput) { titleInput.value = ''; titleInput.classList.remove('error'); }
    if (bpmInput)   { bpmInput.value = '90'; }
    document.getElementById('title-error')?.classList.remove('visible');
    // Reset key to C
    document.querySelectorAll('.key-btn').forEach((b) => {
      b.classList.toggle('selected', b.dataset.key === 'C');
    });
    // Reset mode to major
    document.querySelectorAll('.mode-chip').forEach((c) => {
      c.classList.toggle('selected', c.dataset.mode === 'major');
    });
  },

  // ── Song view screen (Phase 2) ────────────────────────────────────────

  showSongScreen(song) {
    // Deactivate list screen
    document.getElementById('screen-list')?.classList.remove('active');
    // Remove any existing song screen
    document.getElementById('screen-song')?.remove();

    const screen = this.el('div', 'screen active screen-song');
    screen.id = 'screen-song';

    // Black status bar backing
    screen.appendChild(this.el('div', 'top-bar'));

    // ── Header ──────────────────────────────────────────────────────
    const header = this.el('div', 'header');

    // Back button
    const backBtn = this.el('button', 'btn-back');
    backBtn.id = 'btn-back';
    backBtn.setAttribute('aria-label', 'Back to songs');
    backBtn.appendChild(this.svg('<polyline points="15 18 9 12 15 6"/>'));
    backBtn.appendChild(document.createTextNode('Songs'));
    header.appendChild(backBtn);

    // Centre: song title + meta
    const centre = this.el('div', 'header-center');
    const songTitleEl = this.el('div', 'header-song-title');
    songTitleEl.id = 'song-header-title';
    songTitleEl.textContent = song.title;
    centre.appendChild(songTitleEl);
    const songMetaEl = this.el('div', 'header-song-meta');
    songMetaEl.id = 'song-header-meta';
    songMetaEl.textContent = this._songMetaText(song);
    centre.appendChild(songMetaEl);
    header.appendChild(centre);

    // Right actions: song settings (mixer icon)
    const rightActions = this.el('div', 'song-view-header-actions');

    const mixerBtn = this.el('button', 'btn-icon');
    mixerBtn.id = 'btn-edit-meta';
    mixerBtn.setAttribute('aria-label', 'Song settings');
    mixerBtn.appendChild(this.svg(
      '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>' +
      '<line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>' +
      '<line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>' +
      '<line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>' +
      '<line x1="17" y1="16" x2="23" y2="16"/>'
    ));
    rightActions.appendChild(mixerBtn);

    header.appendChild(rightActions);
    screen.appendChild(header);

    // ── Song structure minimap ────────────────────────────────────────
    const minimapWrap = this.el('div', 'section-minimap-wrap');
    minimapWrap.id = 'section-minimap-wrap';
    const minimapIndicator = this.el('div', 'section-minimap-indicator');
    minimapIndicator.id = 'minimap-indicator';
    minimapWrap.appendChild(minimapIndicator);
    const minimapBar = this.el('div', 'section-minimap');
    minimapBar.id = 'section-minimap';
    minimapWrap.appendChild(minimapBar);
    screen.appendChild(minimapWrap);

    // ── Section overview bar (horizontally scrollable) ─────────────
    const overviewBar = this.el('div', 'section-overview');
    overviewBar.id = 'section-overview';
    screen.appendChild(overviewBar);

    // ── Scrollable section list ──────────────────────────────────────
    const content = this.el('div', 'scroll-content');
    const sectionList = this.el('div', 'section-list');
    sectionList.id = 'section-list';
    content.appendChild(sectionList);
    screen.appendChild(content);

    // ── Play pill (fixed, bottom-center) ─────────────────────────────
    const playFab = this.el('button', 'play-fab');
    playFab.id = 'btn-play-fab';
    playFab.setAttribute('aria-label', 'Play song');
    playFab.appendChild(this.svg('<polygon points="5 3 19 12 5 21 5 3"/>'));
    playFab.appendChild(document.createTextNode(' Play'));
    screen.appendChild(playFab);

    const app = document.getElementById('app');
    // Remove any leftover section sheet overlay from a previous song view
    document.getElementById('section-sheet-overlay')?.remove();
    app.appendChild(screen);

    // ── Section sheet overlay (persists for the lifetime of this song screen) ──
    app.appendChild(this._buildSectionSheetOverlay());

    // Bind back button
    backBtn.addEventListener('click', () => history.back());

    // Render sections + overview
    this.renderSectionList(song);
    this.renderOverviewBar(song);
    this.renderMinimap(song);
  },

  // Re-renders the entire section list for the current song
  renderSectionList(song) {
    const container = document.getElementById('section-list');
    if (!container) return;
    container.innerHTML = '';

    const sections = song.sections || [];

    if (sections.length > 0) {
      for (let i = 0; i < sections.length; i++) {
        container.appendChild(this._buildSectionCard(song.id, sections[i]));
      }
    }

    // Footer: total bars
    const totalBars = sections.reduce((sum, s) => sum + (s.bars || 0), 0);
    const footer = this.el('div', 'section-list-footer');
    footer.id = 'section-list-footer';
    footer.textContent = sections.length > 0 ? `Total: ${totalBars} bar${totalBars !== 1 ? 's' : ''}` : '';
    container.appendChild(footer);

    // Inline Add Section button (always visible at bottom of list)
    const addBtn = this.el('button', 'btn-add-section-inline');
    addBtn.dataset.action = 'add-section';
    addBtn.appendChild(this.svg(
      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
    ));
    addBtn.appendChild(document.createTextNode(' Add Section'));
    container.appendChild(addBtn);
  },

  // Updates just the footer bar count without re-rendering everything
  _updateBarFooter(sections) {
    const footer = document.getElementById('section-list-footer');
    if (!footer) return;
    const totalBars = sections.reduce((sum, s) => sum + (s.bars || 0), 0);
    footer.textContent = sections.length > 0 ? `Total: ${totalBars} bar${totalBars !== 1 ? 's' : ''}` : '';
  },

  _buildSectionCard(songId, section) {
    const wrapper = this.el('div', 'section-card-wrapper');
    wrapper.dataset.sectionId = section.id;

    // ── Header row (compact — tap to open section sheet) ──
    const header = this.el('div', 'section-card-header');
    header.dataset.action = 'open-section';
    header.dataset.sectionId = section.id;

    // Label
    const labelEl = this.el('span', 'section-card-label');
    labelEl.textContent = section.label || 'Section';
    header.appendChild(labelEl);

    // Bars pill
    const barsEl = this.el('span', 'section-card-bars');
    barsEl.textContent = `· ${section.bars || 8} bars`;
    header.appendChild(barsEl);

    // Chord preview
    const chordsEl = this.el('span', 'section-card-chords');
    const chordNames = (section.chords || []).map((c) => c.name).join('  ');
    chordsEl.textContent = chordNames || '—';
    header.appendChild(chordsEl);

    // Chevron (right-facing: indicates tapping opens a sheet)
    const chevron = this.el('span', 'section-chevron');
    chevron.appendChild(this.svg('<polyline points="9 18 15 12 9 6"/>'));
    header.appendChild(chevron);

    wrapper.appendChild(header);
    return wrapper;
  },

  _buildLabelPicker(songId, section) {
    const STANDARD_LABELS = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Solo', 'Interlude', 'Outro'];
    const currentLabel = section.label || 'Section';

    const wrap = this.el('div', 'label-picker');
    wrap.dataset.sectionId = section.id;

    const chipsWrap = this.el('div', 'label-chips');

    // Recents
    const recents = (State.recentLabels || []).filter(
      (r) => !STANDARD_LABELS.includes(r) || r === currentLabel
    ).slice(0, 3);

    if (recents.length > 0) {
      for (const r of recents) {
        const chip = this._makeLabelChip(r, r === currentLabel, songId, section.id);
        chipsWrap.appendChild(chip);
      }
      const sep = this.el('span', 'label-recents-divider');
      chipsWrap.appendChild(sep);
    }

    // Standard labels
    for (const lbl of STANDARD_LABELS) {
      const chip = this._makeLabelChip(lbl, lbl === currentLabel, songId, section.id);
      chipsWrap.appendChild(chip);
    }

    // Custom chip
    const customChip = this.el('button', 'label-chip custom-chip');
    customChip.textContent = 'Custom…';
    customChip.type = 'button';
    customChip.dataset.action = 'show-custom-label';
    customChip.dataset.sectionId = section.id;
    chipsWrap.appendChild(customChip);

    wrap.appendChild(chipsWrap);

    // Custom input (hidden until Custom… is tapped)
    const customWrap = this.el('div', 'label-custom-input-wrap');
    customWrap.id = `custom-label-wrap-${section.id}`;

    const customInput = this.el('input', 'label-custom-input');
    customInput.id = `custom-label-input-${section.id}`;
    customInput.type = 'text';
    customInput.placeholder = 'Label name';
    customInput.setAttribute('autocorrect', 'off');
    customInput.setAttribute('autocapitalize', 'words');
    customWrap.appendChild(customInput);

    const doneBtn = this.el('button', 'btn-custom-label-done');
    doneBtn.textContent = 'Done';
    doneBtn.type = 'button';
    doneBtn.dataset.action = 'apply-custom-label';
    doneBtn.dataset.sectionId = section.id;
    customWrap.appendChild(doneBtn);

    wrap.appendChild(customWrap);

    return wrap;
  },

  _makeLabelChip(label, isSelected, songId, sectionId) {
    const chip = this.el('button', isSelected ? 'label-chip selected' : 'label-chip');
    chip.type = 'button';
    chip.textContent = label;
    chip.dataset.action = 'set-label';
    chip.dataset.label = label;
    chip.dataset.sectionId = sectionId;
    return chip;
  },

  _buildBarControl(songId, section) {
    const BAR_QUICK = [4, 8, 12, 16];
    const currentBars = section.bars || 8;

    const wrap = this.el('div', 'bar-count-wrap');

    // Quick chips
    const chipsWrap = this.el('div', 'bar-chips');
    for (const n of BAR_QUICK) {
      const chip = this.el('button', n === currentBars ? 'bar-chip selected' : 'bar-chip');
      chip.type = 'button';
      chip.textContent = String(n);
      chip.dataset.action = 'set-bars-quick';
      chip.dataset.bars = n;
      chip.dataset.sectionId = section.id;
      chipsWrap.appendChild(chip);
    }
    wrap.appendChild(chipsWrap);

    // Stepper — reuse .bpm-stepper classes
    const stepper = this.el('div', 'bpm-stepper bar-stepper');

    const minusBtn = this.el('button', 'bpm-stepper-btn');
    minusBtn.type = 'button';
    minusBtn.textContent = '−';
    minusBtn.dataset.action = 'bars-minus';
    minusBtn.dataset.sectionId = section.id;
    minusBtn.setAttribute('aria-label', 'Fewer bars');
    if (currentBars <= 1) minusBtn.disabled = true;
    stepper.appendChild(minusBtn);

    const barInput = this.el('input', 'bpm-input');
    barInput.id = `bar-input-${section.id}`;
    barInput.type = 'number';
    barInput.value = currentBars;
    barInput.min = '1';
    barInput.max = '64';
    barInput.setAttribute('inputmode', 'numeric');
    barInput.setAttribute('aria-label', 'Bar count');
    barInput.dataset.sectionId = section.id;
    stepper.appendChild(barInput);

    const plusBtn = this.el('button', 'bpm-stepper-btn');
    plusBtn.type = 'button';
    plusBtn.textContent = '+';
    plusBtn.dataset.action = 'bars-plus';
    plusBtn.dataset.sectionId = section.id;
    plusBtn.setAttribute('aria-label', 'More bars');
    if (currentBars >= 64) plusBtn.disabled = true;
    stepper.appendChild(plusBtn);

    wrap.appendChild(stepper);
    return wrap;
  },

  // ── Phase 3: Chord entry ────────────────────────────────────────────────

  // Builds the full CHORDS section-row: title + strip + palette
  _buildChordRow(songId, section) {
    const row = this.el('div', 'section-row');
    const title = this.el('div', 'section-row-label');
    title.textContent = 'Chords';
    row.appendChild(title);
    row.appendChild(this._buildChordStrip(songId, section));
    row.appendChild(this._buildChordPalette(songId, section));
    return row;
  },

  // Builds the horizontal chord strip + the "+" add button
  _buildChordStrip(songId, section) {
    const song = State.activeSong;
    const wrap = this.el('div', 'chord-strip-wrap');

    const strip = this.el('div', 'chord-strip');
    strip.id = `chord-strip-${section.id}`;

    const chords = section.chords || [];
    if (chords.length === 0) {
      const empty = this.el('span', 'chord-strip-empty');
      empty.textContent = 'No chords yet';
      strip.appendChild(empty);
    } else {
      chords.forEach((chord) => {
        const inKey = song ? Theory.isChordInKey(chord.name, song.key, song.mode) : true;
        strip.appendChild(this._buildChordPill(songId, section.id, chord, inKey));
      });
    }
    wrap.appendChild(strip);

    // "+" toggle button
    const addBtn = this.el('button', 'btn-add-chord');
    if (State.activePaletteId === section.id) addBtn.classList.add('active');
    addBtn.type = 'button';
    addBtn.setAttribute('aria-label', 'Add chord');
    addBtn.dataset.action = 'toggle-palette';
    addBtn.dataset.sectionId = section.id;
    addBtn.appendChild(this.svg(
      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
      '0 0 24 24'
    ));
    wrap.appendChild(addBtn);
    return wrap;
  },

  // Builds the inline chord palette panel (open when State.activePaletteId === section.id)
  _buildChordPalette(songId, section) {
    const song = State.activeSong;
    const key  = song?.key  || 'C';
    const mode = song?.mode || 'major';
    const isOpen = State.activePaletteId === section.id;

    const palette = this.el('div', isOpen ? 'chord-palette open' : 'chord-palette');
    palette.id = `chord-palette-${section.id}`;

    // Header row: "KEY OF C MAJOR · Done"
    const hdr = this.el('div', 'chord-palette-header');
    const modeNames = { major: 'Major', minor: 'Minor', dorian: 'Dorian', mixolydian: 'Mixolydian' };
    const keyLbl = this.el('span', 'chord-palette-key-label');
    keyLbl.textContent = `Key of ${key} ${modeNames[mode] || mode}`;
    hdr.appendChild(keyLbl);
    const closeBtn = this.el('button', 'btn-close-palette');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Done';
    closeBtn.dataset.action = 'toggle-palette';
    closeBtn.dataset.sectionId = section.id;
    hdr.appendChild(closeBtn);
    palette.appendChild(hdr);

    const { diatonic, borrowed } = Theory.getPalette(key, mode);

    // Diatonic group (with Roman numeral badges)
    const dLabel = this.el('div', 'chord-palette-group-label');
    dLabel.textContent = 'Diatonic';
    palette.appendChild(dLabel);
    const dChips = this.el('div', 'chord-palette-chips');
    diatonic.forEach((name, i) => {
      const numeral = Theory.getDiatonicNumeral(mode, i);
      dChips.appendChild(this._buildPaletteChip(name, section.id, numeral));
    });
    palette.appendChild(dChips);

    // Borrowed group (only if non-empty after filtering)
    if (borrowed.length > 0) {
      const bLabel = this.el('div', 'chord-palette-group-label');
      bLabel.textContent = 'Borrowed';
      palette.appendChild(bLabel);
      const bChips = this.el('div', 'chord-palette-chips');
      borrowed.forEach((name) => {
        const numeral = Theory.getBorrowedNumeral(name, key);
        bChips.appendChild(this._buildPaletteChip(name, section.id, numeral));
      });
      palette.appendChild(bChips);
    }

    return palette;
  },

  // Builds a single palette chip button, optionally with a Roman numeral badge below.
  _buildPaletteChip(name, sectionId, numeral) {
    const chip = this.el('button', 'chord-palette-chip');
    chip.type = 'button';
    chip.dataset.action = 'add-chord';
    chip.dataset.sectionId = sectionId;
    chip.dataset.chordName = name;

    const nameEl = this.el('span', 'chip-name');
    nameEl.textContent = name;
    chip.appendChild(nameEl);

    if (numeral) {
      const badge = this.el('span', 'chip-numeral');
      badge.textContent = numeral;
      chip.appendChild(badge);
    }

    return chip;
  },

  // Builds a single chord pill (name + × remove button)
  _buildChordPill(songId, sectionId, chord, isInKey) {
    const pill = this.el('div', isInKey ? 'chord-pill' : 'chord-pill out-of-key');

    const name = this.el('span', 'chord-pill-name');
    name.textContent = chord.name;
    pill.appendChild(name);

    const removeBtn = this.el('button', 'chord-pill-remove');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `Remove ${chord.name}`);
    removeBtn.dataset.action = 'remove-chord';
    removeBtn.dataset.sectionId = sectionId;
    removeBtn.dataset.chordId = chord.id;
    removeBtn.appendChild(this.svg(
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      '0 0 24 24'
    ));
    pill.appendChild(removeBtn);
    return pill;
  },

  // Lightweight re-render of just the chord strip (called after add/remove).
  // Does NOT rebuild the full section card, preserving palette open state.
  _rerenderChordStrip(songId, sectionId) {
    const song = Data.getSong(songId);
    if (!song) return;
    const section = (song.sections || []).find((s) => s.id === sectionId);
    if (!section) return;

    const strip = document.getElementById(`chord-strip-${sectionId}`);
    if (strip) {
      strip.innerHTML = '';
      const chords = section.chords || [];
      if (chords.length === 0) {
        const empty = this.el('span', 'chord-strip-empty');
        empty.textContent = 'No chords yet';
        strip.appendChild(empty);
      } else {
        chords.forEach((chord) => {
          const inKey = Theory.isChordInKey(chord.name, song.key, song.mode);
          strip.appendChild(this._buildChordPill(songId, sectionId, chord, inKey));
        });
      }
    }

    // Sync collapsed header chord preview
    const wrapper = document.querySelector(`.section-card-wrapper[data-section-id="${sectionId}"]`);
    if (wrapper) {
      const preview = wrapper.querySelector('.section-card-chords');
      if (preview) {
        const names = (section.chords || []).map((c) => c.name).join('  ');
        preview.textContent = names || '—';
      }
    }

    // Sync overview bar chord preview for this section
    const overviewSeg = document.querySelector(
      `.section-overview-segment[data-section-id="${sectionId}"] .section-overview-segment-chords`
    );
    if (overviewSeg) {
      overviewSeg.textContent = (section.chords || []).map((c) => c.name).join('  ');
    }
  },

  // Renders the proportional section overview bar above the section list
  renderOverviewBar(song) {
    const container = document.getElementById('section-overview');
    if (!container) return;
    container.innerHTML = '';

    const sections = song.sections || [];
    if (sections.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    for (const section of sections) {
      const seg = this.el('button', 'section-overview-segment');
      seg.dataset.action = 'select-section-overview';
      seg.dataset.sectionId = section.id;

      const lbl = this.el('span', 'section-overview-segment-label');
      lbl.textContent = section.label || 'Section';
      seg.appendChild(lbl);

      const bars = this.el('span', 'section-overview-segment-bars');
      bars.textContent = String(section.bars || 8);
      seg.appendChild(bars);

      const chordNames = (section.chords || []).map((c) => c.name).join('  ');
      const chordsEl = this.el('span', 'section-overview-segment-chords');
      chordsEl.textContent = chordNames;
      seg.appendChild(chordsEl);

      container.appendChild(seg);
    }
  },

  // No-op kept for compatibility — overview no longer has an inline "active" state.
  updateOverviewActiveState() {},

  // Minimap — grey-tone color per section type
  _minimapColor(label) {
    const map = {
      'Intro': '#c8c8c5', 'Verse': '#ddddd9', 'Pre-Chorus': '#d4d4d0',
      'Chorus': '#b8b8b4', 'Bridge': '#a8a8a4', 'Solo': '#c0c0bc',
      'Interlude': '#ccccc8', 'Outro': '#c8c8c5', 'Section': '#d0d0cc',
    };
    return map[label] || '#d0d0cc';
  },

  // Render the minimap blocks (proportional to bar count, full-width, non-scrollable)
  renderMinimap(song) {
    const container = document.getElementById('section-minimap');
    const wrap = document.getElementById('section-minimap-wrap');
    if (!container || !wrap) return;
    container.innerHTML = '';

    const sections = song.sections || [];
    if (sections.length === 0) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';

    const totalBars = sections.reduce((sum, s) => sum + (s.bars || 0), 0);
    for (const section of sections) {
      const pct = totalBars > 0
        ? ((section.bars || 0) / totalBars) * 100
        : 100 / sections.length;
      const block = this.el('div', 'section-minimap-block');
      block.style.width = `${pct}%`;
      block.style.background = this._minimapColor(section.label);
      container.appendChild(block);
    }
    this._updateMinimapIndicator();
  },

  // Update the red indicator line position/width based on overview bar scroll
  _updateMinimapIndicator() {
    const overview = document.getElementById('section-overview');
    const indicator = document.getElementById('minimap-indicator');
    const wrap = document.getElementById('section-minimap-wrap');
    if (!overview || !indicator || !wrap) return;

    const scrollWidth = overview.scrollWidth;
    const clientWidth = overview.clientWidth;
    const scrollLeft  = overview.scrollLeft;
    const wrapWidth   = wrap.clientWidth;

    if (scrollWidth <= clientWidth) {
      // Everything visible — indicator spans full width
      indicator.style.left  = '0px';
      indicator.style.width = `${wrapWidth}px`;
      return;
    }

    const visibleFraction = clientWidth / scrollWidth;
    const scrollFraction  = scrollLeft / scrollWidth;
    indicator.style.width = `${visibleFraction * wrapWidth}px`;
    indicator.style.left  = `${scrollFraction * wrapWidth}px`;
  },

  _songMetaText(song) {
    const drumLabel = { rock:'Rock', reggae:'Reggae', halftime:'Half-time', funk:'Funk' }[song.drumPattern];
    return `${song.key} ${this.modeLabel(song.mode)} · ${song.bpm} BPM`
      + (drumLabel ? ` · ${drumLabel}` : '');
  },

  // Update the song header title and meta without re-rendering the whole screen
  updateSongHeader(song) {
    const titleEl = document.getElementById('song-header-title');
    const metaEl  = document.getElementById('song-header-meta');
    if (titleEl) titleEl.textContent = song.title;
    if (metaEl)  metaEl.textContent = this._songMetaText(song);
  },

  // Phase 4/5 — Update play/stop UI without re-rendering any screens.
  // Called by app.js whenever playback state changes.
  updatePlaybackUI(isPlaying, playingSectionId) {
    // 1. Play pill (bottom-center)
    const fab = document.getElementById('btn-play-fab');
    if (fab) {
      fab.innerHTML = '';
      if (isPlaying) {
        fab.appendChild(this.svg(
          '<rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" stroke="none"/>'
        ));
        fab.appendChild(document.createTextNode(' Stop'));
        fab.classList.add('active');
        fab.setAttribute('aria-label', 'Stop song');
      } else {
        fab.appendChild(this.svg('<polygon points="5 3 19 12 5 21 5 3"/>'));
        fab.appendChild(document.createTextNode(' Play'));
        fab.classList.remove('active');
        fab.setAttribute('aria-label', 'Play song');
      }
    }

    // 2. Overview bar segments — highlight the playing section
    document.querySelectorAll('.section-overview-segment').forEach((seg) => {
      const isThis = isPlaying && seg.dataset.sectionId === playingSectionId;
      seg.classList.toggle('playing', isThis);
      // Auto-scroll the playing section into view
      if (isThis) {
        seg.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
        setTimeout(() => this._updateMinimapIndicator(), 250);
      }
    });

    // 3. Section play button inside the open sheet (if any)
    document.querySelectorAll('[data-action="play-section"]').forEach((btn) => {
      const isThisSection = isPlaying && btn.dataset.sectionId === playingSectionId;
      btn.innerHTML = '';
      if (isThisSection) {
        btn.appendChild(this.svg(
          '<rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" stroke="none"/>'
        ));
        btn.appendChild(document.createTextNode('Stop'));
        btn.classList.add('playing');
      } else {
        btn.appendChild(this.svg('<polygon points="5 3 19 12 5 21 5 3"/>'));
        btn.appendChild(document.createTextNode('Play'));
        btn.classList.remove('playing');
      }
    });
  },

  showListScreen() {
    document.getElementById('screen-song')?.remove();
    document.getElementById('section-sheet-overlay')?.remove();
    document.getElementById('screen-list')?.classList.add('active');
  },

  // ── Phase 5: Section Sheet ─────────────────────────────────────────────

  // Builds the persistent section sheet overlay DOM.
  // Called once per song screen session from showSongScreen().
  _buildSectionSheetOverlay() {
    const overlay = this.el('div', 'sheet-overlay');
    overlay.id = 'section-sheet-overlay';
    const sheet = this.el('div', 'bottom-sheet');
    sheet.id = 'section-sheet';
    overlay.appendChild(sheet);
    return overlay;
  },

  // Opens the section sheet (animation only — call populateSectionSheet first).
  openSectionSheet() {
    const overlay = document.getElementById('section-sheet-overlay');
    const sheet   = document.getElementById('section-sheet');
    if (!overlay || !sheet) return;
    overlay.classList.add('visible');
    sheet.classList.add('open');
  },

  // Closes the section sheet.
  closeSectionSheet() {
    const overlay = document.getElementById('section-sheet-overlay');
    const sheet   = document.getElementById('section-sheet');
    if (!overlay || !sheet) return;
    overlay.classList.remove('visible');
    sheet.classList.remove('open');
  },

  // Populates #section-sheet with the given section's edit controls.
  // Does NOT animate open — call openSectionSheet() separately for that.
  populateSectionSheet(songId, sectionId) {
    const song = Data.getSong(songId);
    if (!song) return;
    const section = (song.sections || []).find((s) => s.id === sectionId);
    if (!section) return;

    const sheet = document.getElementById('section-sheet');
    if (!sheet) return;
    sheet.innerHTML = '';

    // Handle
    const handle = this.el('div', 'sheet-handle');
    sheet.appendChild(handle);

    // ── Sheet header: label + close button ──
    const hdr = this.el('div', 'section-sheet-header');

    const labelPill = this.el('span', 'section-sheet-label-pill');
    labelPill.textContent = section.label || 'Section';
    hdr.appendChild(labelPill);

    const closeBtn = this.el('button', 'btn-icon');
    closeBtn.id = 'btn-close-section-sheet';
    closeBtn.dataset.action = 'close-section-sheet';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.appendChild(this.svg(
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
    ));
    hdr.appendChild(closeBtn);
    sheet.appendChild(hdr);

    // ── Label row ──
    const labelRow = this.el('div', 'section-row');
    const labelRowTitle = this.el('div', 'section-row-label');
    labelRowTitle.textContent = 'Label';
    labelRow.appendChild(labelRowTitle);
    labelRow.appendChild(this._buildLabelPicker(songId, section));
    sheet.appendChild(labelRow);

    // ── Bars row ──
    const barsRow = this.el('div', 'section-row');
    const barsRowTitle = this.el('div', 'section-row-label');
    barsRowTitle.textContent = 'Bars';
    barsRow.appendChild(barsRowTitle);
    barsRow.appendChild(this._buildBarControl(songId, section));
    sheet.appendChild(barsRow);

    // ── Chords row ──
    const chordRow = this.el('div', 'section-row');
    const chordTitle = this.el('div', 'section-row-label');
    chordTitle.textContent = 'Chords';
    chordRow.appendChild(chordTitle);

    const chords = section.chords || [];
    const paletteOpen = State.activePaletteId === section.id;

    if (chords.length === 0 && !paletteOpen) {
      // No chords yet: show a prominent "Add Chords" text button
      const addChordsBtn = this.el('button', 'btn-add-chords');
      addChordsBtn.dataset.action = 'toggle-palette';
      addChordsBtn.dataset.sectionId = section.id;
      addChordsBtn.appendChild(this.svg(
        '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
      ));
      addChordsBtn.appendChild(document.createTextNode(' Add Chords'));
      chordRow.appendChild(addChordsBtn);
    } else {
      // Has chords (or palette is open): show chord strip
      chordRow.appendChild(this._buildChordStrip(songId, section));
    }

    // Chord palette (shown when activePaletteId matches)
    chordRow.appendChild(this._buildChordPalette(songId, section));
    sheet.appendChild(chordRow);

    // ── Action buttons ──
    const actions = this.el('div', 'section-actions');

    const playAction = this.el('button', 'btn-section-action');
    playAction.dataset.action    = 'play-section';
    playAction.dataset.sectionId = section.id;
    if (State.isPlaying && State.playbackSectionId === section.id) {
      playAction.appendChild(this.svg(
        '<rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" stroke="none"/>'
      ));
      playAction.appendChild(document.createTextNode('Stop'));
      playAction.classList.add('playing');
    } else {
      if (chords.length === 0) playAction.classList.add('inactive');
      playAction.appendChild(this.svg('<polygon points="5 3 19 12 5 21 5 3"/>'));
      playAction.appendChild(document.createTextNode('Play'));
    }
    actions.appendChild(playAction);

    actions.appendChild(this.el('div', 'section-action-sep'));

    const dupAction = this.el('button', 'btn-section-action');
    dupAction.dataset.action    = 'duplicate-section';
    dupAction.dataset.sectionId = section.id;
    dupAction.appendChild(this.svg(
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
    ));
    dupAction.appendChild(document.createTextNode('Duplicate'));
    actions.appendChild(dupAction);

    actions.appendChild(this.el('div', 'section-action-sep'));

    const delAction = this.el('button', 'btn-section-action destructive');
    delAction.dataset.action    = 'delete-section';
    delAction.dataset.sectionId = section.id;
    delAction.appendChild(this.svg(
      '<polyline points="3 6 5 6 21 6"/>' +
      '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
      '<path d="M10 11v6"/><path d="M14 11v6"/>' +
      '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'
    ));
    delAction.appendChild(document.createTextNode('Delete'));
    actions.appendChild(delAction);

    sheet.appendChild(actions);
  },

  // Updates the play FAB enabled/disabled state based on whether any section has chords.
  updatePlayFabState(song) {
    const fab = document.getElementById('btn-play-fab');
    if (!fab) return;
    const hasChords = (song.sections || []).some((s) => (s.chords || []).length > 0);
    fab.disabled = !hasChords;
    fab.title = hasChords ? 'Play song' : 'Add chords to sections first';
  },
};
