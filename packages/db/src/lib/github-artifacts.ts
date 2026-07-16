/**
 * GitHub Actions artifact helpers shared by `ingest-ci-run.ts` (download
 * mode). All calls shell out to the
 * `gh` CLI, which picks up GITHUB_TOKEN from the environment.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { hwToGpuKey } from '../etl/normalizers.js';

export interface ArtifactMeta {
  id?: number;
  name: string;
  archive_download_url: string;
  created_at: string;
  expired?: boolean;
}

/**
 * Matches the trailing `_<runner-pool>_<runner-index>` token in an artifact
 * name. The logical name normalizes the runner pool to its hardware class, so
 * retries on `h200-cw` and `h200-dgxc-slurm` collapse while genuinely distinct
 * B200 and B300 points remain separate.
 *
 * The runner pool name itself has no underscores (`h200-cw`,
 * `h200-dgxc-slurm`, `b200-nb`), so `[a-zA-Z0-9.-]*` keeps the strip
 * bounded — using `\w` here would over-match across earlier `_` separators
 * and collapse different (conc, offload) variants into the same logical
 * name.
 */
export const RUNNER_SUFFIX_RE = /_[a-zA-Z][a-zA-Z0-9.-]*_\d+$/u;

export function logicalArtifactName(name: string): string {
  const match = name.match(/^(?<prefix>.*)_(?<runner>[a-zA-Z][a-zA-Z0-9.-]*)_\d+$/u);
  if (!match?.groups) return name;
  const hardware = hwToGpuKey(match.groups.runner) ?? match.groups.runner.toLowerCase();
  return `${match.groups.prefix}_${hardware}`;
}

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
    const key = logicalArtifactName(a.name);
    const existing = byLogical.get(key);
    if (
      !existing ||
      a.created_at > existing.created_at ||
      (a.created_at === existing.created_at && (a.id ?? 0) > (existing.id ?? 0))
    ) {
      byLogical.set(key, a);
    }
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
