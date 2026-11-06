import { videoArtifactIdentity } from '@/components/video-benchmark/artifact-identity';
import { verifyManifestIdentity, type CIArtifact } from '@/components/video-benchmark/archive';
import { at, loadBundle, text } from '@/components/video-benchmark/bundle';
import {
  liveHistoryEntry,
  type VideoHistoryEntry,
  type VideoHistoryPage,
} from '@/components/video-benchmark/history';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { readZipEntries } from './zip-range';

export type GithubRead = (
  path: string,
  signal: AbortSignal,
  init?: { redirect?: RequestRedirect },
) => Promise<Response>;

const MAX_ARTIFACTS = 32;
const CACHE_LIMIT = 32;
const cache = new Map<string, Promise<StoredArtifact>>();

/** Observation code reads only these; media, logs and stdout captures stay in the ZIP. */
const isDocument = (path: string) =>
  path === 'SHA256SUMS' || (path.endsWith('.json') && !path.endsWith('.stdout.json'));

/** Newest attempt of each native result configuration; an older attempt is a superseded rerun. */
function latestResults(runId: string, artifacts: CIArtifact[]): CIArtifact[] {
  const latest = new Map<string, CIArtifact>();
  for (const artifact of artifacts) {
    const identity = videoArtifactIdentity(artifact.name);
    if (
      !artifact.name.startsWith('h3-results-') ||
      identity?.run !== runId ||
      artifact.expired ||
      artifact.workflow_run?.id !== Number(runId)
    )
      continue;
    const key = identity.configuration ?? '';
    const current = latest.get(key);
    if (!current || Number(videoArtifactIdentity(current.name)!.attempt) < Number(identity.attempt))
      latest.set(key, artifact);
  }
  if (latest.size > MAX_ARTIFACTS) throw new Error('Too many result artifacts to read live');
  return [...latest.values()].toSorted((a, b) => b.id - a.id);
}

async function rangeRead(url: string, start: number, end: number, signal: AbortSignal) {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end - 1}` },
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  // Storage that ignores Range answers 200 with the whole archive; never read that body.
  if (
    response.status !== 206 ||
    !response.headers.get('content-range')?.startsWith(`bytes ${start}-${end - 1}/`)
  ) {
    await response.body?.cancel();
    throw new Error('Artifact storage did not honor the byte range');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== end - start) throw new Error('Artifact range length mismatch');
  return bytes;
}

async function readArtifact(
  runId: string,
  artifact: CIArtifact,
  github: GithubRead,
  signal: AbortSignal,
): Promise<StoredArtifact> {
  const redirect = await github(`/actions/artifacts/${artifact.id}/zip`, signal, {
    redirect: 'manual',
  });
  await redirect.body?.cancel();
  const location = redirect.headers.get('location');
  if (redirect.status < 300 || redirect.status >= 400 || !location?.startsWith('https://'))
    throw new Error('Artifact download unavailable');
  const files = await readZipEntries(
    (start, end) => rangeRead(location, start, end, signal),
    artifact.size_in_bytes,
    isDocument,
  );
  if (files.has('index.json')) throw new Error('Exported archives are not read live');
  const bundle = await loadBundle((path) => {
    const bytes = files.get(path);
    if (!bytes) return Promise.reject(new Error(`Missing artifact file: ${path}`));
    return Promise.resolve(new Blob([new Uint8Array(bytes)]));
  }, isDocument);
  verifyManifestIdentity(bundle.manifest, artifact);
  return {
    storageVersion: 1,
    runId,
    artifact,
    sources: [
      {
        id: text(at(bundle.manifest, 'run_id')),
        documents: [...bundle.documents],
        checksums: [...bundle.checksums],
        assets: [],
        texts: [],
      },
    ],
  };
}

/** Artifact IDs and digests name immutable uploads, so only the memory bound evicts. */
function cachedArtifact(
  runId: string,
  artifact: CIArtifact,
  github: GithubRead,
  signal: AbortSignal,
): Promise<StoredArtifact> {
  const key = `${artifact.id}:${artifact.digest ?? ''}`;
  const saved = cache.get(key);
  if (saved) return saved;
  while (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  const read = readArtifact(runId, artifact, github, signal);
  cache.set(key, read);
  read.catch(() => {
    if (cache.get(key) === read) cache.delete(key);
  });
  return read;
}

/**
 * History-shaped projection of an unstored run, read from the documents of its native
 * `h3-results-*` artifacts. Nothing is stored or approved and no media is exposed. Callers must
 * check repository visibility first, including before a cache hit.
 */
export async function liveVideoRunPage(
  runId: string,
  artifacts: CIArtifact[],
  github: GithubRead,
  signal: AbortSignal,
): Promise<VideoHistoryPage> {
  const entries = await Promise.all(
    latestResults(runId, artifacts).map(async (artifact): Promise<VideoHistoryEntry> => {
      try {
        return liveHistoryEntry(await cachedArtifact(runId, artifact, github, signal));
      } catch {
        return {
          id: `${runId}.${artifact.id}`,
          runId,
          artifact: {
            id: artifact.id,
            name: artifact.name,
            expired: artifact.expired,
            size_in_bytes: artifact.size_in_bytes,
            digest: artifact.digest,
            stored: false,
          },
          publishedAt: null,
          approved: false,
          sources: [],
          error: 'Live artifact read failed',
        };
      }
    }),
  );
  return { schemaVersion: 1, entries, nextPage: null };
}
