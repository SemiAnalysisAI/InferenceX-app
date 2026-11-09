import { at, canonical, number, rows, safePath, sha256, text, type Json } from './bundle';
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
    /** Stored original MP4; empty when the reference is not published, as for a live run. */
    url: string;
    /** Web playback rendition of `url`, attached at read time. */
    previewUrl?: string;
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

export function originalQualityCandidate(c: Json, artifacts: StoredArtifact[]) {
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
  return {
    run,
    artifact,
    sourceId,
    manifestSha,
    source,
    cellId,
    cell,
    slot,
    record: { ...record, caseId: record.caseId, prompt: record.prompt, seed: record.seed },
    mediaPath,
    mediaSha,
  };
}

export function pairedMediaMetrics(
  comparison: Json,
  expectedFrames: Json,
): Pick<
  ClipQuality,
  | 'status'
  | 'psnrDb'
  | 'comparedFrames'
  | 'totalFrames'
  | 'checks'
  | 'notes'
  | 'qualityStatus'
  | 'releaseQualified'
> {
  const metrics = at(comparison, 'metrics');
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
        total === expectedFrames &&
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
    status: compatible ? (identical ? 'identical' : 'measured') : 'incompatible',
    psnrDb: compatible && !identical ? psnr : null,
    comparedFrames: compared,
    totalFrames: total,
    checks: checks.map(publicCheck),
    notes: [compatible ? 'complete-stream-comparison' : 'incompatible-media'],
    qualityStatus: 'unjudged',
    releaseQualified: false,
  };
}

const UNSCORED_REASONS = [
  'invalid_candidate',
  'checksum_mismatch',
  'no_reference',
  'settings_mismatch',
] as const;
export type UnscoredReason = (typeof UNSCORED_REASONS)[number];
const isUnscoredReason = (value: string): value is UnscoredReason =>
  (UNSCORED_REASONS as readonly string[]).includes(value);
const PLAN_FIELDS = ['model_id', 'model_revision', 'generation', 'fairness'];
const CASE_FIELDS = ['case_id', 'prompt', 'seed', 'requires_motion', 'requires_sound'];

/** A measured clip the scorer listed without comparing it. */
export interface UnscoredClip {
  candidate: Pick<QualityCandidate, 'source_id' | 'manifest_sha256' | 'cell_id' | 'slot_id'>;
  reason: UnscoredReason;
  /** Plan or case fields that differ from the reference, for `settings_mismatch`. */
  fields: string[];
}

/** One stored artifact's share of a quality attachment; `unreadable` when the scorer could not read it. */
export interface ArtifactQuality {
  pairs: ClipQuality[];
  unscored: UnscoredClip[];
  unreadable: boolean;
}

/** Reads an h3-quality artifact: SHA256SUMS seals quality.json and the descriptor it names. */
export async function verifiedQualityFiles(read: (name: string) => Blob | undefined) {
  const inventory = read('SHA256SUMS');
  requireEvidence(inventory, 'quality checksum inventory');
  const sums = new Map<string, string>();
  const listing = await inventory.text();
  for (const line of listing.trimEnd().split('\n')) {
    const match = /^(?<sha>[a-f0-9]{64}) {2}(?<name>[\w.-]+)$/u.exec(line);
    requireEvidence(match && !sums.has(match.groups!.name), 'quality checksum inventory');
    sums.set(match.groups!.name, match.groups!.sha);
  }
  const sealed = async (name: string) => {
    const blob = read(name);
    requireEvidence(blob && sums.get(name) === (await sha256(blob)), `${name} seal`);
    return { json: JSON.parse(await blob.text()) as Json, sha256: sums.get(name)! };
  };
  const quality = await sealed('quality.json');
  const name = text(at(quality.json, 'references', 'descriptor'));
  requireEvidence(/^[\w-]+\.json$/u.test(name) && name !== 'quality.json', 'descriptor name');
  const descriptor = await sealed(name);
  requireEvidence(
    at(quality.json, 'references', 'descriptor_sha256') === descriptor.sha256,
    'descriptor SHA256',
  );
  return {
    attachment: quality.json,
    descriptor: descriptor.json,
    attachmentSha256: quality.sha256,
  };
}

/**
 * Pure identity/metric projection of one stored artifact's pairs against the public reference
 * descriptor. The caller verifies the file seals with `verifiedQualityFiles` first.
 */
