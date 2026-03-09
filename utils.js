export const MODES = {
  bala: { key: 'bala', label: 'Bala', targetScore: 5 },
  rapida: { key: 'rapida', label: 'Rápida', targetScore: 10 },
  liga: { key: 'liga', label: 'Liga', targetScore: 20 },
};

export const ROOM_TIMER_SECONDS = 35;

export function randomCode() {
  return `TEMA-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function calculatePoints(guessYear, correctYear) {
  const guess = Number(guessYear);
  const correct = Number(correctYear);
  if (!Number.isFinite(guess) || !Number.isFinite(correct)) return 0;
  const diff = Math.abs(guess - correct);
  if (diff === 0) return 3;
  if (diff === 1) return 2;
  if (diff === 2 || diff === 3) return 1;
  return 0;
}

export function statusLabel(status, isTieBreak = false) {
  const labels = {
    lobby: 'Lobby',
    round_ready: 'Lista',
    round_timer_running: 'Respondiendo',
    round_time_up: 'Tiempo agotado',
    round_revealed: 'Revelado',
    match_finished: 'Final',
  };
  const text = labels[status] || 'Sala';
  return isTieBreak ? `${text} · Desempate` : text;
}

export function safeUpperRoom(value = '') {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function roomShareUrl(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  return url.toString();
}

export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

export function readStorage(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function sortPlayers(playersMap = {}) {
  return Object.values(playersMap).sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });
}

export function ensureUniqueName(name, playersMap = {}, samePlayerId = null) {
  const normalized = name.trim();
  const existingNames = new Set(
    Object.values(playersMap)
      .filter((p) => p && p.id !== samePlayerId)
      .map((p) => String(p.name || '').trim().toLowerCase())
  );
  if (!existingNames.has(normalized.toLowerCase())) return normalized;
  let i = 2;
  while (existingNames.has(`${normalized} ${i}`.toLowerCase())) i += 1;
  return `${normalized} ${i}`;
}
