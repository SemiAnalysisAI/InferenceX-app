import { describe, expect, it } from 'vitest';
import { parseVideoObservationFields } from './observation-projection';
import { qualityEligibility } from './quality';

// Synthetic complete judgement exercises ingestion; no retained clip was judged.
function judgement() {
  const metric = {
    value: 4,
    status: 'pass',
    direction: 'higher',
    evaluatorId: 'fixture-human',
    evaluatorVersion: 'v1',
    evaluatorSha256: 'c'.repeat(64),
    samples: 20,
    total: 20,
    calibration: {
      status: 'calibrated',
      cohortId: 'fixture-calibration',
      threshold: 3,
      provenance: 'fixture://rule',
      frozenAt: '2026-09-01T00:00:00Z',
    },
  };
  return {
    scale: 'ordinal_0_to_4',
    contractId: 'fixture-contract',
    contractSha256: 'a'.repeat(64),
    rubricVersion: 'fixture-rubric',
    rubricSha256: 'b'.repeat(64),
    metrics: {
      prompt_adherence: { ...metric },
      visual_fidelity: { ...metric },
      temporal_consistency: { ...metric },
      motion_plausibility: { ...metric },
      audio_quality: { ...metric },
      audio_content: { ...metric },
      av_sync: { ...metric },
    },
  };
}
describe('dashboard observation runtime shape', () => {
  it('preserves zero, null and failed raw scores in the canonical scale', () => {
    const quality = judgement();
    Object.assign(quality.metrics.visual_fidelity, { value: 0, status: 'fail' });
    Object.assign(quality.metrics.audio_content, {
      value: null,
      status: 'unjudged',
      calibration: null,
    });
    const parsed = parseVideoObservationFields({ quality });
    expect(parsed.quality).toEqual(quality);
    expect(
      qualityEligibility(parsed, { metric: 'prompt_adherence', threshold: null }).eligible,
    ).toBe(false);
  });
  it.each([undefined, 'ordinal_1_to_5'])('rejects a missing or legacy scale: %s', (scale) => {
    expect(() => parseVideoObservationFields({ quality: { ...judgement(), scale } })).toThrow(
      'dashboard observation',
    );
  });
  it('keeps missing deployment, health and quality null', () => {
    expect(parseVideoObservationFields({})).toEqual({
      deployment: null,
      hardwareHealth: null,
      quality: null,
    });
    expect(
      parseVideoObservationFields({ deployment: { ring: null, batchSize: null } }).deployment,
    ).toMatchObject({ ring: null, batchSize: null, maxBatchSize: null });
  });
  it('carries complete protocol evidence through the same quality eligibility function', () => {
    const parsed = parseVideoObservationFields({ quality: judgement() });
    expect(parsed.quality).toEqual(judgement());
    expect(
      qualityEligibility({ ...parsed, samples: 20 }, { metric: 'prompt_adherence', threshold: 4 })
        .eligible,
    ).toBe(true);
    expect(
      qualityEligibility({ ...parsed, samples: 21 }, { metric: 'prompt_adherence', threshold: 4 })
        .eligible,
    ).toBe(false);
  });
  it.each([
    { deployment: { replicas: 1 } },
    { deployment: { ring: '2' } },
    { deployment: { cfg: 0 } },
    { deployment: { batchSize: 1.5 } },
    { deployment: { batchDelayMs: -1 } },
    { deployment: { offload: { ditCpu: 'false' } } },
    { hardwareHealth: { status: 'healthy' } },
    {
      quality: {
        ...judgement(),
        metrics: { universal_quality: judgement().metrics.prompt_adherence },
      },
    },
    { quality: { ...judgement(), contractSha256: 'not-a-hash' } },
  ])('rejects malformed or invented projection fields: %j', (value) => {
    expect(() => parseVideoObservationFields(value)).toThrow('dashboard observation');
  });
  it('does not promote unjudged or uncalibrated data during shape parsing', () => {
    const quality = judgement();
    Object.assign(quality.metrics.prompt_adherence, {
      value: null,
      status: 'unjudged',
      calibration: null,
    });
    const parsed = parseVideoObservationFields({ quality });
    expect(
      qualityEligibility(parsed, { metric: 'prompt_adherence', threshold: null }),
    ).toMatchObject({ eligible: false, value: null });
  });
});
