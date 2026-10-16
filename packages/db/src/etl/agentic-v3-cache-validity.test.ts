import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_BASES,
  CACHE_OVERALL_SOURCES,
  CACHE_STATUS_CLASSES,
  cacheVocabularyName,
} from '@semianalysisai/inferencex-constants';

import { flattenAgenticAggRow } from './agentic-v3-flatten';
import { mapBenchmarkRow } from './benchmark-mapper';
import producer from './fixtures/cache-validity-producer.json';
import { createSkipTracker } from './skip-tracker';

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

function mappedMetrics(serverMetrics: Record<string, unknown>): Record<string, number> {
  const result = mapBenchmarkRow(v3Row(serverMetrics), createSkipTracker());
  expect(result).not.toBeNull();
  return result!.metrics;
}

const CASES = Object.entries(producer.cases);

describe('v3 cache-validity core through the real mapper', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(CASES)('%s round-trips its core without an unregistered key', (_name, payload) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = mappedMetrics(payload);
    const core = payload.cache_validity;

    expect(m.server_cache_core_schema_version).toBe(1);
    expect(cacheVocabularyName(CACHE_STATUS_CLASSES, m.server_cache_status_class_code)).toBe(
      core.status_class,
    );
    expect(m.server_cache_pricing_eligible).toBe(core.pricing_eligible ? 1 : 0);
    expect(m.server_cache_published).toBe(core.published ? 1 : 0);
    expect(cacheVocabularyName(CACHE_BASES, m.server_cache_basis_code)).toBe(
      core.basis ?? undefined,
    );
    expect(cacheVocabularyName(CACHE_OVERALL_SOURCES, m.server_cache_overall_source_code)).toBe(
      payload.cache.overall_source ?? undefined,
    );
    expect(m.server_overall_cache_hit_rate).toBe(payload.cache.overall_cache_hit_rate ?? undefined);
    expect(warn.mock.calls.flat().join('\n')).not.toMatch(/auto-captured unexpected metric/);
  });

  it('marks only the ATOM complete and zero observations eligible', () => {
    const eligible = CASES.filter(
      ([, payload]) => mappedMetrics(payload).server_cache_pricing_eligible === 1,
    );
    expect(eligible.map(([name]) => name)).toEqual(['atom_complete', 'atom_zero']);
  });

  it('keeps the TRT rejection diagnostic out of every metric', () => {
    const payload = producer.cases.trt_rejected_cached_exceeds_prompt;
    expect(payload.validity.cache_rate.raw_rate).toBeCloseTo(1.0476, 10);
    const m = mappedMetrics(payload);
    expect(Object.values(m).some((value) => Math.abs(value - 1.0476) < 1e-6)).toBe(false);
    expect(m.server_overall_cache_hit_rate).toBeUndefined();
    expect(m.server_cache_basis_code).toBeUndefined();
  });

  it('distinguishes the frontend measurement from the router estimate', () => {
    expect(mappedMetrics(producer.cases.dynamo_frontend).server_cache_overall_source_code).toBe(2);
    expect(
      mappedMetrics(producer.cases.dynamo_router_estimate).server_cache_overall_source_code,
    ).toBe(3);
  });
});

describe('v3 cache-validity edge cases', () => {
  const core = {
    core_schema: 'infx-cache-validity-core/1',
    status_class: 'VALID_COMPLETE',
    pricing_eligible: true,
    published: true,
    basis: 'tiers',
  };
  const flat = (serverMetrics: Record<string, unknown>) =>
    flattenAgenticAggRow(v3Row(serverMetrics));

  it('writes no validity code for a pre-core row', () => {
    const row = flat({ cache: { gpu_cache_hit_rate: 0.78, overall_cache_hit_rate: 0.78 } });
    expect(row.server_gpu_cache_hit_rate).toBe(0.78);
    expect(row.server_overall_cache_hit_rate).toBe(0.78);
    for (const key of Object.keys(row)) expect(key.startsWith('server_cache_')).toBe(false);
  });

  it('marks eligibility that is not a JSON boolean as invalid', () => {
    for (const [value, code] of [
      ['true', -1],
      [1, -1],
      [null, undefined],
    ] as const) {
      const row = flat({ cache_validity: { ...core, pricing_eligible: value, published: 'yes' } });
      expect(row.server_cache_pricing_eligible).toBe(code);
      expect(row.server_cache_published).toBe(-1);
      expect(row.server_cache_status_class_code).toBe(1);
    }
  });

  it('marks unrecognised values as 0 and reads newer core versions', () => {
    const row = flat({
      cache: { overall_source: 'gauge' },
      cache_validity: {
        ...core,
        core_schema: 'infx-cache-validity-core/2',
        status_class: 'VALID_COMPLETE_V2',
        basis: 'layers',
      },
    });
    expect(row.server_cache_core_schema_version).toBe(2);
    expect(row.server_cache_status_class_code).toBe(0);
    expect(row.server_cache_basis_code).toBe(0);
    expect(row.server_cache_overall_source_code).toBe(0);
  });

  it('does not treat an ATOM detail schema as a core', () => {
    const row = flat({
      cache_validity: {
        schema: 'atom-cache-validity/1',
        status: 'VALID_COMPLETE',
        pricing_eligible: true,
      },
    });
    expect(row.server_cache_core_schema_version).toBeUndefined();
    expect(row.server_cache_status_class_code).toBeUndefined();
  });

  it('never writes a non-finite or non-numeric overall rate', () => {
    for (const overall of [Infinity, Number.NaN, '0.5']) {
      expect(
        flat({ cache: { overall_cache_hit_rate: overall } }).server_overall_cache_hit_rate,
      ).toBe(undefined);
    }
  });
});
