import { describe, expect, it } from 'vitest';
import {
  observedIntegers,
  requestServerTiming,
  serverTimingSummary,
  timingDistribution,
} from './server-timing';

// Synthetic timing records test the contract; no server timing was measured here.
const distribution = {
  values: [0, 1, 2, 3],
  sample_count: 4,
  valid_clip_count: 4,
  missing_count: 0,
  p50: 1.5,
  p90: 3,
  p95: 3,
};
const timing = {
  schema_version: '1.0.0',
  status: 'complete',
  request_id: 'request-1',
  instance_id: 'launch-1',
  clock_id: 'linux:synthetic:time:1',
  clock: 'time.monotonic_ns; same Linux boot and time namespace; nanoseconds',
  observed_batch_size: 1,
  replica_id: 0,
  server_ready_latency_seconds: 4,
  prequeue_seconds: 1,
  queue_delay_seconds: 0,
  execution_seconds: 2,
  postprocess_seconds: 1,
};

describe('server timing contract', () => {
  it('retains complete coverage and zero durations while applying percentile sample floors', () => {
    expect(timingDistribution(distribution, 4)).toEqual({
      samples: 4,
      valid: 4,
      missing: 0,
      p50: 1.5,
      p90: null,
      p95: null,
    });
    const full = {
      ...distribution,
      values: Array.from({ length: 20 }, () => 1),
      sample_count: 20,
      valid_clip_count: 20,
      p50: 1,
      p90: 1,
      p95: 1,
    };
    expect(timingDistribution(full, 20)).toMatchObject({ p50: 1, p90: 1, p95: 1 });
  });
  it('retains partial counts but withholds all percentiles, even if supplied', () => {
    expect(
      timingDistribution({ ...distribution, values: [0, 1], sample_count: 2, missing_count: 2 }, 4),
    ).toEqual({ samples: 2, valid: 4, missing: 2, p50: null, p90: null, p95: null });
  });
  it('rejects malformed coverage and unavailable historical fields', () => {
    for (const value of [
      null,
      { ...distribution, missing_count: 1 },
      { ...distribution, sample_count: 4.5 },
      { ...distribution, values: [0, -1, 2, 3] },
    ])
      expect(timingDistribution(value, 4)).toBeNull();
    expect(timingDistribution(distribution, 5)).toBeNull();
    expect(
      serverTimingSummary(
        { serving: { queue_delay_seconds: distribution }, summary: { valid: 4 } },
        false,
      ).stages.every((stage) => stage === null),
    ).toBe(true);
  });
  it('reads repeated observed batches without treating concurrency as a batch size', () => {
    expect(observedIntegers([1, 1, 1, 1], 1)).toEqual([1]);
    expect(observedIntegers([0], 0)).toEqual([0]);
    expect(observedIntegers([1, 1.5], 1)).toBeNull();
    expect(serverTimingSummary({ serving: { concurrency: 4 } }, true).batchSizes).toBeNull();
  });
  it('requires verified request-correlated timing and preserves partial per-request stages', () => {
    const record = { job_id: 'request-1', server_timings: timing };
    expect(requestServerTiming(record, true)).toMatchObject({
      stages: [4, 1, 0, 2, 1],
      batchSize: 1,
      replicaId: 0,
    });
    expect(requestServerTiming({ ...record, job_id: 'other' }, true)).toBeNull();
    expect(requestServerTiming(record, false)).toBeNull();
    for (const status of ['invalid', 'unknown'])
      expect(
        requestServerTiming({ ...record, server_timings: { ...timing, status } }, true),
      ).toBeNull();
    expect(
      requestServerTiming(
        { ...record, server_timings: { ...timing, status: 'partial', execution_seconds: null } },
        true,
      )?.stages,
    ).toEqual([4, 1, 0, null, 1]);
    expect(
      requestServerTiming({ ...record, server_timings: { ...timing, clock_id: '' } }, true),
    ).toBeNull();
    expect(
      requestServerTiming(
        { ...record, server_timings: { ...timing, execution_seconds: null } },
        true,
      ),
    ).toBeNull();
  });
});
