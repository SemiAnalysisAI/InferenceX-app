import { costPerGpuHour, type CostTier } from './hardware';

/** Denominator for per-GPU metrics: boards that generated the clip vs. boards the job reserved. */
export type GpuBasis = 'participating' | 'allocated';

/** One published serving cell (hardware × client concurrency) flattened for the dashboard. */
export interface VideoPoint {
  id: string;
  runId: string;
  artifactId: number;
  cell: string | null;
  hardwareKey: string | null;
  hardwareName: string;
  runtime: string;
  model: string;
  /** Human-readable workload summary from the projection (resolution · duration · fps · steps · model @ rev · seeds · prompt). */
  workload: string;
  concurrency: number | null;
  participating: number | null;
  allocated: number | null;
  /** Model replicas behind the endpoint; null for bundles that predate the deployment record. */
  replicas: number | null;
  valid: number | null;
  completed: number | null;
  scheduled: number | null;
  failed: number | null;
  samples: number;
  p50: number | null;
  p90: number | null;
  wallSeconds: number | null;
  durationSeconds: number | null;
  frameCount: number | null;
  /** GPU-board kJ per valid clip over the recorded generation window; null when power is invalid. */
  energyKj: number | null;
  /** Sum of participating boards' time-weighted mean W. */
  avgPowerW: number | null;
  /** Sum of the same boards' recorded enforced limits; null when a limit was not recorded. */
  enforcedLimitW: number | null;
  server: { tp: number | null; ulysses: number | null; attention: string | null } | null;
  status: string;
  observedAt: string | null;
}

export type XMetricId = 'p90Latency' | 'p50Latency' | 'genSpeed';
export type YMetricId =
  | 'videosPerDollar'
  | 'videosPerGpuHour'
  | 'videoSecondsPerGpuHour'
  | 'dollarsPerVideo'
  | 'kjPerVideo'
  | 'videosPerKwh';
export type MetricId = XMetricId | YMetricId | 'powerPctCap' | 'dollarsPerVideoSecond';

export interface MetricOptions {
  tier: CostTier;
  basis: GpuBasis;
}

interface MetricDefinition {
  label: string;
  labelZh: string;
  unit: string;
  polarity: 'higher' | 'lower';
  digits: number;
  /** Label gets the cost tier appended. */
  tiered?: boolean;
  /** Prefix a dollar sign when formatting. */
  currency?: boolean;
}

export const X_METRICS: readonly XMetricId[] = ['p90Latency', 'p50Latency', 'genSpeed'];
export const Y_METRICS: readonly YMetricId[] = [
  'videosPerDollar',
  'videosPerGpuHour',
  'videoSecondsPerGpuHour',
  'dollarsPerVideo',
  'kjPerVideo',
  'videosPerKwh',
];
export const COST_TIERS: readonly CostTier[] = ['h', 'r'];

/** Same tier names the inference calculator uses for HW_REGISTRY costh/costr. */
export const TIER_LABELS: Record<CostTier, { en: string; zh: string }> = {
  h: { en: 'Owning at Large Hyperscaler Volume', zh: 'Hyperscaler 自有设备' },
  r: { en: 'Rent - 3 Year Commit', zh: '租赁 - 3 年承诺' },
};

export const VIDEO_METRICS: Record<MetricId, MetricDefinition> = {
  p90Latency: {
    label: 'P90 time to video (s)',
    labelZh: 'P90 出片时间（s）',
    unit: 's',
    polarity: 'lower',
    digits: 1,
  },
  p50Latency: {
    label: 'P50 time to video (s)',
    labelZh: 'P50 出片时间（s）',
    unit: 's',
    polarity: 'lower',
    digits: 1,
  },
  genSpeed: {
    label: 'Generation speed (frames/s per request)',
    labelZh: '生成速度（每请求 frames/s）',
    unit: 'frames/s',
    polarity: 'higher',
    digits: 2,
  },
  videosPerDollar: {
    label: 'Videos per $1 TCO',
    labelZh: '每 1 美元 TCO 生成视频数',
    unit: 'videos/$',
    polarity: 'higher',
    digits: 2,
    tiered: true,
  },
  videosPerGpuHour: {
    label: 'Videos per GPU-hour',
    labelZh: '每 GPU 小时生成视频数',
    unit: 'videos/GPU-hr',
    polarity: 'higher',
    digits: 2,
  },
  videoSecondsPerGpuHour: {
    label: 'Video seconds per GPU-hour',
    labelZh: '每 GPU 小时生成视频秒数',
    unit: 'video-s/GPU-hr',
    polarity: 'higher',
    digits: 1,
  },
  dollarsPerVideo: {
    label: 'TCO cost per video',
    labelZh: '每条视频 TCO 成本',
    unit: '$/video',
    polarity: 'lower',
    digits: 3,
    tiered: true,
    currency: true,
  },
  dollarsPerVideoSecond: {
    label: 'TCO cost per video-second',
    labelZh: '每秒视频时长 TCO 成本',
    unit: '$/video-s',
    polarity: 'lower',
    digits: 4,
    tiered: true,
    currency: true,
  },
  kjPerVideo: {
    label: 'GPU-board energy per video (kJ)',
    labelZh: '每条视频 GPU 板卡能耗（kJ）',
    unit: 'kJ/video',
    polarity: 'lower',
    digits: 1,
  },
  videosPerKwh: {
    label: 'Videos per GPU-board kWh',
    labelZh: '每 kWh GPU 板卡电能生成视频数',
    unit: 'videos/kWh',
    polarity: 'higher',
    digits: 2,
  },
  powerPctCap: {
    label: 'Mean board power / enforced limit (%)',
    labelZh: '板卡平均功率 / 生效功率上限（%）',
    unit: '%',
    polarity: 'higher',
    digits: 1,
  },
};

