import { describe, expect, it } from 'vitest';

import type { HardwareConfig } from '@/components/inference/types';

import type { ProfitEstimatorRow } from './profit-estimator';
import {
  buildProfitSegments,
  contrastingTextColor,
  generateProfitTooltipHTML,
  estimateTextWidth,
  slantedMargins,
  splitAxisLabel,
  xLabelLayout,
  operatorMarginLabel,
  profitYDomain,
  BAR_ICON_MAX_HEIGHT,
  BAR_ICON_MIN_HEIGHT,
  barMarkHeight,
  STACK_HEADROOM_PX,
  stackHeadroomPx,
  rowLabel,
  segmentLabelLines,
} from './ProfitEstimatorChart';

function row(overrides: Partial<ProfitEstimatorRow> = {}): ProfitEstimatorRow {
  return {
    hwKey: 'h200',
    resultKey: 'h200',
    gpuHours: 6_394_160_584,
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

describe('barMarkHeight', () => {
  it('grows the vendor mark with the bar between the phone and desktop bounds', () => {
    expect(barMarkHeight(0)).toBe(BAR_ICON_MIN_HEIGHT);
    expect(barMarkHeight(40)).toBe(BAR_ICON_MIN_HEIGHT);
    expect(barMarkHeight(100)).toBeCloseTo(22, 5);
    expect(barMarkHeight(400)).toBe(BAR_ICON_MAX_HEIGHT);
    // The headroom the domain reserves follows the mark.
    expect(stackHeadroomPx(BAR_ICON_MAX_HEIGHT) - STACK_HEADROOM_PX).toBe(
      BAR_ICON_MAX_HEIGHT - BAR_ICON_MIN_HEIGHT,
    );
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

  it('sizes the headroom to the label stack in pixels once the plot height is known', () => {
    // 1000 of data in (500 - headroom) px; the headroom is then exactly STACK_HEADROOM_PX tall.
    const [, top] = profitYDomain([row()], 500);
    const pxPerUnit = 500 / top;
    expect((top - 1000) * pxPerUnit).toBeCloseTo(STACK_HEADROOM_PX, 5);
    // A taller plot needs proportionally less data-space headroom.
    expect(profitYDomain([row()], 1000)[1]).toBeLessThan(top);
    expect(top).toBeLessThan(1300);
    // A bigger vendor mark asks for more headroom at the same plot height.
    const [, roomy] = profitYDomain([row()], 500, stackHeadroomPx(BAR_ICON_MAX_HEIGHT));
    expect(roomy).toBeGreaterThan(top);
    expect((roomy - 1000) * (500 / roomy)).toBeCloseTo(stackHeadroomPx(BAR_ICON_MAX_HEIGHT), 5);
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
  const assumptions = { utilizationPct: 60, labCutPct: 30, basis: 'gw-year' } as const;

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
    expect(html).toContain('Model License Fee');
    expect(html).toContain('$90');
  });

  it('formats cents and drops the GPU-hours footer on the chip-hour basis', () => {
    const html = generateProfitTooltipHTML(
      row({ revenue: 2.16, tco: 1.73, grossMargin: 0.43, labCut: 0.648, profit: -0.218 }),
      hardwareConfig,
      { ...assumptions, basis: 'chip-hour' },
      'en',
      false,
    );
    expect(html).toContain('$2.16');
    expect(html).toContain('-$0.22');
    expect(html).not.toContain('/GPU/hr');
    const perGw = generateProfitTooltipHTML(row(), hardwareConfig, assumptions, 'en', false);
    expect(perGw).toContain('/GPU/hr');
    expect(perGw).not.toContain('GPU-hours');
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
  tco: 'Compute Expense',
  labCut: 'Model License Fee',
  profit: 'Profit',
  loss: 'Loss',
};

describe('segmentLabelLines', () => {
  it('names the segment and its amount when the rectangle is tall enough', () => {
    expect(segmentLabelLines('tco', row(), 40, SEGMENT_WORDS)).toEqual(['Compute Expense', '$400']);
    expect(segmentLabelLines('labCut', row(), 40, SEGMENT_WORDS)).toEqual([
      'Model License Fee',
      '$180',
    ]);
    expect(segmentLabelLines('profit', row(), 40, SEGMENT_WORDS)).toEqual(['Profit', '$420']);
  });

  it('drops to the amount alone, then to nothing, as the rectangle shrinks', () => {
    expect(segmentLabelLines('profit', row(), 20, SEGMENT_WORDS)).toEqual(['$420']);
    expect(
      segmentLabelLines('profit', row({ profit: 0.5 }), 40, SEGMENT_WORDS, undefined, 'chip-hour'),
    ).toEqual(['Profit', '$0.50']);
    expect(segmentLabelLines('profit', row(), 10, SEGMENT_WORDS)).toEqual([]);
  });

  it('labels a loss with the loss word and the negative amount', () => {
    const lossRow = row({ tco: 1300, grossMargin: -300, labCut: 300, profit: -600 });
    expect(segmentLabelLines('loss', lossRow, 40, SEGMENT_WORDS)).toEqual(['Loss', '-$600']);
  });

  it('drops the name, then the amount, when the bar is too narrow (phones)', () => {
    // "Compute Expense" is 15 glyphs; at 11px that is ~91px plus padding.
    expect(segmentLabelLines('tco', row(), 40, SEGMENT_WORDS, 200)).toEqual([
      'Compute Expense',
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

describe('slantedMargins', () => {
  const base = { top: 44, right: 8, bottom: 140, left: 64 };
  it('widens the left and bottom margins so a long slanted label stays inside the SVG', () => {
    const m = slantedMargins(['GB300 NVL72 (Dynamo vLLM) (FP4)'], 40, 10, base);
    expect(m.left).toBeGreaterThan(base.left);
    expect(m.bottom).toBeGreaterThan(base.bottom);
    expect(m.top).toBe(base.top);
    expect(m.right).toBe(base.right);
  });
  it('never shrinks below the base margins', () => {
    expect(slantedMargins(['B200'], 200, 10, base)).toEqual(base);
    expect(slantedMargins([], 200, 10, base)).toEqual(base);
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
