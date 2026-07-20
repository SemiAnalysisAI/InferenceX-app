import { dedupeArtifactsByLogicalName, type ArtifactMeta } from './github-artifacts.js';

/** Prefer the compact aggregate; otherwise retain the latest per-config benchmark artifacts. */
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
