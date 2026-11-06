import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/video-runs/route';
import { VIDEO_HISTORY_MAX_PAGES, videoHistoryEntry } from '@/components/video-benchmark/history';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { loadVideoPageData, videoPageState } from './video-page-data';

vi.mock('@/app/api/video-runs/route', () => ({ GET: vi.fn() }));
beforeEach(() => vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token'));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('VideoGenX first document', () => {
  it('leaves History to the client read when video storage is not configured', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    const initial = await loadVideoPageData({ unofficialrun: '456' });
    expect(initial.state.unofficialRun).toBe('456');
    expect(initial.history).toBeNull();
    expect(initial.sides).toEqual({});
    expect(GET).not.toHaveBeenCalled();
  });

  it('loads the complete bounded cohort and only its URL-selected named media before rendering', async () => {
    const original = referenceQualityFixture(20, '123', 7);
    const named = referenceQualityFixture(20, '456', 8, 'b'.repeat(64), 'NVIDIA H100');
    const path = named.attachment.pairs[0].candidate.media_path;
    named.stored.sources[0].assets = [[path, { url: '/named.mp4', downloadUrl: '/named.mp4' }]];
    vi.mocked(GET).mockImplementation(async (request) => {
      const query = request.nextUrl.searchParams;
      if (query.get('format') === 'history') {
        expect([query.get('page'), query.get('pages')]).toEqual([
          '1',
          String(VIDEO_HISTORY_MAX_PAGES),
        ]);
        return Response.json(
          {
            schemaVersion: 1,
            entries: [original.stored, named.stored].map((saved) => videoHistoryEntry(saved, null)),
            nextPage: null,
          },
          { headers: { 'X-VideoGenX-Replay': '1' } },
        );
      }
      expect(query.get('run')).toBe('456');
      expect(query.get('artifact')).toBe('8');
      return await Promise.resolve(Response.json(named.stored));
    });
    const initial = await loadVideoPageData({ unofficialrun: '456' });
    expect(initial.state.unofficialRun).toBe('456');
    expect(initial.history?.pages[0].entries).toHaveLength(2);
    expect(initial.history?.replay).toBe(true);
    const sides = Object.values(initial.sides);
    expect(sides).toHaveLength(1);
    expect(sides[0]?.hardwareKey).toBe('h100');
    expect(sides[0]?.urls.get(path)).toBe('/named.mp4');
    expect(GET).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded metrics when a selected media read fails and leaves retry available', async () => {
    const { stored } = referenceQualityFixture(20);
    vi.mocked(GET)
      .mockResolvedValueOnce(
        Response.json({
          schemaVersion: 1,
          entries: [{ ...videoHistoryEntry(stored, null), approved: true }],
          nextPage: null,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const initial = await loadVideoPageData({});
    expect(initial.history?.pages[0].entries).toHaveLength(1);
    expect(initial.sides).toEqual({});
    expect(GET).toHaveBeenCalledTimes(2);
  });

  it('parses the URL selection for the streamed shell without reading data', () => {
    expect(videoPageState({ unofficialrun: '456' }).unofficialRun).toBe('456');
    expect(videoPageState({ unofficialrun: ['789', '456'] }).unofficialRun).toBe('789');
    expect(GET).not.toHaveBeenCalled();
  });
});
