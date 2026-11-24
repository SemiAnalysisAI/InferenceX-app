import { dedupeArtifactsByLogicalName, type ArtifactMeta } from './github-artifacts.js';

export function selectBenchmarkArtifacts(artifacts: readonly ArtifactMeta[]): ArtifactMeta[] {
  const deduped = dedupeArtifactsByLogicalName(artifacts);
  const aggregate = deduped.get('results_bmk');
  if (aggregate) return [aggregate];
  return [...deduped.values()].filter((artifact) => artifact.name.startsWith('bmk_'));
}

export function repositoryFromRunUrl(url: string | null): string | null {
  const match = url?.match(
    /^https:\/\/github\.com\/(?<repository>[^/]+\/[^/]+)\/actions\/runs\/\d+/u,
  );
  return match?.groups?.repository ?? null;
}

/**
 * The repository of a stored run: from its URL, else from the URL that log redaction recorded
 * before clearing it (`loadRedactedRunUrls`), else null so the caller falls back to `INGEST_REPO`,
 * as for runs ingested without GitHub metadata. GitHub run IDs are unique across repositories, so a
 * cleared run missing from the map reads as not found in `INGEST_REPO`, never as another run.
 */
export function storedRunRepository(
  run: { github_run_id: number | string; html_url: string | null },
  redactedUrls: ReadonlyMap<string, string>,
): string | null {
  return repositoryFromRunUrl(run.html_url ?? redactedUrls.get(String(run.github_run_id)) ?? null);
}
