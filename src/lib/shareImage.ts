import { METRONOME_BODY_PATH, METRONOME_NEEDLE_PATH } from '../components/icons';
import { Octave } from './daily';

export type DailyShareData = {
  day: number;
  title: string;
  artist: string;
  /** the song's real BPM; null only for legacy local results */
  actual: number | null;
  guess: number;
  score: number;
  octave: Octave | null;
  streak: number;
  /** per-interval BPMs of the run, oldest first; null for results saved before graphs were stored */
  bpms: number[] | null;
  dark: boolean;
};

const ACCENT = '#f5a623';

/**
 * The app's metronome mark, filled from the same SVG path data the header
 * uses (1940×2560 y-flipped trace space). `size` is the rendered height.
 */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 2560;
  ctx.save();
  ctx.translate(x, y + size);
  ctx.scale(s, -s);
  ctx.fillStyle = ACCENT;
  ctx.fill(new Path2D(METRONOME_BODY_PATH));
  ctx.fill(new Path2D(METRONOME_NEEDLE_PATH));
  ctx.restore();
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Renders a shareable daily-result card (score + tempo graph) as a PNG blob. */
export async function renderDailyShareImage(data: DailyShareData): Promise<Blob> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bg = data.dark ? '#12121c' : '#fdf8ef';
  const fg = data.dark ? '#f2f0ff' : '#2a2438';
  const muted = data.dark ? '#9a95b8' : '#8a8299';
  const good = data.dark ? '#4ade80' : '#16a34a';
  const warn = data.dark ? '#fbbf24' : '#d97706';
  const bad = data.dark ? '#f87171' : '#dc2626';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header: real logo + wordmark
  drawLogo(ctx, 64, 48, 72);
  ctx.fillStyle = ACCENT;
  ctx.font = 'bold 56px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('TempoTuner', 136, 110);

  // Daily number + song
  ctx.fillStyle = fg;
  ctx.font = 'bold 68px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`Daily #${data.day}`, 64, 232);
  ctx.fillStyle = muted;
  ctx.font = '600 44px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(truncateToWidth(ctx, `${data.title} — ${data.artist}`, W - 128), 64, 296);

  // You vs actual
  ctx.fillStyle = fg;
  ctx.font = 'bold 130px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`${data.guess}`, 64, 460);
  ctx.fillStyle = ACCENT;
  ctx.fillText(`${data.actual ?? '—'}`, 560, 460);
  ctx.font = '40px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText('you', 64, 515);
  ctx.fillText('actual BPM', 560, 515);

  // Score + streak
  ctx.fillStyle = fg;
  ctx.font = '600 48px "Segoe UI", system-ui, sans-serif';
  const streakPart = data.streak > 0 ? `   ·   🔥 ${data.streak} day streak` : '';
  ctx.fillText(`🎯 ${data.score}/100${streakPart}`, 64, 592);

  // Graph of the run, with a dashed line at the song's tempo (octave-matched
  // to how the run was felt, so half/double-time runs still line up).
  const gx = 64;
  const gy = 640;
  const gw = W - 128;
  const gh = 290;
  ctx.strokeStyle = data.dark ? '#2c2c40' : '#e8e0d0';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gh);

  const lineBpm =
    data.actual === null
      ? null
      : data.octave === 'half'
        ? data.actual / 2
        : data.octave === 'double'
          ? data.actual * 2
          : data.actual;
  const dotColor = (bpm: number) => {
    if (lineBpm === null) return ACCENT;
    const diff = Math.abs(bpm - lineBpm);
    return diff <= 3 ? good : diff <= 8 ? warn : bad;
  };

  if (data.bpms && data.bpms.length > 1) {
    // Rebuild timestamps from the intervals themselves.
    let t = 0;
    const points = data.bpms.map((bpm) => {
      t += 60000 / bpm;
      return { t, bpm };
    });

    const all = lineBpm === null ? [...data.bpms] : [...data.bpms, lineBpm];
    let lo = Math.min(...all) - 10;
    let hi = Math.max(...all) + 10;
    if (hi - lo < 50) {
      const mid = (lo + hi) / 2;
      lo = mid - 25;
      hi = mid + 25;
    }
    const t0 = points[0].t;
    const t1 = Math.max(points[points.length - 1].t, t0 + 1000);
    const px = (tt: number) => gx + 30 + ((tt - t0) / (t1 - t0)) * (gw - 60);
    const py = (b: number) => gy + 30 + ((hi - b) / (hi - lo)) * (gh - 60);

    if (lineBpm !== null) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.moveTo(gx + 20, py(lineBpm));
      ctx.lineTo(gx + gw - 20, py(lineBpm));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ACCENT;
      ctx.font = '600 30px "Segoe UI", system-ui, sans-serif';
      const lineLabel =
        data.octave === 'half' || data.octave === 'double' ? `song tempo (${data.octave} time)` : 'song tempo';
      ctx.fillText(lineLabel, gx + 24, py(lineBpm) - 12);
    }

    // Smoothed dashed trend line — matches the in-app graph.
    ctx.strokeStyle = fg;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    points.forEach((p, i) => {
      const loI = Math.max(0, i - 2);
      const hiI = Math.min(points.length - 1, i + 2);
      let sum = 0;
      for (let j = loI; j <= hiI; j++) sum += points[j].bpm;
      const avg = sum / (hiI - loI + 1);
      if (i === 0) ctx.moveTo(px(p.t), py(avg));
      else ctx.lineTo(px(p.t), py(avg));
    });
    ctx.stroke();
    ctx.setLineDash([]);

    for (const p of points) {
      ctx.fillStyle = dotColor(p.bpm);
      ctx.beginPath();
      ctx.arc(px(p.t), py(p.bpm), 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = muted;
    ctx.font = '36px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('tapped from memory — no peeking!', gx + 40, gy + gh / 2);
  }

  // Footer
  ctx.fillStyle = muted;
  ctx.font = '36px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('tempotuner.app — how well do you know your tempo?', 64, H - 60);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas export failed'))), 'image/png');
  });
}

/** Returns how the blob left the device, so callers can offer a text fallback. */
export async function shareOrDownload(blob: Blob, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], 'tempotuner-daily.png', { type: 'image/png' });
  // The link lives in `text` ONLY. Passing `url` as well double-posts it in
  // apps that keep both fields (WhatsApp does).
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        text,
        title: 'TempoTuner daily',
      });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tempotuner-daily.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
