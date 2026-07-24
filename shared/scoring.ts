// Daily-challenge domain logic shared VERBATIM by the web app (src/lib/daily.ts
// re-exports it) and the leaderboard API (api/ imports it directly). The server
// recomputes every submitted score with these exact functions, so keeping them
// in one place is what makes client and server scores provably identical.

/** trackId = the verified iTunes track whose 30s preview (and BPM) this entry represents. */
export type Song = { title: string; artist: string; bpm: number; trackId: number };

/** Valid intervals needed to finish a challenge run. */
export const CHALLENGE_POINTS = 16;

// ---------- day math (all in local time, like Wordle) ----------

const LAUNCH_DATE_KEY = '2026-07-22'; // daily #1

export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Noon, so DST shifts can never push day arithmetic across a midnight. */
function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function dailyNumber(dateKey: string): number {
  return Math.round((keyToDate(dateKey).getTime() - keyToDate(LAUNCH_DATE_KEY).getTime()) / 86400000) + 1;
}

export function shiftDateKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

// ---------- scoring ----------

export type Octave = 'straight' | 'half' | 'double';

/**
 * Octave-aware accuracy score. Tapping half or double time is a musically
 * valid feel, so the guess is scored against whichever of target, target×2 or
 * target÷2 it lands closest to (relative error), then mapped so that ~2% off
 * is still an excellent score and 25%+ off is 0.
 */
export function scoreGuess(guess: number, target: number): { score: number; octave: Octave } {
  const candidates: { bpm: number; octave: Octave }[] = [
    { bpm: target, octave: 'straight' },
    { bpm: target / 2, octave: 'half' },
    { bpm: target * 2, octave: 'double' },
  ];
  let best = candidates[0];
  let bestErr = Math.abs(guess - best.bpm) / best.bpm;
  for (const c of candidates.slice(1)) {
    const err = Math.abs(guess - c.bpm) / c.bpm;
    if (err < bestErr) {
      best = c;
      bestErr = err;
    }
  }
  return { score: Math.max(0, Math.round(100 - bestErr * 400)), octave: best.octave };
}

/**
 * Consistency penalty for a challenge run: the median guess can be spot-on
 * while the taps wobbled all over, so high interval variance costs points.
 * A missed or fumbled tap is a stumble, not a wobbly sense of tempo — the
 * worst ~10% of intervals are excluded first (like computeStats does), so
 * only sustained unsteadiness is penalized. cv ≲ 4% on the rest is free;
 * it ramps up to −25 from there.
 */
export function wobblePenalty(bpms: number[]): number {
  if (bpms.length < 4) return 0;
  const sorted = [...bpms].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const trimCount = bpms.length >= 8 ? Math.max(1, Math.round(bpms.length * 0.1)) : 0;
  const kept = [...bpms]
    .sort((a, b) => Math.abs(a - median) - Math.abs(b - median))
    .slice(0, bpms.length - trimCount);
  const avg = kept.reduce((s, b) => s + b, 0) / kept.length;
  const sd = Math.sqrt(kept.reduce((s, b) => s + (b - avg) ** 2, 0) / kept.length);
  const cv = sd / avg;
  return Math.max(0, Math.min(25, Math.round((cv - 0.04) * 250)));
}

/** The run's single BPM guess: median over every interval (robust to stumbles). */
export function medianBpm(bpms: number[]): number {
  const sorted = [...bpms].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median);
}

/** The one true scoring path: raw per-interval BPMs in, final result out. */
export function scoreRun(bpms: number[], targetBpm: number) {
  const guess = medianBpm(bpms);
  const { score: accuracy, octave } = scoreGuess(guess, targetBpm);
  const wobble = wobblePenalty(bpms);
  return { guess, octave, wobble, score: Math.max(0, accuracy - wobble) };
}
