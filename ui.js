import { GENRE_META, getSongsByGenres } from './songs-data.js';
import { MODES, statusLabel, sortPlayers, roomShareUrl } from './utils.js';

let qrInstance = null;

export function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
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

export function renderHome({ selectedMode, selectedGenres, lastRoom, inviteRoomCode, myRooms }) {
  const view = document.getElementById('main-view');
  const tpl = document.getElementById('home-template');
  view.innerHTML = '';
  view.appendChild(tpl.content.cloneNode(true));

  if (inviteRoomCode) {
    const banner = document.getElementById('invite-banner');
    banner.style.display = '';
    document.getElementById('invite-room-code').textContent = inviteRoomCode;
  }

  const modePicker = document.getElementById('mode-picker');
  Object.values(MODES).forEach((mode) => {
    modePicker.appendChild(segmentButton({ text: `${mode.label} · ${mode.targetScore}`, active: mode.key === selectedMode, attrs: { 'data-mode': mode.key } }));
  });

  const genrePicker = document.getElementById('genre-picker');
  Object.values(GENRE_META).forEach((genre) => {
    genrePicker.appendChild(chipButton({ text: `${genre.emoji} ${genre.label}`, active: selectedGenres.includes(genre.key), attrs: { 'data-genre': genre.key, 'data-key': genre.key } }));
  });

  const quick = document.getElementById('quick-room-slot');
  if (lastRoom?.roomCode) {
    quick.innerHTML = `<div class="quick-room">Última sala: <strong>${lastRoom.roomCode}</strong> · ${lastRoom.playerName || ''}<br><button class="btn secondary" id="btn-last-room" style="margin-top:10px">Rellenar última sala</button></div>`;
  }

  renderMyRooms(myRooms || []);
}

