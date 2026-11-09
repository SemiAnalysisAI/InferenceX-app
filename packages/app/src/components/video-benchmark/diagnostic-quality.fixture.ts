import { at, type Json } from './bundle';
import { referenceQualityFixture } from './reference-quality.fixture';

const descriptor = (name: string, sha: string) => ({
  receipt_path: `/private/${name}/diagnostic.json`,
  receipt_sha256: sha,
  checksums_sha256: 'e'.repeat(64),
});

export function diagnosticQualityFixture(
  hardware = 'h200',
  artifactId = 7,
  manifest = 'a'.repeat(64),
  requests = 4,
) {
  const original = referenceQualityFixture(
    requests,
    '123',
    artifactId,
    manifest,
    `NVIDIA ${hardware.toUpperCase()}`,
  );
  const { plan } = original;
  const noise = {
    video: {
      raw_sha256: '1'.repeat(64),
      file_sha256: '2'.repeat(64),
      dtype: 'float32',
      shape: [1, 4],
      file_shape: [1, 4],
      file_dtype: 'float32',
      transform: 'identity',
    },
    audio: {
      raw_sha256: '3'.repeat(64),
      file_sha256: '4'.repeat(64),
      dtype: 'float32',
      shape: [1, 2],
      file_shape: [1, 2],
      file_dtype: 'float32',
      transform: 'identity',
    },
  };
  const candidate = {
    schema_version: 1,
    kind: 'matched-noise-clip',
    role: 'candidate',
    status: 'complete',
    quality_status: 'unjudged',
    release_qualified: false,
    run_id: 'native-candidate',
    hardware_key: hardware,
    gpu_count: 4,
    topology: { ulysses_degree: 2, tensor_parallel_degree: 2 },
    plan,
    plan_sha256: '5'.repeat(64),
    case_id: 'drum-taps',
    prompt: 'A drummer taps a snare drum.',
    seed: 11,
    source_revision: '6'.repeat(40),
    harness_sha256: '6'.repeat(64),
    runtime_name: 'sglang',
    runtime_revision: '7'.repeat(40),
    image_digest: `sha256:${'8'.repeat(64)}`,
    effective_settings_sha256: '9'.repeat(64),
    noise,
    ranks: Array.from({ length: 4 }, (_, rank) => ({
      rank,
      video_raw_sha256: noise.video.raw_sha256,
      audio_raw_sha256: noise.audio.raw_sha256,
      video_file_sha256: noise.video.file_sha256,
      audio_file_sha256: noise.audio.file_sha256,
    })),
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
    media: { path: 'drum-taps/candidate.mp4', sha256: '0'.repeat(64) },
    evidence: [{ path: 'native.json', sha256: 'a'.repeat(64) }],
  };
  const reference = {
    ...structuredClone(candidate),
    role: 'reference',
    run_id: 'native-reference',
    gpu_count: 1,
    topology: { ulysses_degree: 1, tensor_parallel_degree: 1 },
    runtime_name: 'official-diffusers-t2va',
    image_digest: null,
    runtime_revision: String(at(plan, 'fairness', 'reference_identity', 'diffusers_revision')),
    ranks: [candidate.ranks[0]],
    media: { path: 'drum-taps/reference.mp4', sha256: 'b'.repeat(64) },
  };
  const candidateSha = 'c'.repeat(64),
    referenceSha = 'd'.repeat(64);

  const attachment = {
    schema_version: 1,
    kind: 'matched-noise-diagnostic',
    quality_status: 'unjudged',
    release_qualified: false,
    scorer: original.attachment.scorer,
    pairs: [
      {
        origin: original.attachment.pairs[0].candidate,
        candidate: descriptor('candidate', candidateSha),
        reference: descriptor('reference', referenceSha),
        comparison: original.attachment.pairs[0].comparison,
      },
    ],
  };
  return {
    original,
    candidate,
    reference,
    candidateSha,
    referenceSha,
    attachment,
    receipts: new Map<string, Json>([
      [candidateSha, candidate],
      [referenceSha, reference],
    ]),
  };
}
