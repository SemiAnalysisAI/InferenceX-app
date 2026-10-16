import { describe, expect, it } from 'vitest';

import {
  assertBackfillKeepsValidatedCache,
  planBenchmarkPointBackfill,
} from '../lib/benchmark-point-backfill';
import { flattenAgenticAggRow } from './agentic-v3-flatten';
import { mapBenchmarkRow } from './benchmark-mapper';
import closeout from './fixtures/cache-validity-producer-x1ir.json';
import producer from './fixtures/cache-validity-producer.json';
import {
  applyBenchmarkPointBackfill,
  BENCHMARK_POINT_BACKFILLS,
  type BenchmarkPointBackfill,
} from './run-overrides';
import { createSkipTracker } from './skip-tracker';
import { persistPreparedTraceReplay, type PreparedTraceReplay } from './trace-replay-ingest';

/** Minimal v3 agentic agg row around one producer `server_metrics` payload. */
function v3Row(serverMetrics: Record<string, unknown>): Record<string, any> {
  return {
    infmax_model_prefix: 'dsv4',
    hw: 'cluster:b300-nv',
    framework: 'vllm',
    precision: 'fp4',
    spec_decoding: 'none',
    disagg: false,
    scenario_type: 'agentic-coding',
    is_multinode: false,
    tp: 4,
    ep: 1,
    dp_attention: 'false',
    conc: 16,
    image: 'vllm/vllm-openai:v0.23.0',
    kv_offloading: 'none',
    num_requests_total: 100,
    num_requests_successful: 100,
    request_metrics: {
      throughput: { per_gpu: { total_tput_tps: 2000, input_tput_tps: 1900, output_tput_tps: 100 } },
    },
    server_metrics: { present: true, ...serverMetrics },
  };
}

const flat = (serverMetrics: Record<string, unknown>) => flattenAgenticAggRow(v3Row(serverMetrics));
const core = producer.cases.atom_complete.cache_validity;

describe('ETL keeps "present but invalid" distinct from absent', () => {
  it('records the detail schema of a #3964 row that has no common core', () => {
    const row = flat(closeout.cases.atom3964_complete);
    expect(row.server_cache_detail_schema_code).toBe(1);
    expect(row.server_cache_pricing_eligible).toBe(1);
    expect(row.server_cache_core_schema_version).toBeUndefined();
  });

  it('marks non-boolean eligibility as invalid instead of dropping it', () => {
    const row = flat({ cache_validity: { ...core, pricing_eligible: 'true', published: 1 } });
    expect(row.server_cache_pricing_eligible).toBe(-1);
    expect(row.server_cache_published).toBe(-1);
  });

  it('marks non-numeric rates on a validity row instead of coercing them to zero', () => {
    const row = flat({
      cache: {
        gpu_cache_hit_rate: false,
        cpu_cache_hit_rate: 'x',
        external_cache_hit_rate: null,
        overall_cache_hit_rate: 'invalid',
      },
      cache_validity: core,
    });
    expect(row.server_gpu_cache_hit_rate).toBeUndefined();
    expect(row.server_cpu_cache_hit_rate).toBeUndefined();
    expect(row.server_cache_invalid_rate_fields).toBe(1 + 2 + 8);
  });

  it('leaves pre-core rows on the existing numeric parse', () => {
    const row = flat({ cache: { gpu_cache_hit_rate: false } });
    expect(row.server_gpu_cache_hit_rate).toBe(0);
    expect(row.server_cache_invalid_rate_fields).toBeUndefined();
  });

  it.each<[string, number]>([
    ['infx-cache-validity-core/1', 1],
    ['infx-cache-validity-core/12', 12],
    ['infx-cache-validity-core/01', 0],
    ['infx-cache-validity-core/1.0', 0],
    ['infx-cache-validity-core/1e0', 0],
    ['infx-cache-validity-core/ 1', 0],
    ['infx-cache-validity-core/', 0],
  ])('reads core schema %s as version %d', (schema, version) => {
    expect(
      flat({ cache_validity: { ...core, core_schema: schema } }).server_cache_core_schema_version,
    ).toBe(version);
  });

  it('maps the real MISSING producer output', () => {
    const result = mapBenchmarkRow(
      v3Row(closeout.cases.missing_server_metrics),
      createSkipTracker(),
    );
    expect(result).not.toBeNull();
    expect(result!.metrics).toMatchObject({
      server_cache_core_schema_version: 1,
      server_cache_status_class_code: 8,
      server_cache_pricing_eligible: 0,
      server_cache_published: 0,
      server_cache_detail_schema_code: 2,
    });
    expect(result!.metrics.server_cache_basis_code).toBeUndefined();
  });
});

function preparedWithRates(): PreparedTraceReplay {
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
    cacheHitRates: { gpu: 0.2, cpu: 0.5 },
    fullResponseMetrics: {},
  };
}

describe('trace replay does not overwrite producer-validated cache rates', () => {
  it('excludes rows that carry a validity contract from the chart-series rewrite', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const execute = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      calls.push({ text, values });
      if (text.includes('for update')) return Promise.resolve([{ id: 41 }]);
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

    await expect(persistPreparedTraceReplay(sql, [41], preparedWithRates())).resolves.toBe(1);
    const rewrite = calls.find((call) => call.text.includes("'{server_gpu_cache_hit_rate}'"));
    expect(rewrite).toBeDefined();
    expect(rewrite!.text).toContain('?|');
    const guarded = rewrite!.values.find(
      (value): value is string[] =>
        Array.isArray(value) && value.length > 0 && value.every((key) => typeof key === 'string'),
    );
    expect(guarded).toEqual(
      expect.arrayContaining(['server_cache_core_schema_version', 'server_cache_pricing_eligible']),
    );
  });
});

