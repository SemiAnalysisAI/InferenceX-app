import { describe, expect, it } from 'vitest';
import {
  qualityCohortKey,
  qualityEligibility,
  qualityValue,
  type VideoQualityAssessment,
  type VideoQualityMetricResult,
  type VideoQualityStatus,
} from './quality';

// Synthetic calibrated evidence exercises the boundary; no retained H3 clip is judged.
const calibrated = (
  overrides: Partial<VideoQualityMetricResult> = {},
): VideoQualityMetricResult => ({
  value: 4,
  status: 'pass',
  direction: 'higher',
  evaluatorId: 'fixture-human-review',
  evaluatorVersion: 'fixture-v1',
  evaluatorSha256: 'a'.repeat(64),
  samples: 20,
  total: 20,
  calibration: {
    status: 'calibrated',
    cohortId: 'fixture-calibration-only',
    threshold: 3,
    provenance: 'fixture://preregistered-rule',
    frozenAt: '2026-09-01T00:00:00Z',
  },
  ...overrides,
});
function point(overrides: Partial<VideoQualityMetricResult> = {}) {
  const quality: VideoQualityAssessment = {
    scale: 'ordinal_0_to_4',
    contractId: 'fixture-quality-contract',
    contractSha256: 'b'.repeat(64),
    rubricVersion: 'fixture-rubric-v1',
    rubricSha256: 'd'.repeat(64),
    metrics: {
      prompt_adherence: calibrated(overrides),
      visual_fidelity: calibrated(),
      temporal_consistency: calibrated(),
      motion_plausibility: calibrated(),
      audio_quality: calibrated(),
      audio_content: calibrated(),
      av_sync: calibrated(),
    },
  };
  return { quality };
}
const selection = { metric: 'prompt_adherence', threshold: null } as const;

