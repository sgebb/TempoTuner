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

/** Exponential moving average of recent intervals — smooths out jitter while following trends. */
export function currentBpm(points: TapPoint[]): number | null {
  if (points.length === 0) return null;
  // Use last 8 taps with exponential weighting: newer taps matter more
  const recent = points.slice(-8).map((p) => p.bpm);
  if (recent.length === 0) return null;
  let ema = recent[0];
  const alpha = 0.3; // smoothing factor: higher = more responsive, lower = smoother
  for (let i = 1; i < recent.length; i++) {
    ema = alpha * recent[i] + (1 - alpha) * ema;
  }
  return Math.round(ema);
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
