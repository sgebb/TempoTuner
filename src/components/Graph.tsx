import { useEffect, useRef, useState } from 'react';
import { TapPoint, accuracyColor } from '../lib/tempo';
import { VolumeSample } from '../hooks/useRecorder';

type Props = {
  points: TapPoint[];
  targetBpm: number | null;
  volume: VolumeSample[];
  playbackTime: number | null;
  /** set only while playing back — tapping the graph then seeks instead of counting a beat */
  onSeek?: ((absMs: number) => void) | null;
};

export function graphDomain(points: TapPoint[], targetBpm: number | null, volume: VolumeSample[]) {
  const bpms = points.map((p) => p.bpm);
  if (targetBpm !== null) bpms.push(targetBpm);
  const lo = bpms.length ? Math.min(...bpms) : 80;
  const hi = bpms.length ? Math.max(...bpms) : 140;
  const pad = Math.max(8, (hi - lo) * 0.2);
  let minY = Math.max(20, lo - pad);
  let maxY = Math.min(650, hi + pad);

  // Never zoom in tighter than a 50 BPM window — a steady take should look flat.
  const MIN_SPAN = 50;
  if (maxY - minY < MIN_SPAN) {
    const mid = (minY + maxY) / 2;
    minY = mid - MIN_SPAN / 2;
    maxY = mid + MIN_SPAN / 2;
    if (minY < 20) {
      maxY += 20 - minY;
      minY = 20;
    } else if (maxY > 650) {
      minY -= maxY - 650;
      maxY = 650;
    }
  }

  const times = points.map((p) => p.t);
  if (volume.length) times.push(volume[0].t, volume[volume.length - 1].t);
  const t0 = times.length ? Math.min(...times) : 0;
  const t1 = Math.max(times.length ? Math.max(...times) : 0, t0 + 8000);
  return { minY, maxY, t0, t1 };
}

const TIME_STEPS_S = [2, 5, 10, 15, 30, 60, 120, 300, 600];
const BPM_STEPS = [5, 10, 20, 40, 80];

