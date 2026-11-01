import { at, type Json } from './bundle';
import { servingFixture } from './serving.fixture';
import type { StoredArtifact } from './stored';

/** Test-only sealed-pair metadata. No media bytes or measured results. */
export function referenceQualityFixture(
  requests = 4,
  runId = '123',
  artifactId = 7,
  manifestSha256 = 'a'.repeat(64),
) {
  const fixture = servingFixture(runId, 'NVIDIA H200', requests);
  const fairness = {
    reference_identity: {
      implementation: 'official-diffusers-t2va',
      diffusers_revision: 'd'.repeat(40),
      model_revision: 'a'.repeat(40),
    },
    schedule: { sigma_points: 51, denoising_updates: 50 },
  };
  for (const document of fixture.documents.values()) {
    const plan = at(document, 'plan');
    if (plan && typeof plan === 'object' && !Array.isArray(plan)) plan.fairness = fairness;
  }
  const manifestPlan = at(fixture.manifest, 'workload_plan');
  if (manifestPlan && typeof manifestPlan === 'object' && !Array.isArray(manifestPlan))
    manifestPlan.fairness = fairness;
  fixture.documents.set('manifest.json', fixture.manifest);
  if (fixture.ci && typeof fixture.ci === 'object' && !Array.isArray(fixture.ci))
    fixture.ci.release_qualified = false;
  fixture.documents.set('ci.json', fixture.ci);
  fixture.checksums.set('manifest.json', manifestSha256);
  const stored: StoredArtifact = {
    storageVersion: 1,
    runId,
    artifact: { id: artifactId, name: `h3-results-${runId}-1`, expired: false, size_in_bytes: 1 },
    sources: [
      {
        id: runId,
        documents: [...fixture.documents],
        checksums: [...fixture.checksums],
        assets: [],
        texts: [],
      },
    ],
  };
  const plan = structuredClone(at(fixture.documents.get('gpu/c1/baseline/run.json'), 'plan'));
  const caseValue = at(plan, 'cases', 0);
  const receipt = {
    status: 'selection_complete',
    quality_status: 'unjudged',
    release_qualified: false,
    runtime: {
      diffusers_source: {
        url: `https://github.com/huggingface/diffusers/archive/${'d'.repeat(40)}.tar.gz`,
      },
    },
    model_snapshot: { requested_revision: 'a'.repeat(40) },
    schedule: Object.fromEntries(
      ['video', 'audio'].map((modality) => [
        modality,
        {
          updates: 50,
          sigmas: Array.from({ length: 51 }, (_, i) => 1 - i / 50),
          float32_le_sha256: '2'.repeat(64),
        },
      ]),
    ),
    plan,
    plan_sha256: 'b'.repeat(64),
    selection: ['drum-taps'],
    cases: [
      { ...(caseValue as Record<string, Json>), sha256: { 'reference.mp4': 'c'.repeat(64) } },
    ],
  };
  const referenceSha = 'd'.repeat(64);
  const attachment = {
    schema_version: 1,
    quality_status: 'unjudged',
    release_qualified: false,
    scorer: {
      name: 'evaluator.media.compare_media',
      source_revision: 'e'.repeat(40),
      sha256: 'f'.repeat(64),
      method: 'decoded-rgb24-all-frames',
    },
    references: [
      {
        receipt_path: '/private/reference.json',
        receipt_sha256: referenceSha,
        checksums_sha256: '1'.repeat(64),
      },
    ],
    pairs: [
      {
        candidate: {
          run_id: runId,
          artifact_id: artifactId,
          source_id: runId,
          manifest_sha256: manifestSha256,
          cell_id: 'c1',
          slot_id: 'measurement-r001-c001',
          case_id: 'drum-taps',
          prompt: 'A drummer taps a snare drum.',
          seed: 11,
          media_path: 'gpu/c1/baseline/artifacts/measurement-r001-c001.mp4',
          media_sha256: 'e11'.padEnd(64, '0'),
        },
        reference: {
          receipt_sha256: referenceSha,
          case_id: 'drum-taps',
          media_path: 'drum-taps/reference.mp4',
          media_sha256: 'c'.repeat(64),
        },
        comparison: {
          compatible: true,
          metrics: {
            video_psnr_db: 25,
            video_identical: false,
            video_compared_frames: 107,
            video_total_frames: 107,
            video_sample_coverage_fraction: 1,
          },
          checks: [{ name: 'pair.full_stream_alignment', status: 'passed' }],
          notes: [],
        },
      },
    ],
  };
  return {
    stored,
    receipt,
    attachment,
    referenceSha,
    receipts: new Map([[referenceSha, receipt as Json]]),
  };
}
