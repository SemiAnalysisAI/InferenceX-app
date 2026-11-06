import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeNextCache, resetFakeNextCache } from '@/lib/testing/fake-next-cache';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import { publishedVideoHistory } from './video-history-store';
import { readStoredArtifact, storedArtifacts } from './video-storage';
import { cachedPublishedArtifact, cachedVideoHistory } from './video-read-cache';
import { purgeVideo } from '@/lib/cache/api-cache';

vi.mock('next/cache', () => fakeNextCache);
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
vi.mock('./video-history-store', () => ({ publishedVideoHistory: vi.fn() }));
vi.mock('./video-storage', () => ({
  storedArtifacts: vi.fn(),
  readStoredArtifact: vi.fn(),
}));

const page = (entries: VideoHistoryPage['entries'] = []): VideoHistoryPage => ({
  schemaVersion: 1,
  entries,
  nextPage: null,
});
const entry = (runId: string, approved: boolean): VideoHistoryPage['entries'][number] => ({
  id: `${runId}.1`,
  runId,
  artifact: { id: 1, name: `h3-results-${runId}-1`, expired: false, size_in_bytes: 1 },
  approved,
  publishedAt: null,
  sources: [],
  error: null,
});
const artifact = { id: 20, name: 'h3-results-10-1', expired: false, size_in_bytes: 0 };
const saved = { storageVersion: 1 as const, runId: '10', artifact, sources: [] };

afterEach(() => {
  resetFakeNextCache();
  vi.resetAllMocks();
});

describe('shared VideoGenX read cache', () => {
  it('serves a retained History page, unapproved entries included, without rereading storage', async () => {
    vi.mocked(publishedVideoHistory).mockImplementation((number) =>
      Promise.resolve({ page: page([entry(String(number), number === 1)]), complete: true }),
    );
    const first = await cachedVideoHistory(1, 1);
    const again = await cachedVideoHistory(1, 1);
    const second = await cachedVideoHistory(2, 1);
    const bounded = await cachedVideoHistory(1, 5);
    expect(again).toEqual(first);
    expect(second.entries[0]?.runId).toBe('2');
    expect(bounded).toEqual(first);
    expect(publishedVideoHistory).toHaveBeenCalledTimes(3);
    expect(publishedVideoHistory).toHaveBeenNthCalledWith(1, 1, 1);
    expect(publishedVideoHistory).toHaveBeenNthCalledWith(2, 2, 1);
    expect(publishedVideoHistory).toHaveBeenNthCalledWith(3, 1, 5);
  });

  it('returns an incomplete page but rereads it, because a failed approval lookup appears as unapproved', async () => {
    vi.mocked(publishedVideoHistory).mockResolvedValue({
      page: page([entry('10', false)]),
      complete: false,
    });
    const first = await cachedVideoHistory(1, 1);
    const second = await cachedVideoHistory(1, 1);
    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(1);
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
  });

  it('propagates a failed read and retains nothing from it', async () => {
    vi.mocked(publishedVideoHistory)
      .mockRejectedValueOnce(new Error('Blob unavailable'))
      .mockResolvedValueOnce({ page: page(), complete: true });
    await expect(cachedVideoHistory(1, 1)).rejects.toThrow('Blob unavailable');
    await expect(cachedVideoHistory(1, 1)).resolves.toEqual(page());
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
  });

  it('retains a published artifact but keeps looking for an absent one', async () => {
    vi.mocked(storedArtifacts).mockImplementation((runId) =>
      Promise.resolve(runId === '10' ? [artifact] : []),
    );
    vi.mocked(readStoredArtifact).mockResolvedValue(saved);
    await expect(cachedPublishedArtifact('10', '20')).resolves.toEqual(saved);
    await expect(cachedPublishedArtifact('10', '20')).resolves.toEqual(saved);
    expect(readStoredArtifact).toHaveBeenCalledTimes(1);
    await expect(cachedPublishedArtifact('11', '20')).resolves.toBeNull();
    await expect(cachedPublishedArtifact('11', '20')).resolves.toBeNull();
    expect(storedArtifacts).toHaveBeenCalledTimes(3);
  });

  it('rereads every page and artifact after a publication purge', async () => {
    vi.mocked(publishedVideoHistory).mockResolvedValue({ page: page(), complete: true });
    vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
    vi.mocked(readStoredArtifact).mockResolvedValue(saved);
    await cachedVideoHistory(1, 1);
    await cachedPublishedArtifact('10', '20');
    purgeVideo();
    await cachedVideoHistory(1, 1);
    await cachedPublishedArtifact('10', '20');
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
    expect(readStoredArtifact).toHaveBeenCalledTimes(2);
  });
});