describe('quality eligibility', () => {
  it('preserves a canonical zero score and zero frozen threshold without coercion', () => {
    const source = point({
      value: 0,
      calibration: { ...calibrated().calibration!, threshold: 0 },
    });
    expect(qualityEligibility(source, { ...selection, threshold: 0 })).toMatchObject({
      eligible: true,
      value: 0,
    });
    expect(source.quality.metrics.prompt_adherence?.value).toBe(0);
  });
  it('rejects missing and legacy scale metadata without shifting otherwise plausible scores', () => {
    for (const scale of [undefined, 'ordinal_1_to_5']) {
      const source = point({ value: 3 });
      Object.assign(source.quality, { scale });
      expect(qualityEligibility(source, selection)).toMatchObject({
        eligible: false,
        value: null,
      });
      expect(source.quality.metrics.prompt_adherence?.value).toBe(3);
    }
  });
  it('keeps retained missing/unjudged quality null, never inventing a score', () => {
    expect(qualityValue({}, 'prompt_adherence')).toBeNull();
    expect(qualityEligibility({ quality: null }, selection).reasons).toEqual(['unjudged']);
    expect(qualityValue(point({ status: 'unjudged', value: null }), 'prompt_adherence')).toBeNull();
  });

  it.each<VideoQualityStatus>(['judged_unqualified', 'fail', 'inconclusive', 'unassessable'])(
    'excludes a completed score with %s decision',
    (status) => expect(qualityEligibility(point({ status }), selection).eligible).toBe(false),
  );

  it('requires complete assessed clip coverage, not a passing survivor subset', () => {
    for (const samples of [null, 0, 19, 21, 19.5, Number.NaN])
      expect(qualityEligibility(point({ samples }), selection).reasons).toContain(
        'incomplete_coverage',
      );
    expect(qualityEligibility(point(), selection).eligible).toBe(true);
    expect(
      qualityEligibility({ ...point({ samples: 1, total: 1 }), samples: 20 }, selection).reasons,
    ).toContain('incomplete_coverage');
  });

  it('requires calibrated provenance and a frozen threshold even without a reader threshold', () => {
    const calibration = calibrated().calibration!;
    for (const missing of [
      null,
      { ...calibration, status: 'uncalibrated' as const },
      { ...calibration, threshold: null },
      { ...calibration, provenance: null },
      { ...calibration, cohortId: null },
      { ...calibration, frozenAt: 'invalid date' },
    ])
      expect(qualityEligibility(point({ calibration: missing }), selection).reasons).toContain(
        'uncalibrated',
      );
  });

  it('preserves equality at the threshold, and cannot relax the frozen threshold', () => {
    expect(qualityEligibility(point(), { ...selection, threshold: 4 }).eligible).toBe(true);
    expect(qualityEligibility(point(), { ...selection, threshold: 4.5 }).reasons).toContain(
      'below_threshold',
    );
    expect(qualityEligibility(point({ value: 2 }), { ...selection, threshold: 1 }).eligible).toBe(
      false,
    );
    expect(qualityEligibility(point(), { ...selection, threshold: Number.NaN }).eligible).toBe(
      false,
    );
  });

  it('rejects missing evaluator identity, out-of-scale values and a reversed human score direction', () => {
    expect(qualityEligibility(point({ evaluatorSha256: null }), selection).reasons).toContain(
      'missing_evaluator',
    );
    for (const value of [null, Number.NaN, Infinity, -1, 5])
      expect(qualityEligibility(point({ value }), selection).reasons).toContain('invalid_value');
    expect(qualityEligibility(point({ direction: 'lower' }), selection).reasons).toContain(
      'incompatible_direction',
    );
    const missingContract = point();
    missingContract.quality.contractSha256 = null;
    expect(qualityEligibility(missingContract, selection).reasons).toContain('missing_protocol');
  });

  it('requires every critical dimension even when the selected dimension passes', () => {
    const missing = point();
    delete missing.quality.metrics.audio_content;
    expect(qualityEligibility(missing, selection)).toMatchObject({ eligible: false, value: null });
    const failed = point();
    failed.quality.metrics.temporal_consistency = calibrated({ status: 'fail' });
    expect(qualityEligibility(failed, selection)).toMatchObject({ eligible: false, value: null });
    const partial = point();
    partial.quality.metrics.visual_fidelity = calibrated({ samples: 19 });
    expect(qualityEligibility(partial, selection).reasons).toContain('incomplete_coverage');
    const uncalibrated = point();
    uncalibrated.quality.metrics.av_sync = calibrated({ calibration: null });
    expect(qualityEligibility(uncalibrated, selection).reasons).toContain('uncalibrated');
  });

  it('keeps raw dimensions separate and applies the reader threshold only to the selected one', () => {
    const source = point();
    source.quality.metrics.audio_quality = calibrated({ value: 3 });
    expect(qualityValue(source, 'prompt_adherence')).toBe(4);
    expect(qualityValue(source, 'audio_quality')).toBe(3);
    expect(qualityEligibility(source, { ...selection, threshold: 4 }).eligible).toBe(true);
    expect(qualityEligibility(source, { metric: 'audio_quality', threshold: 4 }).eligible).toBe(
      false,
    );
  });

  it('isolates evaluator versions, calibration rules and contract revisions in frontier cohorts', () => {
    const original = qualityCohortKey(point(), 'prompt_adherence');
    expect(original).not.toBeNull();
    expect(
      qualityCohortKey(point({ evaluatorVersion: 'fixture-v2' }), 'prompt_adherence'),
    ).not.toBe(original);
    expect(
      qualityCohortKey(
        point({ calibration: { ...calibrated().calibration!, cohortId: 'other' } }),
        'prompt_adherence',
      ),
    ).not.toBe(original);
    const changedContract = point();
    changedContract.quality.contractSha256 = 'c'.repeat(64);
    expect(qualityCohortKey(changedContract, 'prompt_adherence')).not.toBe(original);
    const changedOtherDimension = point();
    changedOtherDimension.quality.metrics.audio_content = calibrated({ evaluatorVersion: 'other' });
    expect(qualityCohortKey(changedOtherDimension, 'prompt_adherence')).not.toBe(original);
    changedOtherDimension.quality.metrics.audio_content = calibrated({
      calibration: { ...calibrated().calibration!, threshold: 2 },
    });
    expect(qualityCohortKey(changedOtherDimension, 'prompt_adherence')).not.toBe(original);
  });
});
