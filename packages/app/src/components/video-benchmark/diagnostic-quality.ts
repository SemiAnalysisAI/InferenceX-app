import { at, number, rows, safePath, text, type Json } from './bundle';
import { videoHistoryEntry } from './history';
import { namedRunPoints } from './points';
import {
  originalQualityCandidate,
  pairedMediaMetrics,
  type ClipQuality,
  type QualityCandidate,
} from './reference-quality';
import type { StoredArtifact } from './stored';

export interface DiagnosticCandidate {
  run_id: string;
  receipt_sha256: string;
  plan_sha256: string;
  hardware_key: string;
  gpu_count: number;
  topology: { ulysses_degree: number; tensor_parallel_degree: number };
  runtime_name: string;
  runtime_revision: string;
  source_revision: string;
  harness_sha256: string;
  image_digest: string;
  effective_settings_sha256: string;
  noise: Json;
  case_id: string;
  prompt: string;
  seed: number;
  media_path: string;
  media_sha256: string;
  url: string;
}

export interface DiagnosticPair extends Omit<ClipQuality, 'candidate'> {
  scope: 'matched-noise-diagnostic';
  origin: QualityCandidate;
  candidate: DiagnosticCandidate;
}

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid diagnostic pair: ${message}`);
}
const digest = (value: Json) => {
  const result = text(value);
  requireValue(/^[a-f0-9]{64}$/u.test(result), 'SHA256 identity');
  return result;
};
const revision = (value: Json) => {
  const result = text(value);
  requireValue(/^[a-f0-9]{40}$/u.test(result), 'source revision');
  return result;
};
function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function clipReceipt(receipt: Json, role: 'candidate' | 'reference', plan: Json, caseId: string) {
  requireValue(
    at(receipt, 'schema_version') === 1 &&
      at(receipt, 'kind') === 'matched-noise-clip' &&
      at(receipt, 'role') === role &&
      at(receipt, 'status') === 'complete' &&
      at(receipt, 'quality_status') === 'unjudged' &&
      at(receipt, 'release_qualified') === false,
    'receipt contract',
  );
  requireValue(/^[a-zA-Z0-9._:-]+$/u.test(text(at(receipt, 'run_id'))), 'native run identity');
  digest(at(receipt, 'plan_sha256'));
  const actualPlan = at(receipt, 'plan');
  for (const field of ['model_id', 'model_revision', 'generation', 'fairness'])
    requireValue(
      at(plan, field) !== null && canonical(at(plan, field)) === canonical(at(actualPlan, field)),
      `matched ${field}`,
    );
  const cases = rows(at(actualPlan, 'cases')).filter((item) => at(item, 'case_id') === caseId);
  const originals = rows(at(plan, 'cases')).filter((item) => at(item, 'case_id') === caseId);
  requireValue(
    cases.length === 1 && originals.length === 1 && canonical(cases[0]) === canonical(originals[0]),
    'selected plan case',
  );
  for (const field of ['case_id', 'prompt', 'seed'])
    requireValue(at(receipt, field) === at(cases[0], field), `recorded ${field}`);
  revision(at(receipt, 'source_revision'));
  digest(at(receipt, 'harness_sha256'));
  revision(at(receipt, 'runtime_revision'));
  requireValue(
    (role === 'reference' && at(receipt, 'image_digest') === null) ||
      /^sha256:[a-f0-9]{64}$/u.test(text(at(receipt, 'image_digest'))),
    'image identity',
  );
  digest(at(receipt, 'effective_settings_sha256'));
  const count = number(at(receipt, 'gpu_count'));
  requireValue(count !== null && Number.isSafeInteger(count) && count > 0, 'GPU count');
  const ranks = rows(at(receipt, 'ranks'));
  requireValue(
    ranks.length === count &&
      new Set(ranks.map((rank) => at(rank, 'rank'))).size === count &&
      ranks.every((rank) => {
        const index = number(at(rank, 'rank'));
        return index !== null && Number.isSafeInteger(index) && index >= 0 && index < count;
      }),
    'complete rank coverage',
  );
  const noise: Record<string, Json> = {};
  for (const modality of ['video', 'audio']) {
    const input = at(receipt, 'noise', modality);
    const raw = digest(at(input, 'raw_sha256'));
    const file = digest(at(input, 'file_sha256'));
    const dtype = text(at(input, 'dtype'));
    const shape = rows(at(input, 'shape'));
    const fileShape = rows(at(input, 'file_shape'));
    const fileDtype = text(at(input, 'file_dtype'));
    const transform = text(at(input, 'transform'));
    requireValue(
      ['float32', 'float16', 'bfloat16'].includes(dtype) &&
        shape.length > 0 &&
        shape.every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0),
      'noise geometry',
    );
    requireValue(
      ['float32', 'float16', 'bfloat16'].includes(fileDtype) &&
        fileShape.length > 0 &&
        fileShape.every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0) &&
        ['identity', 'h3-video-patchify'].includes(transform),
      'noise file mapping',
    );
    requireValue(
      ranks.every(
        (rank) =>
          at(rank, `${modality}_raw_sha256`) === raw &&
          at(rank, `${modality}_file_sha256`) === file,
      ),
      'consumed rank noise',
    );
    noise[modality] = {
      raw_sha256: raw,
      file_sha256: file,
      dtype,
      shape,
      file_shape: fileShape,
      file_dtype: fileDtype,
      transform,
    };
    const schedule = at(receipt, 'schedule', modality);
    const updates = number(at(plan, 'fairness', 'schedule', 'denoising_updates'));
    const sigmas = rows(at(schedule, 'sigmas'));
    requireValue(
      updates !== null &&
        Number.isSafeInteger(updates) &&
        updates > 0 &&
        at(schedule, 'updates') === updates &&
        at(plan, 'generation', 'num_inference_steps') === updates &&
        sigmas.length === updates + 1 &&
        sigmas.every((n) => number(n) !== null),
      'executed schedule',
    );
    digest(at(schedule, 'float32_le_sha256'));
  }
  requireValue(rows(at(receipt, 'evidence')).length > 0, 'native source evidence');
  for (const evidence of rows(at(receipt, 'evidence'))) {
    safePath(text(at(evidence, 'path')));
    digest(at(evidence, 'sha256'));
  }
  const path = safePath(text(at(receipt, 'media', 'path')));
  requireValue(path.endsWith('.mp4'), 'MP4 media');
  digest(at(receipt, 'media', 'sha256'));
  return { noise, count, path };
}

/** Native single-case evidence is attached as context, never inserted into the CI cohort. */
export function verifiedDiagnosticPairs(
  attachment: Json,
  receipts: Map<string, Json>,
  artifacts: StoredArtifact[],
  attachmentSha256: string,
): DiagnosticPair[] {
  requireValue(
    at(attachment, 'schema_version') === 1 &&
      at(attachment, 'kind') === 'matched-noise-diagnostic' &&
      at(attachment, 'quality_status') === 'unjudged' &&
      at(attachment, 'release_qualified') === false,
    'attachment contract',
  );
  digest(attachmentSha256);
  const scorer = at(attachment, 'scorer');
  requireValue(
    at(scorer, 'name') === 'evaluator.media.compare_media' &&
      at(scorer, 'method') === 'decoded-rgb24-all-frames',
    'scorer',
  );
  const scoring = {
    name: 'evaluator.media.compare_media',
    source_revision: revision(at(scorer, 'source_revision')),
    sha256: digest(at(scorer, 'sha256')),
    method: 'decoded-rgb24-all-frames' as const,
  };
  const pairs = rows(at(attachment, 'pairs'));
  requireValue(pairs.length > 0, 'nonempty pairs');
  const seen = new Set<string>();
  let controls: string | null = null;
  return pairs.map((pair) => {
    const originValue = at(pair, 'origin');
    const original = originalQualityCandidate(originValue, artifacts);
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
    } = original;
    const plan = at(cell.run, 'plan');
    const candidateSha = digest(at(pair, 'candidate', 'receipt_sha256'));
    const referenceSha = digest(at(pair, 'reference', 'receipt_sha256'));
    const candidate = receipts.get(candidateSha) ?? null,
      reference = receipts.get(referenceSha) ?? null;
    const c = clipReceipt(candidate, 'candidate', plan, record.caseId!);
    const r = clipReceipt(reference, 'reference', plan, record.caseId!);
    const saved = artifacts.find((item) => item.runId === run && item.artifact.id === artifact)!;
    const point = namedRunPoints(
      [{ schemaVersion: 1, entries: [videoHistoryEntry(saved, null)], nextPage: null }],
      run,
    ).find((item) => item.id === `${manifestSha}:${cellId}`);
    const hardware = text(at(candidate, 'hardware_key'));
    requireValue(point?.hardwareKey === hardware, 'original hardware context');
    requireValue(
      text(at(candidate, 'run_id')) !== run && at(candidate, 'runtime_name') === 'sglang',
      'native candidate identity',
    );
    requireValue(
      c.count === 4 &&
        at(candidate, 'topology', 'ulysses_degree') === 2 &&
        at(candidate, 'topology', 'tensor_parallel_degree') === 2,
      'matched candidate topology',
    );
    const refIdentity = at(plan, 'fairness', 'reference_identity');
    requireValue(
      at(reference, 'runtime_name') === 'official-diffusers-t2va' &&
        at(reference, 'runtime_revision') === at(refIdentity, 'diffusers_revision'),
      'official reference revision',
    );
    requireValue(canonical(c.noise) === canonical(r.noise), 'candidate/reference input noise');
    requireValue(
      canonical(at(candidate, 'schedule')) === canonical(at(reference, 'schedule')),
      'candidate/reference schedule',
    );
    const signature = canonical([
      referenceSha,
      at(candidate, 'source_revision'),
      at(candidate, 'harness_sha256'),
      at(candidate, 'runtime_revision'),
      at(candidate, 'image_digest'),
      at(candidate, 'effective_settings_sha256'),
      at(candidate, 'topology'),
    ]);
    requireValue(controls === null || controls === signature, 'matched candidate controls');
    controls = signature;
    requireValue(!seen.has(hardware), 'duplicate hardware/original binding');
    seen.add(hardware);
    return {
      scope: 'matched-noise-diagnostic',
      attachmentSha256,
      origin: {
        run_id: run,
        artifact_id: artifact!,
        source_id: sourceId,
        manifest_sha256: manifestSha,
        cell_id: cellId,
        slot_id: slot,
        case_id: record.caseId!,
        prompt: record.prompt!,
        seed: record.seed!,
        media_path: mediaPath,
        media_sha256: mediaSha,
        plan_sha256: digest(at(cell.run, 'plan_sha256')),
      },
      candidate: {
        run_id: text(at(candidate, 'run_id')),
        receipt_sha256: candidateSha,
        plan_sha256: digest(at(candidate, 'plan_sha256')),
        hardware_key: hardware,
        gpu_count: c.count,
        topology: { ulysses_degree: 2, tensor_parallel_degree: 2 },
        runtime_name: 'sglang',
        runtime_revision: text(at(candidate, 'runtime_revision')),
        source_revision: text(at(candidate, 'source_revision')),
        harness_sha256: text(at(candidate, 'harness_sha256')),
        image_digest: text(at(candidate, 'image_digest')),
        effective_settings_sha256: text(at(candidate, 'effective_settings_sha256')),
        noise: c.noise,
        case_id: record.caseId!,
        prompt: record.prompt!,
        seed: record.seed!,
        media_path: c.path,
        media_sha256: digest(at(candidate, 'media', 'sha256')),
        url: '',
      },
      reference: {
        receipt_sha256: referenceSha,
        plan_sha256: digest(at(reference, 'plan_sha256')),
        case_id: record.caseId!,
        media_path: r.path,
        media_sha256: digest(at(reference, 'media', 'sha256')),
        model_id: text(at(plan, 'model_id')),
        model_revision: text(at(plan, 'model_revision')),
        implementation: 'official-diffusers-t2va',
        diffusers_revision: text(at(reference, 'runtime_revision')),
        denoising_updates: number(at(plan, 'fairness', 'schedule', 'denoising_updates'))!,
        sigma_points: number(at(plan, 'fairness', 'schedule', 'sigma_points'))!,
        url: '',
      },
      scorer: scoring,
      ...pairedMediaMetrics(at(pair, 'comparison'), at(plan, 'generation', 'frame_count')),
    };
  });
}
