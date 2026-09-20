import { describe, expect, it } from 'vitest';
import { formatMetric, metricLabel, metricValue, type VideoPoint } from './metrics';

// H200 and H100 C1 cells from the retained 2026-09-09 serving-smoke artifacts.
const h200: VideoPoint = {
  id: '34342452354.10107476604:c1',
  runId: '34342452354',
  artifactId: 10107476604,
  cell: 'c1',
  hardwareKey: 'h200',
  hardwareName: 'NVIDIA H200',
  runtime: '71de97b264b04dcd514cf904003028aefe9775c8',
  model: 'MiniMaxAI/MiniMax-H3',
  workload: '1344 × 768 · 8 s · 24 fps · 50 steps · MiniMaxAI/MiniMax-H3 @ 42ed227ee7df',
  concurrency: 1,
  participating: 4,
  allocated: 4,
  replicas: null,
  valid: 20,
  completed: 20,
  scheduled: 20,
  failed: 0,
  samples: 20,
  p50: 150.61379817902343,
  p90: 151.10486977093387,
  wallSeconds: 3013.44202613004,
  durationSeconds: 8,
  frameCount: 192,
  energyKj: 410.954300515549,
  avgPowerW: 2727.484797810607,
  enforcedLimitW: 2800,
  server: { tp: 2, ulysses: 2, attention: 'auto' },
  status: 'complete',
  observedAt: '2026-09-09T10:00:00Z',
};
const h100: VideoPoint = {
  ...h200,
  id: 'x',
  hardwareKey: 'h100',
  hardwareName: 'NVIDIA H100 80GB HBM3',
  p50: 167.33339739358053,
  p90: 168.11354550393298,
  wallSeconds: 3349.37367718108,
  allocated: 8,
  energyKj: 431.14963489170344,
  avgPowerW: 2574.550733165641,
};
const opts = { tier: 'h', basis: 'participating' } as const;
// H3 768p list price captured 2026-09-19 (api-reference.ts), USD per video-second.
const priced = { ...opts, apiPricePerVideoSecond: 0.034 };

