import type { DbClient } from '../connection';
import type { Sql } from '../etl/db-utils';

type ServerMetricsSql = DbClient | Sql;

// Postgres returns bytea as hex text, so selecting a blob over ~512 MB whole exceeds its 1 GB allocation limit.
export const SERVER_METRICS_SLICE_BYTES = 16 * 1024 * 1024;

export async function readServerMetricsGz(
  sql: ServerMetricsSql,
  traceReplayId: number,
  sliceBytes = SERVER_METRICS_SLICE_BYTES,
): Promise<Buffer | null> {
  const query = sql as DbClient;
  const [meta] = await query`
    select octet_length(server_metrics_json_gz) as size
    from agentic_trace_replay where id = ${traceReplayId}
  `;
  if (meta?.size === null || meta?.size === undefined) return null;
  const size = Number(meta.size);
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid server metrics size');
  const blob = Buffer.allocUnsafe(size);
  for (let offset = 0; offset < size; offset += sliceBytes) {
    const [row] = await query`
      select substring(server_metrics_json_gz from ${offset + 1}::int for ${sliceBytes}::int) as data
      from agentic_trace_replay where id = ${traceReplayId}
    `;
    const data = row?.data;
    if (!(data instanceof Uint8Array) || data.length !== Math.min(sliceBytes, size - offset)) {
      throw new Error(
        `Missing or truncated server metrics for trace ${traceReplayId} at ${offset}`,
      );
    }
    blob.set(data, offset);
  }
  return blob;
}
