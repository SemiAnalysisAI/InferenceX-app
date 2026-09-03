import { describe, expect, it } from 'vitest';

import type { HardwareConfig } from '@/components/inference/types';

import type { ProfitEstimatorRow } from './profit-estimator';
import {
  buildProfitSegments,
  generateProfitTooltipHTML,
  profitYDomain,
  rowLabel,
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
  it('stacks TCO, lab cut, and profit from zero upward for a profitable SKU', () => {
    const segments = buildProfitSegments([row()]);
    expect(segments.map((s) => s.kind)).toEqual(['tco', 'labCut', 'profit']);
    expect(segments[0]).toMatchObject({ y0: 0, y1: 400 });
    expect(segments[1]).toMatchObject({ y0: 400, y1: 580 });
    expect(segments[2]).toMatchObject({ y0: 580, y1: 1000 });
    expect(segments[2].y1).toBeCloseTo(1000);
  });

  it('draws a loss below zero and omits the lab cut when margin is negative', () => {
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

  it('lists revenue, TCO, lab cut, and profit with the configured percentages', () => {
    const html = generateProfitTooltipHTML(row(), hardwareConfig, assumptions, 'en', false);
    expect(html).toContain('$1.0k');
    expect(html).toContain('$400');
    expect(html).toContain('30%');
    expect(html).toContain('60%');
    expect(html).toContain('Operator profit');
  });

  it('labels a negative result as a loss and drops the lab cut line', () => {
    const html = generateProfitTooltipHTML(
      row({ revenue: 300, tco: 400, grossMargin: -100, labCut: 0, profit: -100 }),
      hardwareConfig,
      assumptions,
      'en',
      false,
    );
    expect(html).toContain('Operator loss');
    expect(html).toContain('-$100');
    expect(html).not.toContain('Model lab cut');
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
