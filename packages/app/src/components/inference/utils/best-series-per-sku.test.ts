import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import {
  baseSku,
  bestSeriesByPrecisionPerSku,
  bestSeriesPerSku,
  restrictGraphToBestPrecisions,
  restrictToBestPrecisions,
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

function precisionPoint(hwKey: string, precision: string, x: number, y: number): InferenceData {
  return { ...point('B200-8', hwKey, x, y), precision };
}

describe('bestSeriesByPrecisionPerSku', () => {
  it('ranks the FP4 and FP8 curves of one hwKey as separate candidates', () => {
    // b200_trt FP4 dominates its own FP8 curve; both share the same hwKey.
    const rows = [
      precisionPoint('b200_trt', 'fp4', 10, 1000),
      precisionPoint('b200_trt', 'fp4', 20, 800),
      precisionPoint('b200_trt', 'fp8', 10, 600),
      precisionPoint('b200_trt', 'fp8', 20, 500),
    ];

    expect(bestSeriesByPrecisionPerSku(rows, 'upper_left', ['fp4', 'fp8'])).toEqual(
      new Map([['b200_trt', new Set(['fp4'])]]),
    );
    // Explicit single-precision selection is unchanged.
    expect(bestSeriesByPrecisionPerSku(rows, 'upper_left', ['fp8'])).toEqual(
      new Map([['b200_trt', new Set(['fp8'])]]),
    );
  });

  it("picks a chip's best config across precisions, not the default precision", () => {
    // The best FP8 config (sglang) beats the best FP4 config (trt) on this SKU.
    const rows = [
      precisionPoint('b200_trt', 'fp4', 10, 500),
      precisionPoint('b200_trt', 'fp4', 20, 400),
      precisionPoint('b200_sglang', 'fp8', 10, 900),
      precisionPoint('b200_sglang', 'fp8', 20, 700),
      precisionPoint('b200_sglang', 'fp4', 10, 300),
      precisionPoint('b200_sglang', 'fp4', 20, 200),
    ];

    expect(bestSeriesByPrecisionPerSku(rows, 'upper_left', ['fp4', 'fp8'])).toEqual(
      new Map([['b200_sglang', new Set(['fp8'])]]),
    );
    expect(bestSeriesPerSku(rows, 'upper_left', ['fp4'])).toEqual(new Set(['b200_trt']));
  });

  it('does not merge precisions into one envelope that beats both single curves', () => {
    // trt FP4 wins low x, trt FP8 wins high x; one merged hwKey front would
    // beat sglang, but neither single trt curve does.
    const rows = [
      precisionPoint('b200_trt', 'fp4', 10, 1000),
      precisionPoint('b200_trt', 'fp4', 20, 100),
      precisionPoint('b200_trt', 'fp8', 10, 100),
      precisionPoint('b200_trt', 'fp8', 20, 1000),
      precisionPoint('b200_sglang', 'fp4', 10, 700),
      precisionPoint('b200_sglang', 'fp4', 20, 700),
    ];

    expect(bestSeriesByPrecisionPerSku(rows, 'upper_right', ['fp4', 'fp8'])).toEqual(
      new Map([['b200_sglang', new Set(['fp4'])]]),
    );
  });
});

describe('restrictToBestPrecisions', () => {
  it("drops a winning hwKey's losing precision and keeps unranked hwKeys whole", () => {
    const rows = [
      precisionPoint('b200_trt', 'fp4', 10, 1000),
      precisionPoint('b200_trt', 'fp8', 10, 600),
      precisionPoint('h200_vllm', 'fp8', 10, 40),
      precisionPoint('h200_vllm', 'bf16', 10, 30),
    ];
    const selection = new Map([['b200_trt', new Set(['fp4'])]]);

    expect(
      restrictToBestPrecisions(rows, selection).map((p) => `${p.hwKey}:${p.precision}`),
    ).toEqual(['b200_trt:fp4', 'h200_vllm:fp8', 'h200_vllm:bf16']);
  });

  it('restricts chart, table and clipped rows of a graph together', () => {
    const fp4 = precisionPoint('b200_trt', 'fp4', 10, 1000);
    const fp8 = precisionPoint('b200_trt', 'fp8', 10, 600);
    const graph = {
      data: [fp4, fp8],
      tableData: [fp4, fp8],
      clippedData: [{ point: fp8, reasons: [] }],
    };
    const restricted = restrictGraphToBestPrecisions(
      graph,
      new Map([['b200_trt', new Set(['fp4'])]]),
    );

    expect(restricted.data).toEqual([fp4]);
    expect(restricted.tableData).toEqual([fp4]);
    expect(restricted.clippedData).toEqual([]);
    expect(restrictGraphToBestPrecisions(graph, new Map())).toBe(graph);
  });
});

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

  it('uses only the shared measured domain instead of rewarding wider coverage', () => {
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

    expect(selected).toEqual(new Set(['b200_narrow']));
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
