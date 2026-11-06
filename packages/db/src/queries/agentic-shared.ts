import type { DbClient } from '../connection.js';
import {
  CHART_SERIES_SUMMARY_VERSION,
  encodeChartSeriesSummary,
} from '../etl/chart-series-summary';
import type { ChartSeries } from '../etl/compute-chart-series';
import type { RequestTimeline } from '../etl/compute-request-timeline';
import { gzipRequestTimeline } from '../etl/request-timeline-codec';
import {
  encodeSequenceLengthSketches,
  SEQUENCE_LENGTH_SKETCH_FORMAT,
} from '../etl/sequence-length-sketch-codec';

import {
  buildTokenLengthSketch,
  type TokenLengthSketch,
} from '@semianalysisai/inferencex-constants';

export const STATS_VERSION = 10;

export const SEQUENCE_LENGTH_SKETCHES_VERSION = STATS_VERSION * 100 + SEQUENCE_LENGTH_SKETCH_FORMAT;

export interface SequenceLengthSketchColumns {
  sketches: Buffer | null;
  version: number | null;
}

export function sequenceLengthSketchColumns(aggregateStats: unknown): SequenceLengthSketchColumns {
  const sketches =
    typeof aggregateStats === 'object' &&
    aggregateStats !== null &&
    'version' in aggregateStats &&
    aggregateStats.version === STATS_VERSION
      ? encodeSequenceLengthSketches(
          'sequenceLengths' in aggregateStats ? aggregateStats.sequenceLengths : undefined,
        )
      : null;
  return { sketches, version: sketches ? SEQUENCE_LENGTH_SKETCHES_VERSION : null };
}

export interface IslOslRecord {
  metadata?: { benchmark_phase?: string; was_cancelled?: boolean };
  metrics?: {
    input_sequence_length?: { value?: number } | number;
    output_sequence_length?: { value?: number } | number;
  };
}

export function pushRecordIslOsl(rec: IslOslRecord, isl: number[], osl: number[]): void {
  if (rec.metadata?.was_cancelled === true) return;
  const m = rec.metrics ?? {};
  const i = readNum(m.input_sequence_length);
  const o = readNum(m.output_sequence_length);
  if (typeof i === 'number') isl.push(i);
  if (typeof o === 'number') osl.push(o);
}

export function extractIslOsl(jsonl: string): { isl: number[]; osl: number[] } {
  const isl: number[] = [];
  const osl: number[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line) continue;
    let rec: IslOslRecord;
    try {
      rec = JSON.parse(line) as IslOslRecord;
    } catch {
      continue;
    }
    if (rec.metadata?.benchmark_phase && rec.metadata.benchmark_phase !== 'profiling') continue;
    pushRecordIslOsl(rec, isl, osl);
  }
  return { isl, osl };
}

export interface MetricPercentiles {
  mean: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  n: number;
}

export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (pos - lo);
}

export function meanOf(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function percentilesOf(samples: number[]): MetricPercentiles | null {
  const clean = samples.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  const sorted = [...clean].toSorted((a, b) => a - b);
  return {
    mean: meanOf(sorted),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    n: sorted.length,
  };
}

export interface SequenceLengthSketches {
  isl: TokenLengthSketch | null;
  osl: TokenLengthSketch | null;
}

export function sequenceLengthSketches(
  isl: readonly number[],
  osl: readonly number[],
): SequenceLengthSketches {
  return {
    isl: buildTokenLengthSketch(isl),
    osl: buildTokenLengthSketch(osl),
  };
}

export function readNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value?: unknown }).value;
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
  }
  return undefined;
}

export type WriteBackColumn = 'aggregate_stats';

let writeBackWarned = false;

export function _resetWriteBackWarned(): void {
  writeBackWarned = false;
}

function warnWriteBackFailure(target: string, error: unknown): void {
  if (writeBackWarned) return;
  writeBackWarned = true;
  console.warn(
    `[agentic write-back] could not persist ${target} (read-only connection?). ` +
      `Serving the recomputed result without caching. ${
        error instanceof Error ? error.message : String(error)
      }`,
  );
}

export function writeBackTraceReplayJsonb(
  sql: DbClient,
  column: WriteBackColumn,
  traceReplayId: number,
  payload: unknown,
): void {
  if (payload === null || payload === undefined) return;
  const value = structuredClone(payload);
  const { sketches, version } = sequenceLengthSketchColumns(value);
  void sql`
    update agentic_trace_replay set aggregate_stats = ${value}::jsonb,
      sequence_length_sketches = ${sketches},
      sequence_length_sketches_version = ${version}
    where id = ${traceReplayId}
  `.catch((error: unknown) => {
    warnWriteBackFailure(column, error);
  });
}

export function writeBackChartSeries(
  sql: DbClient,
  traceReplayId: number,
  series: ChartSeries,
): void {
  const json = JSON.stringify(series);
  const write = async () => {
    const summary = encodeChartSeriesSummary(json);
    await sql`
      update agentic_trace_replay
      set chart_series = ${json}::jsonb,
          chart_series_summary_gz = ${summary},
          chart_series_summary_version = ${CHART_SERIES_SUMMARY_VERSION}
      where id = ${traceReplayId}
    `;
  };
  void write().catch((error: unknown) => {
    warnWriteBackFailure('chart_series', error);
  });
}

export async function writeBackRequestTimeline(
  sql: DbClient,
  traceReplayId: number,
  timeline: RequestTimeline,
): Promise<void> {
  try {
    const gz = await gzipRequestTimeline(timeline);
    await sql`
      update agentic_trace_replay
      set request_timeline_gz = ${gz},
          request_timeline_version = ${timeline.version},
          request_count = ${timeline.requests.length},
          request_chart_data_gz = null,
          request_chart_data_version = null
      where id = ${traceReplayId}
        and coalesce(request_timeline_version, -1) <= ${timeline.version}
    `;
  } catch (error) {
    warnWriteBackFailure('request_timeline_gz', error);
  }
}
