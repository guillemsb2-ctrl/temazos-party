import { ensureAnonymousAuth, db, ref, get, set } from './firebase-client.js';
import { renderHome, renderMyRooms, renderLobby, renderGame, showToast, setAuthPill } from './ui.js';
import { renderConfigView } from './config-view.js';
import { GENRE_META } from './songs-data.js';
import { MODES, safeUpperRoom, readStorage, writeStorage, roomShareUrl, clamp, uid } from './utils.js';
import { createRoom, joinRoom, subscribeRoom, markPresence, leaveRoom, updateRoomSettings, resetScores, closeRoom, addCustomSong, removeCustomSong } from './room-service.js';
import { startMatch, createNextRound, startTimer, submitGuess, revealRound, nextRoundStep, adjustRoundPoints, forceTimeUp } from './game-service.js';
import { loadSavedPlaylists, parsePlaylistText } from './playlist-editor.js';

const state = {
  authUser: null,
  selectedMode: readStorage('temazos.ui.mode', 'bala') || 'bala',
  selectedGenres: readStorage('temazos.ui.genres', ['pop', 'rock']) || ['pop', 'rock'],
  roomCode: null,
  room: null,
  playerId: null,
  moderatorToken: null,
  roomUnsub: null,
  timerTick: null,
  remainingSeconds: 35,
  currentView: 'home',
};

async function boot() {
  bindVisibilityLeave();
  state.authUser = await ensureAnonymousAuth();
  setAuthPill('Firebase OK');
  renderHomeView();
  autoJoinFromUrl();
}

function renderHomeView() {
  state.currentView = 'home';
  const inviteRoomCode = getRequestedRoomCode();
  renderHome({
    selectedMode: state.selectedMode,
    selectedGenres: state.selectedGenres,
    lastRoom: readStorage('temazos.lastRoom', null),
    inviteRoomCode,
    myRooms: [],
  });
  document.getElementById('phase-pill').textContent = 'HOME';

  const storedName = readStorage('temazos.profile', {}).name || '';
  document.getElementById('home-name').value = storedName;
  document.getElementById('home-room-code').value = inviteRoomCode || '';

  if (inviteRoomCode) {
    document.getElementById('home-room-code').readOnly = true;
    const joinBtn = document.getElementById('btn-join-room');
    if (joinBtn) {
      joinBtn.textContent = `Unirse a ${inviteRoomCode}`;
      joinBtn.classList.remove('secondary');
      joinBtn.classList.add('primary');
    }
    document.getElementById('home-name').focus();
  }

  document.getElementById('btn-create-room').addEventListener('click', handleCreateRoom);
  document.getElementById('btn-join-room').addEventListener('click', handleJoinRoom);
  document.getElementById('home-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleJoinRoom(); });
  document.getElementById('home-room-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleJoinRoom(); });

  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedMode = button.dataset.mode;
      writeStorage('temazos.ui.mode', state.selectedMode);
      renderHomeView();
    });
  });
  document.querySelectorAll('[data-genre]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.genre;
      if (state.selectedGenres.includes(key)) {
        state.selectedGenres = state.selectedGenres.filter((v) => v !== key);
      } else {
        state.selectedGenres = [...state.selectedGenres, key];
      }
      if (!state.selectedGenres.length) state.selectedGenres = ['pop'];
      writeStorage('temazos.ui.genres', state.selectedGenres);
      renderHomeView();
    });
  });

  const lastRoomButton = document.getElementById('btn-last-room');
  if (lastRoomButton) {
    lastRoomButton.addEventListener('click', () => {
      const lastRoom = readStorage('temazos.lastRoom', null);
      if (!lastRoom?.roomCode) return;
      document.getElementById('home-room-code').value = lastRoom.roomCode;
      document.getElementById('home-room-code').readOnly = false;
      if (!document.getElementById('home-name').value && lastRoom.playerName) {
        document.getElementById('home-name').value = lastRoom.playerName;
      }
    });
  }

  loadMyRooms();
}

async function loadMyRooms() {
  const myRoomCodes = readStorage('temazos.myRooms', []);
  if (!myRoomCodes.length) return;

  const results = await Promise.allSettled(
    myRoomCodes.slice(-10).map(async (code) => {
      const snap = await get(ref(db, `rooms/${code}`));
      return snap.exists() ? snap.val() : null;
    })
  );
  const myRooms = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);

  renderMyRooms(myRooms);

  document.querySelectorAll('[data-room-code]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.roomCode;
      if (!code) return;
      const nameInput = document.getElementById('home-name');
      const codeInput = document.getElementById('home-room-code');
      if (codeInput) {
        codeInput.value = code;
        codeInput.readOnly = false;
      }
      if (nameInput && !nameInput.value) {
        const profile = readStorage('temazos.profile', {});
        if (profile.name) nameInput.value = profile.name;
      }
    });
  });
}