const finite = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => finite(n) && n > 0;

function gpus(point: VideoPoint, basis: GpuBasis): number | null {
  const n = basis === 'allocated' ? point.allocated : point.participating;
  return positive(n) && Number.isSafeInteger(n) ? n : null;
}

function videosPerGpuHour(point: VideoPoint, basis: GpuBasis): number | null {
  const n = gpus(point, basis);
  if (!positive(point.valid) || !positive(point.wallSeconds) || n === null) return null;
  return (point.valid * 3600) / (point.wallSeconds * n);
}

function dollarsPerVideo(point: VideoPoint, options: MetricOptions): number | null {
  const rate = videosPerGpuHour(point, options.basis);
  const cost = point.hardwareKey ? costPerGpuHour(point.hardwareKey, options.tier) : null;
  return rate !== null && cost !== null ? cost / rate : null;
}

/** Every formula returns null (never 0) when an input is missing or invalid. */
export function metricValue(
  point: VideoPoint,
  id: MetricId,
  options: MetricOptions,
): number | null {
  let value: number | null = null;
  switch (id) {
    case 'p90Latency': {
      // Same display floor as the run views: P90 needs at least ten valid samples.
      value = point.samples >= 10 ? point.p90 : null;
      break;
    }
    case 'p50Latency': {
      value = point.p50;
      break;
    }
    case 'genSpeed': {
      value =
        positive(point.frameCount) && positive(point.p50) ? point.frameCount / point.p50 : null;
      break;
    }
    case 'videosPerGpuHour': {
      value = videosPerGpuHour(point, options.basis);
      break;
    }
    case 'videoSecondsPerGpuHour': {
      const rate = videosPerGpuHour(point, options.basis);
      value =
        rate !== null && positive(point.durationSeconds) ? rate * point.durationSeconds : null;
      break;
    }
    case 'videosPerDollar': {
      const cost = dollarsPerVideo(point, options);
      value = cost === null ? null : 1 / cost;
      break;
    }
    case 'dollarsPerVideo': {
      value = dollarsPerVideo(point, options);
      break;
    }
    case 'dollarsPerVideoSecond': {
      const cost = dollarsPerVideo(point, options);
      value =
        cost !== null && positive(point.durationSeconds) ? cost / point.durationSeconds : null;
      break;
    }
    case 'kjPerVideo': {
      value = positive(point.energyKj) ? point.energyKj : null;
      break;
    }
    case 'videosPerKwh': {
      value = positive(point.energyKj) ? 3600 / point.energyKj : null;
      break;
    }
    case 'powerPctCap': {
      value =
        positive(point.avgPowerW) && positive(point.enforcedLimitW)
          ? (point.avgPowerW / point.enforcedLimitW) * 100
          : null;
      break;
    }
  }
  return finite(value) ? value : null;
}

export function metricLabel(id: MetricId, locale: 'en' | 'zh', options: MetricOptions): string {
  const def = VIDEO_METRICS[id];
  const base = locale === 'zh' ? def.labelZh : def.label;
  if (!def.tiered) return base;
  const tier = TIER_LABELS[options.tier][locale];
  return locale === 'zh' ? `${base}（${tier}）` : `${base} (${tier})`;
}

export function formatMetric(value: number | null, id: MetricId): string {
  if (value === null) return '—';
  const def = VIDEO_METRICS[id];
  const text = value.toLocaleString('en-US', {
    minimumFractionDigits: def.currency ? def.digits : 0,
    maximumFractionDigits: def.digits,
  });
  return def.currency ? `$${text}` : text;
}
