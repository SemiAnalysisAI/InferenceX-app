// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from '@/lib/analytics';

import { useDetailView } from './use-detail-view';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

let container: HTMLDivElement;
let root: Root;

function DetailViewProbe() {
  const [view, setView] = useDetailView();
  return createElement(
    'div',
    null,
    createElement('output', { 'data-testid': 'view' }, view),
    createElement('button', { onClick: () => setView('point') }, 'point'),
    createElement('button', { onClick: () => setView('timeline') }, 'timeline'),
    createElement('button', { onClick: () => setView('aggregates') }, 'aggregates'),
  );
}

function nativeReplace(href: string, state: unknown = window.history.state): void {
  History.prototype.replaceState.call(window.history, state, '', href);
}

function renderProbe(): void {
  act(() => root.render(createElement(DetailViewProbe)));
}

function click(label: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`Missing ${label} button`);
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function renderedView(): string | null {
  return container.querySelector('[data-testid="view"]')?.textContent ?? null;
}

beforeEach(() => {
  Reflect.deleteProperty(window.history, 'replaceState');
  nativeReplace('/inference/agentic/42');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(window.history, 'replaceState');
  nativeReplace('/');
  vi.clearAllMocks();
});

describe('useDetailView', () => {
  it('replaces client-owned view state without Next navigation and preserves the rest of the URL', () => {
    nativeReplace(
      '/inference/agentic/42?unofficialruns=11&view=timeline&sample=abc#server-metrics',
      { route: 'agentic-point' },
    );
    const nextReplace = vi.fn();
    Object.defineProperty(window.history, 'replaceState', {
      configurable: true,
      value: nextReplace,
    });
    const historyLength = window.history.length;

    renderProbe();
    expect(renderedView()).toBe('timeline');

    click('aggregates');
    expect(renderedView()).toBe('aggregates');
    expect(window.location.pathname).toBe('/inference/agentic/42');
    expect(window.location.hash).toBe('#server-metrics');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('aggregates');
    expect(new URLSearchParams(window.location.search).get('unofficialruns')).toBe('11');
    expect(new URLSearchParams(window.location.search).get('sample')).toBe('abc');
    expect(window.history.state).toEqual({ route: 'agentic-point' });
    expect(window.history.length).toBe(historyLength);
    expect(nextReplace).not.toHaveBeenCalled();

    click('point');
    expect(renderedView()).toBe('point');
    expect(new URLSearchParams(window.location.search).has('view')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('unofficialruns')).toBe('11');
    expect(new URLSearchParams(window.location.search).get('sample')).toBe('abc');
    expect(window.location.hash).toBe('#server-metrics');
    expect(nextReplace).not.toHaveBeenCalled();
    expect(track).toHaveBeenNthCalledWith(1, 'inference_agentic_detail_view_changed', {
      view: 'aggregates',
    });
    expect(track).toHaveBeenNthCalledWith(2, 'inference_agentic_detail_view_changed', {
      view: 'point',
    });
  });

  it('updates the mounted selection when Back or forward changes the URL', () => {
    nativeReplace('/inference/agentic/42?unofficialruns=11');
    renderProbe();
    expect(renderedView()).toBe('point');

    act(() => {
      nativeReplace('/inference/agentic/42?unofficialruns=11&view=timeline');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(renderedView()).toBe('timeline');

    act(() => {
      nativeReplace('/inference/agentic/42?unofficialruns=11&view=aggregates');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(renderedView()).toBe('aggregates');
  });
});
