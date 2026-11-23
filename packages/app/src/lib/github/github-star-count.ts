import { useQuery } from '@tanstack/react-query';
export const STAR_COUNT_URL = '/api/v1/github-stars';
export const STAR_COUNT_STORAGE_KEY = 'inferencex-github-stars';
export const STAR_COUNT_TTL_MS = 60 * 60 * 1000;

export const STAR_COUNT_FAILURE_BACKOFF_MS = 10 * 60 * 1000;

interface StoredStarCount {
  count?: number;
  fetchedAt?: number;
  failedAt?: number;
}

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStored(): StoredStarCount {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STAR_COUNT_STORAGE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const count = finiteOrUndefined(record.count);
      const fetchedAt = finiteOrUndefined(record.fetchedAt);
      return {
        ...(count !== undefined && fetchedAt !== undefined ? { count, fetchedAt } : {}),
        ...(finiteOrUndefined(record.failedAt) === undefined
          ? {}
          : { failedAt: record.failedAt as number }),
      };
    }
  } catch {}
  return {};
}

function writeStored(value: StoredStarCount): void {
  try {
    localStorage.setItem(STAR_COUNT_STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

/**
 * Star count read from the app's CDN-cached route, so no server render waits on the GitHub API and
 * browsers never spend GitHub's unauthenticated per-IP rate limit.
 * Each browser asks GitHub at most once per TTL, and after a failure (e.g. rate limiting) waits
 * out a backoff before retrying. Failures fall back to the last known count, or null when there is none.
 */
export async function loadGitHubStarCount(now = Date.now()): Promise<number | null> {
  const stored = readStored();
  const fallback = stored.count ?? null;
  if (stored.fetchedAt !== undefined && now - stored.fetchedAt < STAR_COUNT_TTL_MS) return fallback;
  if (stored.failedAt !== undefined && now - stored.failedAt < STAR_COUNT_FAILURE_BACKOFF_MS)
    return fallback;
  const fail = () => {
    writeStored({
      count: stored.count,
      fetchedAt: stored.fetchedAt,
      failedAt: now,
    });
    return fallback;
  };
  try {
    const res = await fetch(STAR_COUNT_URL);
    if (!res.ok) return fail();
    const data: { stars?: unknown } = await res.json();
    if (typeof data.stars !== 'number' || !Number.isFinite(data.stars)) return fail();
    writeStored({ count: data.stars, fetchedAt: now });
    return data.stars;
  } catch {
    return fail();
  }
}

export function useGitHubStarCount(): number | null {
  const { data } = useQuery({
    queryKey: ['github-star-count'],
    queryFn: () => loadGitHubStarCount(),
    staleTime: STAR_COUNT_TTL_MS,
    retry: false,
  });
  return data ?? null;
}