describe('donor backfills do not inherit producer eligibility', () => {
  const donor = BENCHMARK_POINT_BACKFILLS.find(
    (backfill) => backfill.id.endsWith('-gb200-cache-hit-rate') && !backfill.set.offloadMode,
  )!;
  const validated = mapBenchmarkRow(
    v3Row(producer.cases.atom_complete),
    createSkipTracker(),
  )!.metrics;
  const point = (metrics: Record<string, unknown>) => ({
    configId: 1,
    config: donor.config,
    benchmarkType: donor.benchmarkType,
    isl: donor.isl,
    osl: donor.osl,
    conc: donor.conc,
    offloadMode: donor.offloadMode,
    recipeFingerprint: donor.recipeFingerprint ?? null,
    metrics,
  });
  const row = (metrics: Record<string, unknown>) => ({
    offload_mode: donor.offloadMode,
    recipe_fingerprint: donor.recipeFingerprint ?? null,
    metrics,
  });

  it('is a real GB200→GB300 cache-rate donor', () => {
    expect(donor.set.metricsMerge).toHaveProperty('server_gpu_cache_hit_rate');
  });

  it('refuses the replay path over a validated core and applies it to a pre-core row', () => {
    expect(() => planBenchmarkPointBackfill(row(validated), donor)).toThrow(/validity/);
    const merged = planBenchmarkPointBackfill(row({ server_gpu_cache_hit_rate: 0 }), donor);
    expect(merged?.server_gpu_cache_hit_rate).toBe(
      donor.set.metricsMerge?.server_gpu_cache_hit_rate,
    );
  });

  it('refuses the ingest path over a validated core and applies it to a pre-core row', () => {
    expect(() =>
      applyBenchmarkPointBackfill(donor.githubRunId, donor.runAttempt, point(validated)),
    ).toThrow(/validity/);
    const applied = applyBenchmarkPointBackfill(donor.githubRunId, donor.runAttempt, point({}));
    expect(applied.backfillId).toBe(donor.id);
    expect(applied.point.metrics.server_gpu_cache_hit_rate).toBe(
      donor.set.metricsMerge?.server_gpu_cache_hit_rate,
    );
  });

  describe('the overall source a validated row is priced on', () => {
    // Synthetic rules on the donor's identity: no real backfill touches the source key.
    const rule = (set: BenchmarkPointBackfill['set']): BenchmarkPointBackfill => ({
      ...donor,
      id: 'synthetic-overall-source-rule',
      set,
    });
    const combinedRouter = {
      server_cache_core_schema_version: 1,
      server_cache_status_class_code: 1,
      server_cache_published: 1,
      server_cache_pricing_eligible: 1,
      server_cache_basis_code: 2,
      server_overall_cache_hit_rate: 0.9,
      server_cache_overall_source_code: 3,
    };
    const tiersRouter = { ...validated, server_cache_overall_source_code: 3 };
    const sourceMerge = rule({ metricsMerge: { server_cache_overall_source_code: 1 } });
    const sourceRemove = rule({ metricsRemove: ['server_cache_overall_source_code'] });

    it('refuses a source-only merge on a combined row', () => {
      expect(() => planBenchmarkPointBackfill(row(combinedRouter), sourceMerge)).toThrow(
        /server_cache_overall_source_code/,
      );
    });

    it('refuses a source-only removal on a tiers row', () => {
      expect(() => planBenchmarkPointBackfill(row(tiersRouter), sourceRemove)).toThrow(
        /server_cache_overall_source_code/,
      );
    });

    it('still refuses rate rewrites and eligibility removal', () => {
      const rateMerge = rule({ metricsMerge: { server_gpu_cache_hit_rate: 0.2 } });
      const eligibilityRemove = rule({ metricsRemove: ['server_cache_pricing_eligible'] });
      expect(() => planBenchmarkPointBackfill(row(validated), rateMerge)).toThrow(/validity/);
      expect(() => planBenchmarkPointBackfill(row(validated), eligibilityRemove)).toThrow(
        /validity/,
      );
    });

    it('does not turn a source-only legacy row into a validated one', () => {
      const legacy = { server_gpu_cache_hit_rate: 0.5, server_cache_overall_source_code: 3 };
      expect(planBenchmarkPointBackfill(row(legacy), sourceMerge)).toMatchObject({
        server_cache_overall_source_code: 1,
      });
      expect(planBenchmarkPointBackfill(row(legacy), sourceRemove)).not.toHaveProperty(
        'server_cache_overall_source_code',
      );
    });

    it('leaves non-cache fields on a validated row open to backfills', () => {
      const offload = rule({ metricsMerge: { kv_offloading: 'dram' } });
      expect(planBenchmarkPointBackfill(row(validated), offload)).toMatchObject({
        kv_offloading: 'dram',
      });
    });

    it('applies the same guard to the replay and ingest entries', () => {
      // Ingest only matches the real rule list, so its call into the shared guard is
      // exercised with the real donor; the guard itself refuses source-only rules.
      expect(() => assertBackfillKeepsValidatedCache(combinedRouter, sourceMerge)).toThrow(
        /server_cache_overall_source_code/,
      );
      expect(() =>
        applyBenchmarkPointBackfill(donor.githubRunId, donor.runAttempt, point(combinedRouter)),
      ).toThrow(/validity/);
    });
  });
});
