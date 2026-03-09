import { readStorage, writeStorage } from './utils.js';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function parsePlaylistText(text) {
  const lines = text.split('\n');
  const valid = [];
  const errors = [];
  const seenUrls = new Set();
  let duplicateCount = 0;

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;

    const lineNum = idx + 1;
    const firstPipe = line.indexOf('|');
    const secondPipe = firstPipe >= 0 ? line.indexOf('|', firstPipe + 1) : -1;

    if (firstPipe < 0 || secondPipe < 0) {
      errors.push({ line: lineNum, reason: 'Formato inválido — se esperan 3 campos separados por |' });
      return;
    }

    const url = line.slice(0, firstPipe).trim();
    const yearStr = line.slice(firstPipe + 1, secondPipe).trim();
    const title = line.slice(secondPipe + 1).trim();
    const year = Number(yearStr);

    if (!url) {
      errors.push({ line: lineNum, reason: 'URL inválida — debe contener http(s)://' });
      return;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('bad protocol');
      }
    } catch {
      errors.push({ line: lineNum, reason: 'URL inválida — debe contener http(s)://' });
      return;
    }

    if (!yearStr || isNaN(year) || year < 1900 || year > 2099) {
      errors.push({ line: lineNum, reason: 'Año inválido — debe ser un número entre 1900 y 2099' });
      return;
    }

    if (!title) {
      errors.push({ line: lineNum, reason: 'Falta el título' });
      return;
    }

    if (seenUrls.has(url)) {
      duplicateCount++;
      return;
    }

    seenUrls.add(url);
    valid.push({ url, year, title });
  });

  return { valid, errors, duplicateCount };
}

export function loadSavedPlaylists(roomCode) {
  return readStorage(`temazos.playlists.${roomCode}`, {});
}

export function savePlaylists(roomCode, data) {
  writeStorage(`temazos.playlists.${roomCode}`, data);
}

export function renderPlaylistEditor(container, { genres, roomCode, onSave }) {
  container.innerHTML = '';

  const saved = loadSavedPlaylists(roomCode);

  Object.values(genres).forEach((genre) => {
    const block = document.createElement('div');
    block.className = 'playlist-block card';

    const safeKey = genre.key.replace(/[^a-zA-Z0-9_-]/g, '');
    const headerId = `playlist-header-${safeKey}`;
    const bodyId = `playlist-body-${safeKey}`;
    const textareaId = `playlist-ta-${safeKey}`;
    const counterId = `playlist-counter-${safeKey}`;
    const errorsId = `playlist-errors-${safeKey}`;

    const savedText = saved[genre.key] || '';

    block.innerHTML = `
      <div class="playlist-header" id="${headerId}" role="button" tabindex="0">
        <span class="playlist-genre-label">${escapeHtml(genre.emoji)} ${escapeHtml(genre.label)}</span>
        <span class="playlist-toggle">▼</span>
      </div>
      <div class="playlist-body" id="${bodyId}" style="display:none">
        <div class="field-block">
          <textarea
            id="${textareaId}"
            class="playlist-textarea"
            rows="8"
            placeholder="Pega canciones aquí...\nFormato: URL | AÑO | TÍTULO"
          >${escapeHtml(savedText)}</textarea>
        </div>
        <div class="playlist-counter helper-line" id="${counterId}">0 canciones válidas</div>
        <div class="playlist-errors" id="${errorsId}"></div>
        <div class="playlist-actions">
          <button type="button" class="btn secondary" data-action="validate" data-genre="${escapeHtml(genre.key)}">Validar</button>
          <button type="button" class="btn primary" data-action="save" data-genre="${escapeHtml(genre.key)}">Guardar</button>
          <button type="button" class="btn danger" data-action="clear" data-genre="${escapeHtml(genre.key)}">Limpiar</button>
        </div>
      </div>
    `;

    container.appendChild(block);

    const header = block.querySelector(`#${headerId}`);
    const body = block.querySelector(`#${bodyId}`);

    header.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      header.querySelector('.playlist-toggle').textContent = open ? '▼' : '▲';
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });

    const textarea = block.querySelector(`#${textareaId}`);

    const runValidation = () => {
      const result = parsePlaylistText(textarea.value);
      const counterEl = block.querySelector(`#${counterId}`);
      const errorsEl = block.querySelector(`#${errorsId}`);

      let counterText = `${result.valid.length} canciones válidas`;
      if (result.duplicateCount > 0) {
        counterText += ` · ${result.duplicateCount} duplicadas ignoradas`;
      }
      counterEl.textContent = counterText;

      if (result.errors.length > 0) {
        errorsEl.innerHTML = result.errors
          .map(e => `<div class="playlist-error-line">Línea ${e.line}: ${escapeHtml(e.reason)}</div>`)
          .join('');
      } else {
        errorsEl.innerHTML = '';
      }

      return result;
    };

    block.querySelector('[data-action="validate"]').addEventListener('click', () => {
      runValidation();
    });

    block.querySelector('[data-action="save"]').addEventListener('click', () => {
      const result = runValidation();
      const all = loadSavedPlaylists(roomCode);
      all[genre.key] = textarea.value;
      savePlaylists(roomCode, all);
      if (onSave) onSave(genre.key, result.valid);
    });

    block.querySelector('[data-action="clear"]').addEventListener('click', () => {
      textarea.value = '';
      block.querySelector(`#${counterId}`).textContent = '0 canciones válidas';
      block.querySelector(`#${errorsId}`).innerHTML = '';
      const all = loadSavedPlaylists(roomCode);
      delete all[genre.key];
      savePlaylists(roomCode, all);
    });

    if (savedText) {
      runValidation();
    }
  });
}
