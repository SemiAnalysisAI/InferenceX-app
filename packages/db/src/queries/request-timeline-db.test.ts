import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import { gzipRequestTimeline } from '../etl/request-timeline-codec';
import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';

import { encodeRequestChartData, getRequestChartData } from './request-chart-data';
import { getRequestTimeline } from './request-timeline';
import { getTraceHistograms } from './trace-histograms';

/** A small timeline whose request fields differ by `seed`. */
function timelineFor(seed: number): RequestTimeline {
  return {
    version: REQUEST_TIMELINE_VERSION,
    startNs: 1_700_000_000_000_000_000 + seed * 1_000_000_000,
    endNs: 1_700_000_001_400_000_000 + seed * 1_000_000_000,
    durationS: 1.4,
    requests: Array.from({ length: 4 }, (_, index) => ({
      cid: `trace-${seed}-${index % 2}`,
      ri: index % 2,
      ti: Math.floor(index / 2),
      srcTrace: `weka-${seed}`,
      wid: String(index),
      ad: 0,
      phase: index === 0 ? 'warmup' : 'profiling',
      credit: index * 1_000_000,
      start: index * 1_000_000 + 250_000,
      ack: index === 3 ? null : index * 1_000_000 + 750_000,
      end: index * 1_000_000 + 40_000_000,
      ttftMs: index === 3 ? null : 40 + seed + index / 8,
      tpotMs: 18.125,
      isl: index === 2 ? null : 16_000 + seed * 100 + index,
      osl: index === 1 ? null : 300 + seed * 10 + index,
      cancelled: index === 3,
    })),
  };
}

/** Expected histogram arrays: the numeric ISL/OSL values in request order. */
function sequenceLengths(timeline: RequestTimeline): { isl: number[]; osl: number[] } {
  return {
    isl: timeline.requests.flatMap((request) => (request.isl === null ? [] : [request.isl])),
    osl: timeline.requests.flatMap((request) => (request.osl === null ? [] : [request.osl])),
  };
}

const legacyOnly = timelineFor(1);
const gzipOnly = timelineFor(2);
const gzipCopy = timelineFor(3);
// Same version, different content: only a reader that consults the legacy
// copy despite a gzip copy could return it.
const supersededLegacy = timelineFor(4);

let db: PGlite;
let sql: PgliteSql;

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
  await db.exec(`
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', 'completed', 'success', '2026-10-01T04:19:00Z', '2026-10-01');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsv4', 'b200', 'vllm', 'fp4', 'none', false, false, 8, 8, 8, 8);
  `);
  await sql`
    insert into agentic_trace_replay (id, request_timeline)
    values (11, ${JSON.stringify(legacyOnly)}::jsonb)
  `;
  await sql`
    insert into agentic_trace_replay (id, request_timeline_gz, request_timeline_version, request_count)
    values (12, ${await gzipRequestTimeline(gzipOnly)}, ${REQUEST_TIMELINE_VERSION}, 4)
  `;
  await sql`
    insert into agentic_trace_replay (
      id, request_timeline, request_timeline_gz, request_timeline_version, request_count
    )
    values (
      13, ${JSON.stringify(supersededLegacy)}::jsonb, ${await gzipRequestTimeline(gzipCopy)},
      ${REQUEST_TIMELINE_VERSION}, 4
    )
  `;
  await db.exec(`
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, conc,
      metrics, trace_replay_id)
    VALUES (101, 1, 1, 'agentic_traces', '2026-10-01', 16, '{}', 11),
           (102, 1, 1, 'agentic_traces', '2026-10-01', 32, '{}', 12),
           (103, 1, 1, 'agentic_traces', '2026-10-01', 64, '{}', 13);
  `);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe('request timeline storage on PostgreSQL', () => {
  it('reads legacy JSONB, gzip-only, and gzip-over-legacy rows from the right column', async () => {
    await expect(getRequestTimeline(sql, 101)).resolves.toEqual(legacyOnly);
    await expect(getRequestTimeline(sql, 102)).resolves.toEqual(gzipOnly);
    await expect(getRequestTimeline(sql, 103)).resolves.toEqual(gzipCopy);
  });

  it('encodes identical chart tuples from the SQL projection and the gzip decode', async () => {
    // Point 101 is a small legacy row, so it takes the SQL projection.
    await expect(getRequestChartData(sql, 101)).resolves.toEqual(
      encodeRequestChartData(legacyOnly, legacyOnly.requests),
    );
    await expect(getRequestChartData(sql, 102)).resolves.toEqual(
      encodeRequestChartData(gzipOnly, gzipOnly.requests),
    );
    await expect(getRequestChartData(sql, 103)).resolves.toEqual(
      encodeRequestChartData(gzipCopy, gzipCopy.requests),
    );
  });

  it('returns the same ISL/OSL arrays from the SQL unnest and the gzip decode', async () => {
    await expect(getTraceHistograms(sql, [101, 102, 103])).resolves.toEqual({
      101: { id: 101, ...sequenceLengths(legacyOnly) },
      102: { id: 102, ...sequenceLengths(gzipOnly) },
      103: { id: 103, ...sequenceLengths(gzipCopy) },
    });
  });
});
