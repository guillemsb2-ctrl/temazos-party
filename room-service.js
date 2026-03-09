import { db, ref, set, update, get, onValue, remove, onDisconnect, serverTimestamp } from './firebase-client.js';
import { MODES, randomCode, uid, roomShareUrl, ensureUniqueName, writeStorage, readStorage } from './utils.js';

export function subscribeRoom(roomCode, callback) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  return onValue(roomRef, (snap) => callback(snap.val() || null));
}

export async function roomExists(roomCode) {
  const snap = await get(ref(db, `rooms/${roomCode}/meta`));
  return snap.exists();
}

export async function generateUniqueRoomCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = randomCode();
    if (!(await roomExists(code))) return code;
  }
  return `${randomCode()}${Math.floor(Math.random() * 10)}`;
}

export async function createRoom({ playerName, ownerUid, selectedMode, activeGenres }) {
  const roomCode = await generateUniqueRoomCode();
  const playerId = uid('player');
  const moderatorToken = uid('host');
  const shareUrl = roomShareUrl(roomCode);
  const mode = MODES[selectedMode] || MODES.bala;
  const payload = {
    meta: {
      roomCode,
      createdAt: Date.now(),
      createdBy: ownerUid,
      moderatorId: playerId,
      moderatorToken,
      status: 'lobby',
      mode: mode.key,
      targetScore: mode.targetScore,
      activeGenres,
      shareUrl,
      isTieBreak: false,
      closed: false,
    },
    players: {
      [playerId]: {
        id: playerId,
        authUid: ownerUid,
        name: playerName,
        score: 0,
        joinedAt: Date.now(),
        connected: true,
        isModerator: true,
      },
    },
    currentRound: {
      roundNumber: 0,
      phase: 'lobby',
      songId: '',
      songUrl: '',
      songTitle: '',
      correctYear: null,
      timer: { duration: 35, startedAt: null, endsAt: null, running: false },
      answers: {},
      results: {},
    },
    usedSongIds: {},
    customSongs: {},
    history: {},
  };
  await set(ref(db, `rooms/${roomCode}`), payload);
  writeStorage(`temazos.identity.${roomCode}`, { playerId, playerName, moderatorToken });
  writeStorage('temazos.lastRoom', { roomCode, playerName });
  return { roomCode, playerId, moderatorToken };
}

export async function joinRoom({ roomCode, authUid, playerName }) {
  const roomSnap = await get(ref(db, `rooms/${roomCode}`));
  if (!roomSnap.exists()) throw new Error('Sala no encontrada');
  const room = roomSnap.val();
  if (room?.meta?.closed) throw new Error('La sala está cerrada');

  const saved = readStorage(`temazos.identity.${roomCode}`, null);
  let playerId = saved?.playerId;
  const playersMap = room.players || {};

  if (playerId && playersMap[playerId]) {
    const finalName = ensureUniqueName(playerName, playersMap, playerId);
    await update(ref(db, `rooms/${roomCode}/players/${playerId}`), {
      name: finalName,
      connected: true,
      authUid,
    });
    writeStorage(`temazos.identity.${roomCode}`, { ...saved, playerId, playerName: finalName });
    writeStorage('temazos.lastRoom', { roomCode, playerName: finalName });
    return { roomCode, playerId, moderatorToken: saved?.moderatorToken || null };
  }

  playerId = uid('player');
  const finalName = ensureUniqueName(playerName, playersMap, null);
  const isModerator = Boolean(saved?.moderatorToken && saved.moderatorToken === room?.meta?.moderatorToken);

  await set(ref(db, `rooms/${roomCode}/players/${playerId}`), {
    id: playerId,
    authUid,
    name: finalName,
    score: 0,
    joinedAt: Date.now(),
    connected: true,
    isModerator,
  });

  if (isModerator) {
    await update(ref(db, `rooms/${roomCode}/meta`), { moderatorId: playerId });
  }

  writeStorage(`temazos.identity.${roomCode}`, {
    playerId,
    playerName: finalName,
    moderatorToken: saved?.moderatorToken || null,
  });
  writeStorage('temazos.lastRoom', { roomCode, playerName: finalName });
  return { roomCode, playerId, moderatorToken: saved?.moderatorToken || null };
}

export async function markPresence(roomCode, playerId) {
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
  try {
    await update(playerRef, { connected: true, lastSeen: serverTimestamp() });
    const disconnectRef = onDisconnect(playerRef);
    await disconnectRef.update({ connected: false, lastSeen: serverTimestamp() });
  } catch (err) {
    console.warn('markPresence failed:', err?.message);
  }
}

export async function leaveRoom(roomCode, playerId) {
  if (!roomCode || !playerId) return;
  try {
    await update(ref(db, `rooms/${roomCode}/players/${playerId}`), { connected: false });
  } catch (err) {
    console.warn('leaveRoom failed:', err?.message);
  }
}

export async function removePlayer(roomCode, playerId) {
  if (!roomCode || !playerId) return;
  await remove(ref(db, `rooms/${roomCode}/players/${playerId}`));
}

export async function renamePlayer(roomCode, playerId, newName) {
  if (!roomCode || !playerId || !newName) return;
  const snap = await get(ref(db, `rooms/${roomCode}/players`));
  const playersMap = snap.val() || {};
  const safeName = ensureUniqueName(newName, playersMap, playerId);
  await update(ref(db, `rooms/${roomCode}/players/${playerId}`), { name: safeName });
}

export async function updateRoomSettings(roomCode, patch = {}) {
  await update(ref(db, `rooms/${roomCode}/meta`), patch);
}

export async function resetScores(roomCode, playersMap = {}) {
  const patch = {};
  Object.keys(playersMap).forEach((playerId) => {
    patch[`rooms/${roomCode}/players/${playerId}/score`] = 0;
  });
  patch[`rooms/${roomCode}/meta/status`] = 'lobby';
  patch[`rooms/${roomCode}/meta/isTieBreak`] = false;
  patch[`rooms/${roomCode}/currentRound`] = {
    roundNumber: 0,
    phase: 'lobby',
    songId: '',
    songUrl: '',
    songTitle: '',
    correctYear: null,
    timer: { duration: 35, startedAt: null, endsAt: null, running: false },
    answers: {},
    results: {},
  };
  patch[`rooms/${roomCode}/usedSongIds`] = {};
  await update(ref(db), patch);
}

export async function closeRoom(roomCode) {
  await update(ref(db, `rooms/${roomCode}/meta`), { closed: true, status: 'match_finished' });
}

export async function destroyRoom(roomCode) {
  await remove(ref(db, `rooms/${roomCode}`));
}

export async function addCustomSong(roomCode, { url, title, year, genre }) {
  const songKey = uid('song');
  await set(ref(db, `rooms/${roomCode}/customSongs/${songKey}`), {
    id: songKey,
    url,
    title,
    year: Number(year),
    genre,
    addedAt: Date.now(),
  });
}

export async function removeCustomSong(roomCode, songKey) {
  await remove(ref(db, `rooms/${roomCode}/customSongs/${songKey}`));
}
