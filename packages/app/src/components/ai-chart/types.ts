import { Model, Sequence, Precision } from '@/lib/data-mappings';
import { Y_AXIS_METRICS } from '@/lib/chart-utils';
import { HW_REGISTRY, FRAMEWORK_KEYS } from '@semianalysisai/inferencex-constants';

export type AiProvider = 'openai' | 'anthropic' | 'xai' | 'google';

export type AiChartType = 'bar' | 'scatter' | 'line' | 'radar';

export type AiDataSource = 'benchmarks' | 'evaluations' | 'reliability' | 'history';

export type AiSortOrder = 'desc' | 'asc' | 'registry';

export interface AiChartSpec {
  chartType: AiChartType;
  dataSource: AiDataSource;

  // ── Data filters ──
  /** Model display name. Empty string = all models. */
  model: string;
  /** Sequence length string (e.g. "8k/1k"). */
  sequence: string;
  /** GPU base keys to include. [] = all. */
  hardwareKeys: string[];
  /** Precision filters. [] = all. */
  precisions: string[];
  /** Framework filters. [] = all. Allows filtering to specific serving backends. */
  frameworks: string[];
  /** Filter to disaggregated configs only (true), non-disagg only (false), or both (null). */
  disagg: boolean | null;

  // ── Metric ──
  /** Primary y-axis metric key. */
  yAxisMetric: string;
  /** Human-readable y-axis label. */
  yAxisLabel: string;

  // ── Bar chart options ──
  /** Interactivity level (tok/s/user) to sample at for bar charts. Default 40. */
  targetInteractivity?: number;
  /** Sort order for bar charts. "desc" = highest first (default), "asc" = lowest first, "registry" = GPU registry order. */
  sortOrder?: AiSortOrder;

  // ── Radar chart options ──
  /** For radar charts: list of y-axis metric keys to plot as axes. */
  radarMetrics?: string[];

  // ── Top-N filtering (applied after data loads) ──
  /** Show only the top N hardware configs by metric value. Undefined = show all. */
  topN?: number;
  /** When true, topN deduplicates by base GPU (best config per GPU family). Default true. */
  topNDistinctGpus?: boolean;

  // ── Display ──
  title: string;
  description: string;
}

/** The LLM may return an array of up to 2 specs for comparison queries. */
export type AiLlmResponse = AiChartSpec | AiChartSpec[];

export interface AiChartBarPoint {
  hwKey: string;
  label: string;
  value: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Validation whitelists
// ---------------------------------------------------------------------------

const VALID_CHART_TYPES = new Set<string>(['bar', 'scatter', 'line', 'radar']);
const VALID_DATA_SOURCES = new Set<string>(['benchmarks', 'evaluations', 'reliability', 'history']);
const VALID_MODELS = new Set<string>(Object.values(Model));
const VALID_SEQUENCES = new Set<string>(Object.values(Sequence));
const VALID_PRECISIONS = new Set<string>(Object.values(Precision));
const VALID_GPU_BASES = new Set<string>(Object.keys(HW_REGISTRY));
const VALID_FRAMEWORKS = new Set<string>(FRAMEWORK_KEYS);
const VALID_Y_METRICS = new Set<string>([...Y_AXIS_METRICS, 'eval_score', 'reliability_rate']);
const VALID_SORT_ORDERS = new Set<string>(['desc', 'asc', 'registry']);

/** Validate and clamp an LLM-generated spec to known values. Throws on unrecoverable input. */
export function validateSpec(raw: Record<string, unknown>): AiChartSpec {
  const chartType = VALID_CHART_TYPES.has(raw.chartType as string)
    ? (raw.chartType as AiChartType)
    : 'bar';

  const dataSource = VALID_DATA_SOURCES.has(raw.dataSource as string)
    ? (raw.dataSource as AiDataSource)
    : 'benchmarks';

  const model = VALID_MODELS.has(raw.model as string) ? (raw.model as string) : Model.DeepSeek_R1;

  const sequence = VALID_SEQUENCES.has(raw.sequence as string)
    ? (raw.sequence as string)
    : Sequence.EightK_OneK;

  const rawPrecisions = Array.isArray(raw.precisions) ? (raw.precisions as string[]) : [];
  const precisions = rawPrecisions
    .filter((p) => VALID_PRECISIONS.has(p.toLowerCase()))
    .map((p) => p.toLowerCase());

  const rawHwKeys = Array.isArray(raw.hardwareKeys) ? (raw.hardwareKeys as string[]) : [];
  const hardwareKeys = rawHwKeys
    .filter((k) => VALID_GPU_BASES.has(k.toLowerCase()))
    .map((k) => k.toLowerCase());

  const rawFrameworks = Array.isArray(raw.frameworks) ? (raw.frameworks as string[]) : [];
  const frameworks = rawFrameworks
    .filter((f) => VALID_FRAMEWORKS.has(f.toLowerCase()))
    .map((f) => f.toLowerCase());

  const disagg = raw.disagg === true ? true : raw.disagg === false ? false : null;

  const yAxisMetric = VALID_Y_METRICS.has(raw.yAxisMetric as string)
    ? (raw.yAxisMetric as string)
    : 'y_tpPerGpu';

  const sortOrder = VALID_SORT_ORDERS.has(raw.sortOrder as string)
    ? (raw.sortOrder as AiSortOrder)
    : undefined;

  const targetInteractivity =
    typeof raw.targetInteractivity === 'number' &&
    raw.targetInteractivity > 0 &&
    raw.targetInteractivity < 1000
      ? raw.targetInteractivity
      : 40;

  const rawRadarMetrics = Array.isArray(raw.radarMetrics) ? (raw.radarMetrics as string[]) : [];
  const radarMetrics = rawRadarMetrics.filter((m) => VALID_Y_METRICS.has(m));

  return {
    chartType,
    dataSource,
    model,
    sequence,
    hardwareKeys,
    precisions,
    frameworks,
    disagg,
    yAxisMetric,
    yAxisLabel: typeof raw.yAxisLabel === 'string' ? raw.yAxisLabel.slice(0, 100) : yAxisMetric,
    targetInteractivity,
    sortOrder,
    radarMetrics: radarMetrics.length > 0 ? radarMetrics : undefined,
    topN:
      typeof raw.topN === 'number' && raw.topN > 0 && raw.topN <= 20
        ? Math.round(raw.topN)
        : undefined,
    topNDistinctGpus: raw.topNDistinctGpus !== false,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : 'AI Generated Chart',
    description: typeof raw.description === 'string' ? raw.description.slice(0, 500) : '',
  };
}
