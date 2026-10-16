import { describe, expect, it } from 'vitest';

import { buildChartSummary } from './chart-summary';

const series = [
  {
    name: 'B200 FP4 (Dynamo SGLang)',
    points: [
      { x: 50, y: 98_000_000 },
      { x: 150, y: 5_000_000 },
    ],
  },
  {
    name: 'Vera Rubin NVL72 FP4 (Dynamo TRTLLM)',
    points: [
      { x: 60, y: 285_000_000 },
      { x: 120, y: 195_000_000 },
      { x: 310, y: 1_000_000 },
    ],
  },
];

describe('buildChartSummary', () => {
  const summary = buildChartSummary({
    locale: 'en',
    xLabel: 'Interactivity (tok/s/user)',
    yLabel: 'Total Tokens per $1 TCO',
    series,
  });

  it('names what the chart plots', () => {
    expect(summary.label).toBe('Total Tokens per $1 TCO versus Interactivity (tok/s/user)');
  });

  it('states the chart type, each axis and its value range', () => {
    expect(summary.description).toContain('Line chart with 2 configurations');
    expect(summary.description).toContain(
      'X axis: Interactivity (tok/s/user), values from 50 to 310.',
    );
    expect(summary.description).toContain(
      'Y axis: Total Tokens per $1 TCO, values from 1,000,000 to 285,000,000.',
    );
  });

  it('lists each configuration by name, highest first, with full numbers', () => {
    const vr = summary.description.indexOf('Vera Rubin NVL72 FP4 (Dynamo TRTLLM): 3 points');
    const b200 = summary.description.indexOf('B200 FP4 (Dynamo SGLang): 2 points');
    expect(vr).toBeGreaterThan(-1);
    expect(b200).toBeGreaterThan(vr);
    expect(summary.description).toContain('highest Y value 285,000,000 at X value 60');
    // No compact abbreviations and no colour words.
    expect(summary.description).not.toMatch(/\d[KMB]\b/);
    expect(summary.description).not.toMatch(/green|red|blue|colou?r/i);
  });

  it('says when nothing is selected and skips empty series', () => {
    expect(
      buildChartSummary({ locale: 'en', xLabel: 'X', yLabel: 'Y', series: [] }).description,
    ).toBe('Line chart with no configurations selected.');
    const one = buildChartSummary({
      locale: 'en',
      xLabel: 'X',
      yLabel: 'Y',
      series: [{ name: 'Empty', points: [{ x: Number.NaN, y: 1 }] }, series[0]],
    });
    expect(one.description).toContain('Line chart with 1 configuration,');
    expect(one.description).not.toContain('Empty');
  });

  it('localises to Chinese', () => {
    const zh = buildChartSummary({
      locale: 'zh',
      xLabel: '交互性',
      yLabel: '每美元 Token',
      series,
    });
    expect(zh.label).toBe('每美元 Token 与 交互性');
    expect(zh.description).toContain('折线图，共 2 个配置');
    expect(zh.description).toContain('Y 轴最高值 285,000,000');
  });
});
