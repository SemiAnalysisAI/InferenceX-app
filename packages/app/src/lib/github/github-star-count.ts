import { useQuery } from '@tanstack/react-query';
import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

const STAR_COUNT_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
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
 * Browser-side star count, so no server render waits on (or revalidates for) the GitHub API.
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
    writeStored({ count: stored.count, fetchedAt: stored.fetchedAt, failedAt: now });
    return fallback;
  };
  try {
    const res = await fetch(STAR_COUNT_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return fail();
    const data: { stargazers_count?: unknown } = await res.json();
    if (typeof data.stargazers_count !== 'number') return fail();
    writeStored({ count: data.stargazers_count, fetchedAt: now });
    return data.stargazers_count;
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
