import type {
  ExperimentCampaign,
  ExperimentRun,
} from '@semianalysisai/inferencex-db/queries/experiments';
import type { BenchmarkRow } from '@/lib/api/api';
import type { AggDataEntry } from '@/components/inference/types';

export const WEKA_EXPERIMENT = 'weka-amg-kimi-k3';
export const LATEST_WEKA_EXPERIMENT = 'weka-amg-kimi-k3-latest-3h';
export function isExperimentCampaign(value: string | null): boolean {
  return value === WEKA_EXPERIMENT || value === LATEST_WEKA_EXPERIMENT;
}

export function experimentQualificationNote(
  experiment: NonNullable<AggDataEntry['experiment']>,
  locale: 'en' | 'zh',
): string {
  if (experiment.frontierEligible) return '';
  if (experiment.qualificationCode === 'metric-integrity')
    return locale === 'zh'
      ? '读取字节计数器完整性异常；请求性能指标有效，但不纳入无异常结果的 Pareto 前沿。'
      : 'Read-byte counter integrity flag; request performance remains valid, but this point is excluded from the clean frontier.';
  if (experiment.qualificationCode === 'dram-recovery')
    return locale === 'zh'
      ? '测量期间发生可恢复的 DRAM cache 读取故障；不纳入无异常结果的 Pareto 前沿。'
      : 'Recoverable DRAM-cache load failures during measurement; excluded from the clean frontier.';
  if (experiment.campaign !== WEKA_EXPERIMENT)
    return locale === 'zh'
      ? '存在异常标记；不纳入无异常结果的 Pareto 前沿。'
      : 'Flagged measurement; excluded from the clean frontier.';
  return locale === 'zh'
    ? '已恢复的 cache miss；不纳入无读取故障的 frontier；GPU-memory utilization 0.89。'
    : 'Recovered cache miss; excluded from clean frontier; GPU-memory utilization 0.89.';
}
export interface ExperimentResponse {
  campaign: ExperimentCampaign;
  runs: ExperimentRun[];
}
export type ExperimentBenchmarkRow = BenchmarkRow & {
  experiment?: AggDataEntry['experiment'];
  actualDate?: string;
};
const FRAMEWORKS = {
  weka: 'vllm-weka-amg',
  native: 'vllm-mooncake-dram',
  'recovered-c150': 'vllm-mooncake-recovered',
} as const;

export function experimentDetailHref(campaign: string, runId: string): string {
  return `/api/v1/experiments/${encodeURIComponent(campaign)}/runs/${encodeURIComponent(runId)}`;
}

function chartMetrics(point: Record<string, unknown>): Record<string, number> {
  const mapping: Record<string, string> = {
    total_tps_gpu: 'tput_per_gpu',
    input_tps_gpu: 'input_tput_per_gpu',
    output_tps_gpu: 'output_tput_per_gpu',
    theoretical_hit_rate: 'theoretical_cache_hit_rate',
    p90_ttft: 'p90_ttft',
  };
  const result: Record<string, number> = {};
  for (const [source, target] of Object.entries(mapping)) {
    const value = point[source];
    if (typeof value === 'number' && Number.isFinite(value)) result[target] = value;
  }
  // Frozen published points contain 1/p90(full-response ITL), not p90(1/ITL).
  const interactivity = point.p90_interactivity;
  if (typeof interactivity === 'number' && interactivity > 0) {
    result.p90_itl = 1 / interactivity;
  }
  return result;
}

function baseRow(): BenchmarkRow {
  return {
    id: 0,
    hardware: 'b300',
    framework: 'vllm',
    model: 'kimik3',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 0,
    offload_mode: 'on',
    image: null,
    metrics: {},
    date: '2026-10-31',
    run_url: null,
  };
}

/** No aggregation/deduplication: every measured repetition keeps its source identity. */
export function experimentBenchmarkRows(data: ExperimentResponse): ExperimentBenchmarkRow[] {
  return data.runs.map((run) => ({
    ...baseRow(),
    framework:
      data.campaign.slug === LATEST_WEKA_EXPERIMENT
        ? run.series === 'weka'
          ? 'vllm-weka-amg-latest'
          : 'vllm-mooncake-internal'
        : FRAMEWORKS[run.series],
    date: data.campaign.slug === LATEST_WEKA_EXPERIMENT ? '2026-11-09' : '2026-10-31',
    // A common comparison date keeps all repetitions in one displayed curve.
    // Tooltips retain each measurement's actual date from its source export.
    actualDate: typeof run.configuration.date === 'string' ? run.configuration.date : undefined,
    conc: run.concurrency,
    image: typeof run.configuration.image === 'string' ? run.configuration.image : null,
    recipe_fingerprint:
      typeof run.configuration.recipe_fingerprint === 'string'
        ? run.configuration.recipe_fingerprint
        : null,
    metrics: {
      ...run.metrics,
      ...chartMetrics(run.plot_metrics),
      ...(typeof run.metrics.p90_full_response_itl === 'number'
        ? { p90_full_response_itl: 1 / Number(run.plot_metrics.p90_interactivity) }
        : {}),
    },
    experiment: {
      campaign: data.campaign.slug,
      runId: run.run_id,
      replicate: run.replicate,
      frontierEligible: run.frontier_eligible,
      qualificationCode:
        typeof run.health.qualification_code === 'string'
          ? run.health.qualification_code
          : undefined,
      configurationVariant:
        typeof run.configuration.configuration_variant === 'string'
          ? run.configuration.configuration_variant
          : undefined,
      detailHref: experimentDetailHref(data.campaign.slug, run.run_id),
    },
  }));
}

/** Pin the published comparison to its archived points, rather than today's changing curve. */
export function experimentReferenceRows(data: ExperimentResponse): BenchmarkRow[] {
  return data.campaign.reference_points.map((point) => ({
    ...baseRow(),
    // This is the genuine original benchmark ID, never an experiment row ID.
    id: Number(point.run_id),
    conc: Number(point.concurrency),
    date: typeof point.date === 'string' ? point.date : '2026-08-16',
    run_url: typeof point.source === 'string' ? point.source : null,
    metrics: chartMetrics(point),
  }));
}

export function withExperimentRows(
  rows: BenchmarkRow[],
  data: ExperimentResponse,
): ExperimentBenchmarkRow[] {
  // Three-hour experiments contain their own matched workload; never overlay one-hour published data.
  if (data.campaign.slug === LATEST_WEKA_EXPERIMENT) return experimentBenchmarkRows(data);
  return [
    ...rows.filter(
      (row) =>
        !(
          row.hardware === 'b300' &&
          row.framework === 'vllm' &&
          row.benchmark_type === 'agentic_traces'
        ),
    ),
    ...experimentReferenceRows(data),
    ...experimentBenchmarkRows(data),
  ];
}
