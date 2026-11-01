import { at, number, rows, safePath, text, type Json } from './bundle';
import { caseRecords } from './compare';
import { servingCells } from './serving';
import { storedBundle, type StoredArtifact } from './stored';

export interface QualityCandidate {
  run_id: string;
  artifact_id: number;
  source_id: string;
  manifest_sha256: string;
  cell_id: string;
  slot_id: string;
  case_id: string;
  prompt: string;
  seed: number;
  media_path: string;
  media_sha256: string;
  plan_sha256: string;
}

export interface ClipQuality {
  attachmentSha256: string;
  candidate: QualityCandidate;
  reference: {
    receipt_sha256: string;
    plan_sha256: string;
    case_id: string;
    media_path: string;
    media_sha256: string;
    model_id: string;
    model_revision: string;
    implementation: 'official-diffusers-t2va';
    diffusers_revision: string;
    denoising_updates: number;
    sigma_points: number;
    url: string;
  };
  scorer: {
    name: string;
    source_revision: string;
    sha256: string;
    method: 'decoded-rgb24-all-frames';
  };
  status: 'measured' | 'identical' | 'incompatible';
  psnrDb: number | null;
  comparedFrames: number;
  totalFrames: number;
  checks: Json[];
  notes: string[];
  qualityStatus: 'unjudged';
  releaseQualified: false;
}

