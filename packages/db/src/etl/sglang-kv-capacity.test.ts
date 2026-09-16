import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { MetricsMap } from './compute-chart-series';
import { computeTraceDerivedPayloads } from './compute-trace-derived';
import fixtures from './fixtures/sglang-kv-capacity-pr2823.json';
import {
  SGLANG_KV_CAPACITY_METRIC,
  sglangKvCachePoolTokensFromMetricPhases,
} from './sglang-kv-capacity';

// Exact capacity series labels and constant averages from run 34738529222's
// c4/c256 server_metrics_export.csv. No request or throughput data is fabricated.
describe('SGLang logical KV capacity', () => {
  it('deduplicates four TP replicas per role (PR #2823, c4)', () => {
    expect(sglangKvCachePoolTokensFromMetricPhases(fixtures['4'], {})).toBe(6_338_048);
  });

  it('retains all eight independent DP pools per role (PR #2823, c256)', () => {
    expect(sglangKvCachePoolTokensFromMetricPhases(fixtures['256'], {})).toBe(241_231_872);
  });

  it('does not multiply identical warmup/profiling observations', () => {
    expect(sglangKvCachePoolTokensFromMetricPhases(fixtures['4'], fixtures['4'])).toBe(6_338_048);
  });

  it('retains distinct endpoints even when every label is identical', () => {
    const metric = structuredClone(fixtures['4']);
    const series = metric[SGLANG_KV_CAPACITY_METRIC].series;
    const firstWorker = series.slice(0, 4);
    series.push(...firstWorker.map((s) => ({ ...s, endpoint_url: 'another-prefill:8000' })));
    expect(sglangKvCachePoolTokensFromMetricPhases(metric, {})).toBe(9_549_824);
  });

  it('rejects changing capacity or conflicting shard observations', () => {
    const changed = structuredClone(fixtures['4']);
    changed[SGLANG_KV_CAPACITY_METRIC].series[0].timeslices[0].avg++;
    expect(sglangKvCachePoolTokensFromMetricPhases(changed, {})).toBeNull();
    expect(sglangKvCachePoolTokensFromMetricPhases(fixtures['4'], changed)).toBeNull();
  });

  it('leaves absent, invalid, or ambiguous telemetry unchanged', () => {
    expect(sglangKvCachePoolTokensFromMetricPhases({}, {})).toBeNull();
    for (const invalid of [0, -1, NaN, Infinity, 1.5]) {
      const metric = structuredClone(fixtures['4']);
      metric[SGLANG_KV_CAPACITY_METRIC].series[0].timeslices[0].avg = invalid;
      expect(sglangKvCachePoolTokensFromMetricPhases(metric, {})).toBeNull();
    }
    for (const mutate of [
      (s: NonNullable<MetricsMap[string]['series']>[number]) => delete s.endpoint_url,
      (s: NonNullable<MetricsMap[string]['series']>[number]) => delete s.labels!.tp_rank,
      (s: NonNullable<MetricsMap[string]['series']>[number]) => delete s.timeslices,
    ]) {
      const metric: MetricsMap = structuredClone(fixtures['4']);
      mutate(metric[SGLANG_KV_CAPACITY_METRIC].series![0]);
      expect(sglangKvCachePoolTokensFromMetricPhases(metric, {})).toBeNull();
    }
  });

  it('collects the capacity metric on both bounded and streaming ingestion paths', async () => {
    const blob = gzipSync(
      JSON.stringify({ metrics: fixtures['4'], warmup_metrics: fixtures['4'] }),
    );
    for (const maxInMemoryBytes of [1, 1_000_000]) {
      const derived = await computeTraceDerivedPayloads(
        null,
        blob,
        { framework: 'mori-sglang', disagg: true },
        { maxInMemoryBytes },
      );
      expect(derived.sglangKvCachePoolTokens).toBe(6_338_048);
    }
  });
});
