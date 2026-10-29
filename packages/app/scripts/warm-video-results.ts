import { env } from 'node:process';
import { publishVideoResults } from '../src/lib/video/video-publication';
if (!env.INFERENCEX_APP_URL) throw new Error('INFERENCEX_APP_URL is not set');
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
await publishVideoResults({
  get,
  runId: env.H3_RUN_ID,
  onStored: (run, artifact, sources) => {
    console.log(`Stored video run ${run}, artifact ${artifact}, ${sources} executions`);
  },
});
