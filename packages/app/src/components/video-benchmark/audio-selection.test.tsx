// @vitest-environment jsdom
import React, { Activity, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import VideoResultsClips from './VideoResultsClips';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints } from './points';
import { referenceQualityFixture } from './reference-quality.fixture';
import { verifiedQuality } from './reference-quality';
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

it('keeps one clip audible, including after the overview is hidden and revealed', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const fixture = referenceQualityFixture(20);
  fixture.stored.sources[0].assets = [
    [fixture.attachment.pairs[0].candidate.media_path, { url: '/a.mp4', downloadUrl: '/a.mp4' }],
  ];
  const [quality] = verifiedQuality(
    fixture.attachment,
    fixture.descriptor,
    fixture.stored,
    '9'.repeat(64),
  ).pairs;
  quality.reference.url = '/reference.mp4';
  fixture.stored.quality = [quality];
  const page: VideoHistoryPage = {
    schemaVersion: 1,
    entries: [videoHistoryEntry(fixture.stored, null)],
    nextPage: null,
  };
  const point = namedRunPoints([page], '123').find((candidate) => candidate.cell === 'c1')!;
  const Overview = ({ hidden }: { hidden: boolean }) => (
    <Activity mode={hidden ? 'hidden' : 'visible'}>
      <VideoResultsClips
        points={[point]}
        initialSides={{ [videoClipSourceKey(point)]: publishedResultsSide(fixture.stored, point) }}
        colorFor={() => 'black'}
        hidden={new Set()}
      />
    </Activity>
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<Overview hidden={false} />));
  const side = (role: 'a' | 'b') => ({
    video: container!.querySelector<HTMLVideoElement>(`[data-side="${role}"] video`)!,
    speaker: container!.querySelector<HTMLButtonElement>(
      `[data-side="${role}"] [data-testid="video-results-speaker"]`,
    )!,
  });
  expect([side('a').video.muted, side('b').video.muted]).toEqual([true, true]);

  act(() => side('a').speaker.click());
  expect([side('a').video.muted, side('b').video.muted]).toEqual([false, true]);
  act(() => side('b').speaker.click());
  expect([side('a').video.muted, side('b').video.muted], 'one audible clip').toEqual([true, false]);

  act(() => root!.render(<Overview hidden />));
  act(() => root!.render(<Overview hidden={false} />));
  expect(side('b').video.muted, 'audible clip after the detail view closes').toBe(false);
  expect(side('b').speaker.getAttribute('aria-pressed')).toBe('true');
});
