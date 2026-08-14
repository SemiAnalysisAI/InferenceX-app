// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPageData } from '@/lib/overview-data';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { OverviewNavigationProvider } from './overview-navigation';
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

const HISTORY_DATA: OverviewPageData = {
  models: [],
  tier: 50,
  engineScope: 'all',
  comparisonMode: 'history',
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

function render() {
  act(() => {
    root.render(
      <OverviewNavigationProvider initialData={HISTORY_DATA} initialHref="/overview?compare=30d">
        <OverviewPresentationProvider locale="en">
          <OverviewPresentationSurface>
            <OverviewPresentToggle strings={strings} />
          </OverviewPresentationSurface>
        </OverviewPresentationProvider>
      </OverviewNavigationProvider>,
    );
  });
}

const surface = () =>
  container.querySelector<HTMLElement>('[data-testid="overview-presentation-surface"]');
const toggle = () =>
  container.querySelector<HTMLButtonElement>('[data-testid="overview-present-toggle"]');

beforeEach(() => {
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
  it('hands the surface to the Fullscreen API and mirrors the browser back', () => {
    render();
    expect(toggle()?.textContent).toBe('Present');
    expect(surface()?.dataset.presenting).toBe('false');

    act(() => toggle()?.click());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBe(surface());
    expect(surface()?.dataset.presenting).toBe('true');
    expect(toggle()?.textContent).toBe('Exit');

    act(() => toggle()?.click());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(surface()?.dataset.presenting).toBe('false');
    expect(toggle()?.textContent).toBe('Present');
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
    render();
    expect(toggle()).toBeNull();
    expect(surface()).not.toBeNull();
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
