import { costPerGpuHour, type CostTier } from './hardware';
import type { ResultsEvidence } from './results-evidence';

/** One stored serving cell (hardware × client concurrency) flattened for the dashboard. */
export interface VideoPoint {
  results?: ResultsEvidence | null;
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
  /** Canonical plan and measurement semantics, independent of the display label. */
  workloadKey?: string | null;
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
  /** Valid decoded output seconds per measurement wall-hour; absent in older projections. */
  videoSecondsPerHour?: number | null;
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
  /** When the artifact entered published history; orders publications with `artifactId`. */
  publishedAt?: string | null;
  /** True only when an immutable publication receipt matches the stored source. */
  approved?: boolean;
}

export type MetricId = 'videosPerDollar' | 'dollarsPerVideo' | 'videosPerGpuHour' | 'kjPerVideo';

export interface MetricOptions {
  tier: CostTier;
}

export const COST_TIERS: readonly CostTier[] = ['h', 'r'];

/** Same tier names the inference calculator uses for HW_REGISTRY costh/costr. */
export const TIER_LABELS: Record<CostTier, { en: string; zh: string }> = {
  h: { en: 'Owning at Large Hyperscaler Volume', zh: 'Hyperscaler 自有设备' },
  r: { en: 'Rent – 3-Year Commit', zh: '租赁 - 3 年承诺' },
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
  }
  return finite(value) ? value : null;
}
