// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLIENT_SEARCH_CHANGE_EVENT } from '@/lib/client-navigation';

import { useClientSearch } from './useClientSearch';

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

function SearchProbe({ id }: { id: string }) {
  const search = useClientSearch();
  return createElement('output', { id }, search);
}

describe('useClientSearch', () => {
  it('uses the empty server snapshot during hydration rendering', () => {
    window.history.replaceState({}, '', '/inference?unofficialrun=123');
    expect(renderToString(createElement(SearchProbe, { id: 'server' }))).toContain(
      '<output id="server"></output>',
    );
  });

  it('shares one pair of browser listeners across subscribers', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          'div',
          null,
          createElement(SearchProbe, { id: 'first' }),
          createElement(SearchProbe, { id: 'second' }),
        ),
      );
    });

    expect(addEventListener.mock.calls.filter(([event]) => event === 'popstate')).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(([event]) => event === CLIENT_SEARCH_CHANGE_EVENT),
    ).toHaveLength(1);
    act(() => root.unmount());
  });

  it('updates every subscriber for explicit search writes and back/forward events', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          'div',
          null,
          createElement(SearchProbe, { id: 'first' }),
          createElement(SearchProbe, { id: 'second' }),
        ),
      );
    });

    act(() => {
      window.history.pushState({}, '', '/inference?unofficialruns=1,2');
      window.dispatchEvent(new CustomEvent(CLIENT_SEARCH_CHANGE_EVENT));
    });
    expect(container.querySelector('#first')?.textContent).toBe('?unofficialruns=1,2');
    expect(container.querySelector('#second')?.textContent).toBe('?unofficialruns=1,2');

    act(() => {
      window.history.replaceState({}, '', '/inference?unofficialruns=1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(container.querySelector('#first')?.textContent).toBe('?unofficialruns=1');
    expect(container.querySelector('#second')?.textContent).toBe('?unofficialruns=1');
    act(() => root.unmount());
  });
});
