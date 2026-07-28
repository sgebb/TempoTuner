// Ghost challenges: "Challenge a friend" puts {day, score, nickname} into the
// share link's hash, so whoever opens it plays the same day's song against
// that score. Entirely client-side — no server round trip — and the link
// carries the day, never the song, so it can't spoil the answer.

export type Challenge = {
  /** date key of the daily being challenged, e.g. '2026-07-28' */
  day: string;
  score: number;
  nick?: string;
};

const STORAGE_KEY = 'tt-challenge';

// base64url so the payload survives URLs and chat apps untouched
const encode = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const decode = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function challengeUrl(c: Challenge): string {
  const payload: Record<string, unknown> = { d: c.day, s: c.score };
  if (c.nick) payload.n = c.nick;
  return `${location.origin}${location.pathname}#c=${encode(JSON.stringify(payload))}`;
}

/** Payloads come from strangers' URLs — reject anything malformed. */
function parseChallenge(raw: string): Challenge | null {
  try {
    const p = JSON.parse(decode(raw)) as { d?: unknown; s?: unknown; n?: unknown };
    if (typeof p.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.d)) return null;
    const score = Number(p.s);
    if (!Number.isInteger(score) || score < 0 || score > 100) return null;
    const nick = typeof p.n === 'string' && p.n.trim() ? p.n.trim().slice(0, 20) : undefined;
    return nick ? { day: p.d, score, nick } : { day: p.d, score };
  } catch {
    return null;
  }
}

/**
 * A challenge arriving in the URL right now. Persisted (so it survives the
 * recipient coming back later) and stripped from the address bar either way.
 */
export function readChallengeFromUrl(): Challenge | null {
  const m = location.hash.match(/[#&]c=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const c = parseChallenge(m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  return c;
}

export function loadStoredChallenge(): Challenge | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Challenge;
    if (typeof c?.day !== 'string' || typeof c?.score !== 'number') return null;
    return c;
  } catch {
    return null;
  }
}
