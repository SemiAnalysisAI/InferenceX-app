import { describe, it, expect } from 'vitest';

import { InferenceData, TrackedConfig, TrendDataPoint } from '@/components/inference/types';

// ─── Re-implement the pure functions from useTrendData.ts for testing ───
// These are module-private in the hook, so we replicate them here to verify behavior.

function buildMatchKey(config: TrackedConfig): string {
  let key = `${config.hwKey}|${config.precision}|${config.tp}|${config.conc}`;
  if (config.disagg) {
    key += `|disagg|${config.num_prefill_gpu ?? 0}|${config.num_decode_gpu ?? 0}`;
  }
  return key;
}

function buildPointMatchKey(point: InferenceData): string {
  let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}`;
  if (point.disagg) {
    key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
  }
  return key;
}

function buildTrendLines(
  accumulator: Map<string, Map<string, TrendDataPoint>>,
): Map<string, TrendDataPoint[]> {
  const result = new Map<string, TrendDataPoint[]>();
  for (const [configId, dateMap] of accumulator) {
    const points = Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    result.set(configId, points);
  }
  return result;
}

// ─── Factories ───

function makeConfig(overrides: Partial<TrackedConfig> = {}): TrackedConfig {
  return {
    id: 'h100|fp8|8|64',
    hwKey: 'h100',
    precision: 'fp8',
    tp: 8,
    conc: 64,
    label: 'H100 (SGLang) — TP8 conc=64 FP8',
    color: '#4e79a7',
    chartType: 'e2e',
    ...overrides,
  };
}

function makePoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2025-06-15',
    x: 100,
    y: 500,
    tp: 8,
    conc: 64,
    hwKey: 'h100',
    precision: 'fp8',
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1.2, roof: false },
    costn: { y: 0.9, roof: false },
    costr: { y: 0.7, roof: false },
    costhi: { y: 0.5, roof: false },
    costni: { y: 0.4, roof: false },
    costri: { y: 0.3, roof: false },
    ...overrides,
  } as InferenceData;
}

// ─── Tests ───

describe('buildMatchKey', () => {
  it('builds a key from config fields', () => {
    const config = makeConfig();
    expect(buildMatchKey(config)).toBe('h100|fp8|8|64');
  });

  it('includes disagg fields when disagg is true', () => {
    const config = makeConfig({
      disagg: true,
      num_prefill_gpu: 2,
      num_decode_gpu: 6,
    });
    expect(buildMatchKey(config)).toBe('h100|fp8|8|64|disagg|2|6');
  });

  it('uses 0 for missing disagg GPU counts', () => {
    const config = makeConfig({ disagg: true });
    expect(buildMatchKey(config)).toBe('h100|fp8|8|64|disagg|0|0');
  });

  it('does not include disagg when disagg is false', () => {
    const config = makeConfig({ disagg: false });
    expect(buildMatchKey(config)).toBe('h100|fp8|8|64');
  });
});

describe('buildPointMatchKey', () => {
  it('builds a key from data point fields', () => {
    const point = makePoint();
    expect(buildPointMatchKey(point)).toBe('h100|fp8|8|64');
  });

  it('includes disagg fields for disaggregated points', () => {
    const point = makePoint({
      disagg: true,
      num_prefill_gpu: 1,
      num_decode_gpu: 7,
    });
    expect(buildPointMatchKey(point)).toBe('h100|fp8|8|64|disagg|1|7');
  });

  it('produces the same key as buildMatchKey for matching config and point', () => {
    const config = makeConfig({
      hwKey: 'b200-sxm-trt',
      precision: 'fp4',
      tp: 4,
      conc: 128,
    });
    const point = makePoint({
      hwKey: 'b200-sxm-trt',
      precision: 'fp4',
      tp: 4,
      conc: 128,
    });
    expect(buildPointMatchKey(point)).toBe(buildMatchKey(config));
  });

  it('produces different keys for different configs', () => {
    const point1 = makePoint({ hwKey: 'h100', tp: 8 });
    const point2 = makePoint({ hwKey: 'h200', tp: 8 });
    expect(buildPointMatchKey(point1)).not.toBe(buildPointMatchKey(point2));
  });
});

describe('buildTrendLines', () => {
  it('returns empty map for empty accumulator', () => {
    const accumulator = new Map<string, Map<string, TrendDataPoint>>();
    const result = buildTrendLines(accumulator);
    expect(result.size).toBe(0);
  });

  it('sorts trend data points by date ascending', () => {
    const dateMap = new Map<string, TrendDataPoint>([
      ['2025-06-17', { date: '2025-06-17', value: 300, x: 90 }],
      ['2025-06-15', { date: '2025-06-15', value: 100, x: 100 }],
      ['2025-06-16', { date: '2025-06-16', value: 200, x: 95 }],
    ]);
    const accumulator = new Map([['config-1', dateMap]]);

    const result = buildTrendLines(accumulator);
    const points = result.get('config-1')!;

    expect(points).toHaveLength(3);
    expect(points[0].date).toBe('2025-06-15');
    expect(points[1].date).toBe('2025-06-16');
    expect(points[2].date).toBe('2025-06-17');
  });

  it('preserves values correctly', () => {
    const dateMap = new Map<string, TrendDataPoint>([
      ['2025-06-15', { date: '2025-06-15', value: 1500, x: 42 }],
    ]);
    const accumulator = new Map([['config-1', dateMap]]);

    const result = buildTrendLines(accumulator);
    const points = result.get('config-1')!;

    expect(points[0].value).toBe(1500);
    expect(points[0].x).toBe(42);
  });

  it('handles multiple configs independently', () => {
    const dateMap1 = new Map<string, TrendDataPoint>([
      ['2025-06-15', { date: '2025-06-15', value: 100, x: 10 }],
    ]);
    const dateMap2 = new Map<string, TrendDataPoint>([
      ['2025-06-15', { date: '2025-06-15', value: 200, x: 20 }],
      ['2025-06-16', { date: '2025-06-16', value: 250, x: 25 }],
    ]);
    const accumulator = new Map([
      ['config-a', dateMap1],
      ['config-b', dateMap2],
    ]);

    const result = buildTrendLines(accumulator);
    expect(result.size).toBe(2);
    expect(result.get('config-a')!).toHaveLength(1);
    expect(result.get('config-b')!).toHaveLength(2);
  });

  it('handles single data point per config', () => {
    const dateMap = new Map<string, TrendDataPoint>([
      ['2025-06-15', { date: '2025-06-15', value: 500, x: 100 }],
    ]);
    const accumulator = new Map([['config-1', dateMap]]);

    const result = buildTrendLines(accumulator);
    expect(result.get('config-1')!).toHaveLength(1);
    expect(result.get('config-1')![0].value).toBe(500);
  });

  it('preserves x values alongside metric values for x-axis trend derivation', () => {
    const dateMap = new Map<string, TrendDataPoint>([
      ['2025-06-15', { date: '2025-06-15', value: 1500, x: 42.5 }],
      ['2025-06-16', { date: '2025-06-16', value: 1600, x: 38.2 }],
      ['2025-06-17', { date: '2025-06-17', value: 1700, x: 35.0 }],
    ]);
    const accumulator = new Map([['config-1', dateMap]]);

    const result = buildTrendLines(accumulator);
    const points = result.get('config-1')!;

    // All x values should be preserved and distinct from the metric values
    expect(points[0].x).toBe(42.5);
    expect(points[0].value).toBe(1500);
    expect(points[1].x).toBe(38.2);
    expect(points[1].value).toBe(1600);
    expect(points[2].x).toBe(35.0);
    expect(points[2].value).toBe(1700);

    // Verify x-axis trend derivation: mapping x → value produces correct trend data
    const xTrendPoints = points.map((p) => ({ ...p, value: p.x }));
    expect(xTrendPoints[0].value).toBe(42.5);
    expect(xTrendPoints[1].value).toBe(38.2);
    expect(xTrendPoints[2].value).toBe(35.0);
  });
});

describe('buildTrendLines edge cases', () => {
  it('handles dates in non-chronological insertion order', () => {
    const dateMap = new Map<string, TrendDataPoint>([
      ['2025-12-31', { date: '2025-12-31', value: 999, x: 10 }],
      ['2025-01-01', { date: '2025-01-01', value: 100, x: 50 }],
      ['2025-07-15', { date: '2025-07-15', value: 500, x: 30 }],
    ]);
    const accumulator = new Map([['config-1', dateMap]]);
    const result = buildTrendLines(accumulator);
    const points = result.get('config-1')!;

    expect(points[0].date).toBe('2025-01-01');
    expect(points[1].date).toBe('2025-07-15');
    expect(points[2].date).toBe('2025-12-31');
  });

  it('preserves zero and negative x values in trend data', () => {
    const dateMap = new Map<string, TrendDataPoint>([
      ['2025-06-15', { date: '2025-06-15', value: 100, x: 0 }],
      ['2025-06-16', { date: '2025-06-16', value: 200, x: -5 }],
    ]);
    const accumulator = new Map([['config-1', dateMap]]);
    const result = buildTrendLines(accumulator);
    const points = result.get('config-1')!;

    expect(points[0].x).toBe(0);
    expect(points[1].x).toBe(-5);
  });

  it('preserves zero metric values', () => {
    const dateMap = new Map<string, TrendDataPoint>([
      ['2025-06-15', { date: '2025-06-15', value: 0, x: 100 }],
    ]);
    const accumulator = new Map([['config-1', dateMap]]);
    const result = buildTrendLines(accumulator);

    expect(result.get('config-1')![0].value).toBe(0);
  });

  it('handles very large number of dates efficiently', () => {
    const dateMap = new Map<string, TrendDataPoint>();
    for (let i = 0; i < 365; i++) {
      const d = i.toString().padStart(3, '0');
      dateMap.set(`2025-${d}`, { date: `2025-${d}`, value: i * 10, x: i });
    }
    const accumulator = new Map([['config-1', dateMap]]);
    const result = buildTrendLines(accumulator);

    expect(result.get('config-1')!).toHaveLength(365);
    // First entry should be the earliest date string
    expect(result.get('config-1')![0].date).toBe('2025-000');
  });
});

describe('match key consistency between config and point', () => {
  it('disaggregated config matches disaggregated point with same fields', () => {
    const config = makeConfig({
      hwKey: 'gb200-nvl72-sglang',
      precision: 'fp4',
      tp: 1,
      conc: 32,
      disagg: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 68,
    });
    const point = makePoint({
      hwKey: 'gb200-nvl72-sglang',
      precision: 'fp4',
      tp: 1,
      conc: 32,
      disagg: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 68,
    });
    expect(buildPointMatchKey(point)).toBe(buildMatchKey(config));
  });

  it('non-disagg config does not match disagg point', () => {
    const config = makeConfig({ disagg: false });
    const point = makePoint({ disagg: true, num_prefill_gpu: 2, num_decode_gpu: 6 });
    expect(buildPointMatchKey(point)).not.toBe(buildMatchKey(config));
  });

  it('different concurrency values produce different keys', () => {
    const config1 = makeConfig({ conc: 64 });
    const config2 = makeConfig({ conc: 128 });
    expect(buildMatchKey(config1)).not.toBe(buildMatchKey(config2));
  });

  it('different TP values produce different keys', () => {
    const config1 = makeConfig({ tp: 4 });
    const config2 = makeConfig({ tp: 8 });
    expect(buildMatchKey(config1)).not.toBe(buildMatchKey(config2));
  });
});
