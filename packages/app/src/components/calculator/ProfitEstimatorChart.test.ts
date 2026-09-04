import { describe, expect, it } from 'vitest';

import type { HardwareConfig } from '@/components/inference/types';

import type { ProfitEstimatorRow } from './profit-estimator';
import {
  buildProfitSegments,
  contrastingTextColor,
  generateProfitTooltipHTML,
  estimateTextWidth,
  splitAxisLabel,
  xLabelLayout,
  operatorMarginLabel,
  profitYDomain,
  rowLabel,
  segmentLabelLines,
} from './ProfitEstimatorChart';

function row(overrides: Partial<ProfitEstimatorRow> = {}): ProfitEstimatorRow {
  return {
    hwKey: 'h200',
    resultKey: 'h200',
    gpuHoursPerGwYear: 6_394_160_584,
    revenuePerGpuHour: 3,
    revenue: 1000,
    tco: 400,
    grossMargin: 600,
    labCut: 180,
    profit: 420,
    ...overrides,
  };
}

const hardwareConfig = {
  h200: { name: 'NVIDIA H200', label: 'H200', gpu: 'H200', framework: 'vllm' },
  'evil-chip': { name: 'Evil', label: '<img>', gpu: 'Evil', framework: 'vllm' },
} as unknown as HardwareConfig;

describe('buildProfitSegments', () => {
  it('stacks TCO, license fee, and profit from zero upward for a profitable SKU', () => {
    const segments = buildProfitSegments([row()]);
    expect(segments.map((s) => s.kind)).toEqual(['tco', 'labCut', 'profit']);
    expect(segments[0]).toMatchObject({ y0: 0, y1: 400 });
    expect(segments[1]).toMatchObject({ y0: 400, y1: 580 });
    expect(segments[2]).toMatchObject({ y0: 580, y1: 1000 });
    expect(segments[2].y1).toBeCloseTo(1000);
  });

  it('draws a loss below zero and omits the license fee when margin is negative', () => {
    const segments = buildProfitSegments([
      row({ revenue: 300, tco: 400, grossMargin: -100, labCut: 0, profit: -100 }),
    ]);
    expect(segments.map((s) => s.kind)).toEqual(['tco', 'loss']);
    expect(segments[1]).toMatchObject({ y0: -100, y1: 0 });
  });

  it('keys segments by result key so repeated SKUs with different precisions stay distinct', () => {
    const segments = buildProfitSegments([
      row({ resultKey: 'h200_fp8', precision: 'fp8' }),
      row({ resultKey: 'h200_fp4', precision: 'fp4' }),
    ]);
    const keys = new Set(segments.map((s) => s.key));
    expect(keys.size).toBe(segments.length);
    expect(keys.has('h200_fp8|tco')).toBe(true);
    expect(keys.has('h200_fp4|profit')).toBe(true);
  });
});

describe('profitYDomain', () => {
  it('falls back to a unit domain with no rows', () => {
    expect(profitYDomain([])).toEqual([0, 1]);
  });

  it('always includes zero and leaves headroom above the tallest bar', () => {
    const [bottom, top] = profitYDomain([row()]);
    expect(bottom).toBe(0);
    expect(top).toBeGreaterThan(1000);
  });

  it('extends below zero when any SKU loses money, and covers TCO when it exceeds revenue', () => {
    const [bottom, top] = profitYDomain([
      row({ revenue: 300, tco: 400, grossMargin: -100, labCut: 0, profit: -100 }),
    ]);
    expect(bottom).toBeLessThan(-100);
    expect(top).toBeGreaterThan(400);
  });

  it('covers the TCO plus license-fee stack of a loss bar, not just revenue or TCO', () => {
    const [bottom, top] = profitYDomain([
      row({ revenue: 300, tco: 400, grossMargin: -100, labCut: 90, profit: -190 }),
    ]);
    expect(bottom).toBeLessThan(-190);
    expect(top).toBeGreaterThan(490);
  });
});

describe('rowLabel', () => {
  it('uses the hardware display label and appends precision in upper case', () => {
    expect(rowLabel(row({ precision: 'fp8' }), hardwareConfig)).toBe('H200 (FP8)');
    expect(rowLabel(row(), hardwareConfig)).toBe('H200');
  });

  it('falls back to the registry entry when the chart config lacks the key', () => {
    expect(rowLabel(row(), {} as HardwareConfig)).toBe('H200');
  });
});

describe('generateProfitTooltipHTML', () => {
  const assumptions = { utilizationPct: 60, labCutPct: 30 };

  it('lists revenue, TCO, license fee, and profit with the configured percentages', () => {
    const html = generateProfitTooltipHTML(row(), hardwareConfig, assumptions, 'en', false);
    expect(html).toContain('$1.0k');
    expect(html).toContain('$400');
    expect(html).toContain('30%');
    expect(html).toContain('60%');
    expect(html).toContain('Profit');
  });

  it('labels a negative result as a loss and still lists the license fee, which is a share of revenue', () => {
    const html = generateProfitTooltipHTML(
      row({ revenue: 300, tco: 400, grossMargin: -100, labCut: 90, profit: -190 }),
      hardwareConfig,
      assumptions,
      'en',
      false,
    );
    expect(html).toContain('Loss');
    expect(html).toContain('-$190');
    expect(html).toContain('Model license fee');
    expect(html).toContain('$90');
  });

  it('renders Chinese copy and the pin hint when requested', () => {
    const pinned = generateProfitTooltipHTML(row(), hardwareConfig, assumptions, 'zh', true);
    const hover = generateProfitTooltipHTML(row(), hardwareConfig, assumptions, 'zh', false);
    expect(pinned).toContain('利润');
    expect(pinned).not.toBe(hover);
  });

  it('escapes HTML in the hardware label', () => {
    const html = generateProfitTooltipHTML(
      row({ hwKey: 'evil-chip', resultKey: 'evil-chip' }),
      hardwareConfig,
      assumptions,
      'en',
      false,
    );
    expect(html).not.toContain('<img>');
    expect(html).toContain('&lt;img&gt;');
  });
});

