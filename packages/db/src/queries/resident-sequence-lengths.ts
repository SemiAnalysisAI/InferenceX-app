import {
  mergeTokenLengthSketches,
  type TokenLengthSketch,
} from '@semianalysisai/inferencex-constants';

import type { DbClient } from '../connection.js';
import { mergeSequenceLengthSketchPayloads } from '../etl/sequence-length-sketch-codec';
import { SEQUENCE_LENGTH_SKETCHES_VERSION, STATS_VERSION } from './agentic-shared';

interface StoredSequenceLengthsJson {
  version: unknown;
  sequence_lengths: {
    isl?: TokenLengthSketch | null;
    osl?: TokenLengthSketch | null;
  } | null;
}

interface StoredSequenceLengthsRow extends StoredSequenceLengthsJson {
  benchmark_result_id: number | string;
  sketches: string | null;
}

export interface ResidentSequenceLengthSketches {
  isl: TokenLengthSketch | null;
  osl: TokenLengthSketch | null;
  coveredPoints: number;
  requestedPoints: number;
}

export async function getResidentSequenceLengthSketches(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<ResidentSequenceLengthSketches> {
  if (benchmarkResultIds.length === 0) {
    return { isl: null, osl: null, coveredPoints: 0, requestedPoints: 0 };
  }

  const rows = (await sql`
    select
      br.id as benchmark_result_id,
      case when atr.sequence_length_sketches_version = ${SEQUENCE_LENGTH_SKETCHES_VERSION}
        then encode(atr.sequence_length_sketches, 'base64') end as sketches,
      case when atr.sequence_length_sketches_version is distinct from ${SEQUENCE_LENGTH_SKETCHES_VERSION}
        then atr.aggregate_stats->'version' end as version,
      case when atr.sequence_length_sketches_version is distinct from ${SEQUENCE_LENGTH_SKETCHES_VERSION}
        then atr.aggregate_stats->'sequenceLengths' end as sequence_lengths
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = any(${benchmarkResultIds}::bigint[])
  `) as unknown as StoredSequenceLengthsRow[];

  const encodedRows = rows.filter(
    (row): row is StoredSequenceLengthsRow & { sketches: string } => row.sketches !== null,
  );
  const merged = mergeSequenceLengthSketchPayloads(
    encodedRows.map((row) => Buffer.from(row.sketches, 'base64')),
  );
  const jsonRows: StoredSequenceLengthsJson[] = rows.filter((row) => row.sketches === null);
  if (merged.unreadable.length > 0) {
    const unreadableIds = merged.unreadable.map((index) => encodedRows[index].benchmark_result_id);
    console.warn(
      `[resident-sequence-lengths] unreadable sequence_length_sketches for benchmark ids ` +
        `${unreadableIds.join(',')}, reading aggregate_stats instead`,
    );
    const fallback = (await sql`
      select
        atr.aggregate_stats->'version' as version,
        atr.aggregate_stats->'sequenceLengths' as sequence_lengths
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${unreadableIds}::bigint[])
    `) as unknown as StoredSequenceLengthsJson[];
    jsonRows.push(...fallback);
  }

  const current = jsonRows.filter(
    (row) =>
      row.version === STATS_VERSION &&
      Boolean(row.sequence_lengths?.isl || row.sequence_lengths?.osl),
  );
  if (current.length === 0) {
    return {
      isl: merged.isl,
      osl: merged.osl,
      coveredPoints: merged.coveredPoints,
      requestedPoints: benchmarkResultIds.length,
    };
  }
  return {
    isl: mergeTokenLengthSketches([merged.isl, ...current.map((row) => row.sequence_lengths?.isl)]),
    osl: mergeTokenLengthSketches([merged.osl, ...current.map((row) => row.sequence_lengths?.osl)]),
    coveredPoints: merged.coveredPoints + current.length,
    requestedPoints: benchmarkResultIds.length,
  };
}
