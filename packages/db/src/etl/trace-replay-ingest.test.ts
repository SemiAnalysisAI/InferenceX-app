import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import type postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import {
  TRACE_REPLAY_UPLOAD_CHUNK_BYTES,
  gzipTraceReplayInput,
  persistPreparedTraceReplay,
  type PreparedTraceReplay,
  uploadTraceReplayPayloadChunks,
} from './trace-replay-ingest';

interface SqlCall {
  text: string;
  values: unknown[];
}

function mockTransactionSql(): { sql: postgres.TransactionSql; calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve([]);
  }) as unknown as postgres.TransactionSql;
  return { sql, calls };
}

function preparedFixture(): PreparedTraceReplay {
  return {
    profileGz: Buffer.from('profile'),
    profileSize: 70,
    serverMetricsCsv: Buffer.from('csv'),
    serverMetricsCsvSize: 30,
    serverMetricsJsonGz: Buffer.from('metrics'),
    serverMetricsJsonSize: 700,
    aggregateStatsJson: Buffer.from('{"version":1}'),
    chartSeriesJson: Buffer.from('{"version":12}'),
    requestTimelineJson: Buffer.from('{"version":1}'),
    chartWindows: 2,
    timelineRequests: 3,
    compressionMs: 10,
    computeMs: 20,
    cacheHitRates: null,
    fullResponseMetrics: {
      median_full_response_itl: 0.005,
      median_full_response_intvty: 200,
      median_itl: 0.005,
      median_intvty: 200,
    },
  };
}

function mockSqlWithTransaction(lockedRows: { id: number }[]): {
  sql: Parameters<typeof persistPreparedTraceReplay>[0];
  calls: SqlCall[];
} {
  const calls: SqlCall[] = [];
  const execute = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('for update')) return Promise.resolve(lockedRows);
    if (text.includes('insert into agentic_trace_replay')) return Promise.resolve([{ id: 123 }]);
    return Promise.resolve([]);
  };
  const tx = Object.assign(execute, {
    array: (values: unknown[]) => values,
    json: (value: unknown) => value,
  });
  const sql = Object.assign(execute, {
    array: (values: unknown[]) => values,
    begin: (operation: (transaction: typeof tx) => Promise<void>) => operation(tx),
  }) as unknown as Parameters<typeof persistPreparedTraceReplay>[0];
  return { sql, calls };
}

describe('uploadTraceReplayPayloadChunks', () => {
  it('bounds every Bind payload for the measured 90 MiB staging row', async () => {
    // Exact payload sizes from InferenceX run 29181694248, item 8/9.
    const measuredPayloads = [
      ['profile_export_jsonl_gz', Buffer.alloc(22_992_290)],
      ['server_metrics_json_gz', Buffer.alloc(49_891_135)],
      ['request_timeline', Buffer.alloc(22_146_655)],
    ] as const;
    const { sql, calls } = mockTransactionSql();

    let expectedParts = 0;
    for (const [field, payload] of measuredPayloads) {
      const parts = await uploadTraceReplayPayloadChunks(sql, field, payload);
      const expected = Math.ceil(payload.length / TRACE_REPLAY_UPLOAD_CHUNK_BYTES);
      expect(parts).toBe(expected);
      expectedParts += expected;
    }

    expect(calls).toHaveLength(expectedParts);
    expect(calls.every((call) => call.text.includes('trace_replay_upload_parts'))).toBe(true);
    const chunks = calls.flatMap((call) => call.values.filter(Buffer.isBuffer));
    expect(chunks).toHaveLength(expectedParts);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBe(TRACE_REPLAY_UPLOAD_CHUNK_BYTES);
    expect(chunks.reduce((total, chunk) => total + chunk.length, 0)).toBe(
      measuredPayloads.reduce((total, [, payload]) => total + payload.length, 0),
    );
  });

  it('does not issue a query for a missing payload', async () => {
    const { sql, calls } = mockTransactionSql();

    await expect(uploadTraceReplayPayloadChunks(sql, 'chart_series', null)).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe('gzipTraceReplayInput', () => {
  it('streams a file-backed trace and preserves its uncompressed bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trace-replay-stream-test-'));
    const file = join(dir, 'server_metrics_export.json');
    const raw = Buffer.alloc(2 * 1024 * 1024, 171);

    try {
      await writeFile(file, raw);
      const prepared = await gzipTraceReplayInput(file);

      expect(prepared.sourceSize).toBe(raw.length);
      expect(prepared.data).not.toBeNull();
      expect(gunzipSync(prepared.data!)).toEqual(raw);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15_000);
});

describe('persistPreparedTraceReplay', () => {
  it('rechecks links under a row lock and avoids creating an orphan after a concurrent ingest', async () => {
    const { sql, calls } = mockSqlWithTransaction([]);

    await expect(persistPreparedTraceReplay(sql, [41], preparedFixture())).resolves.toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('for update');
    expect(calls.some((call) => call.text.includes('insert into agentic_trace_replay'))).toBe(
      false,
    );
  });

  it('uploads every payload and links exactly the rows locked by the transaction', async () => {
    const { sql, calls } = mockSqlWithTransaction([{ id: 41 }]);

    await expect(persistPreparedTraceReplay(sql, [41], preparedFixture())).resolves.toBe(1);
    const lockIndex = calls.findIndex((call) => call.text.includes('for update'));
    const blobIndex = calls.findIndex((call) =>
      call.text.includes('insert into agentic_trace_replay'),
    );
    const linkCall = calls.find((call) => call.text.includes('set trace_replay_id'));
    expect(lockIndex).toBe(0);
    expect(blobIndex).toBeGreaterThan(lockIndex);
    expect(
      calls.filter((call) => call.text.includes('trace_replay_upload_parts (field, part, data)')),
    ).toHaveLength(6);
    expect(linkCall?.values.some((value) => Array.isArray(value) && value.includes(41))).toBe(true);
    const metricUpdate = calls.find((call) =>
      call.text.includes("not (metrics ? 'median_full_response_itl')"),
    );
    expect(metricUpdate?.values).toContainEqual(preparedFixture().fullResponseMetrics);
    expect(metricUpdate?.values).not.toContain(
      JSON.stringify(preparedFixture().fullResponseMetrics),
    );
  });
});
