// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLIENT_SEARCH_CHANGE_EVENT } from '@/lib/client-navigation';
import type { OverviewPageData } from '@/lib/overview-data';

const routerStub = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const trackStub = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => routerStub }));
vi.mock('@/lib/analytics', () => ({ track: trackStub }));

import { OverviewNavigationProvider, useOverviewNavigation } from './overview-navigation';
import {
  DesktopOverviewMatrix,
  overviewFormatters,
  OVERVIEW_STRINGS,
  type OverviewStrings,
} from './overview-scorecard';
import {
  OverviewPresentationProvider,
  OverviewPresentationSurface,
  OverviewPresentToggle,
} from './overview-presentation';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const strings = {
  presentEnter: 'Present',
  presentExit: 'Exit',
  presentEnterAria: 'Show the matrix full screen',
  presentExitAria: 'Leave full screen',
  presentShortcutHint: 'Arrow keys switch views · Esc exits',
} as unknown as OverviewStrings;

describe('OVERVIEW_STRINGS.zh', () => {
  it('preserves protected identifiers, units, and dynamic values', () => {
    const zh = OVERVIEW_STRINGS.zh;

    expect(zh.tierUnit).toBe('tok/s/user');
    expect(zh.scopeAria).toContain('hyperscaler');
    expect(zh.caption).toContain('token');
    expect(zh.scenarioLabels.agentx).toContain('AgentX');
    expect(zh.methodologyNote).toContain('FP4');
    expect(zh.historyCaption(7)).toContain('7–14');
    expect(zh.costDeltaAria('20%', true, 'B200')).toEqual(
      expect.stringMatching(/B200.*20%|20%.*B200/),
    );
    expect(zh.historicalDeltaAria('20%', true, '2026年8月1日')).toEqual(
      expect.stringMatching(/2026年8月1日.*20%|20%.*2026年8月1日/),
    );
    expect(zh.rowScopeShow(3, 7)).toEqual(expect.stringMatching(/3.*7|7.*3/));
    expect(zh.hardwareRowScopeShow(3)).toContain('3');
  });
});

const HISTORY_DATA: OverviewPageData = {
  models: [],
  tier: 50,
  engineScope: 'all',
  comparisonMode: '30d',
  referenceHardware: 'b200',
  modelScope: 'default',
  rowScope: 'all',
  hardwareRowScope: 'all',
  unchangedRowCount: 0,
  emptyRowCount: 0,
  historicalWindow: null,
};

let container: HTMLDivElement;
let root: Root;
let fullscreenElement: Element | null;
let requestFullscreen: ReturnType<typeof vi.fn>;
let exitFullscreen: ReturnType<typeof vi.fn>;

function stubFullscreenApi(enabled: boolean) {
  fullscreenElement = null;
  const setFullscreenElement = (element: Element | null) => {
    fullscreenElement = element;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
  requestFullscreen = vi.fn(function requestFullscreenStub(this: Element) {
    return setFullscreenElement(this);
  });
  exitFullscreen = vi.fn(() => setFullscreenElement(null));

  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: enabled });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  });
}

function render(initialHref = '/overview?compare=30d') {
  act(() => {
    root.render(
      <OverviewNavigationProvider initialData={HISTORY_DATA} initialHref={initialHref}>
        <OverviewPresentationProvider locale="en">
          <OverviewPresentationSurface>
            <OverviewPresentToggle strings={strings} />
            <NavigationProbe />
            <div role="option" tabIndex={-1} data-testid="overview-select-option">
              7 days
            </div>
          </OverviewPresentationSurface>
        </OverviewPresentationProvider>
      </OverviewNavigationProvider>,
    );
  });
}

function NavigationProbe() {
  const navigation = useOverviewNavigation();
  return (
    <>
      <button
        type="button"
        data-testid="overview-server-selection"
        onClick={() => navigation.push('/overview', ['compare'])}
      >
        Hardware
      </button>
      <output data-testid="overview-next-href">
        {navigation.resolve('/overview?tier=75', ['tier'])}
      </output>
    </>
  );
}

const surface = () =>
  container.querySelector<HTMLElement>('[data-testid="overview-presentation-surface"]');
const toggle = () =>
  container.querySelector<HTMLButtonElement>('[data-testid="overview-present-toggle"]');
const serverSelection = () =>
  container.querySelector<HTMLButtonElement>('[data-testid="overview-server-selection"]');
