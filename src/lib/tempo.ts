// Core tap-tempo math. Taps are timestamps in ms (performance.now()).

export type TapPoint = {
  /** timestamp of the tap that completed this interval (ms) */
  t: number;
  bpm: number;
};

export type Stats = {
  avg: number;
  count: number;
};

/**
 * Intervals shorter than this are treated as touchscreen double-fires, longer
 * ones as a pause — neither counts as a beat.
 */
export const MIN_INTERVAL_MS = 100; // 600 BPM
export const MAX_INTERVAL_MS = 2400; // 25 BPM

export const MIN_BPM = 30;
export const MAX_BPM = 240;

export function tapsToPoints(taps: number[]): TapPoint[] {
  const points: TapPoint[] = [];
  for (let i = 1; i < taps.length; i++) {
    const dt = taps[i] - taps[i - 1];
    if (dt >= MIN_INTERVAL_MS && dt <= MAX_INTERVAL_MS) {
      points.push({ t: taps[i], bpm: 60000 / dt });
    }
  }
  return points;
}

/** Median of the last few intervals — what the big number shows. */
export function currentBpm(points: TapPoint[]): number | null {
  if (points.length === 0) return null;
  const recent = points.slice(-4).map((p) => p.bpm).sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  const median = recent.length % 2 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
  return Math.round(median);
}

export function computeStats(points: TapPoint[]): Stats | null {
  if (points.length < 2) return null;
  const bpms = points.map((p) => p.bpm);
  const avg = bpms.reduce((s, b) => s + b, 0) / bpms.length;
  return { avg: Math.round(avg), count: points.length };
}

export function accuracyColor(bpm: number, target: number | null): string {
  if (target === null) return 'var(--accent)';
  const diff = Math.abs(bpm - target);
  if (diff <= 3) return 'var(--good)';
  if (diff <= 8) return 'var(--warn)';
  return 'var(--bad)';
}
