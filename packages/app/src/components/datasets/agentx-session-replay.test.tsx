// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubMatchMedia } from '@/test/match-media-stub';

import { DURATION_MS, LEAD_OUT_MS, TIMELINE } from './agentx-session-replay-model';
import { AgentXSessionReplay } from './agentx-session-replay';

const trackStub = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/analytics', () => ({ track: trackStub }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
/** Reports how much of the replay's rows is on screen, as the browser's observer would. */
let showRows: (ratio: number) => void;

function figure(): HTMLElement {
  return container.querySelector<HTMLElement>('[data-testid="agentx-session-replay"]')!;
}

function replayButton(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    '[data-testid="agentx-session-replay-restart"]',
  );
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
let media: ReturnType<typeof stubMatchMedia>;

beforeEach(() => {
  vi.useFakeTimers();
  trackStub.mockClear();
  media = stubMatchMedia();
  vi.stubGlobal(
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AgentXSessionReplay', () => {
  it('rests on the finished chart until half of the rows are on screen', () => {
    act(() => root.render(<AgentXSessionReplay locale="en" />));
    expect(figure().dataset.replay).toBe('rest');
    expect(figure().textContent).toContain('Request 20 / 20');
    expect(figure().textContent).toContain('92.6%');
    expect(container.querySelectorAll('[data-testid="agentx-session-replay-row"]')).toHaveLength(
      20,
    );

    showRows(0.3);
    advance(DURATION_MS);
    expect(figure().dataset.replay).toBe('rest');
    expect(figure().textContent).toContain('Request 20 / 20');
  });

  it('plays once from the first request and stays on the finished chart', () => {
    act(() => root.render(<AgentXSessionReplay locale="en" />));
    showRows(0.6);
    expect(figure().dataset.replay).toBe('out');
    expect(figure().textContent).toContain('Request 20 / 20');

    advance(LEAD_OUT_MS);
    expect(figure().dataset.replay).toBe('play');
    expect(figure().textContent).toContain('Request 01 / 20');
    expect(figure().textContent).toContain('Replay joins mid-session.');
    expect(replayButton()?.className).toContain('invisible');

    advance(TIMELINE[3].start - LEAD_OUT_MS);
    expect(figure().textContent).toContain('Request 04–06 / 20');
    expect(figure().textContent).toContain('Three subagents start in parallel');

    advance(DURATION_MS - TIMELINE[3].start);
    expect(figure().dataset.replay).toBe('rest');
    expect(replayButton()?.className).not.toContain('invisible');

    advance(3 * DURATION_MS);
    expect(figure().dataset.replay).toBe('rest');
    expect(figure().textContent).toContain('Request 20 / 20');
    expect(trackStub).not.toHaveBeenCalled();
  });

  it('holds its place while the rows are off screen or the tab is hidden', () => {
    act(() => root.render(<AgentXSessionReplay locale="en" />));
    showRows(1);
    advance(TIMELINE[5].start + 10);
    expect(figure().textContent).toContain('Request 10 / 20');

    showRows(0);
    expect(figure().dataset.replayPaused).toBe('');
    advance(DURATION_MS);
    expect(figure().textContent).toContain('Request 10 / 20');

    showRows(0.1);
    expect(figure().dataset.replayPaused).toBeUndefined();
    advance(TIMELINE[6].start - TIMELINE[5].start);
    expect(figure().textContent).toContain('Request 11 / 20');

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(figure().dataset.replayPaused).toBe('');
    advance(DURATION_MS);
    expect(figure().textContent).toContain('Request 11 / 20');

    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(DURATION_MS - TIMELINE[6].start);
    expect(figure().dataset.replay).toBe('rest');
    visibility.mockRestore();
  });

  it('replays from the start when the replay control is pressed', () => {
    act(() => root.render(<AgentXSessionReplay locale="zh" />));
    showRows(1);
    advance(DURATION_MS);
    expect(figure().dataset.replay).toBe('rest');
    expect(replayButton()?.getAttribute('aria-label')).toBe('重新播放');

    act(() => replayButton()!.click());
    expect(trackStub).toHaveBeenCalledExactlyOnceWith('agentx_replay_restarted');
    expect(figure().dataset.replay).toBe('out');
    advance(LEAD_OUT_MS);
    expect(figure().textContent).toContain('请求 01 / 20');
    advance(DURATION_MS);
    expect(figure().dataset.replay).toBe('rest');
  });

  it('is a still chart with no control when the reader prefers reduced motion', () => {
    act(() => root.render(<AgentXSessionReplay locale="en" />));
    showRows(1);
    advance(TIMELINE[3].start);
    expect(figure().dataset.replay).toBe('play');

    act(() => media.set(REDUCED_MOTION, true));
    expect(figure().dataset.replay).toBe('rest');
    expect(figure().textContent).toContain('Request 20 / 20');
    expect(replayButton()).toBeNull();
    advance(DURATION_MS);
    expect(figure().dataset.replay).toBe('rest');
  });
});
