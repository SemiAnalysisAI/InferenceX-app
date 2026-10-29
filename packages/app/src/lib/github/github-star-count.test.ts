import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  STAR_COUNT_FAILURE_BACKOFF_MS,
  STAR_COUNT_STORAGE_KEY,
  STAR_COUNT_TTL_MS,
  loadGitHubStarCount,
} from './github-star-count';

const fetchMock = vi.fn();
let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (count: number) => ({
  ok: true,
  json: () => Promise.resolve({ stargazers_count: count }),
});
const rateLimited = { ok: false, json: () => Promise.resolve({}) };

describe('loadGitHubStarCount', () => {
  it('caches a successful count for the TTL', async () => {
    fetchMock.mockResolvedValue(ok(42));
    expect(await loadGitHubStarCount(1_000)).toBe(42);
    expect(await loadGitHubStarCount(1_000 + STAR_COUNT_TTL_MS - 1)).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('backs off after a failure instead of retrying every load', async () => {
    fetchMock.mockResolvedValue(rateLimited);
    expect(await loadGitHubStarCount(1_000)).toBeNull();
    expect(await loadGitHubStarCount(1_000 + STAR_COUNT_FAILURE_BACKOFF_MS - 1)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(ok(7));
    expect(await loadGitHubStarCount(1_000 + STAR_COUNT_FAILURE_BACKOFF_MS)).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known count during backoff', async () => {
    storage.set(STAR_COUNT_STORAGE_KEY, JSON.stringify({ count: 5, fetchedAt: 0 }));
    fetchMock.mockRejectedValue(new Error('network'));
    const now = STAR_COUNT_TTL_MS + 1;
    expect(await loadGitHubStarCount(now)).toBe(5);
    expect(await loadGitHubStarCount(now + 1)).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.get(STAR_COUNT_STORAGE_KEY)!)).toEqual({
      count: 5,
      fetchedAt: 0,
      failedAt: now,
    });
  });
});
