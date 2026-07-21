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
  /** 0-100 overall pace-keeping score: steadiness minus drift/target penalties */
  score: number;
  /** one-line coach comment, e.g. "you sped up around 1:23" */
  comment: string;
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

export function computeStats(points: TapPoint[], targetBpm: number | null = null): Stats | null {
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

  const driftPenalty = Math.min(30, Math.max(0, (Math.abs(drift) - 2) * 1.5));
  const targetPenalty = targetBpm !== null ? Math.min(25, Math.abs(avg - targetBpm) * 1.2) : 0;
  const score = Math.max(0, Math.min(100, Math.round(stability - driftPenalty - targetPenalty)));

  const comment = buildComment(points, avg, targetBpm, score);

  return { avg: Math.round(avg), stability, drift, count: points.length, score, comment };
}

const formatClock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Finds the strongest sustained speed-up / slow-down (moving window vs the
 * target or session average) and turns it into an encouraging coach one-liner.
 */
function buildComment(
  points: TapPoint[],
  avg: number,
  targetBpm: number | null,
  score: number
): string {
  const baseline = targetBpm ?? avg;
  const W = 4;
  let up = { dev: 0, t: 0 };
  let down = { dev: 0, t: 0 };
  for (let i = 0; i + W <= points.length; i++) {
    let sum = 0;
    for (let j = i; j < i + W; j++) sum += points[j].bpm;
    const dev = sum / W - baseline;
    const t = points[i + Math.floor(W / 2)].t - points[0].t;
    if (dev > up.dev) up = { dev, t };
    if (dev < down.dev) down = { dev, t };
  }

  const threshold = Math.max(4, baseline * 0.04);
  const notes: string[] = [];
  if (up.dev > threshold) notes.push(`make sure not to speed up around ${formatClock(up.t)}`);
  if (-down.dev > threshold) notes.push(`careful not to drag around ${formatClock(down.t)}`);
  if (notes.length > 0) {
    const praise = score >= 85 ? 'great job!' : score >= 60 ? 'nice work!' : 'keep at it —';
    return `${praise} ${notes.join(', and ')}`;
  }

  if (points.length < 8) return 'good start — tap a bit longer for a deeper read';
  if (score >= 90) return 'stellar — steady as a metronome!';
  if (score >= 75) return 'great job — nice and steady all the way';
  return 'good effort — a few wobbles, but no big runaways';
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
