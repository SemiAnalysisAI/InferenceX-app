import { at, text, type Bundle } from './bundle';
import type { ServingCell } from './serving';

export const VIDEO_ENGINES = ['sglang', 'vllm-omni'] as const;
export type VideoEngine = (typeof VIDEO_ENGINES)[number];
export interface VideoProducerIdentity {
  modelRevision: string;
  planSha256: string;
  engine: { name: VideoEngine; revision: string };
}
export interface VideoProducerFields {
  producer?: VideoProducerIdentity | null;
}

export function producerIdentity(
  bundle: Pick<Bundle, 'manifest' | 'documents' | 'checksums'>,
  cells: Pick<ServingCell, 'run' | 'job'>[],
): VideoProducerIdentity | null {
  const { manifest, documents, checksums } = bundle;
  if (at(manifest, 'plan_sha256') === null && at(manifest, 'engine') === null) return null;
  const planSha256 = text(at(manifest, 'plan_sha256'));
  const modelRevision = text(at(manifest, 'workload_plan', 'model_revision'));
  const name = at(manifest, 'engine', 'name');
  const revision = text(at(manifest, 'engine', 'revision'));
  const matrix = documents.get('serving-smoke.json') ?? null;
  if (
    (name !== 'sglang' && name !== 'vllm-omni') ||
    !/^[a-f0-9]{40}$/u.test(revision) ||
    !/^[a-f0-9]{40}$/u.test(modelRevision) ||
    !/^[a-f0-9]{64}$/u.test(planSha256) ||
    !checksums.has('serving-smoke.json') ||
    checksums.get('serving-smoke.json') !== at(manifest, 'evidence', 'serving-smoke.json') ||
    at(matrix, 'plan_sha256') !== planSha256 ||
    at(matrix, 'engine', 'name') !== name ||
    at(matrix, 'engine', 'revision') !== revision ||
    cells.some(
      ({ run, job }) =>
        (run !== null &&
          (at(run, 'plan_sha256') !== planSha256 ||
            at(run, 'configuration', 'runtime') !== name ||
            at(run, 'configuration', 'runtime_revision') !== revision ||
            at(run, 'configuration', 'model_revision') !== modelRevision)) ||
        (job !== null && at(job, 'plan_sha256') !== planSha256),
    )
  )
    throw new Error('Producer engine or selected plan identity does not match sealed execution');
  return { modelRevision, planSha256, engine: { name, revision } };
}
