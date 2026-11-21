import type { Client } from "@libsql/client";

export interface ClientPushStats {
  readonly clientId: string;
  readonly pushes: number;
  readonly duplicates: number;
  readonly lastPushAt: number | null;
}

export interface PushStats {
  readonly boardId: string | null;
  readonly totalPushes: number;
  readonly duplicatePushes: number;
  readonly uniqueKeys: number;
  readonly uniqueClients: number;
  readonly lastPushAt: number | null;
  readonly clients: readonly ClientPushStats[];
}

function toNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * Aggregates the push log for the field-testing report.
 *
 * `duplicatePushes` counts requests that arrived with an idempotency key the
 * server had already seen. Comparing it with `totalPushes` shows how often the
 * client retried a request whose response was lost, or how often two tabs
 * pushed the same compacted patch set.
 */
export async function getPushStats(
  db: Client,
  boardId: string | null,
): Promise<PushStats> {
  const where = boardId === null ? "" : "WHERE board_id = ?";
  const args = boardId === null ? [] : [boardId];

  const totals = await db.execute({
    sql: `SELECT
            COUNT(*) AS total_pushes,
            COALESCE(SUM(duplicate), 0) AS duplicate_pushes,
            COUNT(DISTINCT idem_key) AS unique_keys,
            COUNT(DISTINCT client_id) AS unique_clients,
            MAX(received_at) AS last_push_at
          FROM push_log
          ${where}`,
    args,
  });

  const perClient = await db.execute({
    sql: `SELECT
            client_id,
            COUNT(*) AS pushes,
            COALESCE(SUM(duplicate), 0) AS duplicates,
            MAX(received_at) AS last_push_at
          FROM push_log
          ${where}
          GROUP BY client_id
          ORDER BY pushes DESC, client_id ASC`,
    args,
  });

  const totalsRow = totals.rows[0];

  return {
    boardId,
    totalPushes: toNumber(totalsRow?.total_pushes),
    duplicatePushes: toNumber(totalsRow?.duplicate_pushes),
    uniqueKeys: toNumber(totalsRow?.unique_keys),
    uniqueClients: toNumber(totalsRow?.unique_clients),
    lastPushAt: toNullableNumber(totalsRow?.last_push_at),
    clients: perClient.rows.map((row) => ({
      clientId: String(row.client_id),
      pushes: toNumber(row.pushes),
      duplicates: toNumber(row.duplicates),
      lastPushAt: toNullableNumber(row.last_push_at),
    })),
  };
}
