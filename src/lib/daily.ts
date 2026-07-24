// Daily tempo challenge: one well-known song per day, picked deterministically
// from the local date. The user taps the song's beat from memory and is scored
// on how close their tempo was to the real BPM. Results live in localStorage.
//
// The songs, day math and scoring live in shared/scoring.ts because the
// leaderboard API recomputes scores server-side with the same code.

import { shiftDateKey } from '../../shared/scoring';

export * from '../../shared/scoring';

// ---------- persistence ----------

export type DailyResult = {
  day: number;
  guess: number | null;
  score: number | null;
  skipped?: boolean;
  /** per-interval BPMs of the scoring run, oldest first — used for the share graph */
  bpms?: number[];
  /** song info revealed by the server when the run was scored (absent on legacy entries) */
  title?: string;
  artist?: string;
  actual?: number;
  /** points deducted for listening to the clip before the run */
  clip?: number;
};

export type DailyResults = Record<string, DailyResult>;

const STORAGE_KEY = 'tt-daily';

export function loadDailyResults(): DailyResults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.results && typeof parsed.results === 'object') {
      return parsed.results as DailyResults;
    }
  } catch {
    // corrupted storage — start fresh
  }
  return {};
}

export function saveDailyResults(results: DailyResults) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ results }));
}

/** Consecutive days played ending today — or yesterday, so an unplayed today doesn't read as 0. */
export function computeStreak(results: DailyResults, todayKey: string): number {
  let streak = 0;
  let key = results[todayKey] ? todayKey : shiftDateKey(todayKey, -1);
  while (results[key]) {
    streak++;
    key = shiftDateKey(key, -1);
  }
  return streak;
}
