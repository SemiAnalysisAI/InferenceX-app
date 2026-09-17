import { env } from 'node:process';
const productionOrigin = 'https://inferencex.semianalysis.com';
async function get(path: string) {
  const response = await fetch(`${productionOrigin}/api/video-runs${path}`, {
    signal: AbortSignal.timeout(290000),
  });
  if (!response.ok) throw new Error(`H3 publication failed: HTTP ${response.status}`);
  if (response.status === 204)
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured on the frontend');
  return response.json();
}
const runId = env.H3_RUN_ID;
if (runId && !/^[1-9]\d*$/u.test(runId)) throw new Error('Invalid H3_RUN_ID');
const catalog = runId ? { runs: [{ id: runId }] } : await get('?page=1');
const runs: { id: number | string }[] = catalog.runs;
for (const run of runs) {
  const data = await get(`?run=${run.id}`);
  for (const artifact of data.artifacts) {
    if (artifact.stored || artifact.expired) continue;
    const result = await get(`?run=${run.id}&artifact=${artifact.id}&format=media`);
    if (result.storageVersion !== 1) throw new Error('Unexpected H3 storage response');
    console.log(
      `Stored H3 run ${run.id}, artifact ${artifact.id}, ${result.sources.length} executions`,
    );
  }
}
