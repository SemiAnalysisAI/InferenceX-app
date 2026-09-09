import { head, list, put, BlobNotFoundError } from '@vercel/blob';
import { archiveSources, type CIArtifact } from '@/components/video-benchmark/archive';
import { loadBundle, sha256 } from '@/components/video-benchmark/bundle';
import type { StoredArtifact, StoredSource } from '@/components/video-benchmark/stored';

// Media must survive the dashboard cache's prefix-wide purge.
const PREFIX = 'h3-video-media/v1';
export const videoStorageEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const runPrefix = (runId: string) => `${PREFIX}/runs/${runId}/`;

export async function storedArtifacts(runId: string): Promise<CIArtifact[]> {
  if (!videoStorageEnabled()) return [];
  const result: CIArtifact[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: runPrefix(runId), cursor });
    for (const blob of page.blobs) {
      const match = /\/(?<name>h3-(?:results|video)-\d+-\d+)_(?<id>\d+)\.json$/u.exec(
        blob.pathname,
      );
      if (match?.groups)
        result.push({
          id: Number(match.groups.id),
          name: match.groups.name,
          expired: false,
          size_in_bytes: 0,
          stored: true,
        });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return result;
}
export async function readStoredArtifact(
  runId: string,
  artifact: CIArtifact,
): Promise<StoredArtifact | null> {
  if (!videoStorageEnabled()) return null;
  try {
    const meta = await head(`${runPrefix(runId)}${artifact.name}_${artifact.id}.json`);
    const response = await fetch(meta.url);
    if (!response.ok) throw new Error('Stored result unavailable');
    const result: StoredArtifact = await response.json();
    if (result.storageVersion !== 1 || result.runId !== runId || result.artifact.id !== artifact.id)
      throw new Error('Stored artifact identity mismatch');
    return result;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}
async function immutable(
  path: string,
  body: Blob | string,
  contentType: string,
  signal: AbortSignal,
) {
  try {
    return await put(path, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType,
      cacheControlMaxAge: 31536000,
      abortSignal: signal,
    });
  } catch (error) {
    try {
      return await head(path);
    } catch {
      throw error;
    }
  }
}
export async function storeVideoArtifact(
  runId: string,
  artifact: CIArtifact,
  zip: Blob,
  signal: AbortSignal,
): Promise<StoredArtifact> {
  const sources: StoredSource[] = [];
  const uploads = new Map<string, Promise<{ url: string; downloadUrl: string }>>();
  for (const source of await archiveSources(zip, artifact)) {
    const bundle = await loadBundle(source.read);
    const assets: StoredSource['assets'] = [];
    const files = [...bundle.files];
    for (let start = 0; start < files.length; start += 8) {
      const batch = await Promise.allSettled(
        files.slice(start, start + 8).map(async ([path, body]) => {
          const hash = bundle.checksums.get(path) ?? (await sha256(body));
          const key = `${PREFIX}/objects/${hash}/${path.split('/').at(-1)}`;
          let upload = uploads.get(key);
          if (!upload) {
            upload = immutable(
              key,
              body,
              path.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
              signal,
            );
            uploads.set(key, upload);
          }
          const saved = await upload;
          assets.push([path, { url: saved.url, downloadUrl: saved.downloadUrl }]);
        }),
      );
      const failed = batch.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
    const texts: StoredSource['texts'] = [];
    for (const [path, body] of bundle.files) {
      if (path === 'report/index.html' || (!bundle.result && path.endsWith('/telemetry.jsonl')))
        texts.push([path, await body.text()]);
    }
    sources.push({
      id: source.id,
      documents: [...bundle.documents],
      checksums: [...bundle.checksums],
      assets,
      texts,
    });
  }
  const result: StoredArtifact = {
    storageVersion: 1,
    runId,
    artifact: { ...artifact, stored: true },
    sources,
  };
  // Publish the index last so readers cannot observe partially uploaded bundles.
  await immutable(
    `${runPrefix(runId)}${artifact.name}_${artifact.id}.json`,
    JSON.stringify(result),
    'application/json',
    signal,
  );
  return result;
}
