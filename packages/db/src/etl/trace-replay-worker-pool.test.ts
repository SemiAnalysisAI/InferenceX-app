import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { prepareTraceReplay, type PreparedTraceReplay } from './trace-replay-ingest';
import { AsyncSemaphore } from './async-semaphore';
import { resolveTraceReplayWorkerCount } from './trace-replay-worker-pool';

const tempDirs: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function metric(rate: number) {
  return {
    series: [
      {
        endpoint_url: 'worker.test:8000',
        labels: {},
        timeslices: [{ start_ns: 1e9, end_ns: 2e9, rate }],
      },
    ],
  };
}

async function traceFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'trace-worker-test-'));
  tempDirs.push(dir);
  const profile = join(dir, 'profile_export.jsonl');
  const csv = join(dir, 'server_metrics_export.csv');
  const metrics = join(dir, 'server_metrics_export.json');
  const profileRaw = Buffer.from(
    JSON.stringify({
      metadata: {
        conversation_id: 'conv-1',
        turn_index: 0,
        benchmark_phase: 'profiling',
        credit_issued_ns: 1_000,
        request_start_ns: 2_000,
        request_end_ns: 5_000,
      },
      metrics: {
        input_sequence_length: { value: 128, unit: 'tokens' },
        output_sequence_length: { value: 64, unit: 'tokens' },
        time_to_first_token: { value: 0.001, unit: 'ms' },
      },
    }),
  );
  const csvRaw = Buffer.from('timestamp,value\n1,2\n');
  const metricsRaw = Buffer.from(
    JSON.stringify({
      warmup_metrics: { 'vllm:prompt_tokens': metric(10) },
      metrics: {
        'vllm:prompt_tokens': metric(100),
        'vllm:generation_tokens': metric(50),
      },
    }),
  );
  await Promise.all([
    writeFile(profile, profileRaw),
    writeFile(csv, csvRaw),
    writeFile(metrics, metricsRaw),
  ]);
  return { profile, csv, metrics, profileRaw, csvRaw, metricsRaw };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

function sha256(buffer: Buffer | null): string | null {
  return buffer ? createHash('sha256').update(buffer).digest('hex') : null;
}

function fingerprint(prepared: PreparedTraceReplay) {
  return {
    profileGz: sha256(prepared.profileGz),
    profileRaw: prepared.profileGz ? sha256(gunzipSync(prepared.profileGz)) : null,
    profileSize: prepared.profileSize,
    serverMetricsCsv: sha256(prepared.serverMetricsCsv),
    serverMetricsCsvSize: prepared.serverMetricsCsvSize,
    serverMetricsJsonGz: sha256(prepared.serverMetricsJsonGz),
    serverMetricsJsonRaw: prepared.serverMetricsJsonGz
      ? sha256(gunzipSync(prepared.serverMetricsJsonGz))
      : null,
    serverMetricsJsonSize: prepared.serverMetricsJsonSize,
    aggregateStatsJson: sha256(prepared.aggregateStatsJson),
    chartSeriesJson: sha256(prepared.chartSeriesJson),
    requestTimelineJson: sha256(prepared.requestTimelineJson),
    chartWindows: prepared.chartWindows,
    timelineRequests: prepared.timelineRequests,
    cacheHitRates: prepared.cacheHitRates,
    fullResponseMetrics: prepared.fullResponseMetrics,
  };
}

describe('resolveTraceReplayWorkerCount', () => {
  it.each([
    [1, 1],
    [4, 1],
    [8, 2],
    [16, 4],
    [64, 4],
  ])('maps %i vCPUs to %i bounded workers', (vcpus, expected) => {
    expect(resolveTraceReplayWorkerCount(vcpus, undefined)).toBe(expected);
  });

  it('supports a bounded explicit override and ignores invalid values', () => {
    expect(resolveTraceReplayWorkerCount(16, '6')).toBe(6);
    expect(resolveTraceReplayWorkerCount(16, '99')).toBe(8);
    expect(resolveTraceReplayWorkerCount(8, '0')).toBe(2);
    expect(resolveTraceReplayWorkerCount(8, 'invalid')).toBe(2);
  });
});

describe('AsyncSemaphore', () => {
  it('never exceeds its configured concurrency', async () => {
    const semaphore = new AsyncSemaphore(2);
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const operations = Array.from({ length: 5 }, () =>
      semaphore.run(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await gate;
        active -= 1;
      }),
    );

    await waitUntil(() => active === 2);
    expect(maximum).toBe(2);
    release();
    await Promise.all(operations);
    expect(maximum).toBe(2);
  });
});

describe('TraceReplayWorkerPool', () => {
  it('transfers byte-identical payloads, bounds buffers, and recovers after a failed job', async () => {
    const fixture = await traceFixture();
    const expected = await prepareTraceReplay(fixture.profile, fixture.csv, fixture.metrics);
    const smokeScript = fileURLToPath(new URL('trace-replay-worker-smoke.ts', import.meta.url));
    const { stdout } = await execFileAsync(
      'bun',
      [smokeScript, fixture.profile, fixture.csv, fixture.metrics],
      { maxBuffer: 1024 * 1024 },
    );
    const result = JSON.parse(stdout) as {
      consumersBeforeRelease: number;
      totalConsumers: number;
      direct: ReturnType<typeof fingerprint>;
      results: ReturnType<typeof fingerprint>[];
      rejectedMissingInput: boolean;
      recoveredTimelineRequests: number;
    };

    expect(result.consumersBeforeRelease).toBe(2);
    expect(result.totalConsumers).toBe(3);
    expect(result.results).toEqual([result.direct, result.direct, result.direct]);
    const expectedFingerprint = fingerprint(expected);
    expect(result.direct).toEqual({
      ...expectedFingerprint,
      profileGz: result.direct.profileGz,
      serverMetricsJsonGz: result.direct.serverMetricsJsonGz,
    });
    expect(result.rejectedMissingInput).toBe(true);
    expect(result.recoveredTimelineRequests).toBe(1);
  }, 15_000);
});
