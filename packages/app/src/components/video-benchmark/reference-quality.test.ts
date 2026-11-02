import { describe, expect, it } from 'vitest';
import { at } from './bundle';
import { referenceQualityFixture } from './reference-quality.fixture';
import { verifiedReferencePairs } from './reference-quality';

describe('sealed per-clip reference pairs', () => {
  it('binds a score to its exact source and preserves independent original plan hashes', () => {
    const f = referenceQualityFixture();
    const referenceCases = at(f.receipt, 'plan', 'cases');
    if (Array.isArray(referenceCases))
      referenceCases.push({ case_id: 'unrelated', requires_motion: false });
    const [quality] = verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64));
    expect(quality).toMatchObject({
      status: 'measured',
      psnrDb: 25,
      comparedFrames: 107,
      totalFrames: 107,
      candidate: {
        run_id: '123',
        artifact_id: 7,
        source_id: '123',
        slot_id: 'measurement-r001-c001',
        plan_sha256: 'f'.padEnd(64, '0'),
      },
      reference: {
        receipt_sha256: f.referenceSha,
        plan_sha256: 'b'.repeat(64),
        implementation: 'official-diffusers-t2va',
      },
      qualityStatus: 'unjudged',
      releaseQualified: false,
    });
    expect(JSON.stringify(quality)).not.toContain('/private/');
  });
  it('keeps two same-run artifacts with identical source/path isolated', () => {
    const f = referenceQualityFixture();
    const second = structuredClone(f.stored);
    second.artifact.id = 8;
    const pair = structuredClone(f.attachment.pairs[0]);
    pair.candidate.artifact_id = 8;
    pair.comparison.metrics.video_psnr_db = 29;
    f.attachment.pairs.push(pair);
    expect(
      verifiedReferencePairs(f.attachment, f.receipts, [f.stored, second], '9'.repeat(64)).map(
        (p) => [p.candidate.artifact_id, p.psnrDb],
      ),
    ).toEqual([
      [7, 25],
      [8, 29],
    ]);
  });
  it.each([
    'artifact',
    'source',
    'manifest',
    'path',
    'sha',
    'case',
    'prompt',
    'seed',
    'duplicate',
    'reference',
    'model',
    'generation',
    'fairness',
  ])('rejects %s substitution or ambiguity', (defect) => {
    const f = referenceQualityFixture();
    const pair = f.attachment.pairs[0];
    if (defect === 'artifact') pair.candidate.artifact_id = 8;
    if (defect === 'source') pair.candidate.source_id = '124';
    if (defect === 'manifest') pair.candidate.manifest_sha256 = '0'.repeat(64);
    if (defect === 'path') pair.candidate.media_path = 'another.mp4';
    if (defect === 'sha') pair.candidate.media_sha256 = '0'.repeat(64);
    if (defect === 'case') pair.candidate.case_id = 'another';
    if (defect === 'prompt') pair.candidate.prompt = 'A different prompt';
    if (defect === 'seed') pair.candidate.seed = 12;
    if (defect === 'duplicate') f.attachment.pairs.push(structuredClone(pair));
    if (defect === 'reference') pair.reference.media_sha256 = '0'.repeat(64);
    const key = defect === 'model' ? 'model_revision' : defect;
    if (['model', 'generation', 'fairness'].includes(defect)) {
      const plan = at(f.receipt, 'plan');
      if (plan && typeof plan === 'object' && !Array.isArray(plan)) plan[key] = 'changed';
    }
    expect(() =>
      verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64)),
    ).toThrow();
  });
  it('retains missing pairs and incompatible scores without inventing a number', () => {
    const f = referenceQualityFixture();
    f.attachment.pairs[0].comparison.compatible = false;
    const result = verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: 'incompatible', psnrDb: null });
    f.attachment.pairs = [];
    expect(verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64))).toEqual(
      [],
    );
  });
  it('represents exact decoded equality explicitly and rejects incomplete/nonfinite scores', () => {
    const f = referenceQualityFixture();
    const metrics = f.attachment.pairs[0].comparison.metrics;
    metrics.video_identical = true;
    Object.assign(metrics, { video_psnr_db: null });
    expect(
      verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64))[0],
    ).toMatchObject({ status: 'identical', psnrDb: null });
    metrics.video_compared_frames = 106;
    expect(() =>
      verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64)),
    ).toThrow();
    metrics.video_compared_frames = 107;
    metrics.video_identical = false;
    metrics.video_psnr_db = Infinity;
    expect(() =>
      verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64)),
    ).toThrow();
  });
  it('keeps decoder paths and free-text exceptions in the private attachment', () => {
    const f = referenceQualityFixture();
    Object.assign(f.attachment.pairs[0].comparison, {
      compatible: false,
      checks: [
        {
          name: 'pair.full_stream_alignment',
          status: 'failed',
          observed: {
            error: '/private/reference.mp4: decoder failed',
            baseline: true,
            candidate: false,
          },
          detail: '/private/candidate.mp4',
        },
      ],
      notes: ['/private/reference.mp4: FFmpeg error'],
    });
    const [quality] = verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64));
    expect(JSON.stringify(quality)).not.toContain('/private/');
    expect(quality.checks).toEqual([
      {
        name: 'pair.full_stream_alignment',
        status: 'failed',
        observed: { baseline: true, candidate: false },
      },
    ]);
    expect(quality.notes).toEqual(['incompatible-media']);
    expect(quality.psnrDb).toBeNull();
  });
  it('requires retained completed cases and the executed pinned reference runtime', () => {
    const f = referenceQualityFixture();
    f.receipt.status = 'failed';
    expect(
      verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64))[0].status,
    ).toBe('measured');
    f.receipt.runtime.diffusers_source.url = 'https://example.test/unrelated-runtime';
    expect(() =>
      verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64)),
    ).toThrow('executed reference runtime');
    f.receipt.cases = [];
    expect(() =>
      verifiedReferencePairs(f.attachment, f.receipts, [f.stored], '9'.repeat(64)),
    ).toThrow('completed reference case');
  });
});
