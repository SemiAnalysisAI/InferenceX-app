import { describe, expect, it } from 'vitest';

import { GPU_KEYS, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { buildCompareMatrix, compareMatrixGpuOrder } from './compare-matrix';
import { canonicalCompareSlug } from './compare-slug';

describe('compareMatrixGpuOrder', () => {
  it('includes every registry GPU exactly once', () => {
    const order = compareMatrixGpuOrder();
    expect(order.map((g) => g.key).toSorted()).toEqual([...GPU_KEYS].toSorted());
  });

  it('keeps vendors contiguous with NVIDIA first', () => {
    const vendors = compareMatrixGpuOrder().map((g) => g.vendor);
    // Once the vendor changes, the earlier vendor must never reappear —
    // contiguous blocks are what make the cross-vendor region a rectangle.
    // NVIDIA-first is pinned by VENDOR_BLOCK_ORDER, not derived from registry
    // sort, so a future low-sort AMD flagship can't silently flip the axis.
    const blocks = vendors.filter((v, i) => i === 0 || v !== vendors[i - 1]);
    expect(blocks).toEqual(['NVIDIA', 'AMD']);
  });

  it('orders each vendor block oldest→newest (registry sort descending)', () => {
    const order = compareMatrixGpuOrder();
    for (let i = 1; i < order.length; i++) {
      if (order[i].vendor !== order[i - 1].vendor) continue;
      expect(HW_REGISTRY[order[i].key].sort).toBeLessThan(HW_REGISTRY[order[i - 1].key].sort);
    }
    // Pin the NVIDIA generational read so a registry sort change is caught.
    expect(order.slice(0, 2).map((g) => g.key)).toEqual(['h100', 'h200']);
  });

  it('uses the registry label for rows and the uppercased key for columns', () => {
    const gb200 = compareMatrixGpuOrder().find((g) => g.key === 'gb200')!;
    expect(gb200.label).toBe('GB200 NVL72');
    expect(gb200.shortLabel).toBe('GB200');
  });
});

describe('buildCompareMatrix', () => {
  const PAIRS = [
    { a: 'h100', b: 'h200' },
    { a: 'h100', b: 'mi300x' },
    { a: 'mi300x', b: 'mi325x' },
  ];

  it('defines cells only for the upper triangle of the display order', () => {
    const { gpus, cells } = buildCompareMatrix('deepseek-r1', PAIRS);
    const index = new Map(gpus.map((g, i) => [g.key, i]));
    for (const [rowKey, row] of Object.entries(cells)) {
      for (const colKey of Object.keys(row)) {
        expect(index.get(colKey)!).toBeGreaterThan(index.get(rowKey)!);
      }
    }
    // Every above-diagonal position is present, even when unavailable.
    const cellCount = Object.values(cells).reduce((s, r) => s + Object.keys(r).length, 0);
    expect(cellCount).toBe((gpus.length * (gpus.length - 1)) / 2);
  });

  it('marks exactly the provided pairs as available', () => {
    const { cells, availableCount } = buildCompareMatrix('deepseek-r1', PAIRS);
    expect(availableCount).toBe(PAIRS.length);
    expect(cells['h100']['h200'].available).toBe(true);
    expect(cells['h100']['mi300x'].available).toBe(true);
    expect(cells['mi300x']['mi325x'].available).toBe(true);
    expect(cells['h100']['b200'].available).toBe(false);
  });

  it('builds canonical alphabetical slugs regardless of display order', () => {
    const { cells } = buildCompareMatrix('deepseek-r1', PAIRS);
    // Display order puts h100 before b200, but the slug sorts alphabetically.
    expect(cells['h100']['b200'].slug).toBe(canonicalCompareSlug('deepseek-r1', 'b200', 'h100'));
    expect(cells['h100']['b200'].slug).toBe('deepseek-r1-b200-vs-h100');
  });

  it('labels cells in canonical alphabetical order to match the destination page', () => {
    const { cells } = buildCompareMatrix('deepseek-r1', PAIRS);
    // Display order puts h100 (row) before b200 (col), but the label sorts
    // alphabetically so it matches the destination page title and the
    // analytics payload ("deepseek-r1-b200-vs-h100" → "B200 vs H100").
    expect(cells['h100']['b200'].label).toBe('B200 vs H100');
    // Display and alphabetical order coincide here, so the label is unchanged.
    expect(cells['gb200']['mi355x'].label).toBe('GB200 NVL72 vs MI355X');
  });

  it('flags cross-vendor cells and only those', () => {
    const { gpus, cells } = buildCompareMatrix('deepseek-r1', PAIRS);
    const vendorOf = new Map(gpus.map((g) => [g.key, g.vendor]));
    for (const [rowKey, row] of Object.entries(cells)) {
      for (const [colKey, cell] of Object.entries(row)) {
        expect(cell.cross).toBe(vendorOf.get(rowKey) !== vendorOf.get(colKey));
      }
    }
  });

  it('returns an all-ghost matrix for a model with no pairs', () => {
    const { cells, availableCount } = buildCompareMatrix('glm-5-1', []);
    expect(availableCount).toBe(0);
    expect(Object.values(cells).every((r) => Object.values(r).every((c) => !c.available))).toBe(
      true,
    );
  });
});
