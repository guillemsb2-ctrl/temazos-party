import { ensureAnonymousAuth, db, ref, get } from './firebase-client.js';
import { renderHome, renderMyRooms, renderRoom, showToast, setAuthPill } from './ui.js';
import { GENRE_META } from './songs-data.js';
import { MODES, safeUpperRoom, readStorage, writeStorage, roomShareUrl, clamp } from './utils.js';
import { createRoom, joinRoom, subscribeRoom, markPresence, leaveRoom, updateRoomSettings, resetScores, closeRoom, addCustomSong, removeCustomSong } from './room-service.js';
import { startMatch, createNextRound, startTimer, submitGuess, revealRound, nextRoundStep, adjustRoundPoints, forceTimeUp } from './game-service.js';

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
};

async function boot() {
  bindVisibilityLeave();
  state.authUser = await ensureAnonymousAuth();
  setAuthPill('Firebase OK');
  renderHomeView();
  autoJoinFromUrl();
}

function renderHomeView() {
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

  const myRooms = [];
  for (const code of myRoomCodes.slice(-10)) {
    try {
      const snap = await get(ref(db, `rooms/${code}`));
      if (snap.exists()) {
        myRooms.push(snap.val());
      }
    } catch (err) {
      console.warn(`Failed to load room ${code}:`, err?.message);
    }
  }

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

function bindRoomEvents() {
  document.getElementById('btn-submit-guess')?.addEventListener('click', handleSubmitGuess);
  document.getElementById('btn-share-room')?.addEventListener('click', handleShareRoom);
  document.getElementById('btn-copy-link')?.addEventListener('click', handleCopyLink);
  document.getElementById('guess-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmitGuess(); });

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

  document.querySelectorAll('[data-room-genre]').forEach((button) => {
    button.addEventListener('click', async () => {
      const key = button.dataset.roomGenre;
      let activeGenres = state.room?.meta?.activeGenres || ['pop'];
      activeGenres = activeGenres.includes(key) ? activeGenres.filter((g) => g !== key) : [...activeGenres, key];
      if (!activeGenres.length) activeGenres = ['pop'];
      await updateRoomSettings(state.roomCode, { activeGenres });
    });
  });
  document.querySelectorAll('[data-room-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const key = button.dataset.roomMode;
      await updateRoomSettings(state.roomCode, { mode: key, targetScore: MODES[key].targetScore });
    });
  });
  document.querySelectorAll('[data-adjust-player]').forEach((button) => {
    button.addEventListener('click', async () => runSafe(async () => {
      await adjustRoundPoints(state.roomCode, button.dataset.adjustPlayer, Number(button.dataset.delta));
    }));
  });

  document.getElementById('btn-add-song')?.addEventListener('click', async () => runSafe(async () => {
    const urlInput = document.getElementById('custom-song-url');
    const titleInput = document.getElementById('custom-song-title');
    const yearInput = document.getElementById('custom-song-year');
    const genreSelect = document.getElementById('custom-song-genre');
    const songUrl = (urlInput?.value || '').trim();
    const songTitle = (titleInput?.value || '').trim();
    const songYear = Number(yearInput?.value);
    const songGenre = genreSelect?.value || 'pop';
    if (!songUrl) return showToast('Introduce una URL');
    if (!songTitle) return showToast('Introduce el título');
    if (!songYear || songYear < 1900 || songYear > 2099) return showToast('Introduce un año válido');
    await addCustomSong(state.roomCode, { url: songUrl, title: songTitle, year: songYear, genre: songGenre });
    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';
    if (yearInput) yearInput.value = '';
    showToast('Canción añadida');
  }));

  document.querySelectorAll('[data-remove-song]').forEach((button) => {
    button.addEventListener('click', async () => runSafe(async () => {
      await removeCustomSong(state.roomCode, button.dataset.removeSong);
      showToast('Canción eliminada');
    }));
  });
}

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
  state.roomUnsub = subscribeRoom(roomCode, async (room) => {
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
    if (state.playerId) await markPresence(roomCode, state.playerId);
    renderRoom({ room, currentPlayerId: state.playerId, isModerator: isModerator(), remainingSeconds: computeRemainingSeconds(room) });
    bindRoomEvents();
    watchTimer(room);
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
