import { videoArtifactIdentity } from '@/components/video-benchmark/artifact-identity';
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
  storedFidelityBundle,
  type StoredArtifact,
  type StoredSource,
} from '@/components/video-benchmark/stored';
import { servingCells } from '@/components/video-benchmark/serving';
import {
  videoHistoryEntry,
  type VideoHistoryEntry,
  type VideoHistoryPage,
} from '@/components/video-benchmark/history';

const PREFIX = 'h3-video-media/v1';
export const videoStorageEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const runPrefix = (runId: string) => `${PREFIX}/runs/${runId}/`;
const approvalPath = (runId: string, artifact: CIArtifact) =>
  `${PREFIX}/approvals/${runId}/${artifact.name}_${artifact.id}.json`;
const sourceSeal = (path: string) => /^sources\/[1-9]\d*\/original-SHA256SUMS$/u.test(path);
const legacyTelemetry = (path: string) =>
  /^gpu\/supervisor\/(?:baseline|candidate)\/telemetry\.jsonl$/u.test(path);

export async function storedArtifacts(runId: string): Promise<CIArtifact[]> {
  if (!videoStorageEnabled()) return [];
  const result: CIArtifact[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: runPrefix(runId), cursor });
    for (const blob of page.blobs) {
      const match = /\/(?<name>[^/]+)_(?<id>[1-9]\d*)\.json$/u.exec(blob.pathname);
      if (match?.groups && videoArtifactIdentity(match.groups.name)?.run === runId)
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
    for (const source of result.sources)
      source.texts = source.texts.filter(
        ([path]) => path === 'report/index.html' || legacyTelemetry(path) || sourceSeal(path),
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

interface PublicationSource {
  id: string;
  kind: 'observation' | 'fidelity';
  sha256: string;
  checkoutSha: string;
}

export interface VideoPublicationReceipt {
  version: 1;
  runId: string;
  artifactId: number;
  artifactName: string;
  artifactDigest: string | null;
  mergeRunId: string | null;
  sources: PublicationSource[];
}

function publicationSources(saved: StoredArtifact): PublicationSource[] {
  if (saved.sources.length === 0) throw new Error('Video publication has no source');
  return saved.sources
    .map((source) => {
      let sha: string;
      let checkout: string;
      if (source.kind === 'fidelity') {
        const bundle = storedFidelityBundle(source);
        sha = bundle.comparisonSha256;
        checkout = text(at(bundle.comparison, 'producer', 'git_commit'));
      } else {
        const bundle = storedBundle(source);
        servingCells(bundle);
        sha = bundle.manifestSha256;
        checkout = text(at(bundle.manifest, 'git_commit'));
      }
      if (!/^[a-f0-9]{64}$/u.test(sha) || !/^[a-f0-9]{40}$/u.test(checkout))
        throw new Error('Video publication source seal is invalid');
      return {
        id: source.id,
        kind: source.kind === 'fidelity' ? ('fidelity' as const) : ('observation' as const),
        sha256: sha,
        checkoutSha: checkout,
      };
    })
    .toSorted((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));
}

function expectedReceipt(
  runId: string,
  artifact: CIArtifact,
  saved: StoredArtifact,
  mergeRunId: string | null,
): VideoPublicationReceipt {
  if (
    saved.runId !== runId ||
    saved.artifact.id !== artifact.id ||
    saved.artifact.name !== artifact.name ||
    (artifact.digest !== undefined && saved.artifact.digest !== artifact.digest)
  )
    throw new Error('Stored video source does not match the GitHub artifact');
  return {
    version: 1,
    runId,
    artifactId: artifact.id,
    artifactName: artifact.name,
    artifactDigest: saved.artifact.digest ?? null,
    mergeRunId,
    sources: publicationSources(saved),
  };
}

export async function readVideoPublication(
  runId: string,
  artifact: CIArtifact,
  saved: StoredArtifact,
): Promise<VideoPublicationReceipt | null> {
  if (!videoStorageEnabled()) return null;
  if (
    videoArtifactIdentity(artifact.name)?.run !== runId ||
    !Number.isSafeInteger(artifact.id) ||
    artifact.id <= 0
  )
    throw new Error('Invalid video publication identity');
  let url: string;
  try {
    const metadata = await head(approvalPath(runId, artifact));
    url = metadata.url;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Video publication receipt unavailable');
  const receipt: VideoPublicationReceipt = await response.json();
  if (
    receipt.mergeRunId !== null &&
    (typeof receipt.mergeRunId !== 'string' ||
      !/^[1-9]\d*$/u.test(receipt.mergeRunId) ||
      !Number.isSafeInteger(Number(receipt.mergeRunId)))
  )
    throw new Error('Invalid video publication merge identity');
  const expected = expectedReceipt(runId, artifact, saved, receipt.mergeRunId);
  if (JSON.stringify(receipt) !== JSON.stringify(expected))
    throw new Error('Video publication receipt does not match its stored source');
  return receipt;
}

export async function approveVideoPublication(
  runId: string,
  artifact: CIArtifact,
  saved: StoredArtifact,
  mergeRunId: string | null,
  signal: AbortSignal,
): Promise<VideoPublicationReceipt> {
  const expected = expectedReceipt(runId, artifact, saved, mergeRunId);
  const existing = await readVideoPublication(runId, artifact, saved);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(expected))
      throw new Error('Video publication already has a different merge identity');
    return existing;
  }
  await immutable(
    approvalPath(runId, artifact),
    JSON.stringify(expected),
    'application/json',
    signal,
  );
  const written = await readVideoPublication(runId, artifact, saved);
  if (!written || JSON.stringify(written) !== JSON.stringify(expected))
    throw new Error('Video publication receipt readback mismatch');
  return written;
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
        (fidelity && sourceSeal(path)) ||
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
  await immutable(
    `${runPrefix(runId)}${artifact.name}_${artifact.id}.json`,
    JSON.stringify(result),
    'application/json',
    signal,
  );
  return result;
}

/** Read existing immutable indexes only. This path never uploads an artifact or media. */
export async function publishedVideoHistory(page: number): Promise<VideoHistoryPage> {
  if (!videoStorageEnabled()) return { schemaVersion: 1, entries: [], nextPage: null };
  const indexes: { runId: string; artifact: CIArtifact; publishedAt: string }[] = [];
  let cursor: string | undefined;
  // ponytail: scan index metadata; add a materialized catalog if the published inventory grows large.
  do {
    const batch = await list({ prefix: `${PREFIX}/runs/`, cursor });
    for (const blob of batch.blobs) {
      const match =
        /^h3-video-media\/v1\/runs\/(?<run>[1-9]\d*)\/(?<name>[^/]+)_(?<artifact>[1-9]\d*)\.json$/u.exec(
          blob.pathname,
        )?.groups;
      if (!match || videoArtifactIdentity(match.name)?.run !== match.run) continue;
      indexes.push({
        runId: match.run,
        publishedAt: blob.uploadedAt.toISOString(),
        artifact: {
          id: Number(match.artifact),
          name: match.name,
          expired: false,
          size_in_bytes: 0,
          stored: true,
          indexUrl: blob.url,
        },
      });
    }
    cursor = batch.hasMore ? batch.cursor : undefined;
  } while (cursor);
  indexes.sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.artifact.id - a.artifact.id,
  );
  const size = 10;
  const entries = await Promise.all(
    indexes.slice((page - 1) * size, page * size).map(async (index): Promise<VideoHistoryEntry> => {
      try {
        const saved = await readStoredArtifact(index.runId, index.artifact);
        if (!saved) throw new Error('Published artifact unavailable');
        const approved = await readVideoPublication(index.runId, index.artifact, saved)
          .then((receipt) => receipt !== null)
          .catch(() => false);
        return { ...videoHistoryEntry(saved, index.publishedAt), approved };
      } catch (error) {
        return {
          id: `${index.runId}.${index.artifact.id}`,
          ...index,
          approved: false,
          sources: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  return { schemaVersion: 1, entries, nextPage: page * size < indexes.length ? page + 1 : null };
}
