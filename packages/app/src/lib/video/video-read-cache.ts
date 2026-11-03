import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { publishedVideoHistory, readStoredArtifact, storedArtifacts } from './video-storage';

const TTL_MS = 30_000;
const MAX_ENTRIES = 32;
interface Entry<T> {
  expiresAt: number;
  value: Promise<T>;
}
const history = new Map<string, Entry<VideoHistoryPage>>();
const artifacts = new Map<string, Entry<StoredArtifact | null>>();

// Callers must check repository visibility before every read, including a cache hit.
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

export function cachedVideoHistory(page: number) {
  return read(
    history,
    String(page),
    () => publishedVideoHistory(page),
    (value) =>
      value.entries.every(
        (entry) =>
          entry.approved === true && !entry.error && entry.sources.every((source) => !source.error),
      ),
  );
}

export function cachedPublishedArtifact(runId: string, artifactId: string) {
  return read(
    artifacts,
    `${runId}:${artifactId}`,
    async () => {
      const saved = await storedArtifacts(runId);
      const artifact = saved.find((item) => String(item.id) === artifactId);
      return artifact ? readStoredArtifact(runId, artifact) : null;
    },
    (value) => value !== null,
  );
}

export function clearVideoReadCache() {
  history.clear();
  artifacts.clear();
}
