import { db, ref, update, get } from './firebase-client.js';
import { ROOM_TIMER_SECONDS, MODES, calculatePoints, sortPlayers } from './utils.js';
import { getSongsByGenres } from './songs-data.js';

function pickUnusedSong(room) {
  const activeGenres = room?.meta?.activeGenres || ['pop'];
  const used = room?.usedSongIds || {};
  let pool = getSongsByGenres(activeGenres).filter((song) => !used[song.id]);

  const customSongs = room?.customSongs ? Object.values(room.customSongs) : [];
  const customPool = customSongs.filter((song) =>
    activeGenres.includes(song.genre) && !used[song.id]
  );
  pool = pool.concat(customPool);

  if (!pool.length) {
    pool = getSongsByGenres(activeGenres);
    const allCustom = customSongs.filter((song) => activeGenres.includes(song.genre));
    pool = pool.concat(allCustom);
  }
  if (!pool.length) throw new Error('No hay canciones disponibles');
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function startMatch(roomCode) {
  const roomSnap = await get(ref(db, `rooms/${roomCode}`));
  const room = roomSnap.val();
  if (!room) throw new Error('Sala no encontrada');
  const song = pickUnusedSong(room);
  await update(ref(db), {
    [`rooms/${roomCode}/meta/status`]: 'round_ready',
    [`rooms/${roomCode}/currentRound`]: {
      roundNumber: 1,
      phase: 'round_ready',
      songId: song.id,
      songUrl: song.url,
      songTitle: song.title,
      correctYear: song.year,
      timer: { duration: ROOM_TIMER_SECONDS, startedAt: null, endsAt: null, running: false },
      answers: {},
      results: {},
    },
    [`rooms/${roomCode}/usedSongIds/${song.id}`]: true,
  });
}

export async function createNextRound(roomCode) {
  const roomSnap = await get(ref(db, `rooms/${roomCode}`));
  const room = roomSnap.val();
  if (!room) throw new Error('Sala no encontrada');
  const song = pickUnusedSong(room);
  const nextRoundNumber = Number(room?.currentRound?.roundNumber || 0) + 1;
  const patch = {
    [`rooms/${roomCode}/meta/status`]: 'round_ready',
    [`rooms/${roomCode}/currentRound`]: {
      roundNumber: nextRoundNumber,
      phase: 'round_ready',
      songId: song.id,
      songUrl: song.url,
      songTitle: song.title,
      correctYear: song.year,
      timer: { duration: ROOM_TIMER_SECONDS, startedAt: null, endsAt: null, running: false },
      answers: {},
      results: {},
    },
    [`rooms/${roomCode}/usedSongIds/${song.id}`]: true,
  };
  await update(ref(db), patch);
}

export async function startTimer(roomCode, room) {
  const round = room?.currentRound || {};
  if (!round.songId) throw new Error('Primero crea una ronda');
  if (room?.meta?.status !== 'round_ready') throw new Error('La ronda no está lista');
  const now = Date.now();
  await update(ref(db), {
    [`rooms/${roomCode}/meta/status`]: 'round_timer_running',
    [`rooms/${roomCode}/currentRound/phase`]: 'round_timer_running',
    [`rooms/${roomCode}/currentRound/timer`]: {
      duration: ROOM_TIMER_SECONDS,
      startedAt: now,
      endsAt: now + ROOM_TIMER_SECONDS * 1000,
      running: true,
    },
  });
}

export async function submitGuess(roomCode, playerId, guessYear, room) {
  const status = room?.meta?.status;
  if (!['round_ready', 'round_timer_running'].includes(status)) throw new Error('La ronda no acepta respuestas');
  await update(ref(db, `rooms/${roomCode}/currentRound/answers/${playerId}`), {
    guessYear: Number(guessYear),
    submittedAt: Date.now(),
    locked: true,
  });
}

export async function forceTimeUp(roomCode, room) {
  const status = room?.meta?.status;
  if (status !== 'round_timer_running') return;
  await update(ref(db), {
    [`rooms/${roomCode}/meta/status`]: 'round_time_up',
    [`rooms/${roomCode}/currentRound/phase`]: 'round_time_up',
    [`rooms/${roomCode}/currentRound/timer/running`]: false,
  });
}

function buildRoundResults(room) {
  const players = room?.players || {};
  const answers = room?.currentRound?.answers || {};
  const correctYear = room?.currentRound?.correctYear;
  const results = {};
  Object.keys(players).forEach((playerId) => {
    const answer = answers[playerId];
    const autoPoints = calculatePoints(answer?.guessYear, correctYear);
    results[playerId] = {
      guessYear: answer?.guessYear ?? null,
      autoPoints,
      manualAdjustment: 0,
      finalPoints: autoPoints,
    };
  });
  return results;
}

function firstPlaceInfo(playersMap) {
  const sorted = sortPlayers(playersMap);
  if (!sorted.length) return { leaders: [], topScore: 0 };
  const topScore = sorted[0].score || 0;
  return {
    topScore,
    leaders: sorted.filter((p) => (p.score || 0) === topScore),
  };
}

export async function revealRound(roomCode) {
  const roomSnap = await get(ref(db, `rooms/${roomCode}`));
  const room = roomSnap.val();
  if (!room) throw new Error('Sala no encontrada');
  const results = buildRoundResults(room);
  const patch = {
    [`rooms/${roomCode}/meta/status`]: 'round_revealed',
    [`rooms/${roomCode}/currentRound/phase`]: 'round_revealed',
    [`rooms/${roomCode}/currentRound/timer/running`]: false,
    [`rooms/${roomCode}/currentRound/results`]: results,
  };
  Object.entries(results).forEach(([playerId, data]) => {
    patch[`rooms/${roomCode}/players/${playerId}/score`] = (room.players?.[playerId]?.score || 0) + (data.finalPoints || 0);
  });

  const previewPlayers = JSON.parse(JSON.stringify(room.players || {}));
  Object.entries(results).forEach(([playerId, data]) => {
    previewPlayers[playerId].score = (previewPlayers[playerId].score || 0) + (data.finalPoints || 0);
  });

  const targetScore = room?.meta?.targetScore || MODES.bala.targetScore;
  const { leaders, topScore } = firstPlaceInfo(previewPlayers);

  if (topScore >= targetScore) {
    if (leaders.length > 1) {
      patch[`rooms/${roomCode}/meta/isTieBreak`] = true;
    } else {
      patch[`rooms/${roomCode}/meta/status`] = 'match_finished';
    }
  }

  await update(ref(db), patch);
}

export async function adjustRoundPoints(roomCode, playerId, delta) {
  const roomSnap = await get(ref(db, `rooms/${roomCode}`));
  const room = roomSnap.val();
  if (!room) throw new Error('Sala no encontrada');
  const result = room?.currentRound?.results?.[playerId];
  if (!result) throw new Error('No hay resultados de ronda');
  const newAdjustment = Number(result.manualAdjustment || 0) + delta;
  const newFinal = Number(result.autoPoints || 0) + newAdjustment;
  const previousFinal = Number(result.finalPoints || 0);
  const playerScore = Number(room?.players?.[playerId]?.score || 0);
  await update(ref(db), {
    [`rooms/${roomCode}/currentRound/results/${playerId}/manualAdjustment`]: newAdjustment,
    [`rooms/${roomCode}/currentRound/results/${playerId}/finalPoints`]: newFinal,
    [`rooms/${roomCode}/players/${playerId}/score`]: playerScore - previousFinal + newFinal,
  });
}

export async function nextRoundStep(roomCode) {
  const roomSnap = await get(ref(db, `rooms/${roomCode}`));
  const room = roomSnap.val();
  if (!room) throw new Error('Sala no encontrada');
  if (room?.meta?.status === 'match_finished') return;
  const song = pickUnusedSong(room);
  const nextRoundNumber = Number(room?.currentRound?.roundNumber || 0) + 1;
  await update(ref(db), {
    [`rooms/${roomCode}/meta/status`]: 'round_ready',
    [`rooms/${roomCode}/currentRound`]: {
      roundNumber: nextRoundNumber,
      phase: 'round_ready',
      songId: song.id,
      songUrl: song.url,
      songTitle: song.title,
      correctYear: song.year,
      timer: { duration: ROOM_TIMER_SECONDS, startedAt: null, endsAt: null, running: false },
      answers: {},
      results: {},
    },
    [`rooms/${roomCode}/usedSongIds/${song.id}`]: true,
  });
}
