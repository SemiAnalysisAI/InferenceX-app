import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import { encodeRequestChartColumns } from '../etl/request-chart-columns';
import { gzipRequestTimeline } from '../etl/request-timeline-codec';
import { writeBackRequestTimeline } from '../queries/agentic-shared';
import {
  REQUEST_CHART_DATA_VERSION,
  getRequestChartData,
  requestChartDataFromTimelineGz,
} from '../queries/request-chart-data';
import { getTraceHistograms } from '../queries/trace-histograms';
import {
  computeRequestChartColumns,
  writeRequestChartColumns,
} from './request-chart-data-backfill';
import { writeRequestTimelineGz } from './request-timeline-backfill';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';

function timelineFor(seed: number): RequestTimeline {
  return {
    version: REQUEST_TIMELINE_VERSION,
    startNs: 1_700_000_000_000_000_000 + seed,
    endNs: 1_700_000_001_400_000_000 + seed,
    durationS: 1.4,
    requests: Array.from({ length: 6 }, (_, index) => ({
      cid: `trace-${seed}-${index % 3}`,
      ri: index % 3,
      ti: Math.floor(index / 3),
      wid: String(index),
      ad: 0,
      phase: index === 0 ? 'warmup' : 'profiling',
      credit: index * 1_000_000,
      start: index * 1_000_000 + 250_499 - seed,
      ack: null,
      end: index * 1_000_000 + 40_000_501,
      ttftMs: index === 3 ? null : 40.123_456 + seed + index / 7,
      tpotMs: index === 4 ? 0.000_49 : 18.125,
      isl: index === 2 ? null : 16_000 + seed * 100 + index,
      osl: index === 1 ? null : 300 + seed * 10 + index,
      cancelled: index === 3,
    })),
  };
}

interface ColumnsRow {
  request_chart_data_gz: Uint8Array | null;
  request_chart_data_version: number | null;
}

let db: PGlite;
let sql: PgliteSql;

async function storedColumns(id: number): Promise<ColumnsRow> {
  const [row] = (await sql`
    select request_chart_data_gz, request_chart_data_version
    from agentic_trace_replay where id = ${id}
  `) as unknown as ColumnsRow[];
  return row!;
}

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
}, 30_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('TRUNCATE agentic_trace_replay RESTART IDENTITY CASCADE');
  await sql`
    insert into agentic_trace_replay (id, request_timeline_gz, request_timeline_version, request_count)
    values (21, ${await gzipRequestTimeline(timelineFor(1))}, ${REQUEST_TIMELINE_VERSION}, 6)
  `;
  await db.exec(`
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, conc,
      metrics, trace_replay_id)
    VALUES (201, 1, 1, 'agentic_traces', '2026-10-01', 16, '{}', 21);
  `);
});

describe('request chart columns backfill (PostgreSQL)', () => {
  it('stores columns that serve the same chart data and histograms as the timeline', async () => {
    const fromTimeline = await getRequestChartData(sql, 201);
    const histograms = await getTraceHistograms(sql, [201]);

    const stored = await computeRequestChartColumns(sql, 21);
    await expect(writeRequestChartColumns(sql, 21, stored!)).resolves.toBe(true);

    expect(await storedColumns(21)).toMatchObject({
      request_chart_data_version: REQUEST_CHART_DATA_VERSION,
    });
    const fromColumns = await getRequestChartData(sql, 201);
    expect(JSON.stringify(fromColumns)).toBe(JSON.stringify(fromTimeline));
    expect(JSON.stringify(await getTraceHistograms(sql, [201]))).toBe(JSON.stringify(histograms));
  });

  it('serves stored columns instead of rescanning the timeline', async () => {
    const stored = await computeRequestChartColumns(sql, 21);
    const other = await requestChartDataFromTimelineGz(await gzipRequestTimeline(timelineFor(2)));
    await writeRequestChartColumns(sql, 21, {
      ...stored!,
      columns: encodeRequestChartColumns(other),
    });

    await expect(getRequestChartData(sql, 201)).resolves.toEqual(other);
  });

  it('writes nothing when the timeline changed after it was read', async () => {
    const stored = await computeRequestChartColumns(sql, 21);

    await expect(
      writeRequestChartColumns(sql, 21, { ...stored!, timelineMd5: '0'.repeat(32) }),
    ).resolves.toBe(false);
    expect(await storedColumns(21)).toEqual({
      request_chart_data_gz: null,
      request_chart_data_version: null,
    });
  });

  it('is cleared by every rewrite of the timeline', async () => {
    const empty = { request_chart_data_gz: null, request_chart_data_version: null };
    const fill = async (): Promise<void> => {
      const stored = await computeRequestChartColumns(sql, 21);
      await writeRequestChartColumns(sql, 21, stored!);
    };

    await fill();
    await writeBackRequestTimeline(sql, 21, timelineFor(3));
    expect(await storedColumns(21)).toEqual(empty);

    await fill();
    const gz = await gzipRequestTimeline(timelineFor(4));
    await writeRequestTimelineGz(sql, 21, {
      gz,
      version: REQUEST_TIMELINE_VERSION,
      requestCount: 6,
    });
    expect(await storedColumns(21)).toEqual(empty);
  });
});
