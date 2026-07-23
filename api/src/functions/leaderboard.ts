import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { DayEntity, PLAYER_PARTITION, PlayerEntity, ensureTable, getTable } from '../lib/store';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOP_N = 20;

export async function leaderboard(req: HttpRequest): Promise<HttpResponseInit> {
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

  const playersAll: PlayerEntity[] = [];
  for await (const e of table.listEntities<PlayerEntity>({
    queryOptions: { filter: `PartitionKey eq '${PLAYER_PARTITION}'` },
  })) {
    playersAll.push(e as PlayerEntity);
  }
  playersAll.sort((a, b) => b.totalScore - a.totalScore);

  const today = todayAll.slice(0, TOP_N).map((e) => ({
    nickname: e.nickname,
    score: e.score,
    ...(uuid && e.rowKey === uuid ? { you: true } : {}),
  }));
  const allTime = playersAll.slice(0, TOP_N).map((e) => ({
    nickname: e.nickname,
    total: e.totalScore,
    games: e.games,
    ...(uuid && e.rowKey === uuid ? { you: true } : {}),
  }));

  let you = null;
  if (uuid) {
    const todayIdx = todayAll.findIndex((e) => e.rowKey === uuid);
    const allIdx = playersAll.findIndex((e) => e.rowKey === uuid);
    const me = allIdx >= 0 ? playersAll[allIdx] : null;
    you = {
      todayRank: todayIdx >= 0 ? 1 + todayAll.filter((e) => e.score > todayAll[todayIdx].score).length : null,
      allTimeRank: allIdx >= 0 ? 1 + playersAll.filter((e) => e.totalScore > me!.totalScore).length : null,
      total: me?.totalScore ?? 0,
      games: me?.games ?? 0,
    };
  }

  // No caching: after a run, the sheet must show the fresh board immediately.
  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: { day, today, allTime, you, playersToday: todayAll.length },
  };
}

app.http('leaderboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'leaderboard',
  handler: leaderboard,
});