/* ── VIEW: LOBBY ── */

function showLobbyView() {
  state.currentView = 'lobby';
  document.getElementById('phase-pill').textContent = 'LOBBY';
  renderLobby({
    room: state.room,
    currentPlayerId: state.playerId,
    isModerator: isModerator(),
  });
  bindLobbyEvents();
}

function bindLobbyEvents() {
  document.getElementById('btn-share-room')?.addEventListener('click', handleShareRoom);
  document.getElementById('btn-copy-link')?.addEventListener('click', handleCopyLink);

  if (!isModerator()) return;

  document.getElementById('btn-start-match')?.addEventListener('click', async () => runSafe(async () => {
    await pushImportedSongsToFirebase();
    await startMatch(state.roomCode);
    showToast('Partida iniciada');
    showGameView();
  }));

  document.getElementById('btn-go-config')?.addEventListener('click', () => {
    showConfigView();
  });

  document.getElementById('btn-reset-match')?.addEventListener('click', async () => runSafe(async () => {
    await resetScores(state.roomCode, state.room?.players || {});
    showToast('Sala reiniciada');
  }));

  document.getElementById('btn-close-room')?.addEventListener('click', async () => runSafe(async () => {
    await closeRoom(state.roomCode);
    showToast('Sala cerrada');
  }));
}

/* ── VIEW: CONFIG ── */

function showConfigView() {
  state.currentView = 'config';
  document.getElementById('phase-pill').textContent = 'CONFIG';
  const view = document.getElementById('main-view');
  renderConfigView(view, {
    room: state.room,
    roomCode: state.roomCode,
    onBack: () => showLobbyView(),
    onSaveSettings: async (patch) => {
      await runSafe(async () => {
        await updateRoomSettings(state.roomCode, patch);
        showToast('Configuración guardada');
      });
    },
    onSaveSongs: async (genreKey, validSongs) => {
      await runSafe(async () => {
        await saveSongsToFirebase(genreKey, validSongs);
        showToast(`${validSongs.length} canciones de ${genreKey} guardadas`);
      });
    },
  });
}

async function saveSongsToFirebase(genreKey, validSongs) {
  for (const song of validSongs) {
    const songKey = uid('song');
    await set(ref(db, `rooms/${state.roomCode}/customSongs/${songKey}`), {
      id: songKey,
      url: song.url,
      title: song.title,
      year: Number(song.year),
      genre: genreKey,
      addedAt: Date.now(),
    });
  }
}

async function pushImportedSongsToFirebase() {
  const saved = loadSavedPlaylists(state.roomCode);
  const existingCustom = state.room?.customSongs ? Object.values(state.room.customSongs) : [];
  const existingUrls = new Set(existingCustom.map((s) => s.url));

  for (const [genreKey, text] of Object.entries(saved)) {
    if (!text) continue;
    const { valid } = parsePlaylistText(text);
    for (const song of valid) {
      if (existingUrls.has(song.url)) continue;
      existingUrls.add(song.url);
      const songKey = uid('song');
      await set(ref(db, `rooms/${state.roomCode}/customSongs/${songKey}`), {
        id: songKey,
        url: song.url,
        title: song.title,
        year: Number(song.year),
        genre: genreKey,
        addedAt: Date.now(),
      });
    }
  }
}

/* ── VIEW: GAME ── */

function showGameView() {
  state.currentView = 'game';
  renderGame({
    room: state.room,
    currentPlayerId: state.playerId,
    isModerator: isModerator(),
    remainingSeconds: computeRemainingSeconds(state.room),
  });
  bindGameEvents();
  watchTimer(state.room);
}

