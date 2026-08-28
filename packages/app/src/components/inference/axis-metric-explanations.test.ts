import { describe, expect, it } from 'vitest';

import {
  METRIC_EXPLANATIONS,
  metricRowLabel,
  resolveXAxisKind,
  X_AXIS_EXPLANATIONS,
  X_AXIS_KINDS,
  xAxisPercentileFromLabel,
} from './axis-metric-explanations';
import { METRIC_REGISTRY, type MetricKey } from './metric-registry';

const CJK = /[\u4E00-\u9FFF]/u;
const metricKeys = Object.keys(METRIC_REGISTRY) as MetricKey[];

describe('METRIC_EXPLANATIONS completeness', () => {
  it('covers every METRIC_REGISTRY key and nothing else', () => {
    expect(Object.keys(METRIC_EXPLANATIONS).sort()).toEqual([...metricKeys].sort());
  });

  it.each(metricKeys)('%s has non-empty bilingual description and formula', (key) => {
    const entry = METRIC_EXPLANATIONS[key];
    expect(entry.description.en.length).toBeGreaterThan(20);
    expect(entry.description.zh.length).toBeGreaterThan(10);
    expect(entry.formula.en.length).toBeGreaterThan(5);
    expect(entry.formula.zh.length).toBeGreaterThan(5);
    // Chinese strings must actually be Chinese, not copied English.
    expect(entry.description.zh).toMatch(CJK);
    expect(entry.formula.zh).toMatch(CJK);
    expect(entry.description.en).not.toMatch(CJK);
    // Formulas are structural: they must show a computation, not a number soup.
    expect(entry.formula.en).toMatch(/[÷×=]/u);
  });

  it('per-MW metrics describe the per-MW normalization', () => {
    for (const key of ['tpPerMw', 'inputTputPerMw', 'outputTputPerMw', 'powerUser'] as const) {
      expect(METRIC_EXPLANATIONS[key].formula.en).toContain('all-in utility MW');
    }
  });

  it('cost metrics show the $/Mtok formula', () => {
    for (const key of [
      'costh',
      'costn',
      'costr',
      'costhOutput',
      'costnOutput',
      'costrOutput',
      'costhi',
      'costni',
      'costri',
      'costUser',
    ] as const) {
      expect(METRIC_EXPLANATIONS[key].formula.en).toContain('$/Mtok =');
    }
  });

  it('states both available sale-price sources behind token revenue', () => {
    const explanation = METRIC_EXPLANATIONS.tokenRevenuePerGpuHour;
    expect(explanation.description.en).toContain('$1 per million');
    expect(explanation.description.en).toContain('OpenRouter');
    expect(explanation.description.zh).toContain('每百万 1 美元');
    expect(explanation.description.zh).toContain('OpenRouter');
    expect(explanation.description.en).toContain(
      'Agentic cache hit combines GPU and external cache',
    );
    expect(explanation.description.en).toContain('partially measured cache frontier');
    expect(explanation.description.zh).toContain('缓存命中率由 GPU 与 external cache 相加');
    expect(explanation.description.zh).toContain('缓存指标仅覆盖部分 frontier 数据点');
    expect(explanation.description.en).not.toContain('—');
    expect(explanation.description.zh).not.toContain('—');
    expect(explanation.formula.en).toContain('$/GPU/hr =');
  });
});

describe('X_AXIS_EXPLANATIONS', () => {
  it('covers every x-axis kind', () => {
    expect(Object.keys(X_AXIS_EXPLANATIONS).sort()).toEqual([...X_AXIS_KINDS].sort());
  });

  it.each(X_AXIS_KINDS)('%s has bilingual name and description', (kind) => {
    const entry = X_AXIS_EXPLANATIONS[kind];
    expect(entry.name.en(null).length).toBeGreaterThan(3);
    expect(entry.name.zh(null)).toMatch(CJK);
    expect(entry.description.en.length).toBeGreaterThan(20);
    expect(entry.description.zh).toMatch(CJK);
  });

  it('renders percentile prefixes in row names', () => {
    expect(X_AXIS_EXPLANATIONS.ttft.name.en('P90')).toBe('P90 Time To First Token (s)');
    expect(X_AXIS_EXPLANATIONS.ttft.name.en(null)).toBe('Time To First Token (s)');
    expect(X_AXIS_EXPLANATIONS.ttft.name.zh('Median')).toContain('中位');
    expect(X_AXIS_EXPLANATIONS.e2eNormalizedInteractivity.name.zh('P90')).toContain('P90 ');
  });
});

describe('resolveXAxisKind', () => {
  const base = {
    xAxisField: 'intvty',
    isDerivedNormalizedInteractivity: false,
  };

  it('interactivity chart plots interactivity by default', () => {
    expect(resolveXAxisKind('interactivity', base)).toBe('interactivity');
  });

  it('interactivity chart plots TTFT when the resolved field is a TTFT column', () => {
    expect(resolveXAxisKind('interactivity', { ...base, xAxisField: 'p90_ttft' })).toBe('ttft');
    expect(resolveXAxisKind('interactivity', { ...base, xAxisField: 'median_ttft' })).toBe('ttft');
  });

  it('interactivity chart keeps interactivity for input metrics without a TTFT override', () => {
    // Input metric with no `*_x` config override: `resolveXAxisField` falls
    // back to the chart's natural x, so the footer must say interactivity.
    expect(resolveXAxisKind('interactivity', { ...base, xAxisField: 'p90_intvty' })).toBe(
      'interactivity',
    );
  });

  it('e2e chart plots end-to-end latency by default', () => {
    expect(resolveXAxisKind('e2e', { ...base, xAxisField: 'e2el' })).toBe('e2eLatency');
  });

  it('e2e chart plots TTFT under the ttft x-axis mode', () => {
    expect(resolveXAxisKind('e2e', { ...base, xAxisField: 'p99_ttft' })).toBe('ttft');
  });

  it('e2e chart plots normalized interactivity under the derived agentic mode', () => {
    expect(
      resolveXAxisKind('e2e', {
        xAxisField: 'p90_ttft',
        isDerivedNormalizedInteractivity: true,
      }),
    ).toBe('e2eNormalizedInteractivity');
  });
});

describe('xAxisPercentileFromLabel', () => {
  it('extracts percentile words', () => {
    expect(xAxisPercentileFromLabel('P90 Time To First Token (s)')).toBe('P90');
    expect(xAxisPercentileFromLabel('Median Time To First Token (s)')).toBe('Median');
    expect(xAxisPercentileFromLabel('P75 E2E Normalized Interactivity (tok/s/user)')).toBe('P75');
    expect(xAxisPercentileFromLabel('P99.9 End-to-end Latency (s)')).toBe('P99.9');
  });

  it('returns null when there is no percentile prefix', () => {
    expect(xAxisPercentileFromLabel('Interactivity (tok/s/user)')).toBeNull();
    expect(xAxisPercentileFromLabel('End-to-end Latency (s)')).toBeNull();
  });
});

describe('metricRowLabel', () => {
  it('resolves locale-aware titles from the registry', () => {
    expect(metricRowLabel('tpPerGpu', 'en')).toBe('Token Throughput per Chip');
    expect(metricRowLabel('tpPerGpu', 'zh')).toBe('每芯片 token 吞吐量');
    expect(metricRowLabel('tokenRevenuePerGpuHour', 'en')).toBe('Token Revenue per GPU Hour');
  });
});
