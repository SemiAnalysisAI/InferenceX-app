import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { baseSku, bestSeriesPerSku } from './best-series-per-sku';

function point(hw: string, hwKey: string, x: number, y: number): InferenceData {
  return { hw, hwKey, x, y } as InferenceData;
}

describe('bestSeriesPerSku', () => {
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
});