function bindGameEvents() {
  document.getElementById('btn-submit-guess')?.addEventListener('click', handleSubmitGuess);
  document.getElementById('btn-share-room')?.addEventListener('click', handleShareRoom);
  document.getElementById('btn-copy-link')?.addEventListener('click', handleCopyLink);
  document.getElementById('guess-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmitGuess(); });

  document.getElementById('btn-back-lobby')?.addEventListener('click', () => showLobbyView());
  document.getElementById('btn-back-lobby-mod')?.addEventListener('click', () => showLobbyView());

  if (!isModerator()) return;

  document.getElementById('btn-start-match')?.addEventListener('click', async () => runSafe(async () => {
    await startMatch(state.roomCode);
    showToast('Partida iniciada');
  }));
  document.getElementById('btn-new-round')?.addEventListener('click', async () => runSafe(async () => {
    await createNextRound(state.roomCode);
    clearGuessInput();
    showToast('Nueva ronda lista');
  }));
  document.getElementById('btn-open-song')?.addEventListener('click', () => openSongLink());
  document.getElementById('btn-start-timer')?.addEventListener('click', async () => runSafe(async () => {
    await startTimer(state.roomCode, state.room);
    showToast('Temporizador en marcha');
  }));
  document.getElementById('btn-reveal-round')?.addEventListener('click', async () => runSafe(async () => {
    await revealRound(state.roomCode);
    showToast('Ronda revelada');
  }));
  document.getElementById('btn-next-round')?.addEventListener('click', async () => runSafe(async () => {
    await nextRoundStep(state.roomCode);
    clearGuessInput();
    showToast('Lista para la siguiente ronda');
  }));
  document.getElementById('btn-reset-match')?.addEventListener('click', async () => runSafe(async () => {
    await resetScores(state.roomCode, state.room?.players || {});
    showToast('Sala reiniciada');
  }));
  document.getElementById('btn-close-room')?.addEventListener('click', async () => runSafe(async () => {
    await closeRoom(state.roomCode);
    showToast('Sala cerrada');
  }));

  document.querySelectorAll('[data-adjust-player]').forEach((button) => {
    button.addEventListener('click', async () => runSafe(async () => {
      await adjustRoundPoints(state.roomCode, button.dataset.adjustPlayer, Number(button.dataset.delta));
    }));
  });
}

/* ── ROOM CONNECTION ── */

async function handleCreateRoom() {
  const playerName = sanitizeName(document.getElementById('home-name').value);
  if (!playerName) return failName();
  writeStorage('temazos.profile', { name: playerName });
  const { roomCode, playerId, moderatorToken } = await createRoom({
    playerName,
    ownerUid: state.authUser.uid,
    selectedMode: state.selectedMode,
    activeGenres: state.selectedGenres,
  });
  state.roomCode = roomCode;
  state.playerId = playerId;
  state.moderatorToken = moderatorToken;

  const myRooms = readStorage('temazos.myRooms', []);
  if (!myRooms.includes(roomCode)) {
    myRooms.push(roomCode);
    if (myRooms.length > 20) myRooms.shift();
    writeStorage('temazos.myRooms', myRooms);
  }

  connectToRoom(roomCode);
}

async function handleJoinRoom() {
  const playerName = sanitizeName(document.getElementById('home-name').value);
  const roomCode = safeUpperRoom(document.getElementById('home-room-code').value);
  if (!playerName) return failName();
  if (!roomCode) return showToast('Pon un código de sala');
  writeStorage('temazos.profile', { name: playerName });
  const { playerId, moderatorToken } = await joinRoom({ roomCode, authUid: state.authUser.uid, playerName });
  state.roomCode = roomCode;
  state.playerId = playerId;
  state.moderatorToken = moderatorToken;
  connectToRoom(roomCode);
}

function connectToRoom(roomCode) {
  if (state.roomUnsub) state.roomUnsub();
  state.roomCode = roomCode;
  history.replaceState({}, '', roomShareUrl(roomCode));

  let presenceMarked = false;
  let renderTimer = null;
  let lastRoomJson = '';

  state.roomUnsub = subscribeRoom(roomCode, (room) => {
    if (!room) {
      showToast('La sala ya no existe');
      state.room = null;
      renderHomeView();
      return;
    }
    state.room = room;
    if (!state.playerId) {
      const saved = readStorage(`temazos.identity.${roomCode}`, null);
      state.playerId = saved?.playerId || null;
      state.moderatorToken = saved?.moderatorToken || null;
    }

    if (state.playerId && !presenceMarked) {
      presenceMarked = true;
      markPresence(roomCode, state.playerId);
    }

    const fingerprint = roomFingerprint(room);
    if (fingerprint === lastRoomJson) return;
    lastRoomJson = fingerprint;

    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      const status = room?.meta?.status || 'lobby';
      const isGameActive = ['round_ready', 'round_timer_running', 'round_time_up', 'round_revealed', 'match_finished'].includes(status);

      if (state.currentView === 'config') {
        return;
      }

      if (isGameActive) {
        showGameView();
      } else {
        showLobbyView();
      }
    }, 80);
  });
}

