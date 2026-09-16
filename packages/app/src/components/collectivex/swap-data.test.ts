import { expect, it } from 'vitest';
import { buildDatasetFromNeutral } from '@semianalysisai/inferencex-db/collectivex/reader';
import {
  makeSwapDoc,
  swapMatrix,
  swapMeta,
} from '@semianalysisai/inferencex-db/collectivex/swap-test-fixture';
import { formatSwapBytes, swapChartPoints } from './swap-data';

it('formats byte units without losing the 1 GiB endpoint', () => {
  expect([257, 1024, 262144, 1048576, 1073741824].map(formatSwapBytes)).toEqual([
    '257 B',
    '1 KiB',
    '256 KiB',
    '1 MiB',
    '1 GiB',
  ]);
});
it('selects direction, layout and percentile and separates comparison runs', () => {
  const first = buildDatasetFromNeutral(swapMatrix, [makeSwapDoc()], swapMeta);
  const second = buildDatasetFromNeutral(swapMatrix, [makeSwapDoc()], {
    ...swapMeta,
    run_id: '171',
  });
  const points = swapChartPoints([first, second], {
    direction: 'h2d',
    layout: 'contiguous',
    metric: 'bandwidth',
    percentile: 'p90',
  });
  expect(points.map((p) => [p.x, p.y])).toEqual([
    [1024, 0.256],
    [1073741824, 16.384],
    [1024, 0.256],
    [1073741824, 16.384],
  ]);
  expect(points[0].seriesId).not.toBe(points[2].seriesId);
  expect(points[0].colorKey).toBe(points[2].colorKey);
  expect(
    swapChartPoints([first], {
      direction: 'd2d',
      layout: 'random',
      metric: 'latency',
      percentile: 'p99',
    }).map((p) => p.y),
  ).toEqual([8]);
  expect(
    swapChartPoints([first], {
      direction: 'd2h',
      layout: 'random',
      metric: 'latency',
      percentile: 'p50',
    }),
  ).toEqual([]);
});
