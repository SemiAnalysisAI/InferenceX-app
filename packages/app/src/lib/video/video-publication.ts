import { videoArtifactIdentity } from '@/components/video-benchmark/artifact-identity';
import { at, number, rows, text, type Json } from '@/components/video-benchmark/bundle';

const positiveId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d*$/u.test(value) && Number.isSafeInteger(Number(value));
export interface SelectedVideoArtifact {
  id: string;
  manifestSha256: string;
  sourceHeadSha: string;
}
export function isSelectedVideoArtifact(value: unknown): value is SelectedVideoArtifact {
  if (value === null || typeof value !== 'object') return false;
  return (
    'id' in value &&
    positiveId(value.id) &&
    'manifestSha256' in value &&
    typeof value.manifestSha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.manifestSha256) &&
    'sourceHeadSha' in value &&
    typeof value.sourceHeadSha === 'string' &&
    /^[a-f0-9]{40}$/u.test(value.sourceHeadSha)
  );
}

export type VideoPublicationRequest = { runId: string; mergeRunId: string | null } & (
  | { artifactId: string }
  | { selectedArtifact: SelectedVideoArtifact }
);

// Resolve the whole selection before the first write. A later rerun may already be in the catalog.
function selectedArtifacts(selection: Json, catalog: Json[], runId: string) {
  const attempt = at(selection, 'source_run_attempt');
  const head = text(at(selection, 'source_head_sha'));
  const entries = rows(at(selection, 'artifacts'));
  if (
    at(selection, 'version') !== 1 ||
    at(selection, 'source_run_id') !== runId ||
    !positiveId(attempt) ||
    !/^[a-f0-9]{40}$/u.test(head) ||
    entries.length === 0
  )
    throw new Error('Invalid video publication selection');

  const recipes = new Set<string>();
  const ids = new Set<number>();
  return entries.map((entry) => {
    const name = text(at(entry, 'name'));
    const hash = text(at(entry, 'manifest_sha256'));
    const identity = videoArtifactIdentity(name);
    const recipe = identity?.configuration ?? '';
    if (
      !name.startsWith('h3-results-') ||
      identity?.run !== runId ||
      !positiveId(identity.attempt) ||
      Number(identity.attempt) > Number(attempt) ||
      !/^[a-f0-9]{64}$/u.test(recipe) ||
      recipes.has(recipe) ||
      !/^[a-f0-9]{64}$/u.test(hash)
    )
      throw new Error('Invalid selected artifact identity');
    recipes.add(recipe);
    const matches = catalog.filter((a) => at(a, 'name') === name);
    if (matches.length !== 1 || at(matches[0], 'expired') === true)
      throw new Error(`Selected artifact is missing, ambiguous or expired: ${name}`);
    const id = at(matches[0], 'id');
    if (typeof id !== 'number' || !positiveId(String(id)) || ids.has(id))
      throw new Error('Invalid selected artifact ID');
    ids.add(id);
    return {
      artifact: matches[0],
      selected: { id: String(id), manifestSha256: hash, sourceHeadSha: head },
    };
  });
}

export async function publishVideoResults({
  get,
  post,
  runId,
  mergeRunId,
  selection,
  onStored,
}: {
  get: (query: string) => Promise<Json>;
  post: (body: VideoPublicationRequest) => Promise<Json>;
  runId: string;
  mergeRunId: string | null;
  selection?: Json;
  /** `quality` counts the attached reference pairs; null when no trusted quality exists yet. */
  onStored: (
    run: string,
    artifact: string,
    sources: number,
    quality: number | 'failed' | null,
  ) => void;
}) {
  if (!positiveId(runId)) throw new Error('Invalid H3_RUN_ID');
  if (mergeRunId !== null && !positiveId(mergeRunId)) throw new Error('Invalid H3_MERGE_RUN_ID');
  const data = await get(`?run=${runId}`);
  if (!Array.isArray(at(data, 'artifacts'))) throw new Error('Invalid video artifact catalog');
  if (selection !== undefined && mergeRunId === null)
    throw new Error('Selected publication requires a merge run');
  const catalog = rows(at(data, 'artifacts'));
  const artifacts =
    selection === undefined
      ? catalog.map((artifact) => ({ artifact, selected: null }))
      : selectedArtifacts(selection, catalog, runId);
  const seen = new Set<string>();
  const failures: unknown[] = [];
  for (const { artifact, selected } of artifacts) {
    const artifactId = String(at(artifact, 'id'));
    if (!positiveId(artifactId)) throw new Error('Invalid artifact identity');
    if (seen.has(artifactId) || at(artifact, 'expired') === true) continue;
    seen.add(artifactId);
    try {
      const receipt = await post(
        selected
          ? { runId, mergeRunId, selectedArtifact: selected }
          : { runId, artifactId, mergeRunId },
      );
      const sources = rows(at(receipt, 'sources'));
      if (
        at(receipt, 'version') !== 1 ||
        text(at(receipt, 'runId')) !== runId ||
        at(receipt, 'artifactId') !== Number(artifactId) ||
        text(at(receipt, 'artifactName')) !== text(at(artifact, 'name')) ||
        // A manual republish names no merge run and gets the recorded approval back.
        (mergeRunId !== null && at(receipt, 'mergeRunId') !== mergeRunId) ||
        !Array.isArray(at(receipt, 'sources')) ||
        sources.length === 0 ||
        (selected &&
          (sources.length !== 1 ||
            at(sources[0], 'id') !== runId ||
            at(sources[0], 'kind') !== 'observation' ||
            at(sources[0], 'sha256') !== selected.manifestSha256))
      )
        throw new Error('Unexpected video publication receipt');
      onStored(
        runId,
        artifactId,
        rows(at(receipt, 'sources')).length,
        at(receipt, 'quality') === 'failed' ? 'failed' : number(at(receipt, 'quality')),
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (seen.size === 0) throw new Error('No H3 artifact in the selected source run');
  if (failures.length > 0)
    throw new AggregateError(failures, `${failures.length} video publications failed`);
}
