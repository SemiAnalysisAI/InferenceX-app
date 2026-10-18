import { describe, expect, it, vi } from 'vitest';
import type { Json } from '@/components/video-benchmark/bundle';
import { publishVideoResults } from './video-publication';

describe('video publication job', () => {
  it('continues through empty and repeated pages, deduplicates artifacts, and retries only missing publications', async () => {
    const stored = new Set<string>();
    const published = vi.fn();
    const respond = (query: string): Json => {
      if (query === '?page=1') return { runs: [], nextPage: 2 };
      if (query === '?page=2') return { runs: [{ id: 10 }], nextPage: 3 };
      if (query === '?page=3') return { runs: [{ id: 10 }, { id: 11 }], nextPage: null };
      const run = query.includes('run=10') ? '10' : '11';
      if (!query.includes('artifact='))
        return {
          artifacts: [
            { id: 20, stored: stored.has(run) },
            { id: 20, stored: stored.has(run) },
            { id: 21, expired: true },
          ],
        };
      stored.add(run);
      return { storageVersion: 1, runId: run, artifact: { id: 20 }, sources: [] };
    };
    const get = vi.fn((query: string) => Promise.resolve(respond(query)));
    await publishVideoResults({ get, onStored: published });
    expect(published.mock.calls).toEqual([
      ['10', '20', 0],
      ['11', '20', 0],
    ]);
    expect(get.mock.calls.filter(([query]) => query === '?run=10')).toHaveLength(1);
    await publishVideoResults({ get, onStored: published });
    expect(published).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.filter(([query]) => query.includes('format=media'))).toHaveLength(2);
  });

  it('keeps processing later artifacts after a rejected publication and reports the failed job', async () => {
    const get = vi
      .fn<(query: string) => Promise<Json>>()
      .mockResolvedValueOnce({ artifacts: [{ id: 20 }, { id: 21 }] })
      .mockRejectedValueOnce(new Error('checksum mismatch'))
      .mockResolvedValueOnce({ storageVersion: 1, runId: '10', artifact: { id: 21 }, sources: [] });
    const onStored = vi.fn();
    await expect(publishVideoResults({ get, runId: '10', onStored })).rejects.toThrow(
      '1 video publications failed',
    );
    expect(onStored).toHaveBeenCalledWith('10', '21', 0);
    expect(get).not.toHaveBeenCalledWith('?page=1');
  });

  it('rejects a looping cursor instead of silently reporting complete coverage', async () => {
    await expect(
      publishVideoResults({
        get: () => Promise.resolve({ runs: [], nextPage: 1 }),
        onStored: vi.fn(),
      }),
    ).rejects.toThrow('pagination');
  });
});
