import { GENRE_META } from './songs-data.js';
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

export function renderHome({ selectedMode, selectedGenres, lastRoom }) {
  const view = document.getElementById('main-view');
  const tpl = document.getElementById('home-template');
  view.innerHTML = '';
  view.appendChild(tpl.content.cloneNode(true));

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
}

export function renderRoom({ room, currentPlayerId, isModerator, remainingSeconds }) {
  const view = document.getElementById('main-view');
  const tpl = document.getElementById('room-template');
  view.innerHTML = '';
  view.appendChild(tpl.content.cloneNode(true));

  const meta = room.meta || {};
  const round = room.currentRound || {};
  const players = room.players || {};
  const me = players[currentPlayerId];
  const sortedPlayers = sortPlayers(players);

  document.getElementById('room-title').textContent = meta.isTieBreak ? 'TEMAZOS ROOM · DESEMPATE' : 'TEMAZOS ROOM';
  document.getElementById('room-subtitle').textContent = meta.shareUrl || roomShareUrl(meta.roomCode || '');
  document.getElementById('room-code-display').textContent = meta.roomCode || '----';
  document.getElementById('mode-display').textContent = MODES[meta.mode]?.label || meta.mode || 'Bala';
  document.getElementById('target-display').textContent = String(meta.targetScore || '-');
  document.getElementById('round-display').textContent = String(round.roundNumber || 0);
  document.getElementById('status-display').textContent = statusLabel(meta.status, meta.isTieBreak);
  document.getElementById('phase-pill').textContent = statusLabel(meta.status, meta.isTieBreak).toUpperCase();

  const shareBox = document.getElementById('share-link-box');
  shareBox.textContent = meta.shareUrl || roomShareUrl(meta.roomCode || '');

  const qrBox = document.getElementById('qr-box');
  qrBox.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    qrInstance = new QRCode(qrBox, { text: meta.shareUrl || roomShareUrl(meta.roomCode || ''), width: 112, height: 112 });
  }

  const playersList = document.getElementById('players-list');
  if (!sortedPlayers.length) {
    playersList.innerHTML = '<p class="muted-text">Aún no hay jugadores.</p>';
  } else {
    playersList.innerHTML = '';
    sortedPlayers.forEach((player, index) => {
      const roundResult = round?.results?.[player.id];
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <div class="player-main">
          <div class="rank-badge">${index + 1}</div>
          <div class="player-name-block">
            <div class="player-name">${escapeHtml(player.name || 'Jugador')}</div>
            <div class="player-meta">
              <span class="connected-dot" style="opacity:${player.connected ? 1 : .25}"></span>
              ${player.connected ? 'conectado' : 'desconectado'}
              ${player.isModerator ? '<span class="moderator-tag"> · moderador</span>' : ''}
              ${player.id === currentPlayerId ? ' · tú' : ''}
              ${roundResult ? ` · ronda ${signed(roundResult.finalPoints || 0)}` : ''}
            </div>
          </div>
        </div>
        <div class="score-box">${player.score || 0}</div>
      `;
      playersList.appendChild(row);
    });
  }

  document.getElementById('round-title-display').textContent = round.songTitle
    ? (meta.status === 'round_revealed' || meta.status === 'match_finished' ? round.songTitle : 'Canción cargada')
    : 'Esperando ronda';
  document.getElementById('timer-display').textContent = String(remainingSeconds);
  document.getElementById('timer-hint').textContent = timerHint(meta.status);

  const answerStatus = document.getElementById('answer-status');
  const myAnswer = round.answers?.[currentPlayerId];
  answerStatus.textContent = myAnswer?.locked ? `Tu respuesta: ${myAnswer.guessYear}` : answerHint(meta.status, me, round, currentPlayerId);

  const guessInput = document.getElementById('guess-input');
  const canAnswer = ['round_ready', 'round_timer_running'].includes(meta.status) && !myAnswer?.locked;
  guessInput.disabled = !canAnswer;
  document.getElementById('btn-submit-guess').disabled = !canAnswer;

  const revealBox = document.getElementById('round-reveal-box');
  revealBox.innerHTML = '';
  if (['round_revealed', 'match_finished'].includes(meta.status) && round.songTitle) {
    revealBox.innerHTML = `
      <div class="song-title">${escapeHtml(round.songTitle)}</div>
      <div class="song-year">${round.correctYear}</div>
      <div class="helper-line">Resultados calculados automáticamente. El moderador puede ajustarlos.</div>
    `;
  }

  const moderatorSlot = document.getElementById('moderator-panel-slot');
  moderatorSlot.innerHTML = '';
  if (isModerator) {
    const modTpl = document.getElementById('moderator-template');
    moderatorSlot.appendChild(modTpl.content.cloneNode(true));
    renderModeratorPanel({ room });
  }

  const winnerSlot = document.getElementById('winner-slot');
  winnerSlot.innerHTML = '';
  if (meta.status === 'match_finished') {
    const winnerTpl = document.getElementById('winner-template');
    winnerSlot.appendChild(winnerTpl.content.cloneNode(true));
    const leaders = sortPlayers(players);
    const winner = leaders[0];
    document.getElementById('winner-name').textContent = winner?.name || 'Ganador';
    document.getElementById('winner-subtitle-text').textContent = meta.isTieBreak ? 'Ganó tras el desempate final.' : 'Ha conquistado la partida.';
    document.getElementById('winner-ranking').innerHTML = leaders.map((p, i) => `<div class="player-row"><div class="player-main"><div class="rank-badge">${i + 1}</div><div class="player-name-block"><div class="player-name">${escapeHtml(p.name)}</div></div></div><div class="score-box">${p.score || 0}</div></div>`).join('');
  }
}

export function renderModeratorPanel({ room }) {
  const meta = room.meta || {};
  const round = room.currentRound || {};

  const roomGenrePicker = document.getElementById('room-genre-picker');
  Object.values(GENRE_META).forEach((genre) => {
    roomGenrePicker.appendChild(chipButton({ text: `${genre.emoji} ${genre.label}`, active: (meta.activeGenres || []).includes(genre.key), attrs: { 'data-room-genre': genre.key, 'data-key': genre.key } }));
  });

  const roomModePicker = document.getElementById('room-mode-picker');
  Object.values(MODES).forEach((mode) => {
    roomModePicker.appendChild(segmentButton({ text: `${mode.label} · ${mode.targetScore}`, active: meta.mode === mode.key, attrs: { 'data-room-mode': mode.key } }));
  });

  document.getElementById('btn-start-match').disabled = meta.status !== 'lobby';
  document.getElementById('btn-new-round').disabled = !['round_ready', 'lobby', 'round_revealed'].includes(meta.status);
  document.getElementById('btn-open-song').disabled = !round.songUrl;
  document.getElementById('btn-start-timer').disabled = meta.status !== 'round_ready' || !round.songId;
  document.getElementById('btn-reveal-round').disabled = !['round_ready', 'round_timer_running', 'round_time_up'].includes(meta.status) || !round.songId;
  document.getElementById('btn-next-round').disabled = meta.status !== 'round_revealed';

  const songPanel = document.getElementById('song-link-panel');
  if (round.songUrl) {
    songPanel.innerHTML = `<div class="helper-line">Canción cargada:</div><div class="song-url"><a href="${round.songUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(round.songTitle)}</a></div>`;
  } else {
    songPanel.innerHTML = '<div class="helper-line">Aún no hay canción cargada.</div>';
  }

  const adjustmentsList = document.getElementById('adjustments-list');
  const results = round.results || {};
  const players = room.players || {};
  if (!Object.keys(results).length) {
    adjustmentsList.innerHTML = '<div class="helper-line">Los ajustes aparecerán después de revelar.</div>';
    return;
  }
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
        <button class="adjust-btn" data-adjust-player="${playerId}" data-delta="-1">-1</button>
        <button class="adjust-btn" data-adjust-player="${playerId}" data-delta="1">+1</button>
      </div>
    `;
    adjustmentsList.appendChild(row);
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
