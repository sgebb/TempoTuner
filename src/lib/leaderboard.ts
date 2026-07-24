// Leaderboard client. Identity is a random device UUID + a user-picked
// nickname — no account. The server never trusts a client-computed score: we
// send the raw per-interval BPMs and it rescores them with shared/scoring.ts.

export const API_BASE = 'https://tempotuner-api-eqgmc8dcf0gxcace.westeurope-01.azurewebsites.net/api';

export const apiConfigured = () => !API_BASE.includes('YOUR-FUNCTION-APP');

const UUID_KEY = 'tt-uuid';
const NICK_KEY = 'tt-nick';
const SUBMITTED_KEY = 'tt-lb-submitted';

export function getUuid(): string {
  let id = localStorage.getItem(UUID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(UUID_KEY, id);
  }
  return id;
}

export function getNickname(): string | null {
  return localStorage.getItem(NICK_KEY);
}

export function saveNickname(nick: string) {
  localStorage.setItem(NICK_KEY, nick.trim().slice(0, 20));
}

export type LeaderboardEntry = { nickname: string; score: number; you?: boolean };
export type AllTimeEntry = { nickname: string; total: number; games: number; you?: boolean };
export type LeaderboardData = {
  day: string;
  today: LeaderboardEntry[];
  allTime: AllTimeEntry[];
  you: { todayRank: number | null; allTimeRank: number | null; total: number; games: number } | null;
};

export async function fetchLeaderboard(day: string): Promise<LeaderboardData> {
  // no-store: the board must reflect a just-submitted run even while the old
  // server response would still be fresh in the HTTP cache
  const res = await fetch(`${API_BASE}/leaderboard?day=${day}&uuid=${getUuid()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`);
  return res.json();
}

export type DailyInfo = {
  day: string;
  number: number;
  title: string;
  artist: string;
  /** 30s Apple Music preview clip (null if the lookup failed) */
  previewUrl: string | null;
  /** Apple Music page for the track — attribution link next to the preview */
  trackUrl: string | null;
};

export type RunResult = {
  stored: boolean;
  score: number;
  guess: number;
  octave: 'straight' | 'half' | 'double';
  wobble: number;
  actualBpm: number;
  rankToday: number;
  playersToday: number;
};

/** Today's challenge — title and artist only; the answer stays on the server. */
export async function fetchDaily(day: string): Promise<DailyInfo> {
  const res = await fetch(`${API_BASE}/daily?day=${day}`);
  if (!res.ok) throw new Error(`daily fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Send a finished run's raw intervals for scoring. The server computes the
 * score and reveals the actual BPM; the run only lands on the leaderboard if
 * a nickname is included (i.e. the user has joined).
 */
export async function submitRun(day: string, bpms: number[]): Promise<RunResult> {
  const nickname = getNickname();
  const res = await fetch(`${API_BASE}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uuid: getUuid(), nickname: nickname ?? undefined, day, bpms }),
  });
  if (!res.ok) throw new Error(`score submit failed: ${res.status}`);
  const result: RunResult = await res.json();
  if (nickname && result.stored !== undefined) localStorage.setItem(SUBMITTED_KEY, day);
  return result;
}

/**
 * Re-submit today's stored result if the user has joined and it hasn't gone
 * onto the board yet — covers "joined after playing" and failed submissions.
 */
export async function maybeSubmitToday(
  day: string,
  result: { guess: number | null; bpms?: number[] } | undefined
): Promise<void> {
  if (!apiConfigured() || !getNickname()) return;
  if (!result || result.guess === null || !result.bpms?.length) return;
  if (localStorage.getItem(SUBMITTED_KEY) === day) return;
  await submitRun(day, result.bpms);
}
