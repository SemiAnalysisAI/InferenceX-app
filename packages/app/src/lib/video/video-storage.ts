import { videoArtifactIdentity } from '@/components/video-benchmark/artifact-identity';
import { head, list, put, BlobNotFoundError } from '@vercel/blob';
import { archiveSources, type CIArtifact } from '@/components/video-benchmark/archive';
import { at, loadBundle, sha256, text } from '@/components/video-benchmark/bundle';
import {
  storedBundle,
  withQuality,
  type StoredArtifact,
  type StoredQuality,
  type StoredSource,
} from '@/components/video-benchmark/stored';
import { servingCells } from '@/components/video-benchmark/serving';
import {
  isMediaProfile,
  MEDIA_PROFILES,
  type DerivedMedia,
  type MediaProfile,
} from './video-renditions';

export const PREFIX = 'h3-video-media/v1';
export const videoStorageEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const runPrefix = (runId: string) => `${PREFIX}/runs/${runId}/`;
export const approvalPath = (runId: string, artifact: CIArtifact) =>
  `${PREFIX}/approvals/${runId}/${artifact.name}_${artifact.id}.json`;
const qualityPath = (runId: string, artifact: CIArtifact) =>
  `${PREFIX}/quality/${runId}/${artifact.name}_${artifact.id}.json`;
const renditionsPrefix = `${PREFIX}/renditions/`;
/** Content-addressed by the derived output, like every other stored object. */
export const derivedMediaPath = (profile: MediaProfile, outputSha256: string) =>
  `${PREFIX}/objects/${outputSha256}/${profile}.${MEDIA_PROFILES[profile].extension}`;
