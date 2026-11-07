import { at, type Json } from './bundle';
import { servingFixture } from './serving.fixture';
import type { StoredArtifact } from './stored';

/** Test-only quality attachment and reference descriptor. No media bytes or measured results. */
export function referenceQualityFixture(
  requests = 4,
  runId = '123',
  artifactId = 7,
  manifestSha256 = 'a'.repeat(64),
  hardware = 'NVIDIA H200',
) {
  const fixture = servingFixture(runId, hardware, requests);
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
  const release = { repository: 'SemiAnalysisAI/InferenceX', tag: 'h3-v2-release-v1-references' };
  const descriptor = {
    schema_version: 1,
    release,
    model_id: at(plan, 'model_id'),
    model_revision: at(plan, 'model_revision'),
    generation: at(plan, 'generation'),
    fairness: at(plan, 'fairness'),
    cases: [
      {
        ...(caseValue as Record<string, Json>),
        asset: 'drum-taps.mp4',
        sha256: 'c'.repeat(64),
        bytes: 1024,
        receipt_sha256: 'd'.repeat(64),
        plan_sha256: 'b'.repeat(64),
      },
    ],
  };
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
    references: { descriptor: 'h3-v2.json', descriptor_sha256: '1'.repeat(64), release },
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
          receipt_sha256: 'd'.repeat(64),
          case_id: 'drum-taps',
          media_path: 'drum-taps.mp4',
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
    unscored: [] as Json[],
    unreadable: [] as Json[],
  };
  return { stored, descriptor, attachment, plan };
}
