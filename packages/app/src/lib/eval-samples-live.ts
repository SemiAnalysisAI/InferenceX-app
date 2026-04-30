/**
 * Live-fetch path for the per-sample eval drawer.
 *
 * For unofficial / un-ingested workflow runs the drawer can't query the
 * `eval_samples` table. Instead, we download the matching per-config
 * `eval_<…>.zip` artifact from GitHub Actions on demand, find the
 * `samples_<task>_*.jsonl` file inside, and parse it the same way the offline
 * ingest does. No caching — same policy as `/api/unofficial-run`, since GHA
 * artifacts can change while a workflow is still running.
 */
import {
  type GithubArtifact,
  downloadGithubArtifact,
  extractZipEntries,
} from '@/lib/github-artifacts';
import {
  mapEvalSamples,
  type EvalSampleParams,
} from '@semianalysisai/inferencex-db/etl/eval-samples-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';

/** Subset of an eval row's identifying fields needed to pick the right artifact. */
export interface EvalArtifactConfig {
  model: string;
  framework: string;
  hardware: string;
  precision: string;
  specMethod: string;
  disagg: boolean;
  conc: number | null;
}

/**
 * Pick the per-config eval artifact matching `config` from a run's artifact list.
 *
 * Artifact names follow lm-eval's CI convention:
 *   `eval_<model>_<isl>k<osl>k_<model>_<isl>k<osl>k_<precision>_<framework>_tp<N>-ep<M>-dpa<bool>_disagg-<bool>_spec-<method>_conc<N>_<hardware>-<pool>_<runner>_<rand>`
 *
 * We match on tokens we have on `EvalRow`. ISL/OSL aren't currently stamped on
 * `EvalRow`, so when multiple artifacts differ only in sequence length we pick
 * the highest-id (most recent) match. Excludes the aggregate (`eval_results_all`)
 * and gpu-metrics artifacts which share the `eval_` prefix but don't carry samples.
 */
export function findEvalSampleArtifact(
  artifacts: GithubArtifact[],
  config: EvalArtifactConfig,
): GithubArtifact | null {
  // Required tokens — artifacts that don't contain all of these are eliminated.
  // We deliberately omit `disagg` from the required set: the eval row's `disagg`
  // flag occasionally disagrees with how the artifact was named (e.g. a config
  // run as non-disagg but with prefill==decode topology gets flagged disagg=true
  // on the row), so requiring an exact match drops legitimate hits.
  const required = [
    `_${config.model}_`,
    `_${config.precision}_`,
    `_${config.framework}_`,
    `_${config.hardware}-`,
    `_spec-${config.specMethod}_`,
  ];
  if (config.conc !== null) required.push(`_conc${config.conc}_`);
  // Preferred token — used as a tiebreaker when more than one artifact matches.
  const preferredDisagg = `_disagg-${config.disagg ? 'true' : 'false'}_`;

  const matches = artifacts.filter((a) => {
    const n = a.name.toLowerCase();
    if (!n.startsWith('eval_')) return false;
    if (n.startsWith('eval_results_') || n.startsWith('eval_gpu_metrics_')) return false;
    return required.every((t) => n.includes(t.toLowerCase()));
  });
  if (matches.length === 0) return null;
  // Prefer artifacts whose disagg flag matches the row, then fall back to newest.
  // `toSorted` is stable, so equal-priority matches stay in their original order.
  return matches.toSorted((a, b) => {
    const aDisagg = a.name.toLowerCase().includes(preferredDisagg) ? 0 : 1;
    const bDisagg = b.name.toLowerCase().includes(preferredDisagg) ? 0 : 1;
    if (aDisagg !== bDisagg) return aDisagg - bDisagg;
    return b.id - a.id;
  })[0];
}

/**
 * Download the artifact, find `samples_<task>_*.jsonl` for the requested task,
 * and parse it via the same mapper used at ingest time.
 *
 * Returns `null` if the artifact download fails or the zip contains no samples
 * file for the task. Throws if the JSONL parse blows up unexpectedly — caller
 * is responsible for surfacing as a 500.
 */
export async function fetchAndParseSamples(
  artifact: GithubArtifact,
  task: string,
  githubToken: string,
): Promise<EvalSampleParams[] | null> {
  const response = await downloadGithubArtifact(artifact.archive_download_url, githubToken);
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());

  const tracker = createSkipTracker();
  const collected: EvalSampleParams[] = [];
  // lm-eval names samples files `samples_<task>_<timestamp>.jsonl`. There's
  // typically one per task; we filter by the requested task name only.
  extractZipEntries(buffer, '.jsonl', (entryName, contents) => {
    const m = entryName.match(/(?:^|\/)samples_(.+?)_[^_]+\.jsonl$/);
    if (!m) return [];
    if (m[1].toLowerCase() !== task.toLowerCase()) return [];
    collected.push(...mapEvalSamples(contents, tracker));
    return [];
  });
  if (collected.length === 0) return null;
  // Dedup by docId — lm-eval emits the same prompt twice when multiple filters
  // (`strict-match`, `flexible-extract`) post-process the same response, and
  // re-run scenarios can also produce multiple samples files in one zip. The DB
  // ingest dedups via `(eval_result_id, doc_id)`; mirror that here so totals match.
  const seen = new Map<number, EvalSampleParams>();
  for (const s of collected) if (!seen.has(s.docId)) seen.set(s.docId, s);
  return [...seen.values()].toSorted((a, b) => a.docId - b.docId);
}