const selectOption = () =>
  container.querySelector<HTMLElement>('[data-testid="overview-select-option"]');

beforeEach(() => {
  routerStub.push.mockClear();
  routerStub.replace.mockClear();
  trackStub.mockClear();
  window.history.replaceState({}, '', '/overview?compare=30d');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  stubFullscreenApi(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('OverviewPresentationSurface', () => {
  it('hands the surface to the Fullscreen API and mirrors presentation intent in the URL', () => {
    render();
    expect(toggle()?.textContent).toBe('Present');
    expect(surface()?.dataset.presenting).toBe('false');

    act(() => toggle()?.click());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?compare=30d&present=1');
    expect(fullscreenElement).toBe(surface());
    expect(surface()?.dataset.presenting).toBe('true');
    expect(toggle()?.textContent).toBe('Exit');
    expect(trackStub).toHaveBeenLastCalledWith('overview_presentation_toggled', {
      action: 'enter',
    });

    act(() => toggle()?.click());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?compare=30d');
    expect(surface()?.dataset.presenting).toBe('false');
    expect(toggle()?.textContent).toBe('Present');
    expect(trackStub).toHaveBeenLastCalledWith('overview_presentation_toggled', {
      action: 'exit',
    });
  });

  it('follows the browser out of fullscreen when Esc bypasses the button', () => {
    render();
    act(() => toggle()?.click());
    expect(surface()?.dataset.presenting).toBe('true');

    act(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(surface()?.dataset.presenting).toBe('false');
    expect(window.location.search).toBe('?compare=30d');
  });

  it('reasserts presentation intent when Back or Forward lands on an older URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(() => {
            // Keep server navigation pending while checking client URL state.
          }),
      ),
    );
    window.history.replaceState({}, '', '/overview?tier=100&compare=30d');
    render('/overview?tier=100&compare=30d');
    act(() => toggle()?.click());

    await act(async () => {
      window.history.replaceState({}, '', '/overview?tier=75&compare=30d');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await Promise.resolve();
    });

    expect(window.location.search).toBe('?tier=75&compare=30d&present=1');
    expect(container.querySelector('[data-testid="overview-next-href"]')?.textContent).toBe(
      '/overview?tier=75&compare=30d&present=1',
    );
    expect(surface()?.dataset.presenting).toBe('true');
    expect(fullscreenElement).toBe(surface());
    expect(fetch).toHaveBeenCalledWith('/api/v1/overview?tier=75&compare=30d', {
      headers: { Accept: 'application/json' },
    });
  });

  it('does not carry presentation intent onto a route left through browser history', () => {
    render();
    act(() => toggle()?.click());

    act(() => {
      window.history.replaceState({}, '', '/inference');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(window.location.pathname).toBe('/inference');
    expect(window.location.search).toBe('');
  });

  it('preserves every other query parameter and the fragment while notifying persistent chrome', () => {
    vi.stubGlobal('fetch', vi.fn());
    window.history.replaceState({}, '', '/overview?tier=75&compare=30d&utm_source=deck#matrix');
    const searchEvents: string[] = [];
    const onSearchChange = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        searchEvents.push(event.detail);
      }
    };
    window.addEventListener(CLIENT_SEARCH_CHANGE_EVENT, onSearchChange);

    render('/overview?tier=75&compare=30d');
    act(() => toggle()?.click());

    expect(window.location.pathname).toBe('/overview');
    expect(window.location.search).toBe('?tier=75&compare=30d&present=1&utm_source=deck');
    expect(window.location.hash).toBe('#matrix');
    expect(searchEvents).toEqual(['?tier=75&compare=30d&present=1&utm_source=deck']);
    expect(fetch).not.toHaveBeenCalled();

    act(() => toggle()?.click());
    expect(window.location.search).toBe('?tier=75&compare=30d&utm_source=deck');
    expect(window.location.hash).toBe('#matrix');
    expect(searchEvents).toEqual([
      '?tier=75&compare=30d&present=1&utm_source=deck',
      '?tier=75&compare=30d&utm_source=deck',
    ]);
    window.removeEventListener(CLIENT_SEARCH_CHANGE_EVENT, onSearchChange);
  });

  it('does not attempt native fullscreen from a shared presentation URL without a user gesture', () => {
    window.history.replaceState({}, '', '/overview?compare=30d&present=1');
    render('/overview?compare=30d');

    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(surface()?.dataset.presenting).toBe('false');
    expect(window.location.search).toBe('?compare=30d&present=1');

    act(() => toggle()?.click());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(surface()?.dataset.presenting).toBe('true');
  });

  it('keeps presentation intent and fullscreen active while paging to another view', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        requested.push(String(input));
        return Promise.resolve(Response.json({ ...HISTORY_DATA, comparisonMode: 'hardware' }));
      }),
    );
    render();

    act(() => toggle()?.click());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(requested).toHaveLength(1);
    expect(requested[0]).not.toContain('present=1');
    expect(window.location.search).toBe('?present=1');
    expect(surface()?.dataset.presenting).toBe('true');
    expect(fullscreenElement).toBe(surface());
  });

  it('does not page when an arrow key belongs to an interactive control', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render();
    act(() => toggle()?.click());

    act(() =>
      toggle()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?compare=30d&present=1');
  });

  it('does not page when a Radix Select option owns the arrow key', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render();
    act(() => toggle()?.click());

    act(() =>
      selectOption()?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      ),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?compare=30d&present=1');
  });

  it('keeps presentation intent when an older server selection fails', async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectRequest = reject;
          }),
      ),
    );
    render();

    act(() => serverSelection()?.click());
    act(() => toggle()?.click());
    expect(window.location.search).toBe('?present=1');

    await act(async () => {
      rejectRequest?.(new Error('network down'));
      await Promise.resolve();
    });

    expect(window.location.search).toBe('?present=1');
    expect(surface()?.dataset.presenting).toBe('true');
    expect(container.querySelector('[data-testid="overview-next-href"]')?.textContent).toContain(
      'present=1',
    );
  });

  it('removes presentation intent if the browser refuses fullscreen', async () => {
    requestFullscreen.mockRejectedValueOnce(new Error('denied'));
    render();

    await act(async () => {
      toggle()?.click();
      await Promise.resolve();
    });

    expect(window.location.search).toBe('?compare=30d');
    expect(surface()?.dataset.presenting).toBe('false');
  });

  it('keeps presenting without an unhandled rejection if exiting fullscreen is refused', async () => {
    render();
    act(() => toggle()?.click());
    exitFullscreen.mockRejectedValueOnce(new Error('denied'));

    await act(async () => {
      toggle()?.click();
      await Promise.resolve();
    });

    expect(window.location.search).toBe('?compare=30d&present=1');
    expect(surface()?.dataset.presenting).toBe('true');
    expect(fullscreenElement).toBe(surface());
  });

  it('pages between the two views with the arrow keys, but only while presenting', () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        requested.push(String(input));
        // Never settles: the assertion only cares that the request went out.
        return new Promise<Response>(() => {});
      }),
    );
    render();

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
    expect(requested).toEqual([]);

    act(() => toggle()?.click());
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));

    expect(requested).toHaveLength(1);
    // Leaving the history view is the whole point of the keypress.
    expect(requested[0]).not.toContain('compare=30d');
  });

  it('stays out of the way on browsers that refuse fullscreen', () => {
    stubFullscreenApi(false);
    window.history.replaceState({}, '', '/overview?compare=30d&present=1&utm_source=deck#matrix');
    render('/overview?compare=30d');
    expect(toggle()).toBeNull();
    expect(surface()).not.toBeNull();
    expect(window.location.search).toBe('?compare=30d&utm_source=deck');
    expect(window.location.hash).toBe('#matrix');
  });
});

const matrix = (presenting: boolean) => (
  <DesktopOverviewMatrix
    models={[]}
    locale="en"
    formatters={overviewFormatters('en')}
    strings={OVERVIEW_STRINGS.en}
    comparisonMode="hardware"
    referenceHardware="b200"
    presenting={presenting}
  />
);

describe('DesktopOverviewMatrix', () => {
  it('drops the viewport gate while presenting so a narrow projector still gets a matrix', () => {
    const gate = () =>
      container.querySelector('[data-testid="overview-desktop-matrix"]')?.parentElement?.className;

    act(() => root.render(matrix(false)));
    expect(gate()).toBe('hidden xl:block');

    // `xl` asks whether the viewport can hold the matrix. That is the right
    // question on the page and the wrong one on a deck, which lays out at a
    // fixed width and is scaled by `zoom`: keeping it would blank the slide on
    // any projector under 1280px, since presenting also drops the phone list.
    act(() => root.render(matrix(true)));
    expect(gate()).toBe('block');
  });
});
