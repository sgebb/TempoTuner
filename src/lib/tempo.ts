// Core tap-tempo math. Taps are timestamps in ms (performance.now()).

export type TapPoint = {
  /** timestamp of the tap that completed this interval (ms) */
  t: number;
  bpm: number;
};

export type Stats = {
  avg: number;
  /** 0-100, how steady the intervals were */
  stability: number;
  /** second-half average minus first-half average (positive = rushing) */
  drift: number;
  count: number;
};

/** Intervals outside this range are treated as a pause, not a beat. */
export const MIN_INTERVAL_MS = 240; // 250 BPM
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

  const variance = bpms.reduce((s, b) => s + (b - avg) ** 2, 0) / bpms.length;
  const cv = Math.sqrt(variance) / avg;
  const stability = Math.max(0, Math.min(100, Math.round(100 - cv * 400)));

  const half = Math.floor(bpms.length / 2);
  const firstAvg = bpms.slice(0, half).reduce((s, b) => s + b, 0) / half;
  const secondAvg = bpms.slice(-half).reduce((s, b) => s + b, 0) / half;
  const drift = Math.round(secondAvg - firstAvg);

  return { avg: Math.round(avg), stability, drift, count: points.length };
}

export function driftLabel(drift: number): string {
  if (drift > 2) return `rushing +${drift}`;
  if (drift < -2) return `dragging ${drift}`;
  return 'steady';
}

export function accuracyColor(bpm: number, target: number | null): string {
  if (target === null) return 'var(--accent)';
  const diff = Math.abs(bpm - target);
  if (diff <= 3) return 'var(--good)';
  if (diff <= 8) return 'var(--warn)';
  return 'var(--bad)';
}
