import { at, number, rows, text, type Json } from '@/components/video-benchmark/bundle';

/** The publication job may write; every dashboard/media read remains published-only. */
export async function publishVideoResults({
  get,
  runId,
  onStored,
}: {
  get: (query: string) => Promise<Json>;
  runId?: string;
  onStored: (run: string, artifact: string, sources: number) => void;
}) {
  if (runId && !/^[1-9]\d*$/u.test(runId)) throw new Error('Invalid H3_RUN_ID');
  const seenRuns = new Set<string>();
  const failures: unknown[] = [];
  let page: number | null = 1;
  while (page !== null) {
    const catalog: Json = runId
      ? { runs: [{ id: runId }], nextPage: null }
      : await get(`?page=${page}`);
    if (!Array.isArray(at(catalog, 'runs'))) throw new Error('Invalid video run catalog');
    for (const run of rows(at(catalog, 'runs'))) {
      const id = String(at(run, 'id'));
      if (!/^[1-9]\d*$/u.test(id)) throw new Error('Invalid catalog run identity');
      if (seenRuns.has(id)) continue;
      seenRuns.add(id);
      try {
        const data = await get(`?run=${id}`);
        if (!Array.isArray(at(data, 'artifacts')))
          throw new Error('Invalid video artifact catalog');
        const seenArtifacts = new Set<string>();
        for (const artifact of rows(at(data, 'artifacts'))) {
          const artifactId = String(at(artifact, 'id'));
          if (!/^[1-9]\d*$/u.test(artifactId)) throw new Error('Invalid artifact identity');
          if (
            seenArtifacts.has(artifactId) ||
            at(artifact, 'stored') === true ||
            at(artifact, 'expired') === true
          )
            continue;
          seenArtifacts.add(artifactId);
          try {
            const result = await get(`?run=${id}&artifact=${artifactId}&format=media`);
            if (
              at(result, 'storageVersion') !== 1 ||
              text(at(result, 'runId')) !== id ||
              String(at(result, 'artifact', 'id')) !== artifactId ||
              !Array.isArray(at(result, 'sources'))
            )
              throw new Error('Unexpected video storage response');
            onStored(id, artifactId, rows(at(result, 'sources')).length);
          } catch (error) {
            failures.push(error);
          }
        }
      } catch (error) {
        failures.push(error);
      }
    }
    const next = at(catalog, 'nextPage');
    const nextPage = number(next);
    if (next !== null && (nextPage === null || !Number.isSafeInteger(nextPage) || nextPage <= page))
      throw new Error('Invalid video catalog pagination');
    page = nextPage;
  }
  if (failures.length > 0)
    throw new AggregateError(failures, `${failures.length} video publications failed`);
}
