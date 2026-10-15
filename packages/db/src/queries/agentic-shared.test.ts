import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../connection.js';
import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import { gunzipRequestTimeline } from '../etl/request-timeline-codec';
import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';

import {
  _resetWriteBackWarned,
  writeBackRequestTimeline,
  writeBackTraceReplayJsonb,
} from './agentic-shared';

/**
 * Capture every SQL call: the joined template text plus the bound values, so we
 * can assert the write-back targets the right column and binds the JSONB
 * payload as a `::jsonb`-cast JSON string (driver-agnostic).
 */
function mockSql(reject?: Error): {
  sql: DbClient;
  calls: { text: string; values: unknown[] }[];
} {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return reject ? Promise.reject(reject) : Promise.resolve([]);
  }) as unknown as DbClient;
  return { sql, calls };
}

afterEach(() => {
  _resetWriteBackWarned();
  vi.restoreAllMocks();
});

describe('writeBackTraceReplayJsonb', () => {
  it('issues a fixed-column UPDATE binding the payload as ::jsonb + the id', () => {
    const { sql, calls } = mockSql();
    writeBackTraceReplayJsonb(sql, 'chart_series', 870, { version: 12, foo: 'bar' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toContain('update agentic_trace_replay set chart_series');
    expect(calls[0]!.text).toContain('::jsonb where id');
    // The payload OBJECT is bound directly (not JSON.stringify'd — that would
    // double-encode into a JSONB string), followed by the id. Only the value +
    // id are interpolated; the column name is fully static in the SQL text.
    expect(calls[0]!.values).toEqual([{ version: 12, foo: 'bar' }, 870]);
  });

  it('targets the requested column verbatim (no cross-talk between columns)', () => {
    const cases: ('aggregate_stats' | 'chart_series')[] = ['aggregate_stats', 'chart_series'];
    for (const column of cases) {
      const { sql, calls } = mockSql();
      writeBackTraceReplayJsonb(sql, column, 1, { v: 1 });
      expect(calls[0]!.text).toContain(`update agentic_trace_replay set ${column}`);
    }
  });

  it('no-ops on a null/undefined payload (never overwrites good data with a hole)', () => {
    const { sql, calls } = mockSql();
    writeBackTraceReplayJsonb(sql, 'aggregate_stats', 1, null);
    writeBackTraceReplayJsonb(sql, 'aggregate_stats', 1, undefined);
    expect(calls).toHaveLength(0);
  });

  it('swallows a rejected UPDATE (read-only replica) and warns exactly once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sql } = mockSql(new Error('cannot execute UPDATE in a read-only transaction'));

    // Fire twice; the helper is fire-and-forget so neither call throws.
    expect(() => writeBackTraceReplayJsonb(sql, 'chart_series', 1, { v: 1 })).not.toThrow();
    expect(() => writeBackTraceReplayJsonb(sql, 'chart_series', 2, { v: 1 })).not.toThrow();

    // Let the caught rejections settle.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('could not persist chart_series');
  });
});

describe('writeBackRequestTimeline', () => {
  const timeline: RequestTimeline = {
    version: REQUEST_TIMELINE_VERSION,
    startNs: 1_700_000_000_000_000_000,
    endNs: 1_700_000_001_400_000_000,
    durationS: 1.4,
    requests: [
      {
        cid: 'trace-018',
        ri: 0,
        ti: 0,
        wid: '7',
        ad: 0,
        phase: 'profiling',
        credit: 0,
        start: 1_200_000,
        ack: 1_800_000,
        end: 420_000_000,
        ttftMs: 42.3,
        tpotMs: 18.1,
        isl: 18_320,
        osl: 410,
        cancelled: false,
      },
    ],
  };

  interface StoredRow {
    request_timeline_gz: Uint8Array | null;
    request_timeline_version: number | null;
    request_count: number | null;
    request_timeline: unknown;
  }

  let db: PGlite;
  let pg: PgliteSql;

  beforeAll(async () => {
    db = await migratedPglite();
    pg = pgliteSql(db);
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  async function storedRow(id: number): Promise<StoredRow> {
    const [row] = (await pg`
      select request_timeline_gz, request_timeline_version, request_count, request_timeline
      from agentic_trace_replay
      where id = ${id}
    `) as unknown as StoredRow[];
    return row!;
  }

  it('replaces an older timeline with gzip and its scalars, leaving the legacy JSONB alone', async () => {
    const legacy = { version: REQUEST_TIMELINE_VERSION - 1, requests: [] };
    await pg`
      insert into agentic_trace_replay (id, request_timeline, request_timeline_version)
      values (870, ${JSON.stringify(legacy)}::jsonb, ${REQUEST_TIMELINE_VERSION - 1})
    `;

    await writeBackRequestTimeline(pg, 870, timeline);

    const row = await storedRow(870);
    expect(gunzipRequestTimeline(row.request_timeline_gz!)).toEqual(timeline);
    expect(row.request_timeline_version).toBe(REQUEST_TIMELINE_VERSION);
    expect(row.request_count).toBe(1);
    expect(row.request_timeline).toEqual(legacy);
  });

  it('refuses to replace a newer stored timeline version', async () => {
    const newer = Buffer.from('gzip written by a newer extractor');
    await pg`
      insert into agentic_trace_replay (id, request_timeline_gz, request_timeline_version, request_count)
      values (871, ${newer}, ${REQUEST_TIMELINE_VERSION + 1}, 9)
    `;

    await writeBackRequestTimeline(pg, 871, timeline);

    const row = await storedRow(871);
    expect(Buffer.from(row.request_timeline_gz!).equals(newer)).toBe(true);
    expect(row.request_timeline_version).toBe(REQUEST_TIMELINE_VERSION + 1);
    expect(row.request_count).toBe(9);
  });

  it('resolves after a rejected UPDATE and warns once with the gzip column name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sql } = mockSql(new Error('cannot execute UPDATE in a read-only transaction'));

    await expect(writeBackRequestTimeline(sql, 870, timeline)).resolves.toBeUndefined();
    await expect(writeBackRequestTimeline(sql, 871, timeline)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('could not persist request_timeline_gz');
  });
});
