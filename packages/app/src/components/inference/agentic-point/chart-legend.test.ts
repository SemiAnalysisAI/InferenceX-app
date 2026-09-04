import { describe, expect, it } from 'vitest';

import {
  LEGEND_ITEM_GAP,
  LEGEND_ROW_HEIGHT,
  LEGEND_TEXT_OFFSET,
  estimateTextWidth,
  layoutChartLegend,
} from './chart-legend';

// Inline render of the point-detail charts: 720 viewBox units wide with the
// shared 60/16 left/right axis padding.
const INLINE_INNER_WIDTH = 720 - 60 - 16;

/** Right edge of the item at `index`, i.e. where its text stops. */
const itemRight = (labels: readonly string[], index: number, width: number): number => {
  const { items } = layoutChartLegend(labels, width);
  return items[index]!.x + LEGEND_TEXT_OFFSET + estimateTextWidth(labels[index]!);
};

describe('estimateTextWidth', () => {
  it('grows with the number of characters', () => {
    expect(estimateTextWidth('decode')).toBeGreaterThan(estimateTextWidth('dec'));
  });

  it('counts CJK characters as roughly one em each', () => {
    // Four fullwidth characters at font size 11.
    expect(estimateTextWidth('芯片缓存')).toBeCloseTo(44, 5);
  });

  it('charges more for wide characters than narrow ones', () => {
    expect(estimateTextWidth('mmmm')).toBeGreaterThan(estimateTextWidth('llll'));
  });

  it('returns zero for an empty label', () => {
    expect(estimateTextWidth('')).toBe(0);
  });

  it('scales linearly with font size', () => {
    expect(estimateTextWidth('decode', 22)).toBeCloseTo(estimateTextWidth('decode', 11) * 2, 5);
  });
});

describe('layoutChartLegend', () => {
  it('keeps a short legend on one row and reserves no extra height', () => {
    const layout = layoutChartLegend(['Input', 'Decode'], INLINE_INNER_WIDTH);
    expect(layout.rows).toBe(1);
    expect(layout.extraHeight).toBe(0);
    expect(layout.items.map((i) => i.row)).toEqual([0, 0]);
  });

  it('lays same-row items out left to right without overlapping', () => {
    const labels = ['Input', 'Decode'];
    const { items } = layoutChartLegend(labels, INLINE_INNER_WIDTH);
    expect(items[0]!.x).toBe(0);
    expect(items[1]!.x).toBe(LEGEND_TEXT_OFFSET + estimateTextWidth(labels[0]!) + LEGEND_ITEM_GAP);
    expect(items[1]!.x).toBeGreaterThanOrEqual(itemRight(labels, 0, INLINE_INNER_WIDTH));
  });

  it('wraps the eleven-series KV-cache legend instead of overprinting it', () => {
    // The regression from the inline KV-cache chart: eleven per-engine labels
    // in ~644 units used to get 58 units each and collide.
    const labels = [
      'prefill (500e)',
      'prefill (501a)',
      'prefill (501e)',
      'decode (5021)',
      'decode (5023)',
      'decode (5025)',
      'decode (5027)',
      'Chip HBM (avg n=50)',
      'DRAM',
      'CPU offload pool (avg n=50)',
      'Avg',
    ];
    const layout = layoutChartLegend(labels, INLINE_INNER_WIDTH);

    expect(layout.rows).toBeGreaterThan(1);
    expect(layout.extraHeight).toBe((layout.rows - 1) * LEGEND_ROW_HEIGHT);

    for (const [i, label] of labels.entries()) {
      const item = layout.items[i]!;
      const right = item.x + LEGEND_TEXT_OFFSET + estimateTextWidth(label);
      // Every item fits inside the plot width...
      expect(right).toBeLessThanOrEqual(INLINE_INNER_WIDTH);
      // ...and starts clear of its predecessor on the same row.
      const prev = layout.items[i - 1];
      if (prev && prev.row === item.row) {
        expect(item.x).toBeGreaterThanOrEqual(
          prev.x + LEGEND_TEXT_OFFSET + estimateTextWidth(labels[i - 1]!),
        );
      }
    }
  });

  it('starts each wrapped row back at the left edge', () => {
    const labels = Array.from({ length: 12 }, (_, i) => `series number ${i}`);
    const layout = layoutChartLegend(labels, INLINE_INNER_WIDTH);
    const firstOfRow = new Map<number, number>();
    for (const item of layout.items) {
      if (!firstOfRow.has(item.row)) firstOfRow.set(item.row, item.x);
    }
    for (const x of firstOfRow.values()) expect(x).toBe(0);
  });

  it('wraps sooner for Chinese labels, which are wider per character', () => {
    const en = Array.from({ length: 6 }, () => 'Chip HBM pool');
    const zh = Array.from({ length: 6 }, () => '芯片 HBM 显存池均值');
    expect(layoutChartLegend(zh, INLINE_INNER_WIDTH).rows).toBeGreaterThanOrEqual(
      layoutChartLegend(en, INLINE_INNER_WIDTH).rows,
    );
  });

  it('needs fewer rows at the expanded width than inline', () => {
    const labels = Array.from({ length: 11 }, (_, i) => `decode engine ${i}`);
    const inline = layoutChartLegend(labels, INLINE_INNER_WIDTH);
    const expanded = layoutChartLegend(labels, 1300 - 60 - 16);
    expect(expanded.rows).toBeLessThan(inline.rows);
  });

  it('gives a label wider than the row its own row rather than dropping it', () => {
    const layout = layoutChartLegend(['a', 'w'.repeat(300), 'b'], 100);
    expect(layout.items).toHaveLength(3);
    expect(layout.items[1]!.row).toBe(1);
    expect(layout.items[1]!.x).toBe(0);
    expect(layout.items[2]!.row).toBe(2);
  });

  it('reports a single row for an empty legend', () => {
    const layout = layoutChartLegend([], INLINE_INNER_WIDTH);
    expect(layout.items).toEqual([]);
    expect(layout.rows).toBe(1);
    expect(layout.extraHeight).toBe(0);
  });
});
