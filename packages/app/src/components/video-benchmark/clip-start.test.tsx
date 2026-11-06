// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import VideoResultsClips from './VideoResultsClips';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints } from './points';
import { referenceQualityFixture } from './reference-quality.fixture';
import { publishedResultsSide } from './results-clips';
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

const flush = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );

it('keeps playing when the prime from the play gesture settles after the buffered start', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const plays: { reject: (reason: unknown) => void; resolve: () => void }[] = [];
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
    () =>
      new Promise<void>((resolve, reject) => {
        plays.push({ resolve, reject });
      }),
  );
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const fixture = referenceQualityFixture(20);
  fixture.stored.sources[0].assets = [
    [fixture.attachment.pairs[0].candidate.media_path, { url: '/a.mp4', downloadUrl: '/a.mp4' }],
  ];
  const page: VideoHistoryPage = {
    schemaVersion: 1,
    entries: [videoHistoryEntry(fixture.stored, null)],
    nextPage: null,
  };
  const point = namedRunPoints([page], '123').find((candidate) => candidate.cell === 'c1')!;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <VideoResultsClips
        points={[point]}
        initialSides={{ [videoClipSourceKey(point)]: publishedResultsSide(fixture.stored, point) }}
        colorFor={() => 'black'}
        hidden={new Set()}
      />,
    ),
  );
  const video = container.querySelector<HTMLVideoElement>(
    `[data-hardware="${point.hardwareKey}"] video`,
  )!;
  let bufferedEnd = 2;
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  Object.defineProperty(video, 'duration', { value: 5, configurable: true });
  Object.defineProperty(video, 'buffered', {
    configurable: true,
    value: { length: 1, start: () => 0, end: () => bufferedEnd },
  });
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  const button = container.querySelector<HTMLButtonElement>('[data-testid="video-results-play"]')!;

  act(() => button.click());
  expect(plays, 'the gesture primes the clip').toHaveLength(1);
  expect(pause).toHaveBeenCalledTimes(1);
  expect(button.getAttribute('aria-pressed')).toBe('true');

  bufferedEnd = 5;
  act(() => frames.shift()!(16));
  expect(plays, 'the buffered group starts').toHaveLength(2);

  act(() => plays[0].reject(new DOMException('interrupted', 'AbortError')));
  await flush();
  expect(button.getAttribute('aria-pressed'), 'the settled prime leaves the start alone').toBe(
    'true',
  );
  expect(pause, 'the clip keeps playing').toHaveBeenCalledTimes(1);

  act(() => plays[1].resolve());
  await flush();
  expect(button.getAttribute('aria-pressed')).toBe('true');
});
