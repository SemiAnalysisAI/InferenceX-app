import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { cachedQuery, videoCacheTag } from '@/lib/cache/api-cache';
import { publishedVideoHistory } from './video-history-store';
import { readPublishedArtifact, renditionPreviews, storedArtifacts } from './video-storage';
import { withRenditionPreviews } from './video-renditions';

/**
 * Backstop for the publication purge. A read that started before a purge and finishes after it
 * stores a pre-publication result, which this bounds; Next serves the entry stale while it
 * refreshes, so no request waits on it.
 */
export const VIDEO_CACHE_REVALIDATE_SECONDS = 300;
/** Renditions are encoded after the publication purge, so their listing refreshes on its own. */
export const RENDITION_LISTING_REVALIDATE_SECONDS = 60;

/** A value the shared cache must not keep: an incomplete History read or absent media. */
class UnretainedError<T> extends Error {
  readonly value: T;
  constructor(value: T) {
    super('Unretained video read');
    this.name = 'UnretainedError';
    this.value = value;
  }
}

/**
 * Cache a read across requests and instances under the video tag. A value the
 * loader marks as not retainable is still returned, but the next call reads
 * storage again.
 */
function retained<T, Args extends unknown[]>(
  keyPrefix: string,
  load: (...args: Args) => Promise<{ value: T; retain: boolean }>,
): (...args: Args) => Promise<T> {
  const cached = cachedQuery(
    async (...args: Args): Promise<T> => {
      const { value, retain } = await load(...args);
      if (!retain) throw new UnretainedError(value);
      return value;
    },
    keyPrefix,
    { tag: videoCacheTag(), revalidate: VIDEO_CACHE_REVALIDATE_SECONDS },
  );
  return async (...args) => {
    try {
      return await cached(...args);
    } catch (error) {
      if (error instanceof UnretainedError) return error.value as T;
      throw error;
    }
  };
}

export const cachedVideoHistory = retained('video:history', async (page: number, pages: number) => {
  const { page: value, complete } = await publishedVideoHistory(page, pages);
  // A page past the end is empty for any number; keeping it would let requests grow the cache.
  return { value, retain: complete && (page === 1 || value.entries.length > 0) };
});

const cachedStoredArtifact = retained(
  'video:artifact',
  async (runId: string, artifactId: string) => {
    const saved = await storedArtifacts(runId);
    const artifact = saved.find((item) => String(item.id) === artifactId);
    const value: StoredArtifact | null = artifact
      ? await readPublishedArtifact(runId, artifact)
      : null;
    return { value, retain: value !== null };
  },
);

// Entries, not the Map: the shared cache stores JSON.
const cachedRenditionListing = cachedQuery(
  async () => [...(await renditionPreviews())],
  'video:renditions',
  { tag: videoCacheTag(), revalidate: RENDITION_LISTING_REVALIDATE_SECONDS },
);

export async function cachedPublishedArtifact(runId: string, artifactId: string) {
  const [saved, previews] = await Promise.all([
    cachedStoredArtifact(runId, artifactId),
    // A missing rendition listing only costs download size; the sealed originals still play.
    cachedRenditionListing().then(
      (entries) => new Map(entries),
      () => new Map<string, string>(),
    ),
  ]);
  return saved && withRenditionPreviews(saved, previews);
}
