import { describe, expect, it } from 'vitest';
import { buildDatasetFromNeutral } from '@semianalysisai/inferencex-db/collectivex/reader';
import {
  makeSwapDoc,
  swapMatrix,
  swapMeta,
} from '@semianalysisai/inferencex-db/collectivex/swap-test-fixture';
import {
  formatSwapBytes,
  swapChartPoints,
  swapRangeBands,
  swapRooflines,
  swapYAxis,
  type SwapChartPoint,
} from './swap-data';

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

it('skips rows whose selected percentile was not measured instead of plotting null', () => {
  const dataset = buildDatasetFromNeutral(swapMatrix, [makeSwapDoc()], swapMeta);
  const selection = {
    direction: 'h2d',
    layout: 'contiguous',
    metric: 'latency',
    percentile: 'p99',
  } as const;
  const before = swapChartPoints([dataset], selection);
  const target = before[0].row;
  (target.latency_us as Record<string, number | null>).p99 = null;
  const after = swapChartPoints([dataset], selection);
  expect(after).toHaveLength(before.length - 1);
  expect(after.every((point) => Number.isFinite(point.y))).toBe(true);
  expect(after.some((point) => point.row === target)).toBe(false);
});

it('selects one-way host or read-plus-write HBM ceilings and deduplicates visible GPUs', () => {
  const points = [{ sku: 'h200-dgxc' }, { sku: 'h200-dgxc' }, { sku: 'gb200' }];
  expect(swapRooflines(points, 'h2d').map((r) => [r.path, r.gbps, r.devices])).toEqual([
    ['PCIe 5.0 x16', 64, ['H200 SXM']],
    ['NVLink-C2C', 225, ['GB200 NVL72']],
  ]);
  expect(swapRooflines(points, 'd2d').map((r) => r.gbps)).toEqual([2400, 4000]);
  expect(swapRooflines([{ sku: 'unknown' }], 'd2h')).toEqual([]);
  expect(swapRooflines([], 'h2d')).toEqual([]);
});

it('applies AMD rooflines to current Slurm pool names', () => {
  const points = [{ sku: 'mi300x' }, { sku: 'mi325x' }];
  expect(swapRooflines(points, 'h2d').map((r) => [r.gbps, r.devices])).toEqual([
    [64, ['MI300X', 'MI325X']],
  ]);
  expect(swapRooflines(points, 'd2d').map((r) => r.gbps)).toEqual([2650, 3000]);
});

it('labels a GPU whose runtime reports an empty device name using its recorded SKU', () => {
  const dataset = buildDatasetFromNeutral(swapMatrix, [makeSwapDoc()], swapMeta);
  const result = dataset.swap_blocks![0];
  result.runtime.device = '  ';
  result.sku = 'mi355x';
  const selection = {
    direction: 'h2d' as const,
    layout: 'contiguous' as const,
    metric: 'bandwidth' as const,
    percentile: 'p50' as const,
  };
  expect(swapChartPoints([dataset], selection).map((p) => p.device)).toEqual(['MI355X', 'MI355X']);
  result.sku = 'future-gpu';
  expect(swapChartPoints([dataset], selection)[0].device).toBe('future-gpu');
});

describe('swapYAxis', () => {
  it('breaks above the data and stacks a distant NVLink-C2C roofline just above the break', () => {
    const axis = swapYAxis(80, [64, 225]);
    expect(axis.breakAt).toBeCloseTo(92);
    expect(axis.toPlot(64)).toBe(64);
    const c2c = axis.toPlot(225);
    expect(c2c).toBeGreaterThan(92);
    expect(c2c).toBeLessThan(axis.domainMax);
    expect(axis.domainMax).toBeLessThan(130);
    expect(axis.fromPlot(c2c)).toBe(225);
    expect(axis.fromPlot(50)).toBe(50);
    expect(axis.fromPlot((92 + c2c) / 2)).toBeNull();
  });

  it('keeps a true linear scale when every roofline is near the data', () => {
    const axis = swapYAxis(50, [64]);
    expect(axis.breakAt).toBeNull();
    expect(axis.toPlot(64)).toBe(64);
    expect(axis.domainMax).toBeCloseTo(70.4);
  });

  it('keeps a roofline just above the data below the break so its tick stays labelled', () => {
    const axis = swapYAxis(80, [120, 900]);
    expect(axis.breakAt).toBeCloseTo(138);
    expect(axis.toPlot(120)).toBe(120);
    expect(axis.fromPlot(120)).toBe(120);
    expect(axis.fromPlot(axis.toPlot(900))).toBe(900);
  });
});

const rangePoint = (runId: string, sku: string, numBlocks: number, x: number, y: number) =>
  ({
    x,
    y,
    runId,
    sku,
    device: sku.toUpperCase(),
    seriesId: `${runId}__${sku}__${numBlocks}`,
    colorKey: `${sku}:${numBlocks}`,
    row: { num_blocks: numBlocks },
  }) as SwapChartPoint;

describe('swapRangeBands', () => {
  it('spans block counts per run and SKU with a median line, best member first', () => {
    const bands = swapRangeBands(
      [
        rangePoint('1', 'gb200', 1, 4096, 2),
        rangePoint('1', 'gb200', 4, 4096, 8),
        rangePoint('1', 'gb200', 16, 4096, 4),
        rangePoint('1', 'gb200', 64, 4096, 10),
        rangePoint('1', 'gb200', 1, 1024, 1),
        rangePoint('1', 'b200', 1, 4096, 3),
        rangePoint('2', 'gb200', 1, 4096, 5),
      ],
      'bandwidth',
    );
    expect(bands.map((b) => b.id)).toEqual(['1__b200', '1__gb200', '2__gb200']);
    const gb200 = bands[1];
    expect(gb200.points.map((p) => p.x)).toEqual([1024, 4096]);
    expect(gb200.points[0]).toMatchObject({ lo: 1, mid: 1, hi: 1 });
    // Even count: mean of the two middle values (4 and 8).
    expect(gb200.points[1]).toMatchObject({ lo: 2, mid: 6, hi: 10 });
    expect(gb200.points[1].members.map((m) => m.numBlocks)).toEqual([64, 4, 16, 1]);
  });

  it('puts the lowest latency first', () => {
    const [band] = swapRangeBands(
      [
        rangePoint('1', 'h200', 1, 4096, 9),
        rangePoint('1', 'h200', 4, 4096, 3),
        rangePoint('1', 'h200', 16, 4096, 5),
      ],
      'latency',
    );
    expect(band.points[0]).toMatchObject({ lo: 3, mid: 5, hi: 9 });
    expect(band.points[0].members.map((m) => m.y)).toEqual([3, 5, 9]);
  });
});