export function verifiedQuality(
  attachment: Json,
  descriptor: Json,
  saved: StoredArtifact,
  attachmentSha256: string,
): ArtifactQuality {
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
  requireEvidence(
    at(descriptor, 'schema_version') === 1 &&
      text(at(descriptor, 'release', 'repository')) !== '' &&
      text(at(descriptor, 'release', 'tag')) !== '' &&
      canonical(at(descriptor, 'release')) === canonical(at(attachment, 'references', 'release')),
    'reference release',
  );
  const identity = at(descriptor, 'fairness', 'reference_identity');
  const updates = number(at(descriptor, 'fairness', 'schedule', 'denoising_updates'));
  const sigmas = number(at(descriptor, 'fairness', 'schedule', 'sigma_points'));
  requireEvidence(
    at(identity, 'implementation') === 'official-diffusers-t2va' &&
      at(identity, 'model_revision') === at(descriptor, 'model_revision') &&
      /^[a-f0-9]{40}$/u.test(text(at(identity, 'diffusers_revision'))) &&
      updates !== null &&
      Number.isSafeInteger(updates) &&
      updates > 0 &&
      sigmas === updates + 1 &&
      at(descriptor, 'generation', 'num_inference_steps') === updates,
    'reference implementation/schedule',
  );
  const cases = rows(at(descriptor, 'cases'));
  const ours = (item: Json) =>
    at(item, 'candidate', 'run_id') === saved.runId &&
    at(item, 'candidate', 'artifact_id') === saved.artifact.id;
  const seen = new Set<string>();
  const pairs = rows(at(attachment, 'pairs'))
    .filter(ours)
    .map((pair): ClipQuality => {
      const c = at(pair, 'candidate'),
        r = at(pair, 'reference');
      const {
        run,
        artifact,
        sourceId,
        manifestSha,
        cellId,
        cell,
        slot,
        record,
        mediaPath,
        mediaSha,
      } = originalQualityCandidate(c, [saved]);
      const key = JSON.stringify([sourceId, manifestSha, cellId, slot]);
      requireEvidence(!seen.has(key), 'duplicate candidate slot');
      seen.add(key);

      const caseId = text(at(r, 'case_id'));
      const matches = cases.filter((item) => at(item, 'case_id') === caseId);
      requireEvidence(matches.length === 1 && caseId === record.caseId, 'reference case');
      const reference = matches[0];
      const refPath = safePath(text(at(r, 'media_path'))),
        refSha = digest(at(r, 'media_sha256')),
        bytes = number(at(reference, 'bytes'));
      requireEvidence(
        refPath === `${caseId}.mp4` &&
          at(reference, 'asset') === refPath &&
          at(reference, 'sha256') === refSha &&
          bytes !== null &&
          Number.isSafeInteger(bytes) &&
          bytes > 0,
        'reference media',
      );
      const receiptSha = digest(at(r, 'receipt_sha256'));
      requireEvidence(at(reference, 'receipt_sha256') === receiptSha, 'reference receipt');
      const plan = at(cell.run, 'plan');
      for (const field of PLAN_FIELDS)
        requireEvidence(
          at(plan, field) !== null &&
            canonical(at(plan, field)) === canonical(at(descriptor, field)),
          `matched ${field}`,
        );
      const planned = rows(at(plan, 'cases')).filter((item) => at(item, 'case_id') === caseId);
      requireEvidence(planned.length === 1, 'matched plan case');
      const recorded: Json = {
        ...(planned[0] as Record<string, Json>),
        case_id: record.caseId,
        prompt: record.prompt,
        seed: record.seed,
      };
      for (const field of CASE_FIELDS)
        requireEvidence(
          canonical(at(recorded, field)) === canonical(at(reference, field)),
          `matched case ${field}`,
        );

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
          plan_sha256: digest(at(reference, 'plan_sha256')),
          case_id: caseId,
          media_path: refPath,
          media_sha256: refSha,
          model_id: text(at(descriptor, 'model_id')),
          model_revision: text(at(descriptor, 'model_revision')),
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
        ...pairedMediaMetrics(at(pair, 'comparison'), at(plan, 'generation', 'frame_count')),
      };
    });
  const unscored = rows(at(attachment, 'unscored'))
    .filter(ours)
    .flatMap((item): UnscoredClip[] => {
      const reason = text(at(item, 'reason'));
      // A reason added by a newer scorer leaves its clip unlabeled instead of dropping every pair.
      if (!isUnscoredReason(reason)) return [];
      const c = at(item, 'candidate');
      return [
        {
          candidate: {
            source_id: text(at(c, 'source_id')),
            manifest_sha256: text(at(c, 'manifest_sha256')),
            cell_id: text(at(c, 'cell_id')),
            slot_id: text(at(c, 'slot_id')),
          },
          reason,
          fields: rows(at(item, 'fields'))
            .map(text)
            .filter((field) => PLAN_FIELDS.includes(field) || CASE_FIELDS.includes(field)),
        },
      ];
    });
  return {
    pairs,
    unscored,
    unreadable: rows(at(attachment, 'unreadable')).some(
      (item) => at(item, 'artifact_id') === saved.artifact.id,
    ),
  };
}
