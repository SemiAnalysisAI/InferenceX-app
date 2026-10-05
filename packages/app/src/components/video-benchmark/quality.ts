/** Original Goal 1 rubric dimensions; never an overall quality score. */
export const QUALITY_METRICS = {
  prompt_adherence: { label: 'Prompt adherence', labelZh: '提示词遵循度', polarity: 'higher' },
  visual_fidelity: { label: 'Visual fidelity', labelZh: '视觉质量', polarity: 'higher' },
  temporal_consistency: {
    label: 'Temporal consistency',
    labelZh: '时序一致性',
    polarity: 'higher',
  },
  motion_plausibility: { label: 'Motion plausibility', labelZh: '运动合理性', polarity: 'higher' },
  audio_quality: { label: 'Audio quality', labelZh: '音频质量', polarity: 'higher' },
  audio_content: { label: 'Audio content', labelZh: '音频内容', polarity: 'higher' },
  av_sync: {
    label: 'Audiovisual synchronization',
    labelZh: '音画同步',
    polarity: 'higher',
  },
} as const;

export type QualityMetricId = keyof typeof QUALITY_METRICS;
export const QUALITY_METRIC_IDS = Object.keys(QUALITY_METRICS) as QualityMetricId[];
/** Original human rubric anchors; scores are never shifted from another scale. */
export const QUALITY_SCALE = {
  registryMetricId: 'human.absolute_dimension_rating',
  registryVersion: '0.2.0-draft',
  polarity: 'higher',
  unit: 'ordinal_0_to_4',
  minimum: 0,
  maximum: 4,
} as const;

export type VideoQualityStatus =
  | 'unjudged'
  | 'judged_unqualified'
  | 'pass'
  | 'fail'
  | 'inconclusive'
  | 'unassessable';

export interface VideoQualityMetricResult {
  /** One dimension's declared aggregate; no averaging across dimensions. */
  value: number | null;
  status: VideoQualityStatus;
  direction: 'higher' | 'lower';
  evaluatorId: string | null;
  evaluatorVersion: string | null;
  evaluatorSha256: string | null;
  /** Assessed target clips and all target clips, not number of ratings or pair appearances. */
  samples: number | null;
  total: number | null;
  calibration: {
    status: 'uncalibrated' | 'calibrated';
    cohortId: string | null;
    /** Frozen calibrated threshold; Goal 1 v0 has none, so it stays null. */
    threshold: number | null;
    provenance: string | null;
    frozenAt: string | null;
  } | null;
}

export interface VideoQualityAssessment {
  scale: typeof QUALITY_SCALE.unit;
  contractId: string | null;
  contractSha256: string | null;
  rubricVersion: string | null;
  rubricSha256: string | null;
  metrics: Partial<Record<QualityMetricId, VideoQualityMetricResult>>;
}

export interface QualitySelection {
  metric: QualityMetricId;
  /** Reader's extra threshold. It cannot relax the frozen protocol threshold. */
  threshold: number | null;
}

interface QualityPoint {
  quality?: VideoQualityAssessment | null;
  samples?: number;
}
export type QualityExclusionReason =
  | 'unjudged'
  | 'not_qualified'
  | 'missing_protocol'
  | 'missing_evaluator'
  | 'incomplete_coverage'
  | 'uncalibrated'
  | 'invalid_value'
  | 'incompatible_direction'
  | 'below_threshold';

const text = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const hash = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const score = (value: number | null | undefined): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= QUALITY_SCALE.minimum &&
  value <= QUALITY_SCALE.maximum;

export function qualityMeasurement(point: QualityPoint, metric: QualityMetricId) {
  return point.quality?.metrics?.[metric] ?? null;
}

