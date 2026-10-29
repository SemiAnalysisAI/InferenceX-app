import { at, rows, text, type Json } from '@/components/video-benchmark/bundle';

export async function publishVideoResults({
  get,
  post,
  runId,
  mergeRunId,
  onStored,
}: {
  get: (query: string) => Promise<Json>;
  post: (body: { runId: string; artifactId: string; mergeRunId: string | null }) => Promise<Json>;
  runId: string;
  mergeRunId: string | null;
  onStored: (run: string, artifact: string, sources: number) => void;
}) {
  if (!/^[1-9]\d*$/u.test(runId) || !Number.isSafeInteger(Number(runId)))
    throw new Error('Invalid H3_RUN_ID');
  if (
    mergeRunId !== null &&
    (!/^[1-9]\d*$/u.test(mergeRunId) || !Number.isSafeInteger(Number(mergeRunId)))
  )
    throw new Error('Invalid H3_MERGE_RUN_ID');
  const data = await get(`?run=${runId}`);
  if (!Array.isArray(at(data, 'artifacts'))) throw new Error('Invalid video artifact catalog');
  const seen = new Set<string>();
  const failures: unknown[] = [];
  for (const artifact of rows(at(data, 'artifacts'))) {
    const artifactId = String(at(artifact, 'id'));
    if (!/^[1-9]\d*$/u.test(artifactId) || !Number.isSafeInteger(Number(artifactId)))
      throw new Error('Invalid artifact identity');
    if (seen.has(artifactId) || at(artifact, 'expired') === true) continue;
    seen.add(artifactId);
    try {
      const receipt = await post({ runId, artifactId, mergeRunId });
      if (
        at(receipt, 'version') !== 1 ||
        text(at(receipt, 'runId')) !== runId ||
        at(receipt, 'artifactId') !== Number(artifactId) ||
        text(at(receipt, 'artifactName')) !== text(at(artifact, 'name')) ||
        at(receipt, 'mergeRunId') !== mergeRunId ||
        !Array.isArray(at(receipt, 'sources')) ||
        rows(at(receipt, 'sources')).length === 0
      )
        throw new Error('Unexpected video publication receipt');
      onStored(runId, artifactId, rows(at(receipt, 'sources')).length);
    } catch (error) {
      failures.push(error);
    }
  }
  if (seen.size === 0) throw new Error('No H3 artifact in the selected source run');
  if (failures.length > 0)
    throw new AggregateError(failures, `${failures.length} video publications failed`);
}
