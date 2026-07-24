import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { RestError } from '@azure/data-tables';
import { CHALLENGE_POINTS, dailyNumber, scoreRun } from '../../../shared/scoring';
import { songForDay } from '../lib/songs';
import { DayEntity, PLAYER_PARTITION, PlayerEntity, ensureTable, getTable } from '../lib/store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Per-interval BPM bounds implied by the app's tap filter (100ms–2400ms).
const MIN_BPM = 25;
const MAX_BPM = 600;

const bad = (message: string, status = 400): HttpResponseInit => ({
  status,
  jsonBody: { error: message },
});

/** Strip control chars and angle brackets, collapse whitespace. */
function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const nick = raw
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return nick.length >= 2 ? nick : null;
}

/** The submitted day key is user-local, so allow ±1 day around server UTC. */
function dayIsCurrent(day: string): boolean {
  const utcToday = new Date().toISOString().slice(0, 10);
  const submitted = new Date(`${day}T12:00:00Z`).getTime();
  const now = new Date(`${utcToday}T12:00:00Z`).getTime();
  return Math.abs(submitted - now) <= 86400000;
}

export async function score(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad('invalid JSON');
  }
  const { uuid, day, bpms } = (body ?? {}) as { uuid?: unknown; day?: unknown; bpms?: unknown };

  // Nickname is optional: without one the run is scored but not stored, so
  // players who never join the leaderboard still get their result.
  const nickRaw = (body as { nickname?: unknown })?.nickname;
  const nickname = nickRaw == null || nickRaw === '' ? null : cleanNickname(nickRaw);
  if (nickRaw != null && nickRaw !== '' && !nickname) return bad('nickname must be 2-20 characters');

  if (typeof uuid !== 'string' || !UUID_RE.test(uuid)) return bad('invalid uuid');
  if (typeof day !== 'string' || !DAY_RE.test(day) || Number.isNaN(Date.parse(day))) return bad('invalid day');
  if (!dayIsCurrent(day)) return bad('that daily is closed', 422);
  if (
    !Array.isArray(bpms) ||
    bpms.length !== CHALLENGE_POINTS ||
    !bpms.every((b) => typeof b === 'number' && Number.isFinite(b) && b >= MIN_BPM && b <= MAX_BPM)
  ) {
    return bad(`bpms must be ${CHALLENGE_POINTS} numbers between ${MIN_BPM} and ${MAX_BPM}`);
  }

  // Humans wobble. A run with essentially zero variance is machine-generated.
  const avg = bpms.reduce((s, b) => s + b, 0) / bpms.length;
  const sd = Math.sqrt(bpms.reduce((s, b) => s + (b - avg) ** 2, 0) / bpms.length);
  if (sd / avg < 0.004) return bad('that run looks machine-generated', 422);

  // Never trust a client-computed score: rescore the raw intervals with the
  // exact same shared code the app runs. (The in-run song clip is free: it
  // plays tempo-scrambled, so it never leaks the answer.)
  const song = songForDay(dailyNumber(day));
  const result = scoreRun(bpms as number[], song.bpm);

  await ensureTable();
  const table = getTable();

  let stored = false;
  if (nickname) {
    const entity: DayEntity = {
      partitionKey: day,
      rowKey: uuid.toLowerCase(),
      nickname,
      score: result.score,
      guess: result.guess,
      octave: result.octave,
      wobble: result.wobble,
    };
    stored = true;
    try {
      await table.createEntity(entity); // first submission wins
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 409) stored = false;
      else throw err;
    }
  }

  if (stored && nickname) {
    // Update the all-time aggregate. A lost race only affects the same uuid
    // double-submitting in the same instant, which createEntity already gates.
    const playerKey = uuid.toLowerCase();
    let player: PlayerEntity;
    try {
      const existing = await table.getEntity<PlayerEntity>(PLAYER_PARTITION, playerKey);
      player = {
        partitionKey: PLAYER_PARTITION,
        rowKey: playerKey,
        nickname,
        totalScore: (existing.totalScore ?? 0) + result.score,
        games: (existing.games ?? 0) + 1,
        bestScore: Math.max(existing.bestScore ?? 0, result.score),
        lastDay: day,
      };
    } catch (err) {
      if (!(err instanceof RestError && err.statusCode === 404)) throw err;
      player = {
        partitionKey: PLAYER_PARTITION,
        rowKey: playerKey,
        nickname,
        totalScore: result.score,
        games: 1,
        bestScore: result.score,
        lastDay: day,
      };
    }
    await table.upsertEntity(player, 'Replace');
    context.log(`score accepted: day=${day} nick=${nickname} score=${result.score}`);
  }

  // Rank among today's entries (ties share a rank). For a joined player the
  // recorded (first) score is what counts — a resubmit can't improve it. For
  // anonymous players the rank is hypothetical ("you'd be #N").
  const scores: { rowKey: string; score: number }[] = [];
  let own: DayEntity | null = null;
  for await (const e of table.listEntities<DayEntity>({
    queryOptions: { filter: `PartitionKey eq '${day}'` },
  })) {
    scores.push({ rowKey: e.rowKey!, score: e.score });
    if (e.rowKey === uuid.toLowerCase()) own = e as DayEntity;
  }
  const recorded = own ?? result;
  const rankToday = 1 + scores.filter((s) => s.score > recorded.score).length;

  return {
    status: 200,
    jsonBody: {
      stored,
      score: recorded.score,
      guess: recorded.guess,
      octave: recorded.octave,
      wobble: recorded.wobble,
      actualBpm: song.bpm,
      rankToday,
      playersToday: own ? scores.length : scores.length + 1,
    },
  };
}

app.http('score', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'score',
  handler: score,
});
