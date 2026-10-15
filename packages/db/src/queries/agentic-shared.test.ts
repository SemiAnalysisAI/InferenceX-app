import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../connection.js';
import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import { gunzipRequestTimeline } from '../etl/request-timeline-codec';

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

  it('writes the gzip timeline and its scalars, never the legacy JSONB column', async () => {
    const { sql, calls } = mockSql();
    writeBackRequestTimeline(sql, 870, timeline);

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const [call] = calls;
    expect(call!.text).toContain('set request_timeline_gz = ?');
    expect(call!.text).toContain('request_timeline_version = ?');
    expect(call!.text).toContain('request_count = ?');
    expect(call!.text).not.toContain('::jsonb');
    // A newer stored version is never replaced.
    expect(call!.text).toContain('coalesce(request_timeline_version, -1) <= ?');
    const [gz, version, requestCount, id, guardVersion] = call!.values;
    expect(gunzipRequestTimeline(gz as Buffer)).toEqual(timeline);
    expect([version, requestCount, id, guardVersion]).toEqual([
      REQUEST_TIMELINE_VERSION,
      1,
      870,
      REQUEST_TIMELINE_VERSION,
    ]);
  });

  it('swallows a rejected UPDATE and warns once with the gzip column name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sql } = mockSql(new Error('cannot execute UPDATE in a read-only transaction'));

    expect(() => writeBackRequestTimeline(sql, 870, timeline)).not.toThrow();

    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]![0]).toContain('could not persist request_timeline_gz');
  });
});
