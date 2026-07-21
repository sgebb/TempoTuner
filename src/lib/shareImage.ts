import { Stats, TapPoint, driftLabel } from './tempo';
import { METRONOME_BODY_PATH, METRONOME_NEEDLE_PATH } from '../components/icons';

type ShareData = {
  message: string;
  points: TapPoint[];
  stats: Stats | null;
  targetBpm: number | null;
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

/** Renders a shareable summary card (stats + graph) onto a canvas and returns it as a PNG blob. */
export async function renderShareImage(data: ShareData): Promise<Blob> {
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
  const dotColor = (bpm: number) => {
    if (data.targetBpm === null) return ACCENT;
    const diff = Math.abs(bpm - data.targetBpm);
    return diff <= 3 ? good : diff <= 8 ? warn : bad;
  };

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header: real logo + wordmark
  drawLogo(ctx, 64, 48, 72);
  ctx.fillStyle = ACCENT;
  ctx.font = 'bold 56px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('TempoTuner', 136, 110);

  // User message
  ctx.fillStyle = fg;
  ctx.font = 'italic 44px Georgia, serif';
  wrapText(ctx, data.message || 'My tempo session', 64, 200, W - 128, 56);

  // Stats
  const stats = data.stats;
  ctx.font = 'bold 130px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = fg;
  ctx.fillText(stats ? `${stats.avg}` : '—', 64, 430);
  ctx.font = '40px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText('avg BPM', 64, 485);

  if (stats) {
    const line1 = [
      `score ${stats.score}/100`,
      data.targetBpm !== null ? `target ${data.targetBpm}` : null,
    ]
      .filter(Boolean)
      .join('   ·   ');
    const line2 = [driftLabel(stats.drift), `${stats.count + 1} beats`].join('   ·   ');
    ctx.fillStyle = fg;
    ctx.font = '600 42px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(line1, 420, 400);
    ctx.fillText(line2, 420, 462);
  }

  // Graph
  const gx = 64;
  const gy = 560;
  const gw = W - 128;
  const gh = 340;
  ctx.strokeStyle = data.dark ? '#2c2c40' : '#e8e0d0';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gh);

  if (data.points.length > 0) {
    const bpms = data.points.map((p) => p.bpm);
    if (data.targetBpm !== null) bpms.push(data.targetBpm);
    let lo = Math.min(...bpms) - 10;
    let hi = Math.max(...bpms) + 10;
    if (hi - lo < 50) {
      const mid = (lo + hi) / 2;
      lo = mid - 25;
      hi = mid + 25;
    }
    const t0 = data.points[0].t;
    const t1 = Math.max(data.points[data.points.length - 1].t, t0 + 1000);
    const px = (t: number) => gx + 30 + ((t - t0) / (t1 - t0)) * (gw - 60);
    const py = (b: number) => gy + 30 + ((hi - b) / (hi - lo)) * (gh - 60);

    if (data.targetBpm !== null) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.moveTo(gx + 20, py(data.targetBpm));
      ctx.lineTo(gx + gw - 20, py(data.targetBpm));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Smoothed dashed trend line, split at pauses — matches the in-app graph.
    const GAP_MS = 4000;
    const segments: TapPoint[][] = [];
    for (const p of data.points) {
      const seg = segments[segments.length - 1];
      if (!seg || p.t - seg[seg.length - 1].t > GAP_MS) segments.push([p]);
      else seg.push(p);
    }
    ctx.strokeStyle = fg;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([16, 12]);
    for (const seg of segments) {
      ctx.beginPath();
      seg.forEach((p, i) => {
        const loI = Math.max(0, i - 2);
        const hiI = Math.min(seg.length - 1, i + 2);
        let sum = 0;
        for (let j = loI; j <= hiI; j++) sum += seg[j].bpm;
        const avg = sum / (hiI - loI + 1);
        if (i === 0) ctx.moveTo(px(p.t), py(avg));
        else ctx.lineTo(px(p.t), py(avg));
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Like the in-app graph: dots only for the most recent taps.
    for (const p of data.points.slice(-10)) {
      ctx.fillStyle = dotColor(p.bpm);
      ctx.beginPath();
      ctx.arc(px(p.t), py(p.bpm), 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = muted;
    ctx.font = '36px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('No taps recorded', gx + 40, gy + gh / 2);
  }

  // Coach comment under the graph
  if (stats?.comment) {
    ctx.fillStyle = ACCENT;
    ctx.font = 'italic 600 40px Georgia, serif';
    ctx.fillText(`“${stats.comment}”`, 64, gy + gh + 62);
  }

  // Footer
  ctx.fillStyle = muted;
  ctx.font = '36px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('tempotuner.app — free tap tempo & rhythm trainer', 64, H - 60);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas export failed'))), 'image/png');
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(/\s+/);
  let lineText = '';
  let cy = y;
  for (const word of words) {
    const test = lineText ? `${lineText} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && lineText) {
      ctx.fillText(lineText, x, cy);
      lineText = word;
      cy += lineHeight;
      if (cy > y + lineHeight * 2) {
        ctx.fillText(`${lineText}…`, x, cy);
        return;
      }
    } else {
      lineText = test;
    }
  }
  if (lineText) ctx.fillText(lineText, x, cy);
}

export async function shareOrDownload(blob: Blob, message: string) {
  const file = new File([blob], 'tempotuner-session.png', { type: 'image/png' });
  // The link goes into `text` because most apps (WhatsApp included) drop the
  // `url` field when files are attached.
  const text = message ? `${message}\n\nhttps://tempotuner.app` : 'https://tempotuner.app';
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        text,
        url: 'https://tempotuner.app',
        title: 'TempoTuner session',
      });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tempotuner-session.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
