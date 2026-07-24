import { TableClient } from '@azure/data-tables';

// One table, two kinds of partitions:
//   PartitionKey = "2026-07-24" (a day key) → that day's entries, RowKey = uuid
//   PartitionKey = "player"                 → all-time aggregates, RowKey = uuid
// Uses the function app's own storage account (AzureWebJobsStorage), so no
// extra connection string needs configuring.
const TABLE_NAME = 'leaderboard';

export const PLAYER_PARTITION = 'player';

export type DayEntity = {
  partitionKey: string;
  rowKey: string;
  nickname: string;
  score: number;
  guess: number;
  octave: string;
  wobble: number;
  /** points deducted for listening to the clip before the run (absent = 0) */
  clip?: number;
};

export type PlayerEntity = {
  partitionKey: string;
  rowKey: string;
  nickname: string;
  totalScore: number;
  games: number;
  bestScore: number;
  lastDay: string;
};

let client: TableClient | null = null;
let tableReady: Promise<void> | null = null;

export function getTable(): TableClient {
  if (!client) {
    const conn = process.env.AzureWebJobsStorage;
    if (!conn) throw new Error('AzureWebJobsStorage is not configured');
    client = TableClient.fromConnectionString(conn, TABLE_NAME);
  }
  return client;
}

/** Idempotent create — awaited once per instance, cheap thereafter. */
export function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = getTable()
      .createTable()
      .then(
        () => undefined,
        (err) => {
          // 409 TableAlreadyExists is the normal warm path
          if ((err as { statusCode?: number })?.statusCode !== 409) {
            tableReady = null;
            throw err;
          }
        }
      );
  }
  return tableReady;
}
