/**
 * GitHub Actions artifact helpers shared by `ingest-ci-run.ts` (download
 * mode). All calls shell out to the
 * `gh` CLI, which picks up GITHUB_TOKEN from the environment.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ArtifactMeta {
  id?: number;
  name: string;
  archive_download_url: string;
  created_at: string;
  expired?: boolean;
}

/**
 * Strips the trailing `_<runner-pool>_<attempt-digits>` token from an
 * artifact name so retries on different runners collapse to one logical
 * artifact. Without this, two artifacts produced for the same logical
 * config (e.g. `…_h200-cw_00` and `…_h200-dgxc-slurm_1`) both land in the
 * DB and the failed one's empty metrics can overwrite the good one via
 * ON CONFLICT DO UPDATE.
 *
 * The runner pool name itself has no underscores (`h200-cw`,
 * `h200-dgxc-slurm`, `b200-nb`), so `[a-zA-Z0-9.-]*` keeps the strip
 * bounded — using `\w` here would over-match across earlier `_` separators
 * and collapse different (conc, offload) variants into the same logical
 * name.
 */
export const RUNNER_SUFFIX_RE = /_[a-zA-Z][a-zA-Z0-9.-]*_\d+$/u;

/** List a workflow run's artifacts via `gh api` (paginated). Malformed lines are skipped. */
export function listRunArtifacts(repo: string, runId: string): ArtifactMeta[] {
  const json = execSync(
    `gh api "repos/${repo}/actions/runs/${runId}/artifacts" --paginate --jq '.artifacts[]'`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );
  const out: ArtifactMeta[] = [];
  for (const line of json.trim().split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as ArtifactMeta);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

/**
 * Group artifacts by their runner-suffix-stripped logical name, keeping only
 * the most recent (`created_at`) per group.
 */
export function dedupeArtifactsByLogicalName(
  artifacts: readonly ArtifactMeta[],
): Map<string, ArtifactMeta> {
  const byLogical = new Map<string, ArtifactMeta>();
  for (const a of artifacts) {
    const key = a.name.replace(RUNNER_SUFFIX_RE, '');
    const existing = byLogical.get(key);
    if (!existing || a.created_at > existing.created_at) byLogical.set(key, a);
  }
  return byLogical;
}

function isNewerArtifact(candidate: ArtifactMeta, existing: ArtifactMeta): boolean {
  return (
    candidate.created_at > existing.created_at ||
    (candidate.created_at === existing.created_at && (candidate.id ?? 0) > (existing.id ?? 0))
  );
}

/**
 * Pair each artifact whose name `suffixOf` recognizes with its exact
 * `bmk_agentic_<suffix>` or `bmk_<suffix>` sibling, newest upload per name.
 * Retried jobs upload on different runners, so the newest pair per logical
 * (runner-suffix-stripped) benchmark name wins.
 */
export function pairWithBenchmarkSibling(
  artifacts: readonly ArtifactMeta[],
  suffixOf: (name: string) => string | null,
): { artifact: ArtifactMeta; benchmarks: ArtifactMeta }[] {
  const byName = new Map<string, ArtifactMeta>();
  for (const artifact of artifacts) {
    const existing = byName.get(artifact.name);
    if (!existing || isNewerArtifact(artifact, existing)) byName.set(artifact.name, artifact);
  }
  const byLogicalBenchmark = new Map<
    string,
    { artifact: ArtifactMeta; benchmarks: ArtifactMeta }
  >();
  for (const artifact of byName.values()) {
    const suffix = suffixOf(artifact.name);
    if (!suffix) continue;
    // Require the exact runner suffix. Eval and benchmark jobs can share the
    // same logical config while uploading distinct artifacts.
    const benchmarks = byName.get(`bmk_agentic_${suffix}`) ?? byName.get(`bmk_${suffix}`);
    if (!benchmarks) continue;
    const logicalName = benchmarks.name.replace(RUNNER_SUFFIX_RE, '');
    const existing = byLogicalBenchmark.get(logicalName);
    if (!existing || isNewerArtifact(benchmarks, existing.benchmarks)) {
      byLogicalBenchmark.set(logicalName, { artifact, benchmarks });
    }
  }
  return [...byLogicalBenchmark.values()].toSorted((a, b) =>
    a.artifact.name.localeCompare(b.artifact.name),
  );
}

/** Download + unzip one artifact into `<destRoot>/<artifact.name>`; returns that dir. */
export function downloadArtifact(artifact: ArtifactMeta, destRoot: string): string {
  const zipPath = path.join(destRoot, 'artifact.zip');
  execSync(`gh api "${artifact.archive_download_url}" > "${zipPath}"`, {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const destDir = path.join(destRoot, artifact.name);
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`unzip -oq "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
  fs.unlinkSync(zipPath);
  return destDir;
}

/** Fetch a run's current attempt number via `gh api` (defaults to 1). */
export function fetchRunAttempt(repo: string, runId: string): number {
  const attemptStr = execSync(`gh api "repos/${repo}/actions/runs/${runId}" --jq '.run_attempt'`, {
    encoding: 'utf8',
  }).trim();
  return parseInt(attemptStr || '1', 10);
}

/** Download mode reads only the current attempt, so an older `/attempts/N` URL cannot be honored. */
export function assertRequestedRunAttempt(input: string, currentAttempt: number): void {
  const requested = input.match(/\/attempts\/(?<attempt>\d+)/u)?.groups?.attempt;
  if (requested && Number(requested) !== currentAttempt)
    throw new Error(
      `GitHub attempt ${currentAttempt} differs from requested ${requested}; ` +
        'use retained artifacts and exact source metadata for historical-attempt ingestion',
    );
}

export interface RunMeta {
  id: number;
  name: string;
  path: string;
  run_attempt: number;
  head_sha: string;
  head_branch: string | null;
  conclusion: string | null;
  status: string | null;
  updated_at?: string | null;
  run_started_at?: string | null;
  created_at?: string | null;
}

/**
 * Fetch a workflow run's metadata via `gh api`.
 *
 * Both arguments land in a shell-interpolated command, so they are validated
 * here rather than trusted from the caller: this helper is exported and its
 * callers' own checks are not guaranteed. A run id is always digits and a repo
 * slug is `owner/name`, so anything else is rejected outright.
 */
export function fetchRunMeta(repo: string, runId: string): RunMeta {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo)) {
    throw new Error(`Invalid repo slug: ${repo}`);
  }
  if (!/^\d+$/u.test(runId)) {
    throw new Error(`Invalid run id: ${runId}`);
  }
  const json = execSync(`gh api "repos/${repo}/actions/runs/${runId}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(json) as RunMeta;
}
