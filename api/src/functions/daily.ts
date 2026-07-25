import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { dailyNumber } from '../../../shared/scoring';
import { rateLimit } from '../lib/rateLimit';
import { songForDay } from '../lib/songs';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The requested day is user-local, so "open" spans ±1 day around server UTC —
 * the same window score.ts accepts. Anything older is "closed": no timezone
 * on Earth can still put it on the leaderboard.
 */
function dayState(day: string): 'future' | 'open' | 'closed' {
  const utcToday = new Date().toISOString().slice(0, 10);
  const submitted = new Date(`${day}T12:00:00Z`).getTime();
  const now = new Date(`${utcToday}T12:00:00Z`).getTime();
  if (submitted - now > 86400000) return 'future';
  if (now - submitted > 86400000) return 'closed';
  return 'open';
}

// 30s previews streamed straight from Apple's CDN. lookup?id= is exact (the
// trackId in songs.ts is pre-verified), so no fuzzy matching can go wrong at
// runtime. Cached per instance; a failed lookup isn't cached so it retries.
type Preview = { previewUrl: string | null; trackUrl: string | null };
const previewCache = new Map<number, Preview>();

async function lookupPreview(trackId: number): Promise<Preview> {
  const cached = previewCache.get(trackId);
  if (cached) return cached;
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${trackId}`);
    if (!res.ok) throw new Error(`itunes lookup ${res.status}`);
    const json = (await res.json()) as { results?: { previewUrl?: string; trackViewUrl?: string }[] };
    const track = json.results?.[0];
    const preview: Preview = {
      previewUrl: track?.previewUrl ?? null,
      trackUrl: track?.trackViewUrl ?? null,
    };
    previewCache.set(trackId, preview);
    return preview;
  } catch {
    return { previewUrl: null, trackUrl: null };
  }
}

/**
 * A day's challenge: title, artist and song-clip preview. For the open (current)
 * window the BPM — the answer — is never returned; it comes back with a scored
 * run. Closed past days can't reach the leaderboard anymore (score.ts rejects
 * them), so their BPM is included and the app replays them locally. Future days
 * still 404, so the rotation can't be scraped ahead of time.
 */
export async function daily(req: HttpRequest): Promise<HttpResponseInit> {
  // generous — the calendar can fire a few of these, but not hundreds
  const limited = rateLimit(req, 'daily', 60);
  if (limited) return limited;

  const day = req.query.get('day') ?? '';
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(day))) {
    return { status: 400, jsonBody: { error: 'invalid day' } };
  }
  const state = dayState(day);
  const number = dailyNumber(day);
  if (state === 'future' || number < 1) {
    return { status: 404, jsonBody: { error: 'not available' } };
  }
  const song = songForDay(number);
  const { previewUrl, trackUrl } = await lookupPreview(song.trackId);
  return {
    status: 200,
    // a closed day never changes; the open day's answer status flips at midnight
    headers: { 'Cache-Control': state === 'closed' ? 'public, max-age=86400' : 'public, max-age=300' },
    jsonBody: {
      day,
      number,
      title: song.title,
      artist: song.artist,
      previewUrl,
      trackUrl,
      ...(state === 'closed' ? { bpm: song.bpm } : {}),
    },
  };
}

app.http('daily', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'daily',
  handler: daily,
});
