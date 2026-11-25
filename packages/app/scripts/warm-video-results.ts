import { env } from 'node:process';
import { readFile } from 'node:fs/promises';
import {
  publishVideoResults,
  type VideoPublicationRequest,
} from '../src/lib/video/video-publication';
if (!env.INFERENCEX_APP_URL) throw new Error('INFERENCEX_APP_URL is not set');
if (!env.INVALIDATE_SECRET) throw new Error('INVALIDATE_SECRET is not set');
if (!env.H3_RUN_ID) throw new Error('H3_RUN_ID is not set');
// A merge dispatch approves its selection. A manual dispatch only republishes approved artifacts.
const { H3_MERGE_RUN_ID: mergeRunId, H3_SELECTION_PATH: selectionPath } = env;
const merge =
  env.H3_PUBLICATION_EVENT === 'repository_dispatch' && mergeRunId && selectionPath
    ? { mergeRunId, selectionPath }
    : null;
if (!merge && (env.H3_PUBLICATION_EVENT !== 'workflow_dispatch' || mergeRunId || selectionPath))
  throw new Error('H3 publication requires a merge dispatch with its selection or a manual run');
const origin = new URL(env.INFERENCEX_APP_URL).origin;
const bypassSecret = env.VERCEL_PROTECTION_BYPASS_SECRET;
const headers = bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : undefined;
async function get(path: string) {
  const response = await fetch(`${origin}/api/video-runs${path}`, {
    headers,
    signal: AbortSignal.timeout(290000),
  });
  if (!response.ok) throw new Error(`H3 publication failed: HTTP ${response.status}`);
  if (response.status === 204)
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured on the frontend');
  return response.json();
}
async function post(body: VideoPublicationRequest) {
  const response = await fetch(`${origin}/api/video-runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.INVALIDATE_SECRET}`,
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(290000),
  });
  // The App answers 409 when a manual run names an artifact it never approved.
  if (response.status === 409 && body.mergeRunId === null) return null;
  if (!response.ok) throw new Error(`H3 publication failed: HTTP ${response.status}`);
  return response.json();
}
await publishVideoResults({
  get,
  post,
  runId: env.H3_RUN_ID,
  selection: merge ? JSON.parse(await readFile(merge.selectionPath, 'utf8')) : undefined,
  mergeRunId: merge?.mergeRunId ?? null,
  onStored: (run, artifact, sources, quality) => {
    const pairs =
      quality === null
        ? 'no quality yet'
        : quality === 'failed'
          ? 'quality attachment failed'
          : `${quality} reference pairs`;
    console.log(`Stored video run ${run}, artifact ${artifact}, ${sources} executions, ${pairs}`);
  },
});
