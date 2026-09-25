import { describe, expect, it } from 'vitest';
import {
  formatMetric,
  metricLabel,
  metricValue,
  VIDEO_METRICS,
  X_METRICS,
  Y_METRICS,
  type MetricId,
  type MetricOptions,
  type VideoPoint,
} from './metrics';

// H200, H100 and B200 C1 cells from the retained 2026-09-09 serving-smoke artifacts
// (cypress/fixtures/api/video-history.json).
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
// H100 and B200 reserved eight boards and generated on four.
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
const b200: VideoPoint = {
  ...h200,
  id: 'y',
  hardwareKey: 'b200',
  hardwareName: 'NVIDIA B200',
  p50: 77.94495720259147,
  p90: 78.31597462110221,
  wallSeconds: 1561.6792716470081,
  allocated: 8,
  energyKj: 301.08754501100987,
  avgPowerW: 3856.016973742528,
  enforcedLimitW: 4000,
};
const opts: MetricOptions = { tier: 'h' };
// H3 768p list price captured 2026-09-19 (api-reference.ts), USD per video-second.
const priced: MetricOptions = { ...opts, apiPricePerVideoSecond: 0.034 };

describe('video metrics', () => {
  it('registers the two axis groups plus the two card-only metrics', () => {
    expect([...X_METRICS]).toEqual(['p90Latency', 'p50Latency']);
    expect([...Y_METRICS]).toEqual([
      'videosPerDollar',
      'dollarsPerVideo',
      'videosPerGpuHour',
      'kjPerVideo',
    ]);
    expect(Object.keys(VIDEO_METRICS).toSorted()).toEqual(
      [...X_METRICS, ...Y_METRICS, 'powerPctCap', 'apiPricePerVideo'].toSorted(),
    );
  });
  it('derives throughput per GPU-hour from valid clips, wall time and participating GPUs', () => {
    // 20 clips × 3600 s / (wall s × 4 boards).
    expect(metricValue(h200, 'videosPerGpuHour', opts)).toBeCloseTo(5.9732, 3);
    expect(metricValue(h100, 'videosPerGpuHour', opts)).toBeCloseTo(5.3741, 3);
    expect(metricValue(b200, 'videosPerGpuHour', opts)).toBeCloseTo(11.526, 3);
  });
  it('divides by the participating boards, never the allocation', () => {
    // The idle half of an 8-board reservation is stated beside the numbers, not billed.
    expect(metricValue({ ...h100, allocated: 4 }, 'videosPerGpuHour', opts)).toBe(
      metricValue(h100, 'videosPerGpuHour', opts),
    );
    expect(metricValue({ ...h100, allocated: null }, 'dollarsPerVideo', opts)).toBe(
      metricValue(h100, 'dollarsPerVideo', opts),
    );
    expect(metricValue({ ...h100, participating: 8 }, 'videosPerGpuHour', opts)).toBeCloseTo(
      2.687,
      3,
    );
  });
  it('prices videos with HW_REGISTRY tiers', () => {
    // Hyperscaler $1.22/$1.17/$1.73 and rental $2.90/$2.00/$3.70 per GPU-hour for H200/H100/B200.
    expect(metricValue(h200, 'videosPerDollar', opts)).toBeCloseTo(4.8961, 3);
    expect(metricValue(h200, 'dollarsPerVideo', opts)).toBeCloseTo(0.2042, 3);
    expect(metricValue(h200, 'dollarsPerVideo', { tier: 'r' })).toBeCloseTo(0.4855, 3);
    expect(metricValue(h100, 'videosPerDollar', opts)).toBeCloseTo(4.5933, 3);
    expect(metricValue(h100, 'dollarsPerVideo', opts)).toBeCloseTo(0.2177, 3);
    expect(metricValue(h100, 'dollarsPerVideo', { tier: 'r' })).toBeCloseTo(0.3722, 3);
    expect(metricValue(b200, 'videosPerDollar', opts)).toBeCloseTo(6.6625, 3);
    expect(metricValue(b200, 'dollarsPerVideo', opts)).toBeCloseTo(0.1501, 3);
    expect(metricValue(b200, 'dollarsPerVideo', { tier: 'r' })).toBeCloseTo(0.321, 3);
    // Videos per $1 TCO is exactly the reciprocal of the TCO cost per video.
    expect(
      metricValue(h200, 'videosPerDollar', opts)! * metricValue(h200, 'dollarsPerVideo', opts)!,
    ).toBeCloseTo(1, 12);
  });
  it('exposes latency, energy and board power against the enforced limit', () => {
    expect(metricValue(h200, 'p90Latency', opts)).toBeCloseTo(151.105, 3);
    expect(metricValue(h200, 'p50Latency', opts)).toBeCloseTo(150.614, 3);
    expect(metricValue(h200, 'kjPerVideo', opts)).toBeCloseTo(410.954, 2);
    expect(metricValue(h200, 'powerPctCap', opts)).toBeCloseTo(97.41, 1);
    expect(metricValue(b200, 'powerPctCap', opts)).toBeCloseTo(96.4, 1);
  });
  it('prices the clip at the API list price, independent of hardware and tier', () => {
    // 0.034 $/video-s × 8 s clip.
    expect(metricValue(h200, 'apiPricePerVideo', priced)).toBeCloseTo(0.272, 6);
    expect(metricValue(h100, 'apiPricePerVideo', { ...priced, tier: 'r' })).toBeCloseTo(0.272, 6);
    expect(
      metricValue({ ...b200, hardwareKey: null, wallSeconds: null }, 'apiPricePerVideo', priced),
    ).toBeCloseTo(0.272, 6);
    expect(
      metricValue(h200, 'apiPricePerVideo', { ...priced, apiPricePerVideoSecond: 0.047 }),
    ).toBeCloseTo(0.376, 6);
  });
  it('returns null for the API list price without a positive price or clip length', () => {
    expect(metricValue(h200, 'apiPricePerVideo', opts)).toBeNull();
    for (const price of [null, 0, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        metricValue(h200, 'apiPricePerVideo', { ...opts, apiPricePerVideoSecond: price }),
      ).toBeNull();
    }
    expect(metricValue({ ...h200, durationSeconds: null }, 'apiPricePerVideo', priced)).toBeNull();
    expect(metricValue({ ...h200, durationSeconds: 0 }, 'apiPricePerVideo', priced)).toBeNull();
    // The price never leaks into the TCO metrics.
    expect(metricValue(h200, 'dollarsPerVideo', priced)).toBe(
      metricValue(h200, 'dollarsPerVideo', opts),
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
    for (const id of Y_METRICS) expect(metricValue(broken, id, opts)).toBeNull();
    expect(metricValue(broken, 'powerPctCap', opts)).toBeNull();
    // Same display floor as the run views: P90 needs ten valid samples, P50 does not.
    expect(metricValue({ ...h200, samples: 9 }, 'p90Latency', opts)).toBeNull();
    expect(metricValue({ ...h200, samples: 9 }, 'p50Latency', opts)).toBeCloseTo(150.614, 3);
    expect(metricValue({ ...h200, participating: null }, 'videosPerGpuHour', opts)).toBeNull();
    expect(metricValue({ ...h200, participating: 0 }, 'videosPerGpuHour', opts)).toBeNull();
    expect(metricValue({ ...h200, participating: 2.5 }, 'videosPerGpuHour', opts)).toBeNull();
    expect(metricValue({ ...h200, energyKj: 0 }, 'kjPerVideo', opts)).toBeNull();
    expect(metricValue({ ...h200, avgPowerW: 0 }, 'powerPctCap', opts)).toBeNull();
    // Hardware outside HW_REGISTRY has a rate but no price.
    expect(
      metricValue({ ...h200, hardwareKey: 'unknown-gpu' }, 'videosPerGpuHour', opts),
    ).toBeCloseTo(5.9732, 3);
    expect(
      metricValue({ ...h200, hardwareKey: 'unknown-gpu' }, 'dollarsPerVideo', opts),
    ).toBeNull();
    expect(
      metricValue({ ...h200, hardwareKey: 'unknown-gpu' }, 'videosPerDollar', opts),
    ).toBeNull();
  });
  it('labels tiered metrics with the cost tier and formats by metric', () => {
    expect(metricLabel('videosPerDollar', 'en', opts)).toBe(
      'Videos per $1 TCO (Owning at Large Hyperscaler Volume)',
    );
    expect(metricLabel('videosPerDollar', 'zh', { tier: 'r' })).toBe(
      '每 1 美元 TCO 生成视频数（租赁 - 3 年承诺）',
    );
    expect(metricLabel('dollarsPerVideo', 'zh', opts)).toBe(
      '每条视频 TCO 成本（Hyperscaler 自有设备）',
    );
    expect(metricLabel('p90Latency', 'en', opts)).toBe('P90 time to video (s)');
    expect(metricLabel('kjPerVideo', 'zh', opts)).toBe('每条视频 GPU 板卡能耗（kJ）');
    expect(metricLabel('apiPricePerVideo', 'en', opts)).toBe('API list price per video');
    expect(metricLabel('apiPricePerVideo', 'zh', opts)).toBe('每条视频 API 标价');
    // Only the priced TCO metrics carry the tier.
    const tiered = (Object.keys(VIDEO_METRICS) as MetricId[]).filter(
      (id) => metricLabel(id, 'en', opts) !== metricLabel(id, 'en', { tier: 'r' }),
    );
    expect(tiered).toEqual(['videosPerDollar', 'dollarsPerVideo']);
    expect(formatMetric(0.20419, 'dollarsPerVideo')).toBe('$0.204');
    expect(formatMetric(0.15, 'dollarsPerVideo')).toBe('$0.150');
    expect(formatMetric(0.272, 'apiPricePerVideo')).toBe('$0.272');
    expect(formatMetric(null, 'kjPerVideo')).toBe('—');
    expect(formatMetric(151.10486, 'p90Latency')).toBe('151.1');
    expect(formatMetric(1234.5, 'videosPerGpuHour')).toBe('1,234.5');
    expect(formatMetric(4.8961, 'videosPerDollar')).toBe('4.9');
    expect(formatMetric(97.41, 'powerPctCap')).toBe('97.4');
  });
});
