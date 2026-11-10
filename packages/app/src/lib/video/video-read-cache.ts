import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { cachedQuery, videoCacheTag } from '@/lib/cache/api-cache';
import { publishedVideoHistory } from './video-history-store';
import { derivedMedia, readPublishedArtifact, storedArtifacts } from './video-storage';
import { withDerivedMedia, type DerivedMedia } from './video-renditions';

/**
 * Backstop for the publication purge. A read that started before a purge and finishes after it
 * stores a pre-publication result, which this bounds; Next serves the entry stale while it
 * refreshes, so no request waits on it.
 */
export const VIDEO_CACHE_REVALIDATE_SECONDS = 300;
/**
 * Renditions and posters are encoded after the publication purge, so their listing refreshes on
 * its own.
 */
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

/**
 * The page with its completeness, so consumers can tell a degraded read from a complete one. The
 * key is versioned because the runtime cache outlives deploys and keys only on this prefix: bump
 * it whenever the cached value's shape changes.
 */
export const cachedVideoHistory = retained(
  'video:history:v2',
  async (page: number, pages: number) => {
    const value = await publishedVideoHistory(page, pages);
    // A page past the end is empty for any number; keeping it would let requests grow the cache.
    return { value, retain: value.complete && (page === 1 || value.page.entries.length > 0) };
  },
);

const cachedStoredArtifact = retained(
  'video:artifact',
  async (runId: string, artifactId: string) => {
    const saved = await storedArtifacts(runId);
    const artifact = saved.find((item) => String(item.id) === artifactId);
    if (!artifact) return { value: null as StoredArtifact | null, retain: false };
    const { saved: value, complete } = await readPublishedArtifact(runId, artifact);
    return { value, retain: value !== null && complete };
  },
);

// Entries, not the Map: the shared cache stores JSON. Each value is the derived media object of
// one original; v2 replaced the bare rendition URL, so entries cached under v1 are never read.
const cachedDerivedMediaListing = cachedQuery(
  async () => [...(await derivedMedia())],
  'video:renditions:v2',
  { tag: videoCacheTag(), revalidate: RENDITION_LISTING_REVALIDATE_SECONDS },
);

export async function cachedPublishedArtifact(runId: string, artifactId: string) {
  const [saved, media] = await Promise.all([
    cachedStoredArtifact(runId, artifactId),
    // A missing listing only costs download size and posters; the sealed originals still play.
    cachedDerivedMediaListing().then(
      (entries) => new Map(entries),
      () => new Map<string, DerivedMedia>(),
    ),
  ]);
  return saved && withDerivedMedia(saved, media);
}
