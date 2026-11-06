// @vitest-environment jsdom
import React, { Activity, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import VideoResultsClips from './VideoResultsClips';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints } from './points';
import { referenceQualityFixture } from './reference-quality.fixture';
import { publishedResultsSide } from './results-clips';
import { videoClipSourceKey } from './initial-data';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('./VideoSelect', () => ({
  default: ({
    value,
    onValueChange,
    options,
    testId,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    options: { value: string; label: string }[];
    testId?: string;
  }) => (
    <select
      data-testid={testId}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('keeps the selected clip audible after the overview is hidden and revealed', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
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
  const hardware = point.hardwareKey!;
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
  const video = container.querySelector<HTMLVideoElement>(`[data-hardware="${hardware}"] video`)!;
  expect(video.muted).toBe(true);
  const audio = container.querySelector<HTMLSelectElement>('[data-testid="video-results-audio"]')!;
  act(() => {
    audio.value = hardware;
    audio.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(video.muted).toBe(false);

  act(() => root!.render(<Overview hidden />));
  act(() => root!.render(<Overview hidden={false} />));
  expect(video.muted, 'audible clip after the detail view closes').toBe(false);
  expect(audio.value).toBe(hardware);
});