const SEGMENT_WORDS = {
  tco: 'Compute expense',
  labCut: 'Model license fee',
  profit: 'Profit',
  loss: 'Loss',
};

describe('segmentLabelLines', () => {
  it('names the segment and its amount when the rectangle is tall enough', () => {
    expect(segmentLabelLines('tco', row(), 40, SEGMENT_WORDS)).toEqual(['Compute expense', '$400']);
    expect(segmentLabelLines('labCut', row(), 40, SEGMENT_WORDS)).toEqual([
      'Model license fee',
      '$180',
    ]);
    expect(segmentLabelLines('profit', row(), 40, SEGMENT_WORDS)).toEqual(['Profit', '$420']);
  });

  it('drops to the amount alone, then to nothing, as the rectangle shrinks', () => {
    expect(segmentLabelLines('profit', row(), 20, SEGMENT_WORDS)).toEqual(['$420']);
    expect(segmentLabelLines('profit', row(), 10, SEGMENT_WORDS)).toEqual([]);
  });

  it('labels a loss with the loss word and the negative amount', () => {
    const lossRow = row({ tco: 1300, grossMargin: -300, labCut: 300, profit: -600 });
    expect(segmentLabelLines('loss', lossRow, 40, SEGMENT_WORDS)).toEqual(['Loss', '-$600']);
  });

  it('drops the name, then the amount, when the bar is too narrow (phones)', () => {
    // "Compute expense" is 15 glyphs; at 11px that is ~91px plus padding.
    expect(segmentLabelLines('tco', row(), 40, SEGMENT_WORDS, 200)).toEqual([
      'Compute expense',
      '$400',
    ]);
    expect(segmentLabelLines('tco', row(), 40, SEGMENT_WORDS, 60)).toEqual(['$400']);
    expect(segmentLabelLines('tco', row(), 40, SEGMENT_WORDS, 20)).toEqual([]);
  });
});

describe('splitAxisLabel', () => {
  it('puts the SKU name on the first line and the parenthesised detail on the second', () => {
    expect(splitAxisLabel('GB300 NVL72 (Dynamo vLLM) (FP4)')).toEqual([
      'GB300 NVL72',
      '(Dynamo vLLM) (FP4)',
    ]);
    expect(splitAxisLabel('B200')).toEqual(['B200', '']);
  });
});

describe('xLabelLayout', () => {
  const labels = ['GB300 NVL72 (Dynamo vLLM) (FP4)', 'B200 (SGLang) (FP4)'];
  it('stands labels upright on two lines when every slot has room', () => {
    expect(xLabelLayout(labels, 200, 10)).toBe('stacked');
  });
  it('falls back to the slanted single line on narrow slots or with no data', () => {
    expect(xLabelLayout(labels, 80, 10)).toBe('slanted');
    expect(xLabelLayout([], 200, 10)).toBe('slanted');
    expect(xLabelLayout(labels, 0, 10)).toBe('slanted');
  });
});

describe('estimateTextWidth', () => {
  it('scales with glyph count and font size', () => {
    expect(estimateTextWidth('abcd', 10)).toBeCloseTo(22);
    expect(estimateTextWidth('', 10)).toBe(0);
  });
});

describe('contrastingTextColor', () => {
  it('puts dark text on light fills and light text on dark fills', () => {
    expect(contrastingTextColor('#ffffff')).toBe('#111111');
    expect(contrastingTextColor('#f2c94c')).toBe('#111111');
    expect(contrastingTextColor('#000000')).toBe('#ffffff');
    expect(contrastingTextColor('#1f4e79')).toBe('#ffffff');
  });

  it('falls back to white when the fill cannot be parsed', () => {
    expect(contrastingTextColor('var(--primary)')).toBe('#ffffff');
  });
});

describe('operatorMarginLabel', () => {
  it('formats profit as a share of revenue with the caller-supplied word', () => {
    expect(operatorMarginLabel(row(), 'margin')).toBe('42.0% margin');
    expect(operatorMarginLabel(row({ profit: -600 }), '利润率')).toBe('-60.0% 利润率');
  });

  it('returns nothing when there is no revenue to divide by', () => {
    expect(operatorMarginLabel(row({ revenue: 0 }), 'margin')).toBe('');
  });

  it('keeps only the percentage when the bar is too narrow for the word', () => {
    expect(operatorMarginLabel(row(), 'margin', 40)).toBe('42.0%');
    expect(operatorMarginLabel(row(), 'margin', 200)).toBe('42.0% margin');
  });
});
