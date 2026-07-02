/**
 * GitHub Actions artifact helpers shared by `ingest-ci-run.ts` (download
 * mode). All calls shell out to the
 * `gh` CLI, which picks up GITHUB_TOKEN from the environment.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ArtifactMeta {
  name: string;
  archive_download_url: string;
  created_at: string;
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
