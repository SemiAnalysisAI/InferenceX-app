import { describe, expect, it } from 'vitest';

import { BENCHMARK_POINT_BACKFILLS, validateRunBackfills } from '../etl/run-overrides';
import { planBenchmarkPointBackfill } from './benchmark-point-backfill';

const backfills = BENCHMARK_POINT_BACKFILLS.filter(
  (b) => b.githubRunId === 31633154542 && b.set.offloadMode === 'on',
);

describe('benchmark point backfill recovery', () => {
  it.each(backfills)('extends the previously applied c$conc offload patch', (backfill) => {
    // State written before #975 added the cache-hit fields to this ledger entry.
    const row = {
      offload_mode: 'on',
      metrics: {
        offload_mode: 'on',
        kv_offloading: 'dram',
        kv_offload_backend: 'mooncake',
        kv_offload_backend_version: '0.3.11.post1',
        output_tput_per_gpu: 123.45,
        median_itl: 0.025,
      },
    };
    const original = structuredClone(row);
    // Reproduces the failure without the explicitly registered previous version.
    expect(() => planBenchmarkPointBackfill(row, { ...backfill, previousSet: undefined })).toThrow(
      'desired identity has unexpected data',
    );

    const metrics = planBenchmarkPointBackfill(row, backfill)!;
    expect(metrics).toMatchObject({
      ...row.metrics,
      ...backfill.set.metricsMerge,
    });
    expect(metrics.server_gpu_cache_hit_rate).toBeGreaterThan(0);
    expect(metrics.server_cpu_cache_hit_rate).toBeGreaterThan(0);
    expect(planBenchmarkPointBackfill({ ...row, metrics }, backfill)).toBeNull();
    expect(row).toEqual(original);
  });

  const backfill = backfills[0]!;
  const prior = {
    offload_mode: 'on',
    kv_offloading: 'dram',
    kv_offload_backend: 'mooncake',
    kv_offload_backend_version: '0.3.11.post1',
  };

  it.each([
    { kv_offload_backend: 'lmcache' },
    { kv_offload_backend_version: 'wrong-version' },
    { offload_mode: 'off' },
    { allocated_cpu_dram_gb: 0 },
  ])('still rejects an unexpected destination: %j', (unexpected) => {
    expect(() =>
      planBenchmarkPointBackfill(
        { offload_mode: 'on', metrics: { ...prior, ...unexpected } },
        backfill,
      ),
    ).toThrow('desired identity has unexpected data');
  });

  it('applies to an untouched source and preserves unrelated measurements', () => {
    const metrics = planBenchmarkPointBackfill(
      { offload_mode: 'off', metrics: { allocated_cpu_dram_gb: 0, output_tput_per_gpu: 42 } },
      backfill,
    );
    expect(metrics).toMatchObject({ ...prior, output_tput_per_gpu: 42 });
    expect(metrics).not.toHaveProperty('allocated_cpu_dram_gb');
  });

  it('retains recovery of the original malformed JSONB patch', () => {
    const metrics = planBenchmarkPointBackfill(
      {
        offload_mode: 'on',
        metrics: [
          { output_tput_per_gpu: 42, allocated_cpu_dram_gb: 0 },
          JSON.stringify({ ...backfill.set.metricsMerge, offload_mode: 'on' }),
        ],
      },
      backfill,
    );
    expect(metrics).toMatchObject({ ...prior, output_tput_per_gpu: 42 });
    expect(metrics).not.toHaveProperty('allocated_cpu_dram_gb');
  });

  it.each([{ metrics: null }, { metrics: [] }, { metrics: [{}, 'not-json'] }])(
    'rejects malformed metrics: $metrics',
    ({ metrics }) => {
      expect(() => planBenchmarkPointBackfill({ offload_mode: 'off', metrics }, backfill)).toThrow(
        'unexpected JSON shape',
      );
    },
  );

  it('rejects a previous patch targeting a different offload identity', () => {
    expect(() =>
      validateRunBackfills([], [{ ...backfill, previousSet: { offloadMode: 'off' } }]),
    ).toThrow('previousSet must identify the prior destination patch');
  });
});
