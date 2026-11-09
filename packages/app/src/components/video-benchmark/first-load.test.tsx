// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import VideoResultsClips from './VideoResultsClips';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints } from './points';
import { referenceQualityFixture } from './reference-quality.fixture';
import { publishedResultsSide } from './results-clips';
import { useVideoPoints } from './use-video-points';
import { videoClipSourceKey } from './initial-data';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([true, false])(
  'renders seeded points/media (available=%s) before effects and hydrates without refetching',
  async (available) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fixture = referenceQualityFixture(20);
    const path = fixture.attachment.pairs[0].candidate.media_path;
    fixture.stored.sources[0].assets = [
      [path, { url: '/retained.mp4', downloadUrl: '/retained.mp4' }],
    ];
    const page: VideoHistoryPage = {
      schemaVersion: 1,
      entries: [videoHistoryEntry(fixture.stored, null)],
      nextPage: null,
    };
    const initial = { pages: [page], replay: true };
    const point = namedRunPoints(initial.pages, '123').find(
      (candidate) => candidate.cell === 'c1',
    )!;
    const side = publishedResultsSide(fixture.stored, point);
    function InitialResults() {
      const { points, namedPoints, loading, replay } = useVideoPoints('123', initial);
      return (
        <>
          <output>
            {JSON.stringify({
              official: points.length,
              named: namedPoints.length,
              loading,
              replay,
            })}
          </output>
          <VideoResultsClips
            points={[point]}
            initialSides={{ [videoClipSourceKey(point)]: available ? side : null }}
            colorFor={() => 'black'}
            hidden={new Set()}
          />
        </>
      );
    }
    const html = renderToString(<InitialResults />);
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    for (const video of container.querySelectorAll('video')) {
      Object.defineProperty(video, 'readyState', { value: 4 });
      Object.defineProperty(video, 'duration', { value: 5 });
    }
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      available ? '/retained.mp4' : undefined,
    );
    if (available)
      expect(
        container.querySelector('video')?.getAttribute('preload'),
        'no media before Play',
      ).toBe('none');
    expect(container.querySelector('output')?.textContent).toBe(
      JSON.stringify({ official: 0, named: 3, loading: false, replay: true }),
    );
    const hydrationError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container!, <InitialResults />, { onRecoverableError: hydrationError });
      await Promise.resolve();
    });
    expect(hydrationError).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="video-results-play"]')?.disabled,
    ).toBe(!available);
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      available ? '/retained.mp4' : undefined,
    );
  },
);

it('shows a newly read clip while another selected source is still pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const fast = referenceQualityFixture(20, '123', 7);
  const slow = referenceQualityFixture(20, '456', 8, 'b'.repeat(64), 'NVIDIA H100');
  const points = [fast, slow].map((fixture) => {
    const path = fixture.attachment.pairs[0].candidate.media_path;
    fixture.stored.sources[0].assets = [
      [path, { url: `/${fixture.stored.runId}.mp4`, downloadUrl: '/clip.mp4' }],
    ];
    return namedRunPoints(
      [{ schemaVersion: 1, entries: [videoHistoryEntry(fixture.stored, null)], nextPage: null }],
      fixture.stored.runId,
    ).find((candidate) => candidate.cell === 'c1')!;
  });
  const pending = Promise.withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('run=123') ? Promise.resolve(Response.json(fast.stored)) : pending.promise,
    ),
  );
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(<VideoResultsClips points={points} colorFor={() => 'black'} hidden={new Set()} />);
    await Promise.resolve();
  });
  expect(container.querySelectorAll('video')).toHaveLength(1);
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/123.mp4');
  expect(container.textContent).toContain('Loading retained clips');
  await act(async () => {
    pending.resolve(Response.json(slow.stored));
    await pending.promise;
  });
  expect(container.querySelectorAll('video')).toHaveLength(1);
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/123.mp4');
  expect(container.textContent).not.toContain('Loading retained clips');
});

it('shows the loading state on both sides while the subject is read', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const fixture = referenceQualityFixture(20);
  const point = namedRunPoints(
    [{ schemaVersion: 1, entries: [videoHistoryEntry(fixture.stored, null)], nextPage: null }],
    fixture.stored.runId,
  ).find((candidate) => candidate.cell === 'c1')!;
  container = document.createElement('div');
  document.body.append(container);
  act(() => {
    root = createRoot(container!);
    root.render(<VideoResultsClips points={[point]} colorFor={() => 'black'} hidden={new Set()} />);
  });
  for (const side of ['a', 'b'])
    expect(container.querySelector(`[data-side="${side}"]`)?.textContent).toContain(
      'Loading retained clips',
    );
});