function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid reference pair: ${message}`);
}
const digest = (value: Json) => {
  const result = text(value);
  requireEvidence(/^[a-f0-9]{64}$/u.test(result), 'SHA256 identity');
  return result;
};
function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

const PUBLIC_CHECKS = new Set([
  'pair.valid_media',
  'pair.video.width',
  'pair.video.height',
  'pair.video.frame_count',
  'pair.video.start_time_seconds',
  'pair.video.end_time_seconds',
  'pair.audio.presence',
  'pair.audio.sample_rate_hz',
  'pair.audio.channels',
  'pair.audio.channel_names',
  'pair.audio.sample_count',
  'pair.full_stream_alignment',
]);
const publicScalar = (item: Json) => (typeof item === 'boolean' ? item : number(item));
function publicCheck(check: Json): Json {
  const name = text(at(check, 'name')),
    status = text(at(check, 'status'));
  const value = at(check, 'observed');
  // Decoder exceptions and free text stay in the sealed local attachment.
  const observed =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? {
          baseline: publicScalar(at(value, 'baseline')),
          candidate: publicScalar(at(value, 'candidate')),
        }
      : publicScalar(value);
  return {
    name: PUBLIC_CHECKS.has(name) ? name : 'pair.unspecified',
    status: ['passed', 'failed'].includes(status) ? status : 'unknown',
    observed,
  };
}

/** Pure identity/metric projection. The caller verifies receipt and media bytes before calling. */
export function verifiedReferencePairs(
  attachment: Json,
  receipts: Map<string, Json>,
  artifacts: StoredArtifact[],
  attachmentSha256: string,
): ClipQuality[] {
  requireEvidence(
    at(attachment, 'schema_version') === 1 &&
      at(attachment, 'quality_status') === 'unjudged' &&
      at(attachment, 'release_qualified') === false,
    'attachment contract',
  );
  digest(attachmentSha256);
  const scorer = at(attachment, 'scorer');
  requireEvidence(
    at(scorer, 'name') === 'evaluator.media.compare_media' &&
      at(scorer, 'method') === 'decoded-rgb24-all-frames' &&
      /^[a-f0-9]{40}$/u.test(text(at(scorer, 'source_revision'))),
    'scorer identity',
  );
  digest(at(scorer, 'sha256'));
  requireEvidence(Array.isArray(at(attachment, 'pairs')), 'pairs array');
  const seen = new Set<string>();
  return rows(at(attachment, 'pairs')).map((pair) => {
    const c = at(pair, 'candidate'),
      r = at(pair, 'reference');
    const run = text(at(c, 'run_id')),
      artifact = number(at(c, 'artifact_id'));
    const candidates = artifacts.filter(
      (saved) => saved.runId === run && saved.artifact.id === artifact,
    );
    requireEvidence(candidates.length === 1, 'candidate run/artifact');
    const sourceId = text(at(c, 'source_id'));
    const manifestSha = digest(at(c, 'manifest_sha256'));
    const sources = candidates[0].sources.filter(
      (source) =>
        source.id === sourceId &&
        !source.kind &&
        source.checksums.some(([path, sha]) => path === 'manifest.json' && sha === manifestSha),
    );
    requireEvidence(sources.length === 1, 'candidate source/manifest');
    const source = sources[0],
      cellId = text(at(c, 'cell_id'));
    const cell = servingCells(storedBundle(source)).find((item) => item.id === cellId);
    requireEvidence(cell, 'candidate cell');
    const slot = text(at(c, 'slot_id'));
    const records = caseRecords(cell).filter((record) => record.slotId === slot);
    requireEvidence(records.length === 1, 'candidate slot');
    const record = records[0];
    const mediaPath = safePath(text(at(c, 'media_path'))),
      mediaSha = digest(at(c, 'media_sha256'));
    requireEvidence(
      record.status === 'succeeded' &&
        record.valid === true &&
        record.mediaPath === mediaPath &&
        new Map(source.checksums).get(mediaPath) === mediaSha,
      'candidate media',
    );
    requireEvidence(
      record.caseId === at(c, 'case_id') &&
        record.prompt === at(c, 'prompt') &&
        record.seed === at(c, 'seed') &&
        record.caseId &&
        record.prompt &&
        record.seed !== null,
      'candidate case/prompt/seed',
    );
    const key = JSON.stringify([run, artifact, sourceId, manifestSha, cellId, slot]);
    requireEvidence(!seen.has(key), 'duplicate candidate slot');
    seen.add(key);

    const receiptSha = digest(at(r, 'receipt_sha256'));
    const receipt = receipts.get(receiptSha);
    requireEvidence(
      receipt &&
        ['selection_complete', 'failed', 'interrupted'].includes(text(at(receipt, 'status'))) &&
        at(receipt, 'quality_status') === 'unjudged' &&
        at(receipt, 'release_qualified') === false,
      'reference receipt',
    );
    const caseId = text(at(r, 'case_id'));
    requireEvidence(
      caseId === record.caseId && rows(at(receipt, 'selection')).includes(caseId),
      'reference selection',
    );
    const completed = rows(at(receipt, 'cases')).filter((item) => at(item, 'case_id') === caseId);
    requireEvidence(
      completed.length === 1 &&
        at(completed[0], 'prompt') === record.prompt &&
        at(completed[0], 'seed') === record.seed,
      'completed reference case',
    );
    const refPath = safePath(text(at(r, 'media_path'))),
      refSha = digest(at(r, 'media_sha256'));
    requireEvidence(
      refPath === `${caseId}/reference.mp4` &&
        at(completed[0], 'sha256', 'reference.mp4') === refSha,
      'reference media',
    );
    const plan = at(cell.run, 'plan'),
      referencePlan = at(receipt, 'plan');
    for (const field of ['model_id', 'model_revision', 'generation', 'fairness'])
      requireEvidence(
        at(plan, field) !== null &&
          canonical(at(plan, field)) === canonical(at(referencePlan, field)),
        `matched ${field}`,
      );
    const planCases = rows(at(plan, 'cases')).filter((item) => at(item, 'case_id') === caseId);
    const referenceCases = rows(at(referencePlan, 'cases')).filter(
      (item) => at(item, 'case_id') === caseId,
    );
    requireEvidence(
      planCases.length === 1 &&
        referenceCases.length === 1 &&
        canonical(planCases[0]) === canonical(referenceCases[0]),
      'matched plan case',
    );
    const identity = at(referencePlan, 'fairness', 'reference_identity');
    const updates = number(at(referencePlan, 'fairness', 'schedule', 'denoising_updates'));
    const sigmas = number(at(referencePlan, 'fairness', 'schedule', 'sigma_points'));
    requireEvidence(
      at(identity, 'implementation') === 'official-diffusers-t2va' &&
        at(identity, 'model_revision') === at(referencePlan, 'model_revision') &&
        /^[a-f0-9]{40}$/u.test(text(at(identity, 'diffusers_revision'))) &&
        updates !== null &&
        Number.isSafeInteger(updates) &&
        updates > 0 &&
        sigmas === updates + 1 &&
        at(referencePlan, 'generation', 'num_inference_steps') === updates,
      'reference implementation/schedule',
    );
    requireEvidence(
      at(receipt, 'runtime', 'diffusers_source', 'url') ===
        `https://github.com/huggingface/diffusers/archive/${text(at(identity, 'diffusers_revision'))}.tar.gz` &&
        at(receipt, 'model_snapshot', 'requested_revision') === at(referencePlan, 'model_revision'),
      'executed reference runtime/model',
    );
    for (const modality of ['video', 'audio']) {
      const schedule = at(receipt, 'schedule', modality);
      requireEvidence(
        at(schedule, 'updates') === updates &&
          rows(at(schedule, 'sigmas')).length === sigmas &&
          rows(at(schedule, 'sigmas')).every((value) => number(value) !== null),
        'executed reference schedule',
      );
      digest(at(schedule, 'float32_le_sha256'));
    }

    const comparison = at(pair, 'comparison'),
      metrics = at(comparison, 'metrics');
    const compatible = at(comparison, 'compatible');
    requireEvidence(typeof compatible === 'boolean', 'compatibility verdict');
    const psnr = number(at(metrics, 'video_psnr_db'));
    const identical = at(metrics, 'video_identical') === true;
    const compared = number(at(metrics, 'video_compared_frames')) ?? 0;
    const total = number(at(metrics, 'video_total_frames')) ?? 0;
    requireEvidence(
      Number.isSafeInteger(compared) &&
        Number.isSafeInteger(total) &&
        compared >= 0 &&
        total >= 0 &&
        compared <= total,
      'frame counts',
    );
    const checks = rows(at(comparison, 'checks'));
    if (compatible) {
      requireEvidence(
        Number.isSafeInteger(total) &&
          total > 0 &&
          compared === total &&
          total === at(plan, 'generation', 'frame_count') &&
          at(metrics, 'video_sample_coverage_fraction') === 1,
        'complete frame coverage',
      );
      requireEvidence(
        checks.length > 0 &&
          checks.every((check) => at(check, 'status') === 'passed') &&
          checks.some((check) => at(check, 'name') === 'pair.full_stream_alignment'),
        'full-stream compatibility checks',
      );
      requireEvidence(
        identical ? at(metrics, 'video_psnr_db') === null : psnr !== null,
        'finite PSNR or exact decoded equality',
      );
    }
    return {
      attachmentSha256,
      candidate: {
        run_id: run,
        artifact_id: artifact!,
        source_id: sourceId,
        manifest_sha256: manifestSha,
        cell_id: cellId,
        slot_id: slot,
        case_id: record.caseId,
        prompt: record.prompt,
        seed: record.seed,
        media_path: mediaPath,
        media_sha256: mediaSha,
        plan_sha256: digest(at(cell.run, 'plan_sha256')),
      },
      reference: {
        receipt_sha256: receiptSha,
        plan_sha256: digest(at(receipt, 'plan_sha256')),
        case_id: caseId,
        media_path: refPath,
        media_sha256: refSha,
        model_id: text(at(referencePlan, 'model_id')),
        model_revision: text(at(referencePlan, 'model_revision')),
        implementation: 'official-diffusers-t2va',
        diffusers_revision: text(at(identity, 'diffusers_revision')),
        denoising_updates: updates,
        sigma_points: sigmas,
        url: '',
      },
      scorer: {
        name: text(at(scorer, 'name')),
        source_revision: text(at(scorer, 'source_revision')),
        sha256: text(at(scorer, 'sha256')),
        method: 'decoded-rgb24-all-frames',
      },
      status: compatible ? (identical ? 'identical' : 'measured') : 'incompatible',
      psnrDb: compatible && !identical ? psnr : null,
      comparedFrames: compared,
      totalFrames: total,
      checks: checks.map(publicCheck),
      notes: [compatible ? 'complete-stream-comparison' : 'incompatible-media'],
      qualityStatus: 'unjudged',
      releaseQualified: false,
    };
  });
}
