import { head, list, put, BlobNotFoundError } from '@vercel/blob';
import { archiveSources, type CIArtifact } from '@/components/video-benchmark/archive';
import {
  at,
  loadBundle,
  number,
  ROLES,
  rows,
  sha256,
  text,
} from '@/components/video-benchmark/bundle';
import { loadFidelityBundle, type FidelityBundle } from '@/components/video-benchmark/fidelity';
import {
  storedBundle,
  type StoredArtifact,
  type StoredSource,
} from '@/components/video-benchmark/stored';
import { servingCells } from '@/components/video-benchmark/serving';

// Media must survive the dashboard cache's prefix-wide purge.
const PREFIX = 'h3-video-media/v1';
export const videoStorageEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const runPrefix = (runId: string) => `${PREFIX}/runs/${runId}/`;
const legacyTelemetry = (path: string) =>
  /^gpu\/supervisor\/(?:baseline|candidate)\/telemetry\.jsonl$/u.test(path);

export async function storedArtifacts(runId: string): Promise<CIArtifact[]> {
  if (!videoStorageEnabled()) return [];
  const result: CIArtifact[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: runPrefix(runId), cursor });
    for (const blob of page.blobs) {
      const match = /\/(?<name>h3-(?:results|video|fidelity)-\d+-\d+)_(?<id>\d+)\.json$/u.exec(
        blob.pathname,
      );
      if (match?.groups)
        result.push({
          id: Number(match.groups.id),
          name: match.groups.name,
          expired: false,
          size_in_bytes: 0,
          stored: true,
          indexUrl: blob.url,
        });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return result;
}

async function verifyPublishedSources(bundle: FidelityBundle, signal: AbortSignal) {
  const comparison = bundle.comparison;
  const roles = new Set<string>();
  const media = new Map<string, StoredSource['assets'][number][1]>();
  for (const reference of rows(at(comparison, 'source_artifacts'))) {
    const id = number(at(reference, 'ci', 'databaseId'));
    const artifactId = number(at(reference, 'artifact', 'id'));
    const name = text(at(reference, 'artifact', 'name'));
    if (
      !Number.isSafeInteger(id) ||
      !id ||
      !Number.isSafeInteger(artifactId) ||
      !artifactId ||
      !new RegExp(`^h3-video-${id}-[1-9]\\d*$`, 'u').test(name)
    )
      throw new Error('Invalid original fidelity artifact');
    const saved = await readStoredArtifact(String(id), {
      id: artifactId,
      name,
      expired: false,
      size_in_bytes: 0,
    });
    const source = saved?.sources.find((item) => item.id === String(id) && !item.kind);
    if (!source || saved?.artifact.digest !== at(reference, 'artifact', 'digest'))
      throw new Error('Fidelity media requires an already published original source');
    const original = storedBundle(source);
    servingCells(original);
    const revision = at(original.manifest, 'git_commit');
    if (
      revision !== at(reference, 'ci', 'headSha') ||
      revision !== at(reference, 'artifact', 'workflow_run', 'head_sha') ||
      at(reference, 'artifact', 'workflow_run', 'id') !== id
    )
      throw new Error('Fidelity original source revision mismatch');
    const sealUrl = source.assets.find(([path]) => path === 'SHA256SUMS')?.[1].url;
    if (!sealUrl) throw new Error('Original source seal unavailable');
    const seal = await fetch(sealUrl, { signal });
    if (!seal.ok || (await sha256(await seal.blob())) !== at(reference, 'source_seal_sha256'))
      throw new Error('Fidelity original source seal mismatch');
    const role = ROLES.find(
      (candidateRole) =>
        at(comparison, candidateRole, 'run_bundle_sha256') ===
        original.checksums.get('gpu/c1/baseline/run.json'),
    );
    if (!role || roles.has(role))
      throw new Error('Fidelity roles do not match the original C1 runs');
    roles.add(role);
    const hashes = new Set<string>();
    for (const [path, hash] of original.checksums) {
      if (!/^gpu\/c1\/baseline\/artifacts\/[^/]+\.mp4$/u.test(path)) continue;
      const asset = source.assets.find(([assetPath]) => assetPath === path)?.[1];
      if (asset) {
        hashes.add(hash);
        media.set(hash, asset);
      }
    }
    for (const slot of rows(at(comparison, 'slots'))) {
      const hash = at(slot, role, 'sha256');
      if (text(at(slot, role, 'artifact_path')) && !hashes.has(text(hash)))
        throw new Error('Fidelity media was not published in the original C1 source');
    }
  }
  if (roles.size !== 2) throw new Error('Both original fidelity sources are required');
  return media;
}
export async function readStoredArtifact(
  runId: string,
  artifact: CIArtifact,
): Promise<StoredArtifact | null> {
  if (!videoStorageEnabled()) return null;
  try {
    let url = artifact.indexUrl;
    if (!url) {
      const meta = await head(`${runPrefix(runId)}${artifact.name}_${artifact.id}.json`);
      url = meta.url;
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Stored result unavailable');
    const result: StoredArtifact = await response.json();
    if (result.storageVersion !== 1 || result.runId !== runId || result.artifact.id !== artifact.id)
      throw new Error('Stored artifact identity mismatch');
    // Serving cells already carry verified power and memory summaries. Older
    // indexes embedded their full logs; keep those in downloadable assets only.
    for (const source of result.sources)
      source.texts = source.texts.filter(
        ([path]) => path === 'report/index.html' || legacyTelemetry(path),
      );
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
    const fidelity = 'kind' in source && source.kind === 'fidelity';
    const fidelityBundle = fidelity ? await loadFidelityBundle(source.read, source.id) : null;
    const bundle = fidelityBundle ?? (await loadBundle(source.read));
    const publishedMedia = fidelityBundle
      ? await verifyPublishedSources(fidelityBundle, signal)
      : null;
    const assets: StoredSource['assets'] = [];
    const files = [...bundle.files];
    for (let start = 0; start < files.length; start += 8) {
      const batch = await Promise.allSettled(
        files.slice(start, start + 8).map(async ([path, body]) => {
          const hash = bundle.checksums.get(path) ?? (await sha256(body));
          const original = path.endsWith('.mp4') ? publishedMedia?.get(hash) : undefined;
          if (original) {
            assets.push([path, original]);
            return;
          }
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
      if (
        path === 'report/index.html' ||
        (!('result' in bundle && bundle.result) && legacyTelemetry(path))
      )
        texts.push([path, await body.text()]);
    }
    sources.push({
      id: source.id,
      ...(fidelity ? { kind: 'fidelity' as const } : {}),
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
