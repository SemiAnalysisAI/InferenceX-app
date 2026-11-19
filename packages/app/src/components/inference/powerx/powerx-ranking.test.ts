import { describe, expect, it } from 'vitest';

import {
  gpuWeightedPools,
  powerXDeltaVsBest,
  powerXDirectLabelTexts,
  powerXRankingRows,
  powerXRankingToggle,
  powerXShowFor,
  powerXShowState,
  sumPools,
} from './powerx-ranking';

const line = (...points: [number, number][]) => points.map(([x, y]) => ({ x, y }));

describe('Δ vs best', () => {
  it('reads best for the lowest value and the rounded excess otherwise, at least +1%', () => {
    expect(powerXDeltaVsBest(1, 1)).toBe('best');
    expect(powerXDeltaVsBest(1.34, 1)).toBe('+34%');
    expect(powerXDeltaVsBest(1.001, 1)).toBe('+1%');
  });

  it('ranks rows lowest first at the point nearest Compare at', () => {
    const rows = powerXRankingRows(
      [
        { key: 'mi355x', hidden: false, aggregated: false, points: line([20, 9], [48, 1.34]) },
        { key: 'gb300', hidden: false, aggregated: false, points: line([50, 1], [200, 0.5]) },
      ],
      48,
    );
    expect(rows.map((row) => [row.key, row.rank, row.value, row.delta])).toEqual([
      ['gb300', 1, 1, 'best'],
      ['mi355x', 2, 1.34, '+34%'],
    ]);
  });
});

describe('ranking rows', () => {
  it('lists an aggregated GPU under a role unranked and without a value, never 0', () => {
    const rows = powerXRankingRows(
      [
        { key: 'h200', hidden: false, aggregated: true, points: line([48, 0]) },
        { key: 'gb200', hidden: false, aggregated: false, points: line([48, 2]) },
      ],
      48,
    );
    const aggregated = rows.find((row) => row.key === 'h200')!;
    expect(aggregated).toMatchObject({ rank: null, value: null, delta: null, aggregated: true });
    expect(rows.at(-1)?.key).toBe('h200');
    expect(rows[0]).toMatchObject({ key: 'gb200', rank: 1, delta: 'best' });
  });

  it('keeps hidden rows listed last, out of the ranking and the best', () => {
    const rows = powerXRankingRows(
      [
        { key: 'b200', hidden: true, aggregated: false, points: line([48, 0.5]) },
        { key: 'gb300', hidden: false, aggregated: false, points: line([48, 1]) },
      ],
      48,
    );
    expect(rows.map((row) => [row.key, row.rank, row.delta])).toEqual([
      ['gb300', 1, 'best'],
      ['b200', null, null],
    ]);
  });
});

describe('ranking row toggle', () => {
  it('hides a visible GPU, shows a hidden one and never hides the last visible GPU', () => {
    expect(powerXRankingToggle(new Set(['a', 'b']), 'a')).toEqual({
      action: 'hide',
      next: new Set(['b']),
    });
    expect(powerXRankingToggle(new Set(['b']), 'a')).toEqual({
      action: 'show',
      next: new Set(['a', 'b']),
    });
    expect(powerXRankingToggle(new Set(['b']), 'b').action).toBe('none');
  });
});

describe('Show', () => {
  it('maps Best per GPU, All configs and All points onto Optimal Only and Best per SKU', () => {
    for (const show of ['best', 'configs', 'points'] as const) {
      const { optimalOnly, bestPerSku } = powerXShowState(show);
      expect(powerXShowFor(optimalOnly, bestPerSku)).toBe(show);
    }
    expect(powerXShowFor(false, true)).toBe('points');
  });
});

describe('direct labels', () => {
  it('shows the short GPU name and adds the framework only when two series share a GPU', () => {
    const texts = powerXDirectLabelTexts([
      { key: 'a', hwKey: 'gb300_dynamo-vllm', frameworkTag: 'vLLM', poolTag: '' },
      { key: 'b', hwKey: 'gb300_dynamo-sglang', frameworkTag: 'SGLang', poolTag: '' },
      { key: 'c', hwKey: 'mi355x_sglang', frameworkTag: 'SGLang', poolTag: '' },
    ]);
    expect([...texts.values()]).toEqual(['GB300 vLLM', 'GB300 SGLang', 'MI355X']);
  });
});

const pool = (n: { num_prefill_gpu?: number; num_decode_gpu?: number }, ...pts: number[][]) =>
  pts.map(([x, y, conc]) => ({ x, y, conc, ...n }));

describe('Prefill vs decode ranking', () => {
  // The role draws only the two pool lines, so the all-GPU line is empty: the row must rank
  // the drawn pools combined, not read "–".

  it('ranks the prefill + decode energy of one config nearest Compare at', () => {
    const rows = powerXRankingRows(
      [
        {
          key: 'gb300',
          hidden: false,
          aggregated: false,
          points: [],
          pools: {
            prefill: pool({}, [50, 1, 16], [90, 2, 64]),
            decode: pool({}, [50, 3, 16], [90, 4, 64]),
            combine: sumPools,
          },
        },
        {
          key: 'gb200',
          hidden: false,
          aggregated: false,
          points: [],
          pools: {
            prefill: pool({}, [80, 1, 32]),
            decode: pool({}, [80, 2, 32]),
            combine: sumPools,
          },
        },
      ],
      85,
    );
    expect(rows.map((row) => [row.key, row.rank, row.value, row.delta])).toEqual([
      ['gb200', 1, 3, 'best'],
      ['gb300', 2, 6, '+100%'],
    ]);
    expect(rows[1].pools?.prefill?.conc).toBe(64);
    expect(rows[1].pools?.decode?.conc).toBe(64);
  });

  it('weighs power per GPU by the GPU count of each pool', () => {
    expect(
      gpuWeightedPools({ x: 1, y: 800, num_prefill_gpu: 8 }, { x: 1, y: 400, num_decode_gpu: 24 }),
    ).toBe(500);
  });
});