export function renderMyRooms(myRooms = []) {
  const section = document.getElementById('my-rooms-section');
  const list = document.getElementById('my-rooms-list');
  if (!section || !list) return;
  if (!myRooms.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  list.innerHTML = '';
  myRooms.forEach((room) => {
    const players = room.players || {};
    const playerArr = Object.values(players);
    const connectedCount = playerArr.filter((p) => p.connected).length;
    const totalCount = playerArr.length;
    const status = room.meta?.status || 'unknown';
    const closed = room.meta?.closed;
    const row = document.createElement('div');
    row.className = 'my-room-row';
    row.innerHTML = `
      <div class="my-room-info">
        <strong class="my-room-code">${escapeHtml(room.meta?.roomCode || '----')}</strong>
        <span class="my-room-status ${closed ? 'closed' : ''}">${closed ? 'Cerrada' : statusLabel(status)}</span>
      </div>
      <div class="my-room-players">
        <span class="connected-dot" style="opacity:${connectedCount > 0 ? 1 : .25}"></span>
        ${connectedCount}/${totalCount} jugadores
      </div>
      <div class="my-room-player-names">${playerArr.map((p) => escapeHtml(p.name || 'Jugador')).join(', ')}</div>
      <button class="btn secondary my-room-enter" data-room-code="${escapeHtml(room.meta?.roomCode || '')}">Entrar</button>
      ${closed ? `<button class="btn danger my-room-delete" data-delete-room="${escapeHtml(room.meta?.roomCode || '')}">🗑️ Borrar</button>` : ''}
    `;
    list.appendChild(row);
  });
}

/* ── LOBBY VIEW ── */

export function renderLobby({ room, currentPlayerId, isModerator }) {
  const view = document.getElementById('main-view');
  view.innerHTML = '';

  const meta = room.meta || {};
  const players = room.players || {};
  const sortedPlayers = sortPlayers(players);
  const totalCount = sortedPlayers.length;
  const connectedCount = sortedPlayers.filter((p) => p.connected).length;
  const activeGenres = meta.activeGenres || ['pop'];
  const shareUrl = meta.shareUrl || roomShareUrl(meta.roomCode || '');

  view.innerHTML = `
    <section class="card room-summary">
      <div class="room-head">
        <div>
          <span class="eyebrow">sala activa</span>
          <h2>TEMAZOS ROOM</h2>
          <p class="muted-text">${escapeHtml(shareUrl)}</p>
        </div>
        <div class="room-code-box">
          <span class="room-code-label">Código</span>
          <strong class="room-code-value">${escapeHtml(meta.roomCode || '----')}</strong>
        </div>
      </div>

      <div class="summary-grid">
        <div class="mini-card"><span>Modo</span><strong>${escapeHtml(MODES[meta.mode]?.label || meta.mode || 'Bala')}</strong></div>
        <div class="mini-card"><span>Objetivo</span><strong>${String(meta.targetScore || '-')}</strong></div>
        <div class="mini-card"><span>Jugadores</span><strong>${totalCount}</strong></div>
        <div class="mini-card"><span>Conectados</span><strong>${connectedCount}</strong></div>
      </div>

      <div class="share-wrap">
        <div class="share-buttons">
          <button class="btn secondary" id="btn-share-room">Compartir sala</button>
          <button class="btn secondary" id="btn-copy-link">Copiar link</button>
        </div>
        <div class="share-link-box">${escapeHtml(shareUrl)}</div>
        <div id="qr-box" class="qr-box"></div>
      </div>
    </section>

    ${isModerator ? `
    <section class="card">
      <div class="card-head compact">
        <span class="eyebrow">modo de juego</span>
        <h3>Tipo de partida</h3>
      </div>
      <div class="segmented" id="lobby-mode-picker"></div>
    </section>
    ` : ''}

    <section class="card">
      <div class="card-head compact">
        <span class="eyebrow">listas activas</span>
        <h3>Géneros seleccionados</h3>
      </div>
      <div class="chip-wrap lobby-genres-display">
        ${activeGenres.map((key) => {
          const g = GENRE_META[key];
          return g ? `<span class="chip active" data-key="${escapeHtml(key)}">${escapeHtml(g.emoji)} ${escapeHtml(g.label)}</span>` : '';
        }).join('')}
      </div>
    </section>

    <section class="card players-card">
      <div class="card-head compact">
        <span class="eyebrow">jugadores</span>
        <h3>Ranking en vivo (${totalCount})</h3>
        <p class="players-count-line">${connectedCount} conectado${connectedCount !== 1 ? 's' : ''} de ${totalCount} jugador${totalCount !== 1 ? 'es' : ''}</p>
      </div>
      <div id="players-list"></div>
    </section>

    ${isModerator ? `
    <section class="card moderator-card lobby-mod-card">
      <div class="card-head compact">
        <span class="eyebrow neon">moderador</span>
        <h3>Acciones</h3>
      </div>
      <div class="button-grid moderator-buttons">
        <button class="btn primary" id="btn-start-match">🎮 Iniciar partida</button>
        <button class="btn secondary" id="btn-go-config">⚙️ Configuración</button>
        <button class="btn secondary" id="btn-reset-match">🔄 Nueva partida</button>
        <button class="btn danger" id="btn-close-room">🚪 Cerrar sala</button>
        ${meta.closed ? '<button class="btn danger" id="btn-destroy-room">🗑️ Borrar sala</button>' : ''}
      </div>
    </section>
    ` : `
    <section class="card">
      <div class="card-head compact">
        <h3>Esperando al moderador…</h3>
        <p class="helper-line">El moderador iniciará la partida cuando todo esté listo.</p>
      </div>
    </section>
    `}
  `;

  const lobbyModePicker = view.querySelector('#lobby-mode-picker');
  if (lobbyModePicker) {
    Object.values(MODES).forEach((mode) => {
      lobbyModePicker.appendChild(segmentButton({
        text: `${mode.label} · ${mode.targetScore}`,
        active: mode.key === (meta.mode || 'bala'),
        attrs: { 'data-lobby-mode': mode.key },
      }));
    });
  }

  const playersList = view.querySelector('#players-list');
  renderPlayersList(playersList, sortedPlayers, currentPlayerId, null, isModerator);

  const qrBox = view.querySelector('#qr-box');
  if (typeof QRCode !== 'undefined' && qrBox) {
    qrBox.innerHTML = '';
    new QRCode(qrBox, { text: shareUrl, width: 112, height: 112 });
  }
}

/* ── GAME VIEW ── */

export function renderGame({ room, currentPlayerId, isModerator, remainingSeconds }) {
  const view = document.getElementById('main-view');
  view.innerHTML = '';

  const meta = room.meta || {};
  const round = room.currentRound || {};
  const players = room.players || {};
  const me = players[currentPlayerId];
  const sortedPlayers = sortPlayers(players);
  const totalCount = sortedPlayers.length;
  const connectedCount = sortedPlayers.filter((p) => p.connected).length;

  view.innerHTML = `
    <section class="game-status-bar card">
      <div class="game-status-row">
        <div class="game-status-item"><span class="eyebrow">sala</span><strong class="game-code">${escapeHtml(meta.roomCode || '')}</strong></div>
        <div class="game-status-item"><span class="eyebrow">modo</span><strong>${escapeHtml(MODES[meta.mode]?.label || 'Bala')}</strong></div>
        <div class="game-status-item"><span class="eyebrow">ronda</span><strong>${round.roundNumber || 0}</strong></div>
        <div class="game-status-item"><span class="eyebrow">estado</span><strong>${escapeHtml(statusLabel(meta.status, meta.isTieBreak))}</strong></div>
      </div>
    </section>

    <section class="grid-two">
      <div class="card players-card">
        <div class="card-head compact">
          <span class="eyebrow">jugadores</span>
          <h3>Ranking (${totalCount})</h3>
          <p class="players-count-line">${connectedCount} conectado${connectedCount !== 1 ? 's' : ''}</p>
        </div>
        <div id="players-list"></div>
      </div>

      <div class="card player-action-card">
        <div class="card-head compact">
          <span class="eyebrow">tu respuesta</span>
          <h3 id="round-title-display">${round.songTitle
            ? escapeHtml(round.songTitle)
            : 'Esperando ronda'}</h3>
        </div>
        ${round.songUrl ? `<div class="song-open-box"><button class="btn secondary" id="btn-open-song-player">🎵 Abrir canción</button></div>` : ''}
        <div class="timer-box">
          <div class="timer-ring">
            <span id="timer-display">${remainingSeconds}</span>
          </div>
          <p id="timer-hint">${escapeHtml(timerHint(meta.status))}</p>
        </div>
        <div class="answer-box">
          <input id="guess-input" type="number" inputmode="numeric" min="1900" max="2099" placeholder="Año" />
          <button class="btn primary" id="btn-submit-guess">Enviar año</button>
        </div>
        <div class="helper-line" id="answer-status"></div>
        <div id="round-reveal-box" class="reveal-box"></div>
      </div>
    </section>

    <section id="moderator-panel-slot"></section>
    <section id="winner-slot"></section>
  `;

  document.getElementById('phase-pill').textContent = statusLabel(meta.status, meta.isTieBreak).toUpperCase();

  const playersList = view.querySelector('#players-list');
  renderPlayersList(playersList, sortedPlayers, currentPlayerId, round, false, meta.status);

  const answerStatus = view.querySelector('#answer-status');
  const myAnswer = round.answers?.[currentPlayerId];
  answerStatus.textContent = myAnswer?.locked ? `Tu respuesta: ${myAnswer.guessYear}` : answerHint(meta.status, me, round, currentPlayerId);

  const guessInput = view.querySelector('#guess-input');
  const canAnswer = ['round_ready', 'round_timer_running'].includes(meta.status) && !myAnswer?.locked;
  guessInput.disabled = !canAnswer;
  view.querySelector('#btn-submit-guess').disabled = !canAnswer;

  const revealBox = view.querySelector('#round-reveal-box');
  if (['round_revealed', 'match_finished'].includes(meta.status) && round.songTitle) {
    revealBox.innerHTML = `
      <div class="song-title">${escapeHtml(round.songTitle)}</div>
      <div class="song-year">${round.correctYear}</div>
      <div class="helper-line">Resultados calculados automáticamente. El moderador puede ajustarlos.</div>
    `;
  }

  if (isModerator) {
    const modSlot = view.querySelector('#moderator-panel-slot');
    renderCompactModeratorPanel(modSlot, { room });
  }

  const winnerSlot = view.querySelector('#winner-slot');
  if (meta.status === 'match_finished') {
    const leaders = sortPlayers(players);
    const winner = leaders[0];
    winnerSlot.innerHTML = `
      <section class="card winner-card">
        <div class="winner-glow"></div>
        <span class="eyebrow gold">winner mode</span>
        <h2 class="winner-name">${escapeHtml(winner?.name || 'Ganador')}</h2>
        <p>${escapeHtml(meta.isTieBreak ? 'Ganó tras el desempate final.' : 'Ha conquistado la partida.')}</p>
        <div class="winner-ranking">${leaders.map((p, i) => `<div class="player-row"><div class="player-main"><div class="rank-badge">${i + 1}</div><div class="player-name-block"><div class="player-name">${escapeHtml(p.name)}</div></div></div><div class="score-box">${p.score || 0}</div></div>`).join('')}</div>
        <div style="margin-top:16px"><button class="btn secondary" id="btn-back-lobby">Volver al lobby</button></div>
      </section>
    `;
  }
}

/* ── COMPACT MODERATOR PANEL (game view only) ── */

function renderCompactModeratorPanel(container, { room }) {
  const meta = room.meta || {};
  const round = room.currentRound || {};

  container.innerHTML = `
    <section class="card moderator-card compact-mod">
      <div class="card-head compact">
        <span class="eyebrow neon">moderador</span>
        <h3>Control de ronda</h3>
      </div>

      <div class="button-grid moderator-buttons">
        <button class="btn secondary" id="btn-new-round">Nueva ronda</button>
        <button class="btn secondary" id="btn-open-song">Abrir canción</button>
        <button class="btn secondary" id="btn-start-timer">Iniciar 35s</button>
        <button class="btn gold" id="btn-reveal-round">Revelar</button>
        <button class="btn green" id="btn-next-round">Siguiente</button>
        <button class="btn secondary" id="btn-reset-match">Nueva partida</button>
        <button class="btn danger" id="btn-close-room">Cerrar sala</button>
        <button class="btn secondary" id="btn-back-lobby-mod">Volver al lobby</button>
      </div>

      <div class="song-link-panel" id="song-link-panel"></div>

      <div class="card-head compact top-gap">
        <span class="eyebrow">ajuste manual</span>
        <h3>Puntos de la ronda</h3>
      </div>
      <div id="adjustments-list"></div>
    </section>
  `;

  container.querySelector('#btn-new-round').disabled = !['round_ready', 'lobby', 'round_revealed'].includes(meta.status);
  container.querySelector('#btn-open-song').disabled = !round.songUrl;
  container.querySelector('#btn-start-timer').disabled = meta.status !== 'round_ready' || !round.songId;
  container.querySelector('#btn-reveal-round').disabled = !['round_ready', 'round_timer_running', 'round_time_up'].includes(meta.status) || !round.songId;
  container.querySelector('#btn-next-round').disabled = meta.status !== 'round_revealed';

  const songPanel = container.querySelector('#song-link-panel');
  if (round.songUrl) {
    const safeUrl = safeHref(round.songUrl);
    songPanel.innerHTML = `<div class="helper-line">Canción cargada:</div><div class="song-url"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(round.songTitle)}</a></div>`;
  } else {
    songPanel.innerHTML = '<div class="helper-line">Aún no hay canción cargada.</div>';
  }

  const adjustmentsList = container.querySelector('#adjustments-list');
  const results = round.results || {};
  const players = room.players || {};
  if (!Object.keys(results).length) {
    adjustmentsList.innerHTML = '<div class="helper-line">Los ajustes aparecerán después de revelar.</div>';
  } else {
    adjustmentsList.innerHTML = '';
    Object.entries(results).forEach(([playerId, result]) => {
      const player = players[playerId];
      const row = document.createElement('div');
      row.className = 'adjust-row';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(player?.name || 'Jugador')}</strong><br>
          <span class="helper-line">Auto ${result.autoPoints || 0} · ajuste ${signed(result.manualAdjustment || 0)} · final ${result.finalPoints || 0}</span>
        </div>
        <div class="adjust-controls">
          <button class="adjust-btn" data-adjust-player="${escapeHtml(playerId)}" data-delta="-1">-1</button>
          <button class="adjust-btn" data-adjust-player="${escapeHtml(playerId)}" data-delta="1">+1</button>
        </div>
      `;
      adjustmentsList.appendChild(row);
    });
  }
}

/* ── SHARED HELPERS ── */

function renderPlayersList(container, sortedPlayers, currentPlayerId, round, showModActions, gameStatus) {
  if (!container) return;
  if (!sortedPlayers.length) {
    container.innerHTML = '<p class="muted-text">Aún no hay jugadores. Comparte el enlace para que se unan.</p>';
    return;
  }
  container.innerHTML = '';
  const isAnsweringPhase = ['round_ready', 'round_timer_running', 'round_time_up'].includes(gameStatus);
  sortedPlayers.forEach((player, index) => {
    const roundResult = round?.results?.[player.id];
    const hasAnswered = isAnsweringPhase && !!round?.answers?.[player.id];
    const canManage = showModActions && !player.isModerator && player.id !== currentPlayerId;
    const row = document.createElement('div');
    row.className = `player-row${player.id === currentPlayerId ? ' is-me' : ''}${!player.connected ? ' disconnected' : ''}`;
    row.innerHTML = `
      <div class="player-main">
        <div class="rank-badge${index === 0 && (player.score || 0) > 0 ? ' rank-first' : ''}">${index + 1}</div>
        <div class="player-name-block">
          <div class="player-name">
            ${escapeHtml(player.name || 'Jugador')}
            ${player.isModerator ? '<span class="moderator-badge">👑 MOD</span>' : ''}
            ${player.id === currentPlayerId ? '<span class="you-badge">TÚ</span>' : ''}
          </div>
          <div class="player-meta">
            <span class="connected-dot" style="opacity:${player.connected ? 1 : .25}"></span>
            ${player.connected ? '<span class="connected-text">conectado</span>' : '<span class="disconnected-text">desconectado</span>'}
            ${hasAnswered ? '<span class="answered-badge">✓ respondido</span>' : ''}
            ${roundResult ? ` · ronda ${signed(roundResult.finalPoints || 0)}` : ''}
          </div>
        </div>
      </div>
      <div class="player-actions-wrap">
        ${canManage ? `
          <button class="player-action-btn rename-btn" data-rename-player="${escapeHtml(player.id)}" data-current-name="${escapeHtml(player.name || '')}" title="Cambiar nombre">✏️</button>
          <button class="player-action-btn kick-btn" data-kick-player="${escapeHtml(player.id)}" data-player-name="${escapeHtml(player.name || '')}" title="Expulsar jugador">🗑️</button>
        ` : ''}
        <div class="score-box">${player.score || 0}</div>
      </div>
    `;
    container.appendChild(row);
  });
}

export function setAuthPill(text) {
  document.getElementById('auth-pill').textContent = text;
}

function timerHint(status) {
  if (status === 'round_timer_running') return 'Cuenta atrás en marcha.';
  if (status === 'round_time_up') return 'Tiempo agotado. Esperando reveal.';
  if (status === 'round_revealed') return 'Ronda revelada.';
  if (status === 'match_finished') return 'Partida terminada.';
  return 'Esperando al moderador.';
}

function answerHint(status, me, round, currentPlayerId) {
  if (!me) return 'Aún no has entrado como jugador.';
  if (status === 'lobby') return 'La partida todavía no ha empezado.';
  if (!round.songId) return 'Esperando a que el moderador cargue una canción.';
  if (status === 'round_time_up') return 'Se cerró el tiempo para responder.';
  if (status === 'round_revealed') return 'Mira el resultado de la ronda.';
  if (status === 'match_finished') return 'La partida ha terminado.';
  return 'Escribe un año y pulsa enviar.';
}

function signed(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeHref(url = '') {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return escapeHtml(url);
    }
  } catch {}
  return '#';
}