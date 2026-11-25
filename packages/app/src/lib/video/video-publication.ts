import { videoArtifactIdentity } from '@/components/video-benchmark/artifact-identity';
import { at, number, rows, text, type Json } from '@/components/video-benchmark/bundle';

const positiveId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d*$/u.test(value) && Number.isSafeInteger(Number(value));
const sha256Hex = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export interface SelectedVideoArtifact {
  id: string;
  manifestSha256: string;
  sha256sumsSha256: string;
}
export function isSelectedVideoArtifact(value: unknown): value is SelectedVideoArtifact {
  if (value === null || typeof value !== 'object') return false;
  return (
    'id' in value &&
    positiveId(value.id) &&
    'manifestSha256' in value &&
    sha256Hex(value.manifestSha256) &&
    'sha256sumsSha256' in value &&
    sha256Hex(value.sha256sumsSha256)
  );
}

/** A merge run approves its selected artifact. Without one, an approved artifact is republished. */
export type VideoPublicationRequest =
  | { runId: string; mergeRunId: string; selectedArtifact: SelectedVideoArtifact }
  | { runId: string; mergeRunId: null; artifactId: string };

// Resolve the whole selection before the first write. A later rerun may already be in the catalog.
function selectedArtifacts(selection: Json, catalog: Json[], runId: string) {
  const attempt = at(selection, 'source_run_attempt');
  const entries = rows(at(selection, 'artifacts'));
  if (
    at(selection, 'version') !== 1 ||
    at(selection, 'source_run_id') !== runId ||
    !positiveId(attempt) ||
    entries.length === 0
  )
    throw new Error('Invalid video publication selection');

  const recipes = new Set<string>();
  return entries.map((entry) => {
    const name = text(at(entry, 'name'));
    const hash = text(at(entry, 'manifest_sha256'));
    const seal = text(at(entry, 'sha256sums_sha256'));
    const identity = videoArtifactIdentity(name);
    const recipe = identity?.configuration ?? '';
    if (
      !name.startsWith('h3-results-') ||
      identity?.run !== runId ||
      !positiveId(identity.attempt) ||
      Number(identity.attempt) > Number(attempt) ||
      !sha256Hex(recipe) ||
      recipes.has(recipe) ||
      !sha256Hex(hash) ||
      !sha256Hex(seal)
    )
      throw new Error('Invalid selected artifact identity');
    recipes.add(recipe);
    const matches = catalog.filter((a) => at(a, 'name') === name);
    if (matches.length !== 1 || at(matches[0], 'expired') === true)
      throw new Error(`Selected artifact is missing, ambiguous or expired: ${name}`);
    const id = at(matches[0], 'id');
    if (typeof id !== 'number' || !positiveId(String(id)))
      throw new Error('Invalid selected artifact ID');
    return {
      artifact: matches[0],
      selected: { id: String(id), manifestSha256: hash, sha256sumsSha256: seal },
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
  if ((mergeRunId === null) !== (selection === undefined))
    throw new Error('A merge run and its selection are required together');
  const data = await get(`?run=${runId}`);
  if (!Array.isArray(at(data, 'artifacts'))) throw new TypeError('Invalid video artifact catalog');
  const catalog = rows(at(data, 'artifacts'));
  // Without a merge run nothing is approved: the App only republishes what it already approved.
  const artifacts =
    selection === undefined
      ? catalog.map((artifact) => ({ artifact, selected: null }))
      : selectedArtifacts(selection, catalog, runId);
  const seen = new Set<string>();
  const failures: unknown[] = [];
  let published = 0;
  for (const { artifact, selected } of artifacts) {
    const artifactId = String(at(artifact, 'id'));
    if (!positiveId(artifactId)) throw new Error('Invalid artifact identity');
    if (seen.has(artifactId) || at(artifact, 'expired') === true) continue;
    seen.add(artifactId);
    try {
      const receipt = await post(
        selected && mergeRunId !== null
          ? { runId, mergeRunId, selectedArtifact: selected }
          : { runId, mergeRunId: null, artifactId },
      );
      // `post` answers null when the App holds no approval to republish.
      if (receipt === null && !selected) continue;
      const version = at(receipt, 'version');
      const sources = rows(at(receipt, 'sources'));
      if (
        // Only a republish can return a receipt written before merge selections (version 1).
        (selected ? version !== 2 : version !== 1 && version !== 2) ||
        text(at(receipt, 'runId')) !== runId ||
        at(receipt, 'artifactId') !== Number(artifactId) ||
        text(at(receipt, 'artifactName')) !== text(at(artifact, 'name')) ||
        (mergeRunId !== null && at(receipt, 'mergeRunId') !== mergeRunId) ||
        !Array.isArray(at(receipt, 'sources')) ||
        sources.length === 0 ||
        (selected &&
          (sources.length !== 1 ||
            at(sources[0], 'id') !== runId ||
            at(sources[0], 'kind') !== 'observation' ||
            at(sources[0], 'sha256') !== selected.manifestSha256 ||
            at(receipt, 'selected', 'sha256sumsSha256') !== selected.sha256sumsSha256))
      )
        throw new Error('Unexpected video publication receipt');
      published += 1;
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
  if (published === 0) throw new Error('No approved H3 artifact to republish in the source run');
}
