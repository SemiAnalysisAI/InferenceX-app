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

export const RUNNER_SUFFIX_RE = /_[a-zA-Z][a-zA-Z0-9.-]*_\d+$/u;

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
    } catch {}
  }
  return out;
}

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

export function fetchRunAttempt(repo: string, runId: string): number {
  const attemptStr = execSync(`gh api "repos/${repo}/actions/runs/${runId}" --jq '.run_attempt'`, {
    encoding: 'utf8',
  }).trim();
  const attempt = Number(attemptStr);
  if (!attemptStr || !Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error(
      `GitHub returned no valid run_attempt for ${repo} run ${runId}: '${attemptStr}'`,
    );
  }
  return attempt;
}

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
