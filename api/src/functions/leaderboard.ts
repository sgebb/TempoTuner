import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { rateLimit } from '../lib/rateLimit';
import { DayEntity, ensureTable, getTable } from '../lib/store';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOP_N = 20;
const ATTEMPT_WINDOW = 20;
const SCORES_TO_COUNT = 15;
const MIN_GAMES = 8;

type AllTimePlayer = {
  rowKey: string;
  nickname: string;
  score: number;
  games: number;
};

/** Best 15 scores from a player's latest 20 attempts. */
function allTimePlayer(rowKey: string, attempts: DayEntity[]): AllTimePlayer {
  const newestFirst = [...attempts].sort((a, b) => b.partitionKey.localeCompare(a.partitionKey));
  const window = newestFirst.slice(0, ATTEMPT_WINDOW);
  const score = [...window].sort((a, b) => b.score - a.score).slice(0, SCORES_TO_COUNT).reduce((sum, e) => sum + e.score, 0);
  return {
    rowKey,
    // A nickname can change; show the one from the latest recorded attempt.
    nickname: newestFirst[0].nickname,
    score,
    games: attempts.length,
  };
}

export async function leaderboard(req: HttpRequest): Promise<HttpResponseInit> {
  // the costliest endpoint (two full table scans) — keep refresh-spamming in check
  const limited = rateLimit(req, 'leaderboard', 30);
  if (limited) return limited;

  const day = req.query.get('day') ?? '';
  const uuidRaw = req.query.get('uuid') ?? '';
  if (!DAY_RE.test(day)) return { status: 400, jsonBody: { error: 'invalid day' } };
  const uuid = UUID_RE.test(uuidRaw) ? uuidRaw.toLowerCase() : null;

  await ensureTable();
  const table = getTable();

  const todayAll: DayEntity[] = [];
  for await (const e of table.listEntities<DayEntity>({
    queryOptions: { filter: `PartitionKey eq '${day}'` },
  })) {
    todayAll.push(e as DayEntity);
  }
  todayAll.sort((a, b) => b.score - a.score);

  // Daily rows are the source of truth. The old player aggregates remain in
  // storage for backwards compatibility, but aren't used for rankings.
  const attemptsByPlayer = new Map<string, DayEntity[]>();
  for await (const e of table.listEntities<DayEntity>()) {
    const attempt = e as DayEntity;
    if (!DAY_RE.test(attempt.partitionKey)) continue;
    const attempts = attemptsByPlayer.get(attempt.rowKey) ?? [];
    attempts.push(attempt);
    attemptsByPlayer.set(attempt.rowKey, attempts);
  }
  const allPlayers = [...attemptsByPlayer.entries()].map(([rowKey, attempts]) => allTimePlayer(rowKey, attempts));
  const eligiblePlayers = allPlayers.filter((player) => player.games >= MIN_GAMES).sort((a, b) => b.score - a.score);

  const today = todayAll.slice(0, TOP_N).map((e) => ({
    nickname: e.nickname,
    score: e.score,
    ...(uuid && e.rowKey === uuid ? { you: true } : {}),
  }));
  const allTime = eligiblePlayers.slice(0, TOP_N).map((e) => ({
    nickname: e.nickname,
    total: e.score,
    games: e.games,
    rank: 1 + eligiblePlayers.filter((player) => player.score > e.score).length,
    ...(uuid && e.rowKey === uuid ? { you: true } : {}),
  }));

  let you = null;
  if (uuid) {
    const todayIdx = todayAll.findIndex((e) => e.rowKey === uuid);
    const me = allPlayers.find((e) => e.rowKey === uuid) ?? null;
    you = {
      todayRank: todayIdx >= 0 ? 1 + todayAll.filter((e) => e.score > todayAll[todayIdx].score).length : null,
      // Show an honest hypothetical placement for players still building up
      // their minimum attempts. Ties share a rank, as on the daily board.
      allTimeRank: me ? 1 + eligiblePlayers.filter((e) => e.score > me.score).length : null,
      eligible: (me?.games ?? 0) >= MIN_GAMES,
      total: me?.score ?? 0,
      games: me?.games ?? 0,
    };
  }

  // No caching: after a run, the sheet must show the fresh board immediately.
  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: {
      day,
      today,
      allTime,
      you,
      playersToday: todayAll.length,
      allTimeRules: { attemptWindow: ATTEMPT_WINDOW, scoresCounted: SCORES_TO_COUNT, minimumGames: MIN_GAMES },
    },
  };
}

app.http('leaderboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'leaderboard',
  handler: leaderboard,
});
