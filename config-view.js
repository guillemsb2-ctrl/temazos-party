import { GENRE_META, getSongsByGenres } from './songs-data.js';
import { MODES } from './utils.js';
import { renderPlaylistEditor, loadSavedPlaylists, parsePlaylistText } from './playlist-editor.js';
import { renderPromptBuilder } from './prompt-builder.js';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function chipButton({ text, active, attrs = {} }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `chip${active ? ' active' : ''}`;
  button.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => button.setAttribute(k, v));
  return button;
}

function segmentButton({ text, active, attrs = {} }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `segment${active ? ' active' : ''}`;
  button.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => button.setAttribute(k, v));
  return button;
}

export function renderConfigView(container, { room, roomCode, onBack, onSaveSettings, onSaveSongs }) {
  container.innerHTML = '';

  const meta = room?.meta || {};
  const activeGenres = meta.activeGenres || ['pop'];
  const currentMode = meta.mode || 'bala';

  const wrap = document.createElement('div');
  wrap.className = 'config-view';
  wrap.innerHTML = `
    <section class="card config-header-card">
      <div class="config-head-row">
        <div>
          <span class="eyebrow neon">⚙️ configuración</span>
          <h2 class="config-title">Panel del moderador</h2>
          <p class="helper-line">Configura la partida. Los cambios se aplicarán a la sala <strong>${escapeHtml(meta.roomCode || roomCode)}</strong>.</p>
        </div>
        <button class="btn secondary" id="config-btn-back">← Volver al lobby</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head compact">
        <span class="eyebrow">modo de juego</span>
        <h3>Selecciona el modo</h3>
      </div>
      <div class="segmented" id="config-mode-picker"></div>
    </section>

    <section class="card">
      <div class="card-head compact">
        <span class="eyebrow">géneros / listas</span>
        <h3>Listas activas</h3>
      </div>
      <div class="chip-wrap" id="config-genre-picker"></div>
    </section>

    <section class="card">
      <div class="card-head compact">
        <span class="eyebrow neon">📋 importador masivo</span>
        <h3>Gestor de listas / Importador masivo</h3>
        <p class="helper-line">Pega bloques de canciones generados por IA. Formato: URL | AÑO | TÍTULO</p>
      </div>
      <div id="config-playlist-editor"></div>
    </section>

    <div id="config-prompt-builder"></div>

    <section class="card" id="config-summary-section">
      <div class="card-head compact">
        <span class="eyebrow gold">📊 resumen</span>
        <h3>Resumen del pool de canciones</h3>
      </div>
      <div id="config-summary"></div>
    </section>

    <section class="config-bottom-bar">
      <button class="btn secondary" id="config-btn-back-bottom">← Volver al lobby</button>
    </section>
  `;

  container.appendChild(wrap);

  const modePicker = wrap.querySelector('#config-mode-picker');
  Object.values(MODES).forEach((mode) => {
    modePicker.appendChild(segmentButton({
      text: `${mode.label} · ${mode.targetScore}`,
      active: mode.key === currentMode,
      attrs: { 'data-config-mode': mode.key },
    }));
  });

  const genrePicker = wrap.querySelector('#config-genre-picker');
  Object.values(GENRE_META).forEach((genre) => {
    genrePicker.appendChild(chipButton({
      text: `${genre.emoji} ${genre.label}`,
      active: activeGenres.includes(genre.key),
      attrs: { 'data-config-genre': genre.key, 'data-key': genre.key },
    }));
  });

  wrap.querySelectorAll('[data-config-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.configMode;
      onSaveSettings({ mode: key, targetScore: MODES[key].targetScore });
      wrap.querySelectorAll('[data-config-mode]').forEach((b) => b.classList.toggle('active', b.dataset.configMode === key));
    });
  });

  wrap.querySelectorAll('[data-config-genre]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.configGenre;
      let genres = [...activeGenres];
      if (genres.includes(key)) {
        genres = genres.filter((g) => g !== key);
      } else {
        genres.push(key);
      }
      if (!genres.length) genres = ['pop'];
      onSaveSettings({ activeGenres: genres });
      wrap.querySelectorAll('[data-config-genre]').forEach((b) => {
        b.classList.toggle('active', genres.includes(b.dataset.configGenre));
      });
      activeGenres.length = 0;
      activeGenres.push(...genres);
      updateSummary();
    });
  });

  const editorContainer = wrap.querySelector('#config-playlist-editor');
  renderPlaylistEditor(editorContainer, {
    genres: GENRE_META,
    onSave: (genreKey, validSongs) => {
      if (onSaveSongs) onSaveSongs(genreKey, validSongs);
      updateSummary();
    },
  });

  const promptContainer = wrap.querySelector('#config-prompt-builder');
  renderPromptBuilder(promptContainer, { genres: GENRE_META });

  function updateSummary() {
    const summaryEl = wrap.querySelector('#config-summary');
    if (!summaryEl) return;

    const saved = loadSavedPlaylists();
    const customSongs = room?.customSongs ? Object.values(room.customSongs) : [];
    let totalImported = 0;
    let totalDuplicates = 0;
    let emptyActiveGenres = [];
    const genreRows = [];

    Object.values(GENRE_META).forEach((genre) => {
      const builtIn = getSongsByGenres([genre.key]);
      const text = saved[genre.key] || '';
      const parsed = text ? parsePlaylistText(text) : { valid: [], duplicateCount: 0 };
      const customForGenre = customSongs.filter((s) => s.genre === genre.key);
      const totalForGenre = builtIn.length + parsed.valid.length + customForGenre.length;
      const isActive = activeGenres.includes(genre.key);

      totalImported += parsed.valid.length;
      totalDuplicates += parsed.duplicateCount;

      if (isActive && totalForGenre === 0) {
        emptyActiveGenres.push(genre);
      }

      genreRows.push(`
        <div class="summary-row ${isActive ? 'active' : 'inactive'}">
          <span>${escapeHtml(genre.emoji)} ${escapeHtml(genre.label)}</span>
          <span>${totalForGenre} cancion${totalForGenre !== 1 ? 'es' : ''}</span>
          <span class="summary-status">${isActive ? '✅ activa' : '—'}</span>
        </div>
      `);
    });

    const totalBuiltIn = getSongsByGenres(activeGenres).length;
    const totalCustom = customSongs.filter((s) => activeGenres.includes(s.genre)).length;

    const activeImported = Object.values(GENRE_META)
      .filter((g) => activeGenres.includes(g.key))
      .reduce((sum, g) => {
        const text = saved[g.key] || '';
        const parsed = text ? parsePlaylistText(text) : { valid: [] };
        return sum + parsed.valid.length;
      }, 0);

    const totalPool = totalBuiltIn + totalCustom + activeImported;

    let warnings = '';
    if (emptyActiveGenres.length) {
      warnings = `<div class="summary-warning">⚠️ Géneros activos sin canciones: ${emptyActiveGenres.map((g) => `${g.emoji} ${g.label}`).join(', ')}</div>`;
    }

    summaryEl.innerHTML = `
      <div class="summary-grid-stats">
        <div class="mini-card"><span>Pool total activo</span><strong>${totalPool}</strong></div>
        <div class="mini-card"><span>Built-in activas</span><strong>${totalBuiltIn}</strong></div>
        <div class="mini-card"><span>Importadas</span><strong>${totalImported}</strong></div>
        <div class="mini-card"><span>Custom Firebase</span><strong>${totalCustom}</strong></div>
        <div class="mini-card"><span>Duplicadas eliminadas</span><strong>${totalDuplicates}</strong></div>
        <div class="mini-card"><span>Ya jugadas</span><strong>${Object.keys(room?.usedSongIds || {}).length}</strong></div>
      </div>
      ${warnings}
      <div class="summary-genre-list">${genreRows.join('')}</div>
    `;
  }

  updateSummary();

  wrap.querySelector('#config-btn-back').addEventListener('click', () => onBack());
  wrap.querySelector('#config-btn-back-bottom').addEventListener('click', () => onBack());
}
