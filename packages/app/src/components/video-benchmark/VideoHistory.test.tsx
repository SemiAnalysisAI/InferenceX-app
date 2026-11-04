// @vitest-environment jsdom
import React, { Activity, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import retained from '../../../cypress/fixtures/api/video-history.json';
import type { VideoHistoryPage } from './history';
import VideoHistory from './VideoHistory';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

const settle = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );

it('keeps pages loaded with More stored results when Activity reveals History again', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const first = { ...(structuredClone(retained) as unknown as VideoHistoryPage), nextPage: 2 };
  const older = { ...structuredClone(first.entries[0]), id: 'older-page-entry' };
  older.sources = older.sources.map((source) => ({ ...source, observations: [] }));
  const second: VideoHistoryPage = { schemaVersion: 1, entries: [older], nextPage: null };
  const fetch = vi.fn((url: string) =>
    Promise.resolve(Response.json(url.endsWith('page=2') ? second : first)),
  );
  vi.stubGlobal('fetch', fetch);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const show = async (mode: 'visible' | 'hidden') => {
    act(() =>
      root!.render(
        <Activity mode={mode}>
          <VideoHistory />
        </Activity>,
      ),
    );
    await settle();
  };
  const entries = () => container!.querySelectorAll('[data-testid="video-history-entry"]').length;

  await show('visible');
  expect(entries()).toBe(first.entries.length);
  const more = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'More stored results',
  )!;
  act(() => more.click());
  await settle();
  expect(entries()).toBe(first.entries.length + 1);

  await show('hidden');
  await show('visible');
  expect(entries()).toBe(first.entries.length + 1);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('page=1'))).toHaveLength(1);
});