describe('video metrics', () => {
  it('derives throughput per GPU-hour from valid clips, wall time and participating GPUs', () => {
    expect(metricValue(h200, 'videosPerGpuHour', opts)).toBeCloseTo(5.9732, 3);
    expect(metricValue(h200, 'videoSecondsPerGpuHour', opts)).toBeCloseTo(47.786, 2);
  });
  it('switches the denominator to allocated GPUs on request', () => {
    expect(metricValue(h100, 'videosPerGpuHour', opts)).toBeCloseTo(5.3741, 3);
    expect(metricValue(h100, 'videosPerGpuHour', { ...opts, basis: 'allocated' })).toBeCloseTo(
      2.687,
      3,
    );
  });
  it('prices videos with HW_REGISTRY tiers', () => {
    expect(metricValue(h200, 'videosPerDollar', opts)).toBeCloseTo(4.896, 2);
    expect(metricValue(h200, 'dollarsPerVideo', opts)).toBeCloseTo(0.2042, 3);
    expect(metricValue(h200, 'dollarsPerVideo', { ...opts, tier: 'r' })).toBeCloseTo(0.4855, 3);
    expect(metricValue(h200, 'dollarsPerVideoSecond', opts)).toBeCloseTo(0.02553, 4);
    expect(metricValue(h100, 'dollarsPerVideo', { ...opts, basis: 'allocated' })).toBeCloseTo(
      0.4354,
      3,
    );
  });
  it('exposes latency, generation speed, energy and power ratios', () => {
    expect(metricValue(h200, 'p90Latency', opts)).toBeCloseTo(151.105, 3);
    expect(metricValue(h200, 'p50Latency', opts)).toBeCloseTo(150.614, 3);
    expect(metricValue(h200, 'genSpeed', opts)).toBeCloseTo(192 / 150.61379817902343, 6);
    expect(metricValue(h200, 'kjPerVideo', opts)).toBeCloseTo(410.954, 2);
    expect(metricValue(h200, 'videosPerKwh', opts)).toBeCloseTo(8.76, 2);
    expect(metricValue(h200, 'powerPctCap', opts)).toBeCloseTo(97.41, 1);
  });
  it('prices the clip at the API reference and derives revenue, profit and headroom', () => {
    // 0.034 $/s × 8 s clip; 5.9732 videos/GPU-hr × $0.272; − $1.22 H200 hyperscaler GPU-hr.
    expect(metricValue(h200, 'apiPricePerVideo', priced)).toBeCloseTo(0.272, 6);
    expect(metricValue(h200, 'revenuePerGpuHour', priced)).toBeCloseTo(1.6247, 3);
    expect(metricValue(h200, 'profitPerGpuHour', priced)).toBeCloseTo(0.4047, 3);
    // $0.272 API ÷ $0.2042 TCO per video.
    expect(metricValue(h200, 'apiPriceMultiple', priced)).toBeCloseTo(1.332, 3);
    // Rental tier: same revenue, $2.90 GPU-hr → loss; headroom drops below 1.
    expect(metricValue(h200, 'profitPerGpuHour', { ...priced, tier: 'r' })).toBeCloseTo(-1.2753, 3);
    expect(metricValue(h200, 'apiPriceMultiple', { ...priced, tier: 'r' })).toBeCloseTo(0.5603, 3);
  });
  it('halves revenue on the allocated basis when only half the reserved GPUs generate', () => {
    // H100: 4 of 8 allocated boards participate → 2.687 videos/GPU-hr × $0.272 − $1.17.
    expect(metricValue(h100, 'revenuePerGpuHour', priced)).toBeCloseTo(1.4618, 3);
    expect(metricValue(h100, 'profitPerGpuHour', priced)).toBeCloseTo(0.2918, 3);
    const allocated = { ...priced, basis: 'allocated' } as const;
    expect(metricValue(h100, 'revenuePerGpuHour', allocated)).toBeCloseTo(0.7309, 3);
    expect(metricValue(h100, 'profitPerGpuHour', allocated)).toBeCloseTo(-0.4391, 3);
    // The clip price itself does not depend on the GPU basis.
    expect(metricValue(h100, 'apiPricePerVideo', allocated)).toBeCloseTo(0.272, 6);
    expect(metricValue(h100, 'apiPriceMultiple', allocated)).toBeCloseTo(0.6247, 3);
  });
  it('returns null for every API-priced metric without a positive price or clip length', () => {
    const ids = [
      'apiPricePerVideo',
      'revenuePerGpuHour',
      'profitPerGpuHour',
      'apiPriceMultiple',
    ] as const;
    for (const id of ids) {
      expect(metricValue(h200, id, opts)).toBeNull();
      expect(metricValue(h200, id, { ...opts, apiPricePerVideoSecond: null })).toBeNull();
      expect(metricValue(h200, id, { ...opts, apiPricePerVideoSecond: 0 })).toBeNull();
      expect(metricValue(h200, id, { ...opts, apiPricePerVideoSecond: -0.01 })).toBeNull();
      expect(metricValue(h200, id, { ...opts, apiPricePerVideoSecond: Number.NaN })).toBeNull();
      expect(metricValue({ ...h200, durationSeconds: null }, id, priced)).toBeNull();
    }
    // A price alone is not enough: revenue, profit and headroom still need throughput and a tier cost.
    expect(metricValue({ ...h200, wallSeconds: null }, 'revenuePerGpuHour', priced)).toBeNull();
    expect(metricValue({ ...h200, hardwareKey: null }, 'profitPerGpuHour', priced)).toBeNull();
    expect(metricValue({ ...h200, hardwareKey: null }, 'apiPriceMultiple', priced)).toBeNull();
    expect(metricValue({ ...h200, wallSeconds: null }, 'apiPricePerVideo', priced)).toBeCloseTo(
      0.272,
      6,
    );
  });
  it('returns null instead of zero for missing inputs', () => {
    const broken: VideoPoint = {
      ...h200,
      hardwareKey: null,
      energyKj: null,
      valid: 0,
      wallSeconds: null,
      enforcedLimitW: null,
    };
    expect(metricValue(broken, 'videosPerDollar', opts)).toBeNull();
    expect(metricValue(broken, 'videosPerGpuHour', opts)).toBeNull();
    expect(metricValue(broken, 'kjPerVideo', opts)).toBeNull();
    expect(metricValue(broken, 'videosPerKwh', opts)).toBeNull();
    expect(metricValue(broken, 'powerPctCap', opts)).toBeNull();
    expect(metricValue({ ...h200, samples: 9 }, 'p90Latency', opts)).toBeNull();
    expect(metricValue({ ...h200, participating: null }, 'videosPerGpuHour', opts)).toBeNull();
  });
  it('labels tiered metrics with the cost tier and formats by metric', () => {
    expect(metricLabel('videosPerDollar', 'en', opts)).toBe(
      'Videos per $1 TCO (Owning at Large Hyperscaler Volume)',
    );
    expect(metricLabel('videosPerDollar', 'zh', { ...opts, tier: 'r' })).toBe(
      '每 1 美元 TCO 生成视频数（租赁 - 3 年承诺）',
    );
    expect(metricLabel('p90Latency', 'en', opts)).toBe('P90 time to video (s)');
    expect(formatMetric(0.20419, 'dollarsPerVideo')).toBe('$0.204');
    expect(formatMetric(null, 'kjPerVideo')).toBe('—');
    expect(formatMetric(151.10486, 'p90Latency')).toBe('151.1');
    expect(formatMetric(1234.5, 'videoSecondsPerGpuHour')).toBe('1,234.5');
  });
  it('labels and formats the API-priced metrics, with the sign before the currency symbol', () => {
    expect(metricLabel('profitPerGpuHour', 'en', opts)).toBe(
      'Profit per GPU-hour, API list price − TCO (Owning at Large Hyperscaler Volume)',
    );
    expect(metricLabel('apiPriceMultiple', 'zh', { ...opts, tier: 'r' })).toBe(
      'API 标价 ÷ 每条视频 TCO 成本（租赁 - 3 年承诺）',
    );
    expect(metricLabel('revenuePerGpuHour', 'en', opts)).toBe(
      'Revenue per GPU-hour at API list price',
    );
    expect(metricLabel('apiPricePerVideo', 'zh', opts)).toBe('每条视频 API 标价');
    expect(formatMetric(0.272, 'apiPricePerVideo')).toBe('$0.272');
    expect(formatMetric(1.62471, 'revenuePerGpuHour')).toBe('$1.62');
    expect(formatMetric(-0.43913, 'profitPerGpuHour')).toBe('-$0.44');
    expect(formatMetric(1.3318, 'apiPriceMultiple')).toBe('1.33');
    expect(formatMetric(-1.5, 'p50Latency')).toBe('-1.5');
  });
});
