import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { cachedQuery, videoCacheTag } from '@/lib/cache/api-cache';
import { publishedVideoHistory } from './video-history-store';
import { readStoredArtifact, storedArtifacts } from './video-storage';

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
    { tag: videoCacheTag() },
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
  return { value, retain: complete };
});

export const cachedPublishedArtifact = retained(
  'video:artifact',
  async (runId: string, artifactId: string) => {
    const saved = await storedArtifacts(runId);
    const artifact = saved.find((item) => String(item.id) === artifactId);
    const value: StoredArtifact | null = artifact
      ? await readStoredArtifact(runId, artifact)
      : null;
    return { value, retain: value !== null };
  },
);