function dimensionEligibility(
  point: QualityPoint,
  selection: QualitySelection,
): {
  eligible: boolean;
  reasons: QualityExclusionReason[];
  value: number | null;
  cohortKey: string | null;
} {
  const assessment = point.quality;
  const measurement = qualityMeasurement(point, selection.metric);
  if (!measurement) return { eligible: false, reasons: ['unjudged'], value: null, cohortKey: null };
  const reasons: QualityExclusionReason[] = [];
  if (measurement.status !== 'pass')
    reasons.push(measurement.status === 'unjudged' ? 'unjudged' : 'not_qualified');
  if (
    assessment?.scale !== QUALITY_SCALE.unit ||
    !text(assessment?.contractId) ||
    !hash(assessment?.contractSha256) ||
    !text(assessment?.rubricVersion) ||
    !hash(assessment?.rubricSha256)
  )
    reasons.push('missing_protocol');
  if (
    !text(measurement.evaluatorId) ||
    !text(measurement.evaluatorVersion) ||
    !hash(measurement.evaluatorSha256)
  )
    reasons.push('missing_evaluator');
  if (
    !Number.isSafeInteger(measurement.samples) ||
    (measurement.samples ?? 0) <= 0 ||
    measurement.samples !== measurement.total ||
    (point.samples !== undefined && measurement.total !== point.samples)
  )
    reasons.push('incomplete_coverage');
  const calibration = measurement.calibration;
  if (
    calibration?.status !== 'calibrated' ||
    !text(calibration.cohortId) ||
    !score(calibration.threshold) ||
    !text(calibration.provenance) ||
    !text(calibration.frozenAt) ||
    !Number.isFinite(Date.parse(calibration.frozenAt))
  )
    reasons.push('uncalibrated');
  if (!score(measurement.value)) reasons.push('invalid_value');
  if (measurement.direction !== QUALITY_SCALE.polarity) reasons.push('incompatible_direction');
  if (
    (selection.threshold !== null && !score(selection.threshold)) ||
    (score(measurement.value) &&
      ((score(calibration?.threshold) && measurement.value < calibration.threshold) ||
        (score(selection.threshold) && measurement.value < selection.threshold)))
  )
    reasons.push('below_threshold');
  const eligible = reasons.length === 0;
  return {
    eligible,
    reasons,
    value: eligible ? measurement.value : null,
    cohortKey: eligible
      ? JSON.stringify([
          assessment!.contractId,
          assessment!.contractSha256,
          assessment!.rubricVersion,
          assessment!.rubricSha256,
          selection.metric,
          QUALITY_SCALE.registryMetricId,
          QUALITY_SCALE.registryVersion,
          measurement.direction,
          measurement.evaluatorId,
          measurement.evaluatorVersion,
          measurement.evaluatorSha256,
          calibration!.cohortId,
          calibration!.threshold,
          calibration!.provenance,
          calibration!.frozenAt,
        ])
      : null,
  };
}

/** Every critical dimension must qualify before selecting an axis or computing a frontier. */
export function qualityEligibility(point: QualityPoint, selection: QualitySelection) {
  const results = QUALITY_METRIC_IDS.map((metric) => ({
    metric,
    ...dimensionEligibility(point, {
      metric,
      threshold: metric === selection.metric ? selection.threshold : null,
    }),
  }));
  const selected = results.find((result) => result.metric === selection.metric);
  const reasons = [...new Set(results.flatMap((result) => result.reasons))];
  const eligible = reasons.length === 0 && selected !== undefined;
  return {
    eligible,
    reasons,
    value: eligible ? selected.value : null,
    cohortKey: eligible
      ? JSON.stringify([
          QUALITY_SCALE.unit,
          selection.metric,
          ...results.map((result) => result.cohortKey),
        ])
      : null,
  };
}

export function qualityValue(point: QualityPoint, metric: QualityMetricId): number | null {
  return qualityEligibility(point, { metric, threshold: null }).value;
}

/** Workload/generation compatibility must additionally be enforced by the plot's cohort. */
export function qualityCohortKey(point: QualityPoint, metric: QualityMetricId): string | null {
  return qualityEligibility(point, { metric, threshold: null }).cohortKey;
}
