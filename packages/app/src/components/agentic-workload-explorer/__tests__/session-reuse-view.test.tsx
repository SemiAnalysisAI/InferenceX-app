// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionReuseView } from '@/components/agentic-workload-explorer/session-reuse-view';
import {
  buildSessionReusePayload,
  sessionReuseWindow,
} from '@semianalysisai/inferencex-db/proxytrace/shared/session-reuse';

const data = buildSessionReusePayload(
  [
    { kind: 'sessionAge', cohort: 'all', bucket: 7, count: 2 },
    { kind: 'returnGap', cohort: 'all', bucket: 2, count: 2 },
    { kind: 'callAge', cohort: 'all', bucket: 0, count: 2 },
    { kind: 'callAge', cohort: 'all', bucket: 7, count: 8 },
    { kind: 'activityDailyCalls', cohort: '', bucket: 5, count: 2 },
    { kind: 'activityPeriodCalls', cohort: '', bucket: 10, count: 1 },
  ],
  sessionReuseWindow(new Date('2026-09-21T00:00:00Z')),
  7,
  'anon',
);
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('session reuse dashboard', () => {
  it('renders all three charts, exact data and denominator limitations', () => {
    act(() => root.render(<SessionReuseView data={data} />));
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(3);
    expect(container.textContent).toContain('not verified user counts');
    expect(container.textContent).toContain('Minimum follow-up: 28 days');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(40);
  });
  it('applies valid cutoffs, preserves the chart on invalid input, and exports the displayed data', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    act(() => root.render(<SessionReuseView data={data} />));
    const input = container.querySelector<HTMLInputElement>('#reuse-days')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, '1,7,28');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(12);
    act(() => {
      setter.call(input, '0,29');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('1 to 28');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(12);
    const exportButton = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Export JSON',
    )!;
    act(() => exportButton.click());
    const blob = create.mock.calls[0][0] as Blob;
    const exported = JSON.parse(await blob.text());
    expect(exported.cohorts[0].points.map((p: { days: number }) => p.days)).toEqual([1, 7, 28]);
    expect(exported.window).toEqual(data.window);
    expect(exported.scope).toBe('anon');
  });
  it('shows a follow-up explanation for empty cohorts rather than zero-percent charts', () => {
    const empty = buildSessionReusePayload([], data.window, 7, 'anon');
    act(() => root.render(<SessionReuseView data={empty} />));
    expect(container.textContent).toContain('No eligible sessions have enough follow-up');
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(0);
  });
});
