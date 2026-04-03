import { Model, Sequence, Precision } from '@/lib/data-mappings';
import { Y_AXIS_METRICS } from '@/lib/chart-utils';
import { MODEL_ORDER } from '@/lib/constants';

export type AiProvider = 'openai' | 'anthropic' | 'xai' | 'google';

export type AiChartType = 'bar' | 'scatter';

export type AiDataSource = 'benchmarks' | 'evaluations' | 'reliability' | 'history';

export interface AiChartSpec {
  chartType: AiChartType;
  dataSource: AiDataSource;
  model: string;
  sequence: string;
  precisions: string[];
  hardwareKeys: string[];
  yAxisMetric: string;
  yAxisLabel: string;
  targetInteractivity?: number;
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

const VALID_CHART_TYPES = new Set<string>(['bar', 'scatter']);
const VALID_DATA_SOURCES = new Set<string>(['benchmarks', 'evaluations', 'reliability', 'history']);
const VALID_MODELS = new Set<string>(Object.values(Model));
const VALID_SEQUENCES = new Set<string>(Object.values(Sequence));
const VALID_PRECISIONS = new Set<string>(Object.values(Precision));
const VALID_GPU_BASES = new Set<string>(MODEL_ORDER);
const VALID_Y_METRICS = new Set<string>([...Y_AXIS_METRICS, 'eval_score', 'reliability_rate']);

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

  const yAxisMetric = VALID_Y_METRICS.has(raw.yAxisMetric as string)
    ? (raw.yAxisMetric as string)
    : 'y_tpPerGpu';

  const targetInteractivity =
    typeof raw.targetInteractivity === 'number' &&
    raw.targetInteractivity > 0 &&
    raw.targetInteractivity < 1000
      ? raw.targetInteractivity
      : 40;

  return {
    chartType,
    dataSource,
    model,
    sequence,
    precisions,
    hardwareKeys,
    yAxisMetric,
    yAxisLabel: typeof raw.yAxisLabel === 'string' ? raw.yAxisLabel.slice(0, 100) : yAxisMetric,
    targetInteractivity,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : 'AI Generated Chart',
    description: typeof raw.description === 'string' ? raw.description.slice(0, 500) : '',
  };
}
