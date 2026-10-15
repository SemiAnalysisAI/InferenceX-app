import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import type postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, computeRequestTimeline } from './compute-request-timeline';
import { gunzipRequestTimeline } from './request-timeline-codec';
import {
  TRACE_REPLAY_UPLOAD_CHUNK_BYTES,
  gzipTraceReplayInput,
  persistPreparedTraceReplay,
  prepareTraceReplay,
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
    requestTimelineGz: Buffer.from('timeline-gzip'),
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

function mockSqlWithTransaction(
  lockedRows: { id: number }[],
  capacityLog?: string,
): {
  sql: Parameters<typeof persistPreparedTraceReplay>[0];
  calls: SqlCall[];
} {
  const calls: SqlCall[] = [];
  const execute = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('for update')) return Promise.resolve(lockedRows);
    if (text.includes('insert into agentic_trace_replay')) return Promise.resolve([{ id: 123 }]);
    if (text.includes('select br.id') && capacityLog) {
      return Promise.resolve([{ id: 41, server_log_id: 7 }]);
    }
    if (text.includes('with chunk') && capacityLog) {
      return Promise.resolve([{ has_more: false, line: capacityLog }]);
    }
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
      ['request_timeline_gz', Buffer.alloc(22_146_655)],
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

describe('prepareTraceReplay', () => {
  it('stores the computed request timeline as gzip of its JSON text', async () => {
    const profile = Buffer.from(
      [
        {
          metadata: {
            conversation_id: 'trace-018',
            x_correlation_id: 'session-a',
            root_correlation_id: 'session-a',
            turn_index: 0,
            worker_id: '7',
            benchmark_phase: 'profiling',
            credit_issued_ns: 1_000_000_000,
            request_start_ns: 1_001_200_000,
            request_ack_ns: 1_001_800_000,
            request_end_ns: 1_420_000_000,
          },
          metrics: {
            time_to_first_token: { value: 42.3, unit: 'ms' },
            time_per_output_token: { value: 18.1, unit: 'ms' },
            input_sequence_length: { value: 18_320, unit: 'tokens' },
            output_sequence_length: { value: 410, unit: 'tokens' },
          },
        },
        {
          metadata: {
            conversation_id: 'trace-018',
            x_correlation_id: 'session-b',
            root_correlation_id: 'session-a',
            turn_index: 1,
            worker_id: '7',
            agent_depth: 1,
            benchmark_phase: 'profiling',
            credit_issued_ns: 1_500_000_000,
            request_start_ns: 1_500_400_000,
            request_end_ns: 2_400_000_000,
          },
          metrics: { input_sequence_length: { value: 19_340, unit: 'tokens' } },
        },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n'),
    );

    const prepared = await prepareTraceReplay(profile, null);
    const expected = await computeRequestTimeline(gzipSync(profile));

    expect(prepared.timelineRequests).toBe(2);
    expect(prepared.requestTimelineGz).not.toBeNull();
    expect(gunzipSync(prepared.requestTimelineGz!).toString('utf8')).toBe(JSON.stringify(expected));
    expect(gunzipRequestTimeline(prepared.requestTimelineGz!)).toMatchObject({
      version: REQUEST_TIMELINE_VERSION,
      requests: [
        { cid: 'trace-018', ti: 0, isl: 18_320 },
        { ti: 1, ad: 1, isl: 19_340 },
      ],
    });
  });
});

describe('persistPreparedTraceReplay', () => {
  it('derives ATOM capacity from the stored startup log during ingestion', async () => {
    const { sql, calls } = mockSqlWithTransaction(
      [{ id: 41 }],
      'Concurrent capacity vs context length (max_model_len=1048576, block_size=128, max_slots=32, pool_blocks=8687, dcp=8 (blk/req is per-rank)):',
    );
    const prepared = { ...preparedFixture(), atomKvCacheBlocks: 8414 };
    await expect(persistPreparedTraceReplay(sql, [41], prepared)).resolves.toBe(1);
    const update = calls.find((call) =>
      call.text.includes("jsonb_set(metrics, '{kv_cache_pool_tokens}'"),
    );
    expect(update?.values).toEqual([8615936, 41, 8615936]);
  });
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
    const uploads = calls.filter((call) =>
      call.text.includes('trace_replay_upload_parts (field, part, data)'),
    );
    expect(uploads).toHaveLength(6);
    expect(uploads.map((call) => call.values[0])).toContain('request_timeline_gz');
    expect(linkCall?.values.some((value) => Array.isArray(value) && value.includes(41))).toBe(true);
    const metricUpdate = calls.find((call) =>
      call.text.includes("not (metrics ? 'median_full_response_itl')"),
    );
    expect(metricUpdate?.values).toContainEqual(preparedFixture().fullResponseMetrics);
    expect(metricUpdate?.values).not.toContain(
      JSON.stringify(preparedFixture().fullResponseMetrics),
    );
  });

  it('stores the timeline only as gzip plus its version and request count', async () => {
    const { sql, calls } = mockSqlWithTransaction([{ id: 41 }]);

    await persistPreparedTraceReplay(sql, [41], preparedFixture());
    const insert = calls.find((call) => call.text.includes('insert into agentic_trace_replay'));

    expect(insert?.text).toContain('request_timeline_gz,');
    expect(insert?.text).toContain('request_timeline_version,');
    expect(insert?.text).toContain('request_count');
    // Only aggregate_stats and chart_series are still assembled as JSONB.
    expect(insert?.text.match(/::jsonb/g)).toHaveLength(2);
    // Sizes of the three blobs, then the timeline version and request count.
    expect(insert?.values).toEqual([70, 30, 700, REQUEST_TIMELINE_VERSION, 3]);
  });

  it('leaves every timeline column null when no timeline was computed', async () => {
    const { sql, calls } = mockSqlWithTransaction([{ id: 41 }]);

    await persistPreparedTraceReplay(sql, [41], {
      ...preparedFixture(),
      requestTimelineGz: null,
      timelineRequests: 0,
    });
    const insert = calls.find((call) => call.text.includes('insert into agentic_trace_replay'));
    const uploads = calls.filter((call) =>
      call.text.includes('trace_replay_upload_parts (field, part, data)'),
    );

    expect(uploads.map((call) => call.values[0])).not.toContain('request_timeline_gz');
    expect(insert?.values).toEqual([70, 30, 700, null, null]);
  });
});
