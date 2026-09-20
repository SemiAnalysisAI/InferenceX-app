import { costPerGpuHour, type CostTier } from './hardware';

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
  /** Boards that generated the clip: the denominator of every per-GPU metric. */
  participating: number | null;
  /** Boards the job reserved; the surplus sat idle and is shown, not billed. */
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

export type XMetricId = 'p90Latency' | 'p50Latency';
export type YMetricId = 'videosPerDollar' | 'dollarsPerVideo' | 'videosPerGpuHour' | 'kjPerVideo';
/** Axis metrics plus the two the cards and evidence read but the chart does not plot. */
export type MetricId = XMetricId | YMetricId | 'powerPctCap' | 'apiPricePerVideo';

export interface MetricOptions {
  tier: CostTier;
  /**
   * USD an API bills per video-second of the same clip (`H3_API_REFERENCE` or
   * the reader's override). Missing or non-positive → the API list price is null.
   */
  apiPricePerVideoSecond?: number | null;
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

export const X_METRICS: readonly XMetricId[] = ['p90Latency', 'p50Latency'];
export const Y_METRICS: readonly YMetricId[] = [
  'videosPerDollar',
  'dollarsPerVideo',
  'videosPerGpuHour',
  'kjPerVideo',
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
  videosPerDollar: {
    label: 'Videos per $1 TCO',
    labelZh: '每 1 美元 TCO 生成视频数',
    unit: 'videos/$',
    polarity: 'higher',
    digits: 2,
    tiered: true,
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
  videosPerGpuHour: {
    label: 'Videos per GPU-hour',
    labelZh: '每 GPU 小时生成视频数',
    unit: 'videos/GPU-hr',
    polarity: 'higher',
    digits: 2,
  },
  kjPerVideo: {
    label: 'GPU-board energy per video (kJ)',
    labelZh: '每条视频 GPU 板卡能耗（kJ）',
    unit: 'kJ/video',
    polarity: 'lower',
    digits: 1,
  },
  powerPctCap: {
    label: 'Mean board power / enforced limit (%)',
    labelZh: '板卡平均功率 / 生效功率上限（%）',
    unit: '%',
    polarity: 'higher',
    digits: 1,
  },
  // What the API lists for the same clip: a reference beside the TCO cost, never plotted.
  apiPricePerVideo: {
    label: 'API list price per video',
    labelZh: '每条视频 API 标价',
    unit: '$/video',
    polarity: 'higher',
    digits: 3,
    currency: true,
  },
};

const finite = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => finite(n) && n > 0;

/**
 * Per-GPU metrics divide by the boards that generated the clip. The retained
 * H100 and B200 jobs reserved eight boards and used four; the idle ones are
 * stated beside the numbers (KPI header, chart note) rather than billed.
 */
function gpus(point: VideoPoint): number | null {
  const n = point.participating;
  return positive(n) && Number.isSafeInteger(n) ? n : null;
}

function videosPerGpuHour(point: VideoPoint): number | null {
  const n = gpus(point);
  if (!positive(point.valid) || !positive(point.wallSeconds) || n === null) return null;
  return (point.valid * 3600) / (point.wallSeconds * n);
}

function dollarsPerVideo(point: VideoPoint, options: MetricOptions): number | null {
  const rate = videosPerGpuHour(point);
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
    case 'videosPerGpuHour': {
      value = videosPerGpuHour(point);
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
    case 'kjPerVideo': {
      value = positive(point.energyKj) ? point.energyKj : null;
      break;
    }
    case 'powerPctCap': {
      value =
        positive(point.avgPowerW) && positive(point.enforcedLimitW)
          ? (point.avgPowerW / point.enforcedLimitW) * 100
          : null;
      break;
    }
    case 'apiPricePerVideo': {
      // List price × clip length; the reader's override is validated upstream.
      const price = options.apiPricePerVideoSecond;
      value =
        positive(price) && positive(point.durationSeconds) ? price * point.durationSeconds : null;
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
