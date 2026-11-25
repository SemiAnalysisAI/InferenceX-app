import { at, number, rows, type Json } from '@/components/video-benchmark/bundle';

/**
 * With a merge run the App approves the artifact when that run's selection names it. Without one
 * it only republishes an artifact that is already approved.
 */
export interface VideoPublicationRequest {
  runId: string;
  mergeRunId: string | null;
  artifactId: string;
}

export async function publishVideoResults({
  get,
  post,
  runId,
  mergeRunId,
  onStored,
}: {
  get: (query: string) => Promise<Json>;
  /** Answers null when the App holds no approval for the artifact and the merge run gives none. */
  post: (body: VideoPublicationRequest) => Promise<Json>;
  runId: string;
  mergeRunId: string | null;
  /** `quality` counts the attached reference pairs; null when no trusted quality exists yet. */
  onStored: (
    run: string,
    artifact: string,
    sources: number,
    quality: number | 'failed' | null,
  ) => void;
}) {
  const data = await get(`?run=${runId}`);
  if (!Array.isArray(at(data, 'artifacts'))) throw new TypeError('Invalid video artifact catalog');
  const seen = new Set<string>();
  const failures: unknown[] = [];
  let published = 0;
  for (const artifact of rows(at(data, 'artifacts'))) {
    const artifactId = String(at(artifact, 'id'));
    if (seen.has(artifactId) || at(artifact, 'expired') === true) continue;
    seen.add(artifactId);
    try {
      const receipt = await post({ runId, mergeRunId, artifactId });
      if (receipt === null) continue;
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
  if (published === 0) throw new Error('The App published no H3 artifact of the source run');
}
