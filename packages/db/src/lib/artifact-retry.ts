const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000] as const;

/**
 * Marks a failure no retry can fix (the run or artifact is gone, not
 * unreachable). `retryArtifactOperation` rethrows it immediately instead of
 * burning the full backoff schedule on it.
 */
export class NonRetryableArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableArtifactError';
  }
}

interface ArtifactRetryOptions {
  delaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
  warn?: (message: string) => void;
}

const defaultWait = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

/** Retry transient artifact-store operations with bounded exponential backoff. */
export async function retryArtifactOperation<T>(
  label: string,
  operation: () => T | Promise<T>,
  options: ArtifactRetryOptions = {},
): Promise<T> {
  const delaysMs = options.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const wait = options.wait ?? defaultWait;
  const warn = options.warn ?? console.warn;
  let lastError: unknown;

  for (let attempt = 0; attempt < delaysMs.length + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof NonRetryableArtifactError) throw error;
      lastError = error;
      if (attempt >= delaysMs.length) break;
      const delayMs = delaysMs[attempt];
      if (delayMs === undefined) break;
      warn(`  [WARN] ${label} failed (attempt ${attempt + 1}); retrying in ${delayMs / 1_000}s`);
      await wait(delayMs);
    }
  }

  throw lastError;
}
