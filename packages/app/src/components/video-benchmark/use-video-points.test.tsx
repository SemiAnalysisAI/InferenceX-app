// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { liveHistoryEntry, type VideoHistoryPage } from './history';
import { referenceQualityFixture } from './reference-quality.fixture';
import { useVideoPoints } from './use-video-points';

const empty: VideoHistoryPage = { schemaVersion: 1, entries: [], nextPage: null };
const live: VideoHistoryPage = {
  schemaVersion: 1,
  entries: [liveHistoryEntry(referenceQualityFixture(20).stored)],
  nextPage: null,
};
const initial = { pages: [empty], replay: false };

function Probe({ runId }: { runId: string | null }) {
  const { namedSource } = useVideoPoints(runId, initial);
  return createElement('output', null, namedSource);
}

let root: Root;
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('useVideoPoints live overlay', () => {
  it('reads a dismissed run again after a failed live read', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json(live));
    vi.stubGlobal('fetch', fetch);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    root = createRoot(container);
    const render = async (runId: string | null) => {
      await act(async () => {
        root.render(createElement(Probe, { runId }));
        await Promise.resolve();
      });
    };

    await render('123');
    expect(container.textContent).toBe('none');
    await render(null);
    await render('123');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('live');
  });
});

function ReadProbe() {
  const { points, error, loading } = useVideoPoints(null);
  return createElement(
    'output',
    null,
    JSON.stringify({ points: points.length, failed: error !== null, loading }),
  );
}

describe('useVideoPoints History read', () => {
  it('keeps an incomplete page but reports the read as failed, so retry stays available', async () => {
    const page: VideoHistoryPage = {
      schemaVersion: 1,
      entries: [{ ...live.entries[0], approved: true }],
      nextPage: null,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(page, { headers: { 'X-VideoGenX-Incomplete': '1' } })),
    );
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(ReadProbe));
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    const read = JSON.parse(container.textContent ?? '{}') as {
      points: number;
      failed: boolean;
      loading: boolean;
    };
    expect(read.points).toBeGreaterThan(0);
    expect(read).toMatchObject({ failed: true, loading: false });
  });
});
