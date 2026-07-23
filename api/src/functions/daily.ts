import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { dailyNumber } from '../../../shared/scoring';
import { songForDay } from '../lib/songs';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The requested day is user-local, so allow ±1 day around server UTC. */
function dayIsCurrent(day: string): boolean {
  const utcToday = new Date().toISOString().slice(0, 10);
  const submitted = new Date(`${day}T12:00:00Z`).getTime();
  const now = new Date(`${utcToday}T12:00:00Z`).getTime();
  return Math.abs(submitted - now) <= 86400000;
}

/**
 * Today's challenge: title and artist only. The BPM (the answer) is never
 * returned here — it comes back with a scored run. Only the current day
 * window is served, so the future rotation can't be scraped.
 */
export async function daily(req: HttpRequest): Promise<HttpResponseInit> {
  const day = req.query.get('day') ?? '';
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(day))) {
    return { status: 400, jsonBody: { error: 'invalid day' } };
  }
  if (!dayIsCurrent(day)) {
    return { status: 404, jsonBody: { error: 'not the current daily' } };
  }
  const number = dailyNumber(day);
  const song = songForDay(number);
  return {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=300' },
    jsonBody: { day, number, title: song.title, artist: song.artist },
  };
}

app.http('daily', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'daily',
  handler: daily,
});
