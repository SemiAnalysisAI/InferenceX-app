import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { publishedVideoHistory } from './video-history-store';
import { readStoredArtifact, renditionPreviews, storedArtifacts } from './video-storage';
import { withRenditionPreviews } from './video-renditions';

const TTL_MS = 30_000;
const MAX_ENTRIES = 32;
interface Entry<T> {
  expiresAt: number;
  value: Promise<T>;
}
const history = new Map<string, Entry<VideoHistoryPage>>();
const artifacts = new Map<string, Entry<StoredArtifact | null>>();
const renditions = new Map<string, Entry<Map<string, string>>>();

// Callers must check repository visibility before serving every read, including a cache hit.
function read<T>(
  cache: Map<string, Entry<T>>,
  key: string,
  load: () => Promise<T>,
  retain: (value: T) => boolean,
): Promise<T> {
  const now = Date.now();
  for (const [expiredKey, entry] of cache) if (entry.expiresAt <= now) cache.delete(expiredKey);
  const saved = cache.get(key);
  if (saved) return saved.value;
  while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  const entry: Entry<T> = {
    expiresAt: now + TTL_MS,
    value: load().then(
      (value) => {
        if (!retain(value) && cache.get(key) === entry) cache.delete(key);
        return value;
      },
      (error: unknown) => {
        if (cache.get(key) === entry) cache.delete(key);
        throw error;
      },
    ),
  };
  cache.set(key, entry);
  return entry.value;
}

export function cachedVideoHistory(page: number, pages: number) {
  return read(
    history,
    `${page}:${pages}`,
    () => publishedVideoHistory(page, pages),
    (value) =>
      value.entries.every(
        (entry) =>
          entry.approved === true && !entry.error && entry.sources.every((source) => !source.error),
      ),
  );
}

export async function cachedPublishedArtifact(runId: string, artifactId: string) {
  const [saved, previews] = await Promise.all([
    read(
      artifacts,
      `${runId}:${artifactId}`,
      async () => {
        const stored = await storedArtifacts(runId);
        const artifact = stored.find((item) => String(item.id) === artifactId);
        return artifact ? readStoredArtifact(runId, artifact) : null;
      },
      (value) => value !== null,
    ),
    // A missing rendition listing only costs download size; the sealed originals still play.
    read(renditions, 'all', renditionPreviews, () => true).catch(() => new Map<string, string>()),
  ]);
  return saved && withRenditionPreviews(saved, previews);
}

export function clearVideoReadCache() {
  history.clear();
  artifacts.clear();
  renditions.clear();
}