const formatElapsed = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const Graph = ({ points, targetBpm, volume, playbackTime, onSeek }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 320, h: 140 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 18;

  const { minY, maxY, t0, t1 } = graphDomain(points, targetBpm, volume);
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (w - padL - padR);
  const y = (bpm: number) => padT + ((maxY - bpm) / (maxY - minY)) * (h - padT - padB);
  const hasData = points.length > 0 || volume.length > 0;

  const handleSeek = (e: React.PointerEvent<Element>) => {
    if (!onSeek) return;
    e.stopPropagation();
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = t0 + ((px - padL) / (w - padL - padR)) * (t1 - t0);
    onSeek(Math.max(t0, Math.min(t1, t)));
  };

  let content: JSX.Element | null = null;
  if (hasData) {
    // Time ticks (mm:ss since the start), aiming for ~4 labels.
    const durMs = t1 - t0;
    const stepMs =
      (TIME_STEPS_S.find((s) => s * 1000 >= durMs / 4) ?? TIME_STEPS_S[TIME_STEPS_S.length - 1]) * 1000;
    const timeTicks: number[] = [];
    for (let t = t0; t <= t1 + 1; t += stepMs) timeTicks.push(t);

    // BPM gridlines at round values, aiming for ~3 lines.
    const bpmStep = BPM_STEPS.find((s) => s >= (maxY - minY) / 4) ?? BPM_STEPS[BPM_STEPS.length - 1];
    const bpmTicks: number[] = [];
    for (let b = Math.ceil(minY / bpmStep) * bpmStep; b <= maxY; b += bpmStep) bpmTicks.push(b);

    // Smoothed trend line (moving average) instead of connecting every dot,
    // split into segments wherever the singer paused.
    const GAP_MS = 4000;
    const segments: TapPoint[][] = [];
    for (const p of points) {
      const seg = segments[segments.length - 1];
      if (!seg || p.t - seg[seg.length - 1].t > GAP_MS) segments.push([p]);
      else seg.push(p);
    }
    const trendPath = segments
      .map((seg) =>
        seg
          .map((p, i) => {
            const lo = Math.max(0, i - 2);
            const hi = Math.min(seg.length - 1, i + 2);
            let sum = 0;
            for (let j = lo; j <= hi; j++) sum += seg[j].bpm;
            const avg = sum / (hi - lo + 1);
            return `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(avg).toFixed(1)}`;
          })
          .join(' ')
      )
      .join(' ');

    // The volume envelope lives in the bottom quarter of the plot; the hint
    // text sits just above it while playing.
    const bandH = (h - padT - padB) * 0.25;
    const bandTop = h - padB - bandH;

    // Volume envelope inside the band, so it's clear when singing happened.
    let volPath: string | null = null;
    if (volume.length > 1) {
      const baseY = h - padB;
      const maxLevel = Math.max(0.06, ...volume.map((s) => s.level));
      const line = volume
        .map((s) => `L ${x(s.t).toFixed(1)} ${(baseY - (s.level / maxLevel) * (bandH - 2)).toFixed(1)}`)
        .join(' ');
      volPath = `M ${x(volume[0].t).toFixed(1)} ${baseY} ${line} L ${x(
        volume[volume.length - 1].t
      ).toFixed(1)} ${baseY} Z`;
    }

    const playX =
      playbackTime !== null && playbackTime >= t0 && playbackTime <= t1 ? x(playbackTime) : null;

    content = (
      <>
        {bpmTicks.map((b) => (
          <g key={`y${b}`}>
            <line x1={padL} x2={w - padR} y1={y(b)} y2={y(b)} className="graph-grid" />
            <text x={padL - 5} y={y(b) + 3} textAnchor="end" className="graph-axis-label">
              {b}
            </text>
          </g>
        ))}
        {timeTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={h - padB} y2={h - padB + 4} className="graph-tick" />
            <text x={x(t)} y={h - 4} textAnchor="middle" className="graph-axis-label">
              {formatElapsed(t - t0)}
            </text>
          </g>
        ))}
        {onSeek && (
          <text x={w - padR - 6} y={bandTop - 6} textAnchor="end" className="graph-hint-label">
            tap the graph to jump to that part
          </text>
        )}
        {volPath && <path d={volPath} fill="var(--accent)" opacity={0.35} stroke="none" />}
        {targetBpm !== null && (
          <>
            <line
              x1={padL}
              x2={w - padR}
              y1={y(targetBpm)}
              y2={y(targetBpm)}
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="6 5"
              opacity={0.8}
            />
            <text
              x={w - padR}
              y={y(targetBpm) - 4}
              textAnchor="end"
              className="graph-target-label"
            >
              target {targetBpm}
            </text>
          </>
        )}
        {points.length > 1 && (
          <path
            d={trendPath}
            fill="none"
            stroke="var(--fg)"
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="7 5"
            opacity={0.75}
          />
        )}
        {/* only the most recent taps get dots — older history lives in the trend line */}
        {points.slice(-10).map((p) => (
          <circle key={p.t} cx={x(p.t)} cy={y(p.bpm)} r={4} fill={accuracyColor(p.bpm, targetBpm)} />
        ))}
        {playX !== null && (
          <line x1={playX} x2={playX} y1={padT / 2} y2={h - padB} stroke="var(--bad)" strokeWidth={2} />
        )}
      </>
    );
  } else if (targetBpm !== null) {
    content = (
      <line
        x1={padL}
        x2={w - padR}
        y1={h / 2}
        y2={h / 2}
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeDasharray="6 5"
        opacity={0.5}
      />
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`graph-wrap ${onSeek ? 'graph-seekable' : ''}`}
      onPointerDown={onSeek ? handleSeek : undefined}
      {...(onSeek ? { 'data-no-tap': true } : {})}
    >
      <svg width={w} height={h} role="img" aria-label="Tempo over time compared with your target BPM">
        {content}
      </svg>
    </div>
  );
};

export default Graph;