function roomFingerprint(room) {
  const meta = room?.meta || {};
  const round = room?.currentRound || {};
  const players = room?.players || {};
  return JSON.stringify({
    s: meta.status, m: meta.mode, t: meta.targetScore, tb: meta.isTieBreak,
    cl: meta.closed, ag: meta.activeGenres,
    rn: round.roundNumber, ph: round.phase, si: round.songId,
    st: round.songTitle, cy: round.correctYear,
    tr: round.timer?.running, te: round.timer?.endsAt,
    an: round.answers, rs: round.results,
    pl: Object.fromEntries(
      Object.entries(players).map(([id, p]) => [id, { n: p.name, sc: p.score, c: p.connected }])
    ),
  });
}

function watchTimer(room) {
  clearInterval(state.timerTick);
  const meta = room?.meta || {};
  const timer = room?.currentRound?.timer || {};
  state.remainingSeconds = computeRemainingSeconds(room);
  if (meta.status !== 'round_timer_running' || !timer.endsAt) return;
  state.timerTick = setInterval(async () => {
    state.remainingSeconds = computeRemainingSeconds(state.room);
    const display = document.getElementById('timer-display');
    if (display) display.textContent = String(state.remainingSeconds);
    if (state.remainingSeconds <= 0) {
      clearInterval(state.timerTick);
      if (isModerator()) {
        await forceTimeUp(state.roomCode, state.room);
      }
    }
  }, 500);
}

async function handleSubmitGuess() {
  const input = document.getElementById('guess-input');
  const guessYear = Number(input.value);
  if (!guessYear) return showToast('Escribe un año válido');
  await runSafe(async () => {
    await submitGuess(state.roomCode, state.playerId, guessYear, state.room);
    showToast('Respuesta enviada');
  });
}

async function handleShareRoom() {
  const url = state.room?.meta?.shareUrl || roomShareUrl(state.roomCode);
  const shareData = { title: 'TEMAZOS ROOMS', text: `Únete a mi sala ${state.roomCode}`, url };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
  } catch {}
  await fallbackCopy(url);
}

async function handleCopyLink() {
  const url = state.room?.meta?.shareUrl || roomShareUrl(state.roomCode);
  await fallbackCopy(url);
}

async function fallbackCopy(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copiado');
    return;
  } catch {}
  window.prompt('Copia este enlace:', url);
}

function openSongLink() {
  const songUrl = state.room?.currentRound?.songUrl;
  if (!songUrl) return showToast('No hay canción cargada');
  const opened = window.open(songUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    fallbackCopy(songUrl);
    showToast('El navegador bloqueó la apertura. Link copiado.');
  }
}

function isModerator() {
  const meta = state.room?.meta || {};
  return Boolean(state.playerId && meta.moderatorId === state.playerId);
}

function computeRemainingSeconds(room) {
  const timer = room?.currentRound?.timer || {};
  if (!timer.endsAt) return 35;
  return clamp(Math.ceil((timer.endsAt - Date.now()) / 1000), 0, timer.duration || 35);
}

function sanitizeName(name) {
  return String(name || '').trim().slice(0, 18);
}

function failName() {
  showToast('Escribe tu nombre primero');
  document.getElementById('home-name')?.focus();
}

function getRequestedRoomCode() {
  return safeUpperRoom(new URLSearchParams(window.location.search).get('room') || '');
}

function autoJoinFromUrl() {
  const code = getRequestedRoomCode();
  if (!code) return;
  const input = document.getElementById('home-room-code');
  if (input) input.value = code;

  const storedName = readStorage('temazos.profile', {}).name || '';
  if (storedName) {
    document.getElementById('home-name').value = storedName;
  }
}

function clearGuessInput() {
  const input = document.getElementById('guess-input');
  if (input) input.value = '';
}

async function runSafe(fn) {
  try {
    await fn();
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Ha ocurrido un error');
  }
}

function bindVisibilityLeave() {
  window.addEventListener('beforeunload', () => {
    if (state.roomCode && state.playerId) leaveRoom(state.roomCode, state.playerId);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.roomCode && state.playerId) {
      leaveRoom(state.roomCode, state.playerId);
    }
    if (document.visibilityState === 'visible' && state.roomCode && state.playerId) {
      markPresence(state.roomCode, state.playerId);
    }
  });
}

boot().catch((error) => {
  console.error(error);
  setAuthPill('Error Firebase');
  showToast('No se pudo iniciar la app');
});