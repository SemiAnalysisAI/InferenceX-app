import { dedupeArtifactsByLogicalName, type ArtifactMeta } from './github-artifacts.js';

export const CHANGELOG_ARTIFACT_NAME = 'changelog-metadata';
const REUSED_BUNDLE_ARTIFACT_NAME = 'reused-ingest-artifacts';

export interface ArtifactPlan {
  artifacts: ArtifactMeta[];
  reused: boolean;
}

export interface ArtifactPlanOptions {
  validAgenticBenchmarkIds?: ReadonlySet<number>;
}

export function isIngestableAgenticBenchmarkData(data: unknown): boolean {
  const rows = Array.isArray(data) ? data : [data];
  return (
    rows.length > 0 &&
    rows.every((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
      const value = row as Record<string, unknown>;
      if (value.scenario_type !== 'agentic-coding') return false;
      if (typeof value.num_requests_successful !== 'number' || value.num_requests_successful <= 0) {
        return false;
      }
      const requestMetrics = value.request_metrics;
      if (!requestMetrics || typeof requestMetrics !== 'object' || Array.isArray(requestMetrics)) {
        return false;
      }
      const throughput = (requestMetrics as Record<string, unknown>).throughput;
      return (
        throughput !== null &&
        typeof throughput === 'object' &&
        !Array.isArray(throughput) &&
        Object.keys(throughput).length > 0
      );
    })
  );
}

function newestArtifact(artifacts: readonly ArtifactMeta[]): ArtifactMeta | undefined {
  return artifacts.reduce<ArtifactMeta | undefined>((newest, artifact) => {
    if (!newest) return artifact;
    if (artifact.created_at > newest.created_at) return artifact;
    if (artifact.created_at < newest.created_at) return newest;
    return (artifact.id ?? 0) > (newest.id ?? 0) ? artifact : newest;
  }, undefined);
}

function closestCompanion(
  artifacts: readonly ArtifactMeta[],
  name: string,
  anchor: ArtifactMeta,
): ArtifactMeta | undefined {
  const anchorTime = Date.parse(anchor.created_at);
  return artifacts
    .filter((artifact) => artifact.name === name)
    .toSorted((left, right) => {
      const leftDelta = Date.parse(left.created_at) - anchorTime;
      const rightDelta = Date.parse(right.created_at) - anchorTime;
      const distance = Math.abs(leftDelta) - Math.abs(rightDelta);
      if (distance !== 0) return distance;
      const leftIsAfter = leftDelta >= 0;
      const rightIsAfter = rightDelta >= 0;
      if (leftIsAfter !== rightIsAfter) return leftIsAfter ? -1 : 1;
      return (right.id ?? 0) - (left.id ?? 0);
    })[0];
}

function isPointCompanion(name: string): boolean {
  return (
    name.startsWith('agentic_') ||
    name.startsWith('server_logs_') ||
    name.startsWith('multinode_server_logs_') ||
    name.startsWith('gpu_metrics_')
  );
}

function companionNames(anchorName: string): string[] {
  if (anchorName.startsWith('bmk_agentic_')) {
    const suffix = anchorName.slice('bmk_agentic_'.length);
    return [`agentic_${suffix}`, `server_logs_${suffix}`, `gpu_metrics_${suffix}`];
  }
  const suffix = anchorName.slice('bmk_'.length);
  return [`server_logs_${suffix}`, `multinode_server_logs_${suffix}`, `gpu_metrics_${suffix}`];
}

/**
 * Select the artifact set consumed by one official ingest.
 *
 * GitHub keeps artifacts from every rerun attempt under the same run ID.
 * Runner retries can also change the physical runner/index suffix while still
 * representing the same benchmark point. Collapse those physical names to one
 * logical name and keep the newest upload. For reused sweeps, benchmark data
 * comes from the source PR run while changelog metadata comes from the
 * publication run on main.
 */
export function buildArtifactPlan(
  sourceRunId: string,
  mergeRunId: string,
  sourceArtifacts: readonly ArtifactMeta[],
  mergeArtifacts: readonly ArtifactMeta[] = sourceArtifacts,
  options: ArtifactPlanOptions = {},
): ArtifactPlan {
  const reused = sourceRunId !== mergeRunId;
  const usableSource = sourceArtifacts.filter(
    (artifact) =>
      artifact.expired !== true &&
      (!reused ||
        (artifact.name !== CHANGELOG_ARTIFACT_NAME &&
          artifact.name !== REUSED_BUNDLE_ARTIFACT_NAME)),
  );
  const agenticBenchmarks = usableSource.filter(
    (artifact) =>
      artifact.name.startsWith('bmk_agentic_') &&
      (options.validAgenticBenchmarkIds === undefined ||
        (artifact.id !== undefined && options.validAgenticBenchmarkIds.has(artifact.id))),
  );
  const fixedBenchmarks = usableSource.filter(
    (artifact) => artifact.name.startsWith('bmk_') && !artifact.name.startsWith('bmk_agentic_'),
  );
  const benchmarkAnchors = [
    ...dedupeArtifactsByLogicalName(agenticBenchmarks).values(),
    ...dedupeArtifactsByLogicalName(fixedBenchmarks).values(),
  ];
  const standaloneArtifacts = usableSource.filter(
    (artifact) => !artifact.name.startsWith('bmk_') && !isPointCompanion(artifact.name),
  );
  const selected = [...dedupeArtifactsByLogicalName(standaloneArtifacts).values()];

  for (const anchor of benchmarkAnchors) {
    selected.push(anchor);
    for (const companionName of companionNames(anchor.name)) {
      const companion = closestCompanion(usableSource, companionName, anchor);
      if (companion) selected.push(companion);
    }
  }

  if (selected.length === 0) {
    throw new Error(`No unexpired ingestable artifacts found on source run ${sourceRunId}`);
  }

  if (reused) {
    const changelog = newestArtifact(
      mergeArtifacts.filter(
        (artifact) => artifact.expired !== true && artifact.name === CHANGELOG_ARTIFACT_NAME,
      ),
    );
    if (!changelog) {
      throw new Error(`No ${CHANGELOG_ARTIFACT_NAME} artifact found on merge run ${mergeRunId}`);
    }
    selected.push(changelog);
  }

  return {
    artifacts: selected.toSorted((left, right) => left.name.localeCompare(right.name)),
    reused,
  };
}
