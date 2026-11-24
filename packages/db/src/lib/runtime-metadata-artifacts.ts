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
 * The repository of a stored run, from its URL. A run without one is reported and skipped (null)
 * instead of being read from `INGEST_REPO`: the log-redaction backfill clears the URL of runs from
 * private repositories, and guessing would read another repository's run with the same ID.
 */
export function storedRunRepository(run: {
  github_run_id: number | string;
  html_url: string | null;
}): string | null {
  const repository = repositoryFromRunUrl(run.html_url);
  if (repository === null) {
    console.error(
      `  ✗ run ${run.github_run_id}: no GitHub run URL, so its repository is unknown ` +
        '(log redaction clears it for private repositories); skipped instead of using INGEST_REPO',
    );
  }
  return repository;
}
