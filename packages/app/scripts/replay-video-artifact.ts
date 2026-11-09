import { readFile } from 'node:fs/promises';
import { replayVideoArtifact } from '../src/components/video-benchmark/replay';

globalThis.fetch = () => {
  throw new Error('Network disabled for offline artifact replay');
};
const [zipPath, metadataPath, planSha256, ...extra] = process.argv.slice(2);
try {
  if (!zipPath || !metadataPath || !planSha256 || extra.length > 0)
    throw new Error(
      'Usage: bun --no-env-file scripts/replay-video-artifact.ts <original.zip> <github-artifact.json> <expected-plan-sha256>',
    );
  const report = await replayVideoArtifact(
    new Blob([new Uint8Array(await readFile(zipPath))]),
    JSON.parse(await readFile(metadataPath, 'utf8')),
    planSha256,
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  process.exitCode = 1;
}
