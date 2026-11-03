import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { baseSku, bestSeriesPerSku, withUnrankedSkus } from './best-series-per-sku';

function point(hw: string, hwKey: string, x: number, y: number): InferenceData {
  return { hw, hwKey, x, y } as InferenceData;
}

function frameworkPoint(
  hw: string,
  hwKey: string,
  framework: string,
  x: number,
  y: number,
): InferenceData {
  return { ...point(hw, hwKey, x, y), framework };
}

describe('bestSeriesPerSku', () => {
  it('ranks only selected precisions so an FP4 winner cannot hide the FP8 SKU', () => {
    const rows = [
      { ...point('gb300-nvl72', 'gb300_dynamo-trt', 10, 1000), precision: 'fp4' },
      { ...point('gb300-nvl72', 'gb300_dynamo-trt', 20, 800), precision: 'fp4' },
      { ...point('gb300-nvl72', 'gb300_dynamo-sglang', 10, 100), precision: 'fp8' },
      { ...point('gb300-nvl72', 'gb300_dynamo-sglang', 20, 80), precision: 'fp8' },
    ] as InferenceData[];

    expect(bestSeriesPerSku(rows, 'upper_left', ['fp8'])).toEqual(new Set(['gb300_dynamo-sglang']));
    expect(bestSeriesPerSku(rows, 'upper_left', ['fp4', 'fp8'])).toEqual(
      new Set(['gb300_dynamo-trt']),
    );
    expect(bestSeriesPerSku(rows, 'upper_left', ['bf16'])).toEqual(new Set());
  });

  it('selects the highest normalized frontier AUC within each SKU', () => {
    const selected = bestSeriesPerSku(
      [
        point('B200-8', 'b200_trt', 10, 100),
        point('B200-8', 'b200_trt', 20, 80),
        point('B200-8', 'b200_sglang', 10, 90),
        point('B200-8', 'b200_sglang', 20, 60),
        point('H200-8', 'h200_vllm', 10, 40),
      ],
      'upper_left',
    );

    expect([...selected].toSorted()).toEqual(['b200_trt', 'h200_vllm']);
  });

  it('credits a curve for the measured range a narrower rival does not reach', () => {
    const selected = bestSeriesPerSku(
      [
        point('B200-8', 'b200_wide', 8, 70),
        point('B200-8', 'b200_wide', 10, 60),
        point('B200-8', 'b200_wide', 20, 50),
        point('B200-8', 'b200_narrow', 8, 90),
        point('B200-8', 'b200_narrow', 10, 80),
      ],
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_wide']));
  });

  it('keeps a narrower curve that dominates across nearly all of the range', () => {
    const selected = bestSeriesPerSku(
      [
        point('B200-8', 'b200_wide', 10, 50),
        point('B200-8', 'b200_wide', 21, 40),
        point('B200-8', 'b200_narrow', 10, 100),
        point('B200-8', 'b200_narrow', 20, 80),
      ],
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_narrow']));
  });

  it('does not let a short disaggregated preview win on the window it shares (Kimi-K3 MI355X)', () => {
    // Production AgentX tok/$ frontiers at P90 interactivity, 2026-11-03.
    const curves: Record<string, [number, number][]> = {
      mi355x_atom: [
        [20.68, 41_957_024],
        [23.55, 41_033_453],
        [57.01, 21_632_136],
        [120.34, 6_907_136],
        [151.52, 3_890_458],
      ],
      mi355x_vllm: [
        [20.49, 38_127_175],
        [33.36, 34_216_505],
        [43.33, 29_759_666],
        [59.59, 21_268_858],
        [82.03, 15_543_627],
        [142.05, 6_860_835],
        [211.86, 4_606_312],
      ],
      'mi355x_vllm-disagg': [
        [46.69, 26_117_604],
        [74.24, 19_113_307],
        [98.62, 13_334_689],
        [110.13, 10_431_906],
        [131.41, 4_281_518],
      ],
    };
    const rows = Object.entries(curves).flatMap(([hwKey, points]) =>
      points.map(([x, y]) => point('mi355x', hwKey, x, y)),
    );

    expect(bestSeriesPerSku(rows, 'upper_left')).toEqual(new Set(['mi355x_vllm']));
  });

  it('does not let a singleton preview displace a complete curve', () => {
    const selected = bestSeriesPerSku(
      [
        point('B200-8', 'b200_complete', 10, 100),
        point('B200-8', 'b200_complete', 20, 80),
        point('B200-8', 'b200_complete', 30, 60),
        point('B200-8', 'b200_complete', 40, 40),
        point('B200-8', 'b200_singleton', 200, 1_000),
      ],
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_complete']));
  });

  it('keeps a two-point preview from being hidden by a singleton', () => {
    const selected = bestSeriesPerSku(
      [
        point('B200-8', 'b200_two_points', 10, 100),
        point('B200-8', 'b200_two_points', 20, 80),
        point('B200-8', 'b200_singleton', 200, 1_000),
      ],
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_two_points']));
  });

  it('inverts the score for lower-is-better metrics', () => {
    const selected = bestSeriesPerSku(
      [
        point('B200-8', 'b200_cheap', 10, 1),
        point('B200-8', 'b200_cheap', 20, 2),
        point('B200-8', 'b200_expensive', 10, 2),
        point('B200-8', 'b200_expensive', 20, 3),
      ],
      'lower_right',
    );

    expect(selected).toEqual(new Set(['b200_cheap']));
  });

  it('groups framework variants by physical hardware SKU', () => {
    expect(baseSku(point('GB200-NVL72', 'gb200_dynamo-trt', 1, 1))).toBe('GB200');
  });

  it('keeps every eligible TileRT series alongside the SKU AUC winner', () => {
    const selected = bestSeriesPerSku(
      [
        frameworkPoint('B200-8', 'b200_sglang', 'sglang', 20, 1_800),
        frameworkPoint('B200-8', 'b200_sglang', 'sglang', 60, 1_000),
        frameworkPoint('B200-8', 'b200_tilert_mtp', 'tilert', 340, 160),
        frameworkPoint('B200-8', 'b200_tilert_stp', 'tilert', 300, 140),
        frameworkPoint('B200-8', 'b200_unrelated_endpoint', 'vllm', 400, 120),
      ],
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_sglang', 'b200_tilert_mtp', 'b200_tilert_stp']));
  });

  it('ranks unofficial-run overlay series with the same SKU policy', () => {
    const overlayPoint = (hwKey: string, x: number, y: number) =>
      ({
        ...point('B200-8', hwKey, x, y),
        run_url: 'https://github.com/example/actions/runs/123',
      }) as InferenceData;
    const selected = bestSeriesPerSku(
      [
        overlayPoint('b200_overlay_vllm', 10, 80),
        overlayPoint('b200_overlay_vllm', 20, 60),
        overlayPoint('b200_overlay_sglang', 10, 100),
        overlayPoint('b200_overlay_sglang', 20, 75),
      ],
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_overlay_sglang']));
  });

  it('keeps TileRT series from an unofficial-run overlay', () => {
    const overlayPoint = (hwKey: string, framework: string, x: number, y: number) =>
      ({
        ...frameworkPoint('B200-8', hwKey, framework, x, y),
        run_url: 'https://github.com/example/actions/runs/123',
      }) as InferenceData;
    const selected = bestSeriesPerSku(
      [
        overlayPoint('b200_overlay_sglang', 'sglang', 20, 1_800),
        overlayPoint('b200_overlay_sglang', 'sglang', 60, 1_000),
        overlayPoint('b200_overlay_tilert_mtp', 'tilert', 340, 160),
      ],
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_overlay_sglang', 'b200_overlay_tilert_mtp']));
  });
});

describe('withUnrankedSkus', () => {
  it('keeps table-only SKUs when another SKU in the selection can be ranked', () => {
    const ranked = [
      point('B200-8', 'b200_trt', 10, 100),
      point('B200-8', 'b200_trt', 20, 80),
      point('B200-8', 'b200_sglang', 10, 90),
      point('B200-8', 'b200_sglang', 20, 60),
    ];
    const tableOnly = [
      point('GB200-NVL72', 'gb200_dynamo', 10, Number.NaN),
      point('GB200-NVL72', 'gb200_sglang', 10, Number.NaN),
    ];
    const best = bestSeriesPerSku([...ranked, ...tableOnly], 'upper_left');
    expect([...best]).toEqual(['b200_trt']);

    const selected = withUnrankedSkus(best, ranked, tableOnly);

    expect([...selected].toSorted()).toEqual(['b200_trt', 'gb200_dynamo', 'gb200_sglang']);
  });

  it('does not re-add losing series for a SKU that already has a ranked winner', () => {
    const rows = [
      point('B200-8', 'b200_trt', 10, 100),
      point('B200-8', 'b200_sglang', 10, 90),
      point('B200-8', 'b200_vllm', 10, Number.NaN),
    ];

    expect(withUnrankedSkus(new Set(['b200_trt']), rows.slice(0, 2), rows)).toEqual(
      new Set(['b200_trt']),
    );
  });

  it('only adds table rows, not unranked chart-only series', () => {
    const chartOnly = [point('H200-8', 'h200_vllm', 10, Number.NaN)];

    expect(withUnrankedSkus(new Set(['b200_trt']), chartOnly, [])).toEqual(new Set(['b200_trt']));
  });
});
