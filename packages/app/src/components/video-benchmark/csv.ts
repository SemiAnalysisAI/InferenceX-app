import { hardwareLabel } from './hardware';
import { metricValue, VIDEO_METRICS, type MetricId, type VideoPoint } from './metrics';
import { listedVideoCells } from './plot';
import { qualityMeasurement } from './quality';
import { metricOptions, type VideoDashboardState } from './video-url-state';

const METRICS = Object.keys(VIDEO_METRICS) as MetricId[];
const cell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Same selected rows and formulas as the plot, table and public dashboard API. */
export function videoCsv(points: VideoPoint[], state: VideoDashboardState): string {
  const options = metricOptions(state);
  const rows = listedVideoCells(points, state, new Set(state.hidden));
  const header = [
    'id',
    'hardware',
    'concurrency',
    'valid',
    'completed',
    'scheduled',
    'failed',
    'latency_samples',
    'participating_gpus',
    'allocated_gpus',
    'gpus_per_replica',
    'replicas',
    'tp_size',
    'ulysses_degree',
    'ring',
    'cfg',
    'observed_batch_size',
    'configured_max_batch_size',
    'scheduling',
    'offload',
    'engine',
    'runtime',
    'precision',
    'attention',
    'acceleration',
    'generation_settings',
    'workload_identity',
    'hardware_health',
    'health_reason',
    'quality_dimension',
    'quality_status',
    'quality_raw_value',
    'quality_assessed',
    'quality_target',
    'evaluator',
    'evaluator_version',
    'quality_contract',
    'quality_calibration',
    'reader_quality_threshold',
    'threshold_provenance',
    'tco_tier',
    'api_price_usd_per_video_second',
    ...METRICS.map((id) => `${id} (${VIDEO_METRICS[id].unit})`),
    'board_power_w',
    'enforced_limit_w',
    'source_id',
    'source_sha',
    'manifest_sha256',
    'artifact_id',
    'artifact_digest',
    'ci_run',
  ];
  const lines = rows.map((p) => {
    const d = p.deployment;
    const q = qualityMeasurement(p, state.qualityMetric);
    return [
      p.id,
      hardwareLabel(p.hardwareKey ?? ''),
      p.concurrency,
      p.valid,
      p.completed,
      p.scheduled,
      p.failed,
      p.samples,
      p.participating,
      p.allocated,
      d?.gpusPerReplica,
      p.replicas,
      p.server?.tp,
      p.server?.ulysses,
      d?.ring,
      d?.cfg,
      d?.batchSize,
      d?.maxBatchSize,
      d?.scheduling,
      d?.offload,
      d?.engine,
      p.runtime,
      d?.precision,
      p.server?.attention,
      d?.acceleration,
      d?.generationKey,
      p.workloadKey,
      p.hardwareHealth?.status,
      p.hardwareHealth?.reason,
      state.qualityMetric,
      q?.status,
      q?.value,
      q?.samples,
      q?.total,
      q?.evaluatorId,
      q?.evaluatorVersion,
      p.quality?.contractId,
      q?.calibration,
      state.qualityThreshold,
      state.qualityThreshold === null
        ? null
        : 'reader-selected URL; frozen evaluator rule still required',
      state.tier,
      state.apiPrice,
      ...METRICS.map((id) => metricValue(p, id, options)),
      p.avgPowerW,
      p.enforcedLimitW,
      p.provenance?.sourceId,
      p.provenance?.sourceSha,
      p.provenance?.manifestSha256,
      p.artifactId,
      p.provenance?.artifactDigest,
      `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${p.runId}`,
    ]
      .map(cell)
      .join(',');
  });
  return `${[header.join(','), ...lines].join('\n')}\n`;
}
