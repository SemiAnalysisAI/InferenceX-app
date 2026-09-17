import { describe, expect, it } from 'vitest';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';
import { computeParetoResponse, parseParetoRequest } from './pareto-api';

const query =
  'model=DeepSeek-R1-0528&rawModel=dsr1&sequence=1k%2F1k&xMetric=x&yMetric=y&xDirection=max&yDirection=max';
const parse = (suffix = '') => parseParetoRequest(new URLSearchParams(query + suffix));
const row = (id: number, x: number, y: number, overrides = {}): BenchmarkRow => ({
  id,
  model: 'dsr1',
  benchmark_type: 'single_turn',
  isl: 1024,
  osl: 1024,
  hardware: 'h200_sxm',
  framework: 'vllm',
  precision: 'fp8',
  date: '2026-08-01',
  run_url: 'https://github.com/example/run/1',
  metrics: { x, y },
  spec_method: 'none',
  disagg: false,
  is_multinode: false,
  prefill_tp: 1,
  prefill_ep: 1,
  prefill_dp_attention: false,
  prefill_num_workers: 1,
  decode_tp: 1,
  decode_ep: 1,
  decode_dp_attention: false,
  decode_num_workers: 1,
  num_prefill_gpu: 1,
  num_decode_gpu: 1,
  conc: 1,
  offload_mode: 'none',
  image: null,
  ...overrides,
});
const compute = (rows: BenchmarkRow[], suffix = '') =>
  computeParetoResponse(rows, parse(suffix).selection, '/api/v1/benchmarks?model=DeepSeek-R1-0528');

describe('Pareto API', () => {
  it('accepts stored dotted percentile keys and rejects missing workload types', () => {
    const params = new URLSearchParams(query);
    params.set('xMetric', 'p99.9_itl');
    const result = computeParetoResponse(
      [row(1, 1, 2, { metrics: { 'p99.9_itl': 0.01, y: 2 } })],
      parseParetoRequest(params).selection,
      '/raw',
    );
    expect(result.frontier[0].x).toBe(0.01);
    expect(compute([row(2, 1, 2, { benchmark_type: undefined })]).counts.selected).toBe(0);
  });
  it.each([
    [
      'max',
      'max',
      [
        [1, 3],
        [2, 2],
        [3, 1],
      ],
      [[0, 0]],
    ],
    [
      'min',
      'min',
      [[0, 0]],
      [
        [1, 3],
        [2, 2],
        [3, 1],
      ],
    ],
    [
      'min',
      'max',
      [
        [0, 0],
        [1, 3],
      ],
      [
        [0, 0],
        [3, 1],
      ],
    ],
    [
      'max',
      'min',
      [
        [0, 0],
        [3, 1],
      ],
      [
        [0, 0],
        [1, 3],
      ],
    ],
  ])('computes both boundaries for %s/%s', (xd, yd, best, worst) => {
    const params = new URLSearchParams(query);
    params.set('xDirection', xd);
    params.set('yDirection', yd);
    const rows = [row(1, 1, 3), row(2, 2, 2), row(3, 3, 1), row(4, 0, 0)];
    const result = computeParetoResponse(rows, parseParetoRequest(params).selection, '/raw');
    expect(result.frontier.map(({ x, y }) => [x, y])).toEqual(best);
    expect(result.hinterland.map(({ x, y }) => [x, y])).toEqual(worst);
  });

  it('keeps coordinate ties with full observation provenance and does not mutate rows', () => {
    const rows = [row(1, 2, 3, { curve_date: '2026-08-08' }), row(2, 2, 3), row(3, 1, 1)];
    const original = structuredClone(rows);
    const result = compute(rows);
    expect(result.frontier[0].observations).toEqual(rows.slice(0, 2));
    expect(result.frontier[0].observations[0].date).toBe('2026-08-01');
    expect(result.frontier[0].observations[0].curve_date).toBe('2026-08-08');
    expect(result.hinterland[0].observations[0].id).toBe(3);
    expect(result.counts.eligible).toBe(3);
    expect(rows).toEqual(original);
  });

  it('filters exact scope before computing and counts missing axes without coercing zero or strings', () => {
    const result = compute(
      [
        row(1, 0, -1),
        row(2, 1, 1, { metrics: { x: '2', y: 5 } }),
        row(3, NaN, 1),
        row(4, 1, Infinity),
        row(5, 1, 1, { metrics: {} }),
        row(6, 100, 100, { model: 'other' }),
        row(7, 100, 100, { isl: 8192 }),
        row(8, 100, 100, { hardware: 'b200' }),
        row(9, 100, 100, { framework: 'sglang' }),
        row(10, 100, 100, { precision: 'fp4' }),
      ],
      '&hardware=h200_sxm&framework=vllm&precision=fp8',
    );
    expect(result.counts).toEqual({
      returned: 10,
      selected: 5,
      eligible: 1,
      missing_or_nonfinite: 4,
    });
    expect(result.frontier[0]).toMatchObject({ x: 0, y: -1 });
    expect(result.hinterland).toEqual(result.frontier);
  });

  it('returns honest empty boundaries and supports agentic workloads', () => {
    expect(compute([]).frontier).toEqual([]);
    expect(compute([row(1, 1, 1)], '&hardware=unknown').counts.selected).toBe(0);
    const params = new URLSearchParams(query);
    params.set('sequence', 'agentic-traces');
    const rows = [
      row(1, 1, 1, { benchmark_type: 'agentic_traces', isl: null, osl: null }),
      row(2, 2, 2),
    ];
    expect(
      computeParetoResponse(rows, parseParetoRequest(params).selection, '/raw').counts.selected,
    ).toBe(1);
    expect(compute([row(1, 1, 1, { benchmark_type: 'future_type' })]).counts.selected).toBe(0);
  });

  it.each([
    '&unknown=1',
    '&i_frontier=1',
    '&unofficialrun=123',
    '&hardware=',
    '&model=DeepSeek-R1-0528',
    '&date=2026-02-30',
    '&date=invalid',
    '&exact=true',
    '&exact=yes',
    '&runId=abc',
    '&runId=0',
    '&runId=9007199254740992',
    '&exactRun=true',
    '&runId=123&exactRun=true&date=2026-01-01',
    '&powerValid=false',
  ])('rejects ambiguous or invalid query %s', (suffix) => {
    expect(() => parse(suffix)).toThrow();
  });
  it.each(['model', 'rawModel', 'sequence', 'xMetric', 'yMetric', 'xDirection', 'yDirection'])(
    'requires %s',
    (key) => {
      const params = new URLSearchParams(query);
      params.delete(key);
      expect(() => parseParetoRequest(params)).toThrow();
    },
  );
  it('requires strictV2 for registered power axes and passes raw selectors only', () => {
    const params = new URLSearchParams(query);
    params.set('yMetric', 'avg_power_w');
    expect(() => parseParetoRequest(params)).toThrow('Power axes require powerValid=strictV2');
    params.set('powerValid', 'strictV2');
    params.set('date', '2026-08-08');
    params.set('exact', 'true');
    const parsed = parseParetoRequest(params);
    expect(Object.fromEntries(parsed.sourceParams)).toEqual({
      model: 'DeepSeek-R1-0528',
      date: '2026-08-08',
      exact: 'true',
      powerValid: 'strictV2',
    });
  });
});
