import { describe, expect, it } from 'vitest';

import { SLA_EXAMPLE_TARGETS } from '@semianalysisai/inferencex-constants';

import {
  buildSlaConfigs,
  type SlaConfigRow,
  type SlaExcludedPoint,
  type SlaTargetsDataset,
} from './dataset';
import type { SlaPointEvaluations } from './evaluation';
import { buildSlaPublicView, type SlaPublicView } from './public-view';
import { evaluateSlaTargetsView } from './view';

/**
 * A stored fixed-sequence benchmark row as the dashboard reads it. The page
 * model is built from identity and load only; the row's percentile aggregates
 * are spelled out here to show that nothing downstream reads them.
 */
function row(id: number, conc: number): SlaConfigRow & { metrics: Record<string, number> } {
  return {
    id,
    hardware: 'h200',
    framework: 'vllm',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc,
    offload_mode: 'off',
    image: 'vllm/vllm-openai:v1',
    date: '2026-09-01',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1',
    // Every percentile is far inside the example targets (1000 ms, 50 ms).
    metrics: {
      median_ttft: 0.12,
      p99_ttft: 0.2,
      median_tpot: 0.02,
      p99_tpot: 0.03,
      tput_per_gpu: 9,
    },
  };
}

function dataset(
  hasRequestData: (id: number) => boolean,
  excluded: SlaExcludedPoint[] = [],
): SlaTargetsDataset {
  const configs = buildSlaConfigs([row(1, 8), row(2, 16), row(3, 32)], hasRequestData);
  configs[0].excluded = excluded;
  return {
    model: 'DeepSeek-R1-0528',
    models: ['DeepSeek-R1-0528'],
    snapshot: { kind: 'live' },
    configs,
  };
}

function view(data: SlaTargetsDataset, evaluations: SlaPointEvaluations = {}): SlaPublicView {
  return buildSlaPublicView(data, '8k/1k', evaluations, SLA_EXAMPLE_TARGETS, 'hyperscaler');
}

/** Every number in a value, with the path that leads to it. */
function numbers(value: unknown, path = ''): [string, number][] {
  if (typeof value === 'number') return [[path, value]];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => numbers(child, `${path}.${key}`));
}

const MEASURED_VALUE = /attain|passing|goodput|rps|cost|counts|observed|attempted|within/iu;

describe('points without request records', () => {
  it('are unavailable for joint attainment: not zero, not passing, not derived from percentiles', () => {
    const response = view(dataset(() => false));
    expect(response.qualifying).toEqual([]);
    expect(response.configs).toHaveLength(1);
    const [config] = response.configs;
    expect(config.loadKind).toBe('request_concurrency');
    expect(config.status).toBe('insufficient_data');
    expect(config.exploratory).toBe(false);
    expect(config.selections).toEqual({
      highestPassingLoad: null,
      highestGoodput: null,
      lowestCost: null,
    });
    expect(config.bestObserved).toBeNull();
    for (const point of config.points) {
      expect(point.observed).toBeNull();
      expect(point.counts).toBeNull();
      expect(point.accounting).toBeNull();
      expect(point.windowCostUsd).toBeNull();
      expect(point.costPer1kCompliantUsd).toBeNull();
      expect(point.qualification).toMatchObject({
        status: 'insufficient_data',
        reason: 'no_request_level_data',
      });
      expect(point.unavailable).toEqual({ reason: 'no_request_level_data', detail: null });
      expect(point.exclusion).toBeNull();
    }
    // No attainment, passing count, goodput or cost appears anywhere in the
    // response as a number, zero included.
    expect(
      numbers(response.configs).filter(
        ([path]) => MEASURED_VALUE.test(path) && !path.endsWith('qualification.minimumSample'),
      ),
    ).toEqual([]);
  });

  it('give the page model nothing to show as a value either', () => {
    const { configs } = dataset(() => false);
    const page = evaluateSlaTargetsView(configs, 'DeepSeek-R1-0528', {}, 0.5, 'hyperscaler');
    expect(page.qualifying).toEqual([]);
    const [pageRow] = page.rows;
    expect(pageRow.status).toBe('insufficient_data');
    expect(pageRow.bestObserved).toBeNull();
    expect(pageRow.points.every((point) => point.result?.observed === null)).toBe(true);
  });

  it('say that the per-request columns were omitted, with the recorded count and limit', () => {
    const detail = 'attempts_exceed_aggregate_limit: 250000 attempts, limit 200000';
    const response = view(
      dataset((id) => id === 2),
      { 2: { unavailable: 'request_columns_omitted', detail } },
    );
    const [config] = response.configs;
    expect(config.status).toBe('insufficient_data');
    expect(config.points.map((point) => point.unavailable?.reason)).toEqual([
      'no_request_level_data',
      'request_columns_omitted',
      'no_request_level_data',
    ]);
    expect(config.points[1].unavailable?.detail).toBe(detail);
    expect(config.points[1].qualification.reason).toBe('request_columns_omitted');
    expect(config.points[1].observed).toBeNull();
  });
});

describe('failed, excluded and never-measured loads', () => {
  const failed: SlaExcludedPoint = {
    concurrency: 64,
    category: 'service_failure',
    reason: 'Run aborted (failed_request_threshold): 234/2337 profiling requests failed',
    runAttempt: 1,
    jobUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1/job/2',
    artifact: null,
    observedFailures: { http_503: 139 },
  };
  const invalid: SlaExcludedPoint = {
    ...failed,
    concurrency: 128,
    category: 'invalid_measurement',
    reason: 'load generator crashed',
    observedFailures: null,
  };

  it('lists a failed or excluded load with its class and reason, and no value', () => {
    const [config] = view(dataset(() => false, [failed, invalid])).configs;
    const byLoad = new Map(config.points.map((point) => [point.load, point]));
    expect(byLoad.get(64)).toMatchObject({
      pointId: null,
      observed: null,
      counts: null,
      unavailable: null,
      exclusion: { category: 'service_failure', reason: failed.reason },
      qualification: { status: 'misses', reason: 'service_failure' },
    });
    expect(byLoad.get(128)).toMatchObject({
      observed: null,
      exclusion: { category: 'invalid_measurement', reason: 'load generator crashed' },
      qualification: { status: 'insufficient_data', reason: 'invalid_measurement' },
    });
    // A measured point without data is a third state: neither failed nor excluded.
    expect(byLoad.get(8)).toMatchObject({
      exclusion: null,
      unavailable: { reason: 'no_request_level_data' },
    });
  });

  it('does not list a load that was never run, as failed or as anything else', () => {
    const [config] = view(dataset(() => false, [failed])).configs;
    expect(config.points.map((point) => point.load).toSorted((a, b) => a - b)).toEqual([
      8, 16, 32, 64,
    ]);
    // 4, 128 and every other load: absent, not a row with zeros.
    expect(config.points.some((point) => point.load === 128)).toBe(false);
  });
});
