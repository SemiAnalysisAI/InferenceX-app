import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../connection.js';

import { _resetWriteBackWarned, writeBackTraceReplayJsonb } from './agentic-shared';

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
    const cases: ('aggregate_stats' | 'chart_series' | 'request_timeline')[] = [
      'aggregate_stats',
      'chart_series',
      'request_timeline',
    ];
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
