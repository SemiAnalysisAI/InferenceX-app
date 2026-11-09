import { describe, expect, it } from 'vitest';
import { sha256 } from './bundle';
import { referenceQualityFixture } from './reference-quality.fixture';
import { verifiedQuality, verifiedQualityFiles } from './reference-quality';

describe('sealed per-clip reference pairs', () => {
  it('keeps pairs, unscored clips and unreadable bundles isolated across same-run artifacts', () => {
    const f = referenceQualityFixture();
    const second = structuredClone(f.stored);
    second.artifact.id = 8;
    const pair = structuredClone(f.attachment.pairs[0]);
    pair.candidate.artifact_id = 8;
    pair.comparison.metrics.video_psnr_db = 29;
    f.attachment.pairs.push(pair);
    f.attachment.unscored.push(
      {
        candidate: { ...pair.candidate, slot_id: 'measurement-r002-c001' },
        reason: 'settings_mismatch',
        fields: ['generation', '/private/field'],
      },
      {
        candidate: { ...f.attachment.pairs[0].candidate, slot_id: 'measurement-r003-c001' },
        reason: 'reason_from_a_newer_scorer',
        fields: [],
      },
    );
    f.attachment.unreadable.push({ run_id: '123', artifact_id: 9, error: 'KeyError' });
    const first = verifiedQuality(f.attachment, f.descriptor, f.stored, '9'.repeat(64));
    const other = verifiedQuality(f.attachment, f.descriptor, second, '9'.repeat(64));
    expect(first.pairs.map((item) => item.psnrDb)).toEqual([25]);
    expect(first.unscored).toEqual([]);
    expect(other.pairs.map((item) => item.psnrDb)).toEqual([29]);
    expect(other.unscored).toEqual([
      {
        candidate: {
          source_id: '123',
          manifest_sha256: 'a'.repeat(64),
          cell_id: 'c1',
          slot_id: 'measurement-r002-c001',
        },
        reason: 'settings_mismatch',
        fields: ['generation'],
      },
    ]);
    expect([first.unreadable, other.unreadable]).toEqual([false, false]);
    second.artifact.id = 9;
    expect(verifiedQuality(f.attachment, f.descriptor, second, '9'.repeat(64))).toEqual({
      pairs: [],
      unscored: [],
      unreadable: true,
    });
    expect(first.pairs[0]).toMatchObject({
      status: 'measured',
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
        receipt_sha256: 'd'.repeat(64),
        plan_sha256: 'b'.repeat(64),
        media_path: 'drum-taps.mp4',
        implementation: 'official-diffusers-t2va',
        denoising_updates: 50,
        sigma_points: 51,
        url: '',
      },
      qualityStatus: 'unjudged',
      releaseQualified: false,
    });
  });
  it.each([
    'source',
    'manifest',
    'path',
    'sha',
    'case',
    'prompt',
    'seed',
    'duplicate',
    'reference',
    'reference path',
    'receipt',
    'model',
    'generation',
    'fairness',
    'cases',
  ])('rejects %s substitution or ambiguity', (defect) => {
    const f = referenceQualityFixture();
    const pair = f.attachment.pairs[0];
    const descriptor = f.descriptor as Record<string, unknown>;
    if (defect === 'source') pair.candidate.source_id = '124';
    if (defect === 'manifest') pair.candidate.manifest_sha256 = '0'.repeat(64);
    if (defect === 'path') pair.candidate.media_path = 'another.mp4';
    if (defect === 'sha') pair.candidate.media_sha256 = '0'.repeat(64);
    if (defect === 'case') pair.candidate.case_id = 'another';
    if (defect === 'prompt') pair.candidate.prompt = 'A different prompt';
    if (defect === 'seed') pair.candidate.seed = 12;
    if (defect === 'duplicate') f.attachment.pairs.push(structuredClone(pair));
    if (defect === 'reference') pair.reference.media_sha256 = '0'.repeat(64);
    if (defect === 'reference path') pair.reference.media_path = 'drum-taps/reference.mp4';
    if (defect === 'receipt') pair.reference.receipt_sha256 = '0'.repeat(64);
    if (defect === 'model') descriptor.model_id = 'other/model';
    if (defect === 'generation')
      descriptor.generation = { ...(descriptor.generation as object), frame_count: 999 };
    if (defect === 'fairness')
      descriptor.fairness = { ...(descriptor.fairness as object), conditioning_cache: 'enabled' };
    if (defect === 'cases') f.descriptor.cases = [];
    expect(() => verifiedQuality(f.attachment, f.descriptor, f.stored, '9'.repeat(64))).toThrow();
  });
  it('represents exact decoded equality explicitly and rejects incomplete/nonfinite scores', () => {
    const f = referenceQualityFixture();
    const metrics = f.attachment.pairs[0].comparison.metrics;
    const verify = () => verifiedQuality(f.attachment, f.descriptor, f.stored, '9'.repeat(64));
    metrics.video_identical = true;
    Object.assign(metrics, { video_psnr_db: null });
    expect(verify().pairs[0]).toMatchObject({ status: 'identical', psnrDb: null });
    metrics.video_compared_frames = 106;
    expect(verify).toThrow();
    metrics.video_compared_frames = 107;
    metrics.video_identical = false;
    metrics.video_psnr_db = Infinity;
    expect(verify).toThrow();
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
    const [quality] = verifiedQuality(f.attachment, f.descriptor, f.stored, '9'.repeat(64)).pairs;
    expect(JSON.stringify(quality)).not.toContain('/private/');
    expect(quality.checks).toEqual([
      {
        name: 'pair.full_stream_alignment',
        status: 'failed',
        observed: { baseline: true, candidate: false },
      },
    ]);
    expect(quality.notes).toEqual(['incompatible-media']);
    expect(quality.status).toBe('incompatible');
    expect(quality.psnrDb).toBeNull();
  });
});

async function files(defect: string | null) {
  const f = referenceQualityFixture();
  let descriptor = JSON.stringify(f.descriptor);
  f.attachment.references.descriptor_sha256 = await sha256(new Blob([descriptor]));
  if (defect === 'descriptor_sha256') f.attachment.references.descriptor_sha256 = '0'.repeat(64);
  let quality = JSON.stringify(f.attachment);
  const sums = `${await sha256(new Blob([descriptor]))}  h3-v2.json\n${await sha256(new Blob([quality]))}  quality.json\n`;
  if (defect === 'quality.json')
    quality = quality.replace('"video_psnr_db":25', '"video_psnr_db":45');
  if (defect === 'descriptor') descriptor = descriptor.replace('"bytes":1024', '"bytes":1');
  const contents = new Map([
    ['SHA256SUMS', sums],
    ['quality.json', quality],
    ['h3-v2.json', descriptor],
  ]);
  return (name: string) => {
    const value = contents.get(name);
    return value === undefined ? undefined : new Blob([value]);
  };
}

describe('h3-quality artifact seals', () => {
  it('reads quality.json and the descriptor it names when SHA256SUMS seals both', async () => {
    const { descriptor, attachment } = await verifiedQualityFiles(await files(null));
    expect(descriptor).toMatchObject({ release: { tag: 'h3-v2-release-v1-references' } });
    expect(attachment).toMatchObject({ references: { descriptor: 'h3-v2.json' } });
  });
  it.each(['quality.json', 'descriptor', 'descriptor_sha256'])(
    'rejects a tampered %s',
    async (defect) => {
      await expect(verifiedQualityFiles(await files(defect))).rejects.toThrow(
        'Invalid reference pair',
      );
    },
  );
});