/** The output hash in the receipt path lets one listing resolve every derived media URL. */
export const derivedReceiptPath = (
  profile: MediaProfile,
  sourceSha256: string,
  outputSha256: string,
) => `${renditionsPrefix}${sourceSha256}/${profile}/${outputSha256}.json`;
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
/** The artifact's separately stored quality attachment, or null before one is published. */
export async function readStoredQuality(
  runId: string,
  artifact: CIArtifact,
): Promise<StoredQuality | null> {
  if (!videoStorageEnabled()) return null;
  let metadata: Awaited<ReturnType<typeof head>>;
  try {
    metadata = await head(qualityPath(runId, artifact));
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
  const response = await fetch(metadata.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Stored quality unavailable');
  const quality: StoredQuality = await response.json();
  if (quality.version !== 1 || quality.runId !== runId || quality.artifactId !== artifact.id)
    throw new Error('Stored quality identity mismatch');
  return quality;
}

/**
 * The stored index with its quality attachment, which is stored apart from the immutable index.
 * Quality is optional, so a failed quality read still returns the index, marked incomplete so
 * callers neither cache it nor hide the published media.
 */
export async function readPublishedArtifact(
  runId: string,
  artifact: CIArtifact,
): Promise<{ saved: StoredArtifact | null; complete: boolean }> {
  const [saved, quality] = await Promise.all([
    readStoredArtifact(runId, artifact),
    readStoredQuality(runId, artifact).catch(() => undefined),
  ]);
  return {
    saved: saved && quality ? withQuality(saved, quality) : saved,
    complete: quality !== undefined,
  };
}

/** First write wins; a later attachment for the same artifact reads back the stored one. */
export async function storeVideoQuality(
  artifact: CIArtifact,
  quality: StoredQuality,
  signal: AbortSignal,
): Promise<StoredQuality> {
  await immutable(
    qualityPath(quality.runId, artifact),
    JSON.stringify(quality),
    'application/json',
    signal,
  );
  const written = await readStoredQuality(quality.runId, artifact);
  if (!written) throw new Error('Stored quality readback failed');
  return written;
}

/** Content-addressed like candidate media; downloads only when the object is not stored yet. */
export async function storeReferenceMedia(
  mediaSha256: string,
  filename: string,
  download: () => Promise<Blob>,
  signal: AbortSignal,
): Promise<string> {
  const path = `${PREFIX}/objects/${mediaSha256}/${filename}`;
  try {
    const stored = await head(path);
    return stored.url;
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
  }
  const uploaded = await immutable(path, await download(), 'video/mp4', signal);
  return uploaded.url;
}
export async function immutable(
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

/** The digests a merge selection names for one bundle. */
export interface VideoPublicationSelection {
  manifestSha256: string;
  sha256sumsSha256: string;
}

/**
 * Version 2 carries the merge run and the selection it was verified against. Version 1 was
 * written before merge selections existed. Nothing writes it any more, and reading it is the one
 * permanent compatibility path: the entries it approves are never migrated.
 */
export interface VideoPublicationReceipt {
  version: 1 | 2;
  runId: string;
  artifactId: number;
  artifactName: string;
  artifactDigest: string | null;
  mergeRunId: string | null;
  selected?: VideoPublicationSelection;
  sources: PublicationSource[];
}

/** The stored receipt as written, or null when the artifact has none. */
async function receiptText(runId: string, artifact: CIArtifact): Promise<string | null> {
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
  return response.text();
}

/**
 * The receipt that approves `saved`, or null without one. The index and the receipt are both
 * immutable, so a read only binds them by the manifest SHA256; the receipt was verified in full
 * when it was written.
 */
export async function readVideoPublication(
  runId: string,
  artifact: CIArtifact,
  saved: StoredArtifact,
): Promise<VideoPublicationReceipt | null> {
  if (!videoStorageEnabled()) return null;
  const stored = await receiptText(runId, artifact);
  if (stored === null) return null;
  const receipt: VideoPublicationReceipt = JSON.parse(stored);
  // A receipt approves only when it names a merge run.
  if (
    typeof receipt.mergeRunId !== 'string' ||
    !/^[1-9]\d*$/u.test(receipt.mergeRunId) ||
    !Number.isSafeInteger(Number(receipt.mergeRunId))
  )
    return null;
  if (
    (receipt.version !== 1 && receipt.version !== 2) ||
    receipt.sources[0]?.sha256 !== storedBundle(saved.sources[0]).manifestSha256
  )
    throw new Error('Video publication receipt does not match its stored source');
  return receipt;
}

/**
 * The one check of an already stored copy against a merge selection: its manifest, and its
 * SHA256SUMS by the content address it is stored under.
 */
export function requireSelectedSource(saved: StoredArtifact, selected: VideoPublicationSelection) {
  const seal = `/${PREFIX}/objects/${selected.sha256sumsSha256}/SHA256SUMS`;
  if (
    saved.sources.length !== 1 ||
    storedBundle(saved.sources[0]).manifestSha256 !== selected.manifestSha256 ||
    !saved.sources[0].assets.some(([path, { url }]) => path === 'SHA256SUMS' && url.endsWith(seal))
  )
    throw new Error('Stored source differs from the merge selection');
}

/**
 * The only writer of an approval: a merge run approves the stored bundle that its selection
 * names, which the caller has checked against that selection. Serving evidence is validated here,
 * once. The first receipt wins: a repeat with the same merge run and selection reuses it, and any
 * other stored receipt refuses the approval.
 */
export async function approveVideoPublication(
  saved: StoredArtifact,
  mergeRunId: string,
  { manifestSha256, sha256sumsSha256 }: VideoPublicationSelection,
  signal: AbortSignal,
): Promise<VideoPublicationReceipt> {
  const { runId, artifact } = saved;
  const bundle = storedBundle(saved.sources[0]);
  servingCells(bundle);
  const receipt: VideoPublicationReceipt = {
    version: 2,
    runId,
    artifactId: artifact.id,
    artifactName: artifact.name,
    artifactDigest: artifact.digest ?? null,
    mergeRunId,
    selected: { manifestSha256, sha256sumsSha256 },
    sources: [
      {
        id: saved.sources[0].id,
        kind: 'observation',
        sha256: bundle.manifestSha256,
        checkoutSha: text(at(bundle.manifest, 'git_commit')),
      },
    ],
  };
  const body = JSON.stringify(receipt);
  const existing = await receiptText(runId, artifact);
  if (existing === null) {
    await immutable(approvalPath(runId, artifact), body, 'application/json', signal);
    // A concurrent approval may have written first, so the stored bytes must be these.
    if ((await receiptText(runId, artifact)) !== body)
      throw new Error('Video publication receipt readback mismatch');
  } else if (existing !== body)
    throw new Error('Video publication already has a different merge identity');
  return receipt;
}

/**
 * Stores the one observation bundle a merge selection names. The ZIP is checked against the
 * selection here, before the first write.
 */
export async function storeVideoArtifact(
  runId: string,
  artifact: CIArtifact,
  zip: Blob,
  signal: AbortSignal,
  selected: VideoPublicationSelection,
): Promise<StoredArtifact> {
  const sources = await archiveSources(zip, artifact);
  if (sources.length !== 1) throw new Error('A merge selection names one observation bundle');
  const [source] = sources;
  const bundle = await loadBundle(source.read);
  if (
    bundle.checksums.get('manifest.json') !== selected.manifestSha256 ||
    (await sha256(bundle.files.get('SHA256SUMS')!)) !== selected.sha256sumsSha256
  )
    throw new Error('Bundle differs from the merge selection');
  const uploads = new Map<string, Promise<{ url: string; downloadUrl: string }>>();
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
    if (path === 'report/index.html' || (!bundle.result && legacyTelemetry(path)))
      texts.push([path, await body.text()]);
  }
  const result: StoredArtifact = {
    storageVersion: 1,
    runId,
    artifact: { ...artifact, stored: true },
    sources: [
      {
        id: source.id,
        documents: [...bundle.documents],
        checksums: [...bundle.checksums],
        assets,
        texts,
      },
    ],
  };
  await immutable(
    `${runPrefix(runId)}${artifact.name}_${artifact.id}.json`,
    JSON.stringify(result),
    'application/json',
    signal,
  );
  return result;
}

/**
 * Map each original MP4 SHA256 to its derived media (web rendition, poster) from one listing.
 * A receipt is written only after its validated upload, so its path alone identifies the
 * object. The first listed receipt of a profile wins; unknown profiles are ignored.
 */
export async function derivedMedia(): Promise<Map<string, DerivedMedia>> {
  const media = new Map<string, DerivedMedia>();
  if (!videoStorageEnabled()) return media;
  let cursor: string | undefined;
  do {
    const batch = await list({ prefix: renditionsPrefix, cursor });
    for (const blob of batch.blobs) {
      const match =
        /^h3-video-media\/v1\/renditions\/(?<source>[a-f0-9]{64})\/(?<profile>[^/]+)\/(?<output>[a-f0-9]{64})\.json$/u.exec(
          blob.pathname,
        )?.groups;
      if (!match || !isMediaProfile(match.profile)) continue;
      const { field } = MEDIA_PROFILES[match.profile];
      const derived = media.get(match.source) ?? {};
      if (derived[field]) continue;
      derived[field] = new URL(`/${derivedMediaPath(match.profile, match.output)}`, blob.url).href;
      media.set(match.source, derived);
    }
    cursor = batch.hasMore ? batch.cursor : undefined;
  } while (cursor);
  return media;
}
