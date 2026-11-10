import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import {
  baseSku,
  bestSeriesPerSku,
  hypervolume,
  skuColumns,
  withUnrankedSkus,
} from './best-series-per-sku';

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

const overlayPointAt = (hwKey: string, x: number, y: number) =>
  ({
    ...point('B200-8', hwKey, x, y),
    run_url: 'https://github.com/example/actions/runs/123',
  }) as InferenceData;

const frameworkOverlayPoint = (hwKey: string, framework: string, x: number, y: number) =>
  ({
    ...frameworkPoint('B200-8', hwKey, framework, x, y),
    run_url: 'https://github.com/example/actions/runs/123',
  }) as InferenceData;

describe('bestSeriesPerSku', () => {
  it('ranks only selected precisions so an FP4 winner cannot hide the FP8 SKU', () => {
    const rows = [
      { ...point('gb300-nvl72', 'gb300_dynamo-trt', 10, 1000), precision: 'fp4' },
      { ...point('gb300-nvl72', 'gb300_dynamo-trt', 20, 800), precision: 'fp4' },
      { ...point('gb300-nvl72', 'gb300_dynamo-sglang', 10, 100), precision: 'fp8' },
      { ...point('gb300-nvl72', 'gb300_dynamo-sglang', 20, 80), precision: 'fp8' },
    ] as InferenceData[];

    expect(bestSeriesPerSku(skuColumns(rows), 'upper_left', ['fp8'])).toEqual(
      new Set(['gb300_dynamo-sglang']),
    );
    expect(bestSeriesPerSku(skuColumns(rows), 'upper_left', ['fp4', 'fp8'])).toEqual(
      new Set(['gb300_dynamo-trt']),
    );
    expect(bestSeriesPerSku(skuColumns(rows), 'upper_left', ['bf16'])).toEqual(new Set());
  });

  it('builds the columns of one chart data array once', () => {
    const points = [point('B200-8', 'b200_trt', 10, 100)];
    expect(skuColumns(points)).toBe(skuColumns(points));
    expect(skuColumns([...points])).not.toBe(skuColumns(points));
  });

  it('selects the highest normalized frontier AUC within each SKU', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        point('B200-8', 'b200_trt', 10, 100),
        point('B200-8', 'b200_trt', 20, 80),
        point('B200-8', 'b200_sglang', 10, 90),
        point('B200-8', 'b200_sglang', 20, 60),
        point('H200-8', 'h200_vllm', 10, 40),
      ]),
      'upper_left',
    );

    expect([...selected].toSorted()).toEqual(['b200_trt', 'h200_vllm']);
  });

  it('credits a curve for the measured range a narrower rival does not reach', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        point('B200-8', 'b200_wide', 8, 70),
        point('B200-8', 'b200_wide', 10, 60),
        point('B200-8', 'b200_wide', 20, 50),
        point('B200-8', 'b200_narrow', 8, 90),
        point('B200-8', 'b200_narrow', 10, 80),
      ]),
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_wide']));
  });

  it('keeps a narrower curve that dominates across nearly all of the range', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        point('B200-8', 'b200_wide', 10, 50),
        point('B200-8', 'b200_wide', 21, 40),
        point('B200-8', 'b200_narrow', 10, 100),
        point('B200-8', 'b200_narrow', 20, 80),
      ]),
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

    expect(bestSeriesPerSku(skuColumns(rows), 'upper_left')).toEqual(new Set(['mi355x_vllm']));
  });

  it('keeps a large lead where values are high over a long tail of small leads (DeepSeek-V4-Pro GB200)', () => {
    // Production AgentX tok/$ frontiers at P90 interactivity, 2026-11-03. Dynamo SGLang leads
    // over more of the axis, but Dynamo vLLM roughly doubles it between 80 and 105 tok/s/user.
    const curves: Record<string, [number, number][]> = {
      'gb200_dynamo-sglang': [
        [55.46, 140_744_522],
        [65.45, 124_912_721],
        [77.58, 102_921_402],
        [120.48, 54_271_086],
        [137.55, 50_479_877],
        [151.06, 34_442_724],
        [239.81, 7_570_912],
        [287.36, 4_787_344],
      ],
      'gb200_dynamo-vllm': [
        [80.52, 204_225_994],
        [93.9, 164_837_221],
        [95.79, 164_643_739],
        [104.6, 74_816_632],
        [119.19, 46_391_493],
        [141.04, 24_066_238],
        [178.89, 7_029_949],
        [255.75, 4_056_408],
      ],
    };
    const rows = Object.entries(curves).flatMap(([hwKey, points]) =>
      points.map(([x, y]) => point('GB200-NVL72', hwKey, x, y)),
    );

    expect(bestSeriesPerSku(skuColumns(rows), 'upper_left')).toEqual(
      new Set(['gb200_dynamo-vllm']),
    );
  });

  it('ranks a lower-is-better metric exactly like its reciprocal', () => {
    const tokensPerDollar = [
      point('B200-8', 'b200_steady', 10, 900),
      point('B200-8', 'b200_steady', 40, 500),
      point('B200-8', 'b200_steady', 80, 200),
      point('B200-8', 'b200_peaky', 10, 1_400),
      point('B200-8', 'b200_peaky', 30, 400),
      point('B200-8', 'b200_peaky', 90, 150),
      point('B200-8', 'b200_short', 50, 600),
      point('B200-8', 'b200_short', 60, 450),
    ];
    const dollarsPerMillion = tokensPerDollar.map((row) => ({ ...row, y: 1e6 / row.y }));

    const higher = bestSeriesPerSku(skuColumns(tokensPerDollar), 'upper_left');
    expect(bestSeriesPerSku(skuColumns(dollarsPerMillion), 'lower_right')).toEqual(higher);
    // Areas: short 60·450 + 50·150 = 34,500; steady 32,000; peaky 31,000.
    expect(higher).toEqual(new Set(['b200_short']));
    const steady = tokensPerDollar.filter((row) => row.hwKey === 'b200_steady');
    expect(hypervolume(steady, 'upper_left')).toBe(32_000);
    expect(
      hypervolume(
        steady.map((row) => ({ ...row, y: 1 / row.y })),
        'lower_right',
      ),
    ).toBe(32_000);
  });

  it('does not let a singleton preview displace a complete curve', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        point('B200-8', 'b200_complete', 10, 100),
        point('B200-8', 'b200_complete', 20, 80),
        point('B200-8', 'b200_complete', 30, 60),
        point('B200-8', 'b200_complete', 40, 40),
        point('B200-8', 'b200_singleton', 200, 1_000),
      ]),
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_complete']));
  });

  it('keeps a two-point preview from being hidden by a singleton', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        point('B200-8', 'b200_two_points', 10, 100),
        point('B200-8', 'b200_two_points', 20, 80),
        point('B200-8', 'b200_singleton', 200, 1_000),
      ]),
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_two_points']));
  });

  it('inverts the score for lower-is-better metrics', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        point('B200-8', 'b200_cheap', 10, 1),
        point('B200-8', 'b200_cheap', 20, 2),
        point('B200-8', 'b200_expensive', 10, 2),
        point('B200-8', 'b200_expensive', 20, 3),
      ]),
      'lower_right',
    );

    expect(selected).toEqual(new Set(['b200_cheap']));
  });

  it('groups framework variants by physical hardware SKU', () => {
    expect(baseSku(point('GB200-NVL72', 'gb200_dynamo-trt', 1, 1))).toBe('GB200');
  });

  it('keeps every eligible TileRT series alongside the SKU AUC winner', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        frameworkPoint('B200-8', 'b200_sglang', 'sglang', 20, 1_800),
        frameworkPoint('B200-8', 'b200_sglang', 'sglang', 60, 1_000),
        frameworkPoint('B200-8', 'b200_tilert_mtp', 'tilert', 340, 160),
        frameworkPoint('B200-8', 'b200_tilert_stp', 'tilert', 300, 140),
        frameworkPoint('B200-8', 'b200_unrelated_endpoint', 'vllm', 400, 120),
      ]),
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_sglang', 'b200_tilert_mtp', 'b200_tilert_stp']));
  });

  it('ranks unofficial-run overlay series with the same SKU policy', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        overlayPointAt('b200_overlay_vllm', 10, 80),
        overlayPointAt('b200_overlay_vllm', 20, 60),
        overlayPointAt('b200_overlay_sglang', 10, 100),
        overlayPointAt('b200_overlay_sglang', 20, 75),
      ]),
      'upper_left',
    );

    expect(selected).toEqual(new Set(['b200_overlay_sglang']));
  });

  it('keeps TileRT series from an unofficial-run overlay', () => {
    const selected = bestSeriesPerSku(
      skuColumns([
        frameworkOverlayPoint('b200_overlay_sglang', 'sglang', 20, 1_800),
        frameworkOverlayPoint('b200_overlay_sglang', 'sglang', 60, 1_000),
        frameworkOverlayPoint('b200_overlay_tilert_mtp', 'tilert', 340, 160),
      ]),
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
    const best = bestSeriesPerSku(skuColumns([...ranked, ...tableOnly]), 'upper_left');
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
