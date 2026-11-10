import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeNextCache, resetFakeNextCache } from '@/lib/testing/fake-next-cache';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import { publishedVideoHistory } from './video-history-store';
import { readPublishedArtifact, renditionPreviews, storedArtifacts } from './video-storage';
import {
  cachedPublishedArtifact,
  cachedVideoHistory,
  RENDITION_LISTING_REVALIDATE_SECONDS,
  VIDEO_CACHE_REVALIDATE_SECONDS,
} from './video-read-cache';
import { purgeVideo } from '@/lib/cache/api-cache';

vi.mock('next/cache', () => fakeNextCache);
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
vi.mock('./video-history-store', () => ({ publishedVideoHistory: vi.fn() }));
vi.mock('./video-storage', () => ({
  storedArtifacts: vi.fn(),
  readPublishedArtifact: vi.fn(),
  renditionPreviews: vi.fn(),
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

beforeEach(() => {
  vi.mocked(renditionPreviews).mockResolvedValue(new Map());
});
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
    expect(first.complete).toBe(true);
    expect(second.page.entries[0]?.runId).toBe('2');
    expect(bounded).toEqual(first);
    expect(publishedVideoHistory).toHaveBeenCalledTimes(3);
    expect(publishedVideoHistory).toHaveBeenNthCalledWith(1, 1, 1);
    expect(publishedVideoHistory).toHaveBeenNthCalledWith(2, 2, 1);
    expect(publishedVideoHistory).toHaveBeenNthCalledWith(3, 1, 5);
  });

  it('keeps an empty first page but not pages past the end, so arbitrary page numbers add no entries', async () => {
    vi.mocked(publishedVideoHistory).mockResolvedValue({ page: page(), complete: true });
    await cachedVideoHistory(1, 1);
    await cachedVideoHistory(1, 1);
    await cachedVideoHistory(9000, 1);
    await cachedVideoHistory(9000, 1);
    expect(publishedVideoHistory).toHaveBeenCalledTimes(3);
  });

  it('rereads a retained page after the backstop TTL, so a read racing a purge cannot stay stale', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(publishedVideoHistory).mockResolvedValue({
        page: page([entry('10', true)]),
        complete: true,
      });
      await cachedVideoHistory(1, 1);
      vi.advanceTimersByTime(VIDEO_CACHE_REVALIDATE_SECONDS * 1000 - 1);
      await cachedVideoHistory(1, 1);
      expect(publishedVideoHistory).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      await cachedVideoHistory(1, 1);
      expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns an incomplete page but rereads it, because a failed approval lookup appears as unapproved', async () => {
    vi.mocked(publishedVideoHistory).mockResolvedValue({
      page: page([entry('10', false)]),
      complete: false,
    });
    const first = await cachedVideoHistory(1, 1);
    const second = await cachedVideoHistory(1, 1);
    expect(first).toMatchObject({ complete: false });
    expect(first.page.entries).toHaveLength(1);
    expect(second.page.entries).toHaveLength(1);
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
  });

  it('retains a published artifact but keeps looking for an absent one', async () => {
    vi.mocked(storedArtifacts).mockImplementation((runId) =>
      Promise.resolve(runId === '10' ? [artifact] : []),
    );
    vi.mocked(readPublishedArtifact).mockResolvedValue({ saved, complete: true });
    await expect(cachedPublishedArtifact('10', '20')).resolves.toEqual(saved);
    await expect(cachedPublishedArtifact('10', '20')).resolves.toEqual(saved);
    expect(readPublishedArtifact).toHaveBeenCalledTimes(1);
    await expect(cachedPublishedArtifact('11', '20')).resolves.toBeNull();
    await expect(cachedPublishedArtifact('11', '20')).resolves.toBeNull();
    expect(storedArtifacts).toHaveBeenCalledTimes(3);
    // A failed quality read still serves the media but is read again next time.
    vi.mocked(storedArtifacts).mockResolvedValue([{ ...artifact, id: 21 }]);
    vi.mocked(readPublishedArtifact).mockResolvedValue({ saved, complete: false });
    await expect(cachedPublishedArtifact('12', '21')).resolves.toEqual(saved);
    await expect(cachedPublishedArtifact('12', '21')).resolves.toEqual(saved);
    expect(readPublishedArtifact).toHaveBeenCalledTimes(3);
  });

  it('relists renditions on a short clock, because they are encoded after the publication purge', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
      vi.mocked(readPublishedArtifact).mockResolvedValue({ saved, complete: true });
      await cachedPublishedArtifact('10', '20');
      vi.advanceTimersByTime(RENDITION_LISTING_REVALIDATE_SECONDS * 1000);
      await cachedPublishedArtifact('10', '20');
      expect(renditionPreviews).toHaveBeenCalledTimes(2);
      expect(readPublishedArtifact).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rereads every page and artifact after a publication purge', async () => {
    vi.mocked(publishedVideoHistory).mockResolvedValue({ page: page(), complete: true });
    vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
    vi.mocked(readPublishedArtifact).mockResolvedValue({ saved, complete: true });
    await cachedVideoHistory(1, 1);
    await cachedPublishedArtifact('10', '20');
    purgeVideo();
    await cachedVideoHistory(1, 1);
    await cachedPublishedArtifact('10', '20');
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
    expect(readPublishedArtifact).toHaveBeenCalledTimes(2);
  });
});
