// @test-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi, mock } from 'bun:test';
import {
  advanceTimersByTime,
  stubGlobal,
  unstubAllGlobals,
  useFakeTimers,
  useRealTimers,
} from '@/test/helpers';

import { stubMatchMedia } from '@/test/match-media-stub';

import { DURATION_MS, LEAD_OUT_MS } from './agentx-session-replay-model';
import { AgentXSessionReplay } from './agentx-session-replay';

const track = (() => vi.fn())();
mock.module('@/lib/analytics/analytics', () => ({ track }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
/** Reports how much of the rows is on screen, as the browser's observer would. */
let showRows: (ratio: number) => void;

const figure = () => container.querySelector<HTMLElement>('figure')!;
const advance = (ms: number) => act(() => void advanceTimersByTime(ms));

beforeEach(() => {
  useFakeTimers();
  track.mockClear();
  stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
        showRows = (ratio) =>
          act(() => callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]));
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  unstubAllGlobals();
  useRealTimers();
});

it('rests on the finished chart, plays once when the rows show, and replays on request', () => {
  stubMatchMedia();
  act(() => root.render(<AgentXSessionReplay locale="en" />));
  showRows(0.3);
  advance(DURATION_MS);
  expect(figure().dataset.replay).toBe('rest');
  expect(figure().textContent).toContain('Request 20 / 20');

  showRows(1);
  expect(figure().dataset.replay).toBe('out');
  advance(LEAD_OUT_MS);
  expect(figure().textContent).toContain('Request 01 / 20');

  // Off screen it holds its place, then carries on.
  showRows(0);
  advance(DURATION_MS);
  expect(figure().textContent).toContain('Request 01 / 20');
  showRows(0.1);
  advance(DURATION_MS);
  expect(figure().dataset.replay).toBe('rest');
  advance(DURATION_MS);
  expect(figure().dataset.replay).toBe('rest');
  expect(track).not.toHaveBeenCalled();

  act(() => container.querySelector('button')!.click());
  expect(track).toHaveBeenCalledExactlyOnceWith('agentx_replay_restarted');
  advance(LEAD_OUT_MS);
  expect(figure().textContent).toContain('Request 01 / 20');
});

it('is a still chart with no replay control when the reader prefers reduced motion', () => {
  stubMatchMedia({ '(prefers-reduced-motion: reduce)': true });
  act(() => root.render(<AgentXSessionReplay locale="zh" />));
  advance(DURATION_MS);
  expect(figure().dataset.replay).toBe('rest');
  expect(figure().textContent).toContain('请求 20 / 20');
  expect(container.querySelector('button')).toBeNull();
});
