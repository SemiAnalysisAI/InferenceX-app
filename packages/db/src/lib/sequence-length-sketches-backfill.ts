import type { Sql } from '../etl/db-utils.js';
import {
  SEQUENCE_LENGTH_SKETCHES_VERSION,
  sequenceLengthSketchColumns,
} from '../queries/agentic-shared.js';

export interface SequenceLengthSketchesRow {
  sketches: Buffer;
  /** MD5 of the `aggregate_stats` text the sketches were encoded from. */
  statsMd5: string;
}

/**
 * Encode the sketches of a row's stored `aggregate_stats`. Returns null when
 * the stats are missing or stale, or their sketches do not encode exactly.
 */
export async function computeSequenceLengthSketches(
  sql: Sql,
  traceReplayId: number,
): Promise<SequenceLengthSketchesRow | null> {
  const [row] = await sql<{ version: unknown; sequence_lengths: unknown; stats_md5: string }[]>`
    select
      aggregate_stats->'version' as version,
      aggregate_stats->'sequenceLengths' as sequence_lengths,
      md5(aggregate_stats::text) as stats_md5
    from agentic_trace_replay
    where id = ${traceReplayId}
      and aggregate_stats is not null
  `;
  if (!row) return null;
  const { sketches } = sequenceLengthSketchColumns({
    version: row.version,
    sequenceLengths: row.sequence_lengths,
  });
  return sketches ? { sketches, statsMd5: row.stats_md5 } : null;
}

/**
 * Store sketches computed by `computeSequenceLengthSketches`. Returns false,
 * and writes nothing, when `aggregate_stats` changed since it was read.
 */
export async function writeSequenceLengthSketches(
  sql: Sql,
  traceReplayId: number,
  stored: SequenceLengthSketchesRow,
): Promise<boolean> {
  const updated = await sql<{ id: number }[]>`
    update agentic_trace_replay
    set sequence_length_sketches = ${stored.sketches},
      sequence_length_sketches_version = ${SEQUENCE_LENGTH_SKETCHES_VERSION}
    where id = ${traceReplayId}
      and md5(aggregate_stats::text) = ${stored.statsMd5}
    returning id
  `;
  return updated.length > 0;
}
