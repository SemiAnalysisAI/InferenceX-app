// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import VideoResultsClips from './VideoResultsClips';
import { parseStage, writeStage } from './clip-stage';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { videoClipSourceKey } from './initial-data';
import { namedRunPoints } from './points';
import { referenceQualityFixture } from './reference-quality.fixture';
import { publishedResultsSide } from './results-clips';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

it('does not render the stage again when a chart point opens or closes in the address', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const fixture = referenceQualityFixture(20);
  const page: VideoHistoryPage = {
    schemaVersion: 1,
    entries: [videoHistoryEntry(fixture.stored, null)],
    nextPage: null,
  };
  const point = namedRunPoints([page], '123').find((candidate) => candidate.cell === 'c1')!;
  let commits = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <Profiler id="stage" onRender={() => (commits += 1)}>
          <VideoResultsClips
            points={[point]}
            initialSides={{
              [videoClipSourceKey(point)]: publishedResultsSide(fixture.stored, point),
            }}
            colorFor={() => 'black'}
            against="reference"
            onAgainstChange={() => {}}
            onSubjectChange={() => {}}
            onShow={() => {}}
            reveal={0}
          />
        </Profiler>
      </QueryClientProvider>,
    ),
  );
  const view = () =>
    container!.querySelector<HTMLElement>('[data-testid="video-results-stage"]')?.dataset.view;
  expect(view()).toBe('wipe');

  // The open chart point and the compared hardware live in the same address as the stage's keys.
  commits = 0;
  act(() => writeStage({ ...parseStage(location.search), sheet: '0:b200' }));
  expect(location.search).toContain('r_sheet=');
  act(() => writeStage({ ...parseStage(location.search), vs: 'h100' }));
  act(() => writeStage({ ...parseStage(location.search), sheet: null }));
  expect(commits, 'renders for keys the stage does not read').toBe(0);

  // Its own key still reaches it, and the keys written before it are kept.
  act(() => writeStage({ ...parseStage(location.search), view: 'side', sheet: '0:b200' }));
  expect(commits).toBeGreaterThan(0);
  expect(view()).toBe('side');
  expect(parseStage(location.search)).toMatchObject({ view: 'side', vs: 'h100', sheet: '0:b200' });
});
