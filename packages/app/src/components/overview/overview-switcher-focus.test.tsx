// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPageData, OverviewTier } from '@/lib/overview-data';

const routerStub = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
}));

import { OverviewNavigationProvider, useOverviewData } from './overview-navigation';
import { OVERVIEW_STRINGS, OverviewTierSwitcher } from './overview-scorecard';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function pageData(tier: OverviewTier): OverviewPageData {
  return {
    models: [],
    tier,
    engineScope: 'community',
    comparisonMode: 'hardware',
    referenceHardware: 'b200',
    modelScope: 'default',
    historicalWindow: null,
  };
}

/** Mirrors the real page: the tier comes from the payload in context, so the
 *  active option moves when the response lands. */
function Body() {
  const data = useOverviewData();
  return (
    <OverviewTierSwitcher
      tier={data.tier}
      engineScope={data.engineScope}
      comparisonMode={data.comparisonMode}
      referenceHardware={data.referenceHardware}
      modelScope={data.modelScope}
      locale="en"
      strings={OVERVIEW_STRINGS.en}
    />
  );
}

function renderSwitcher(tier: OverviewTier, href: string) {
  act(() => {
    root.render(
      <OverviewNavigationProvider initialData={pageData(tier)} initialHref={href}>
        <Body />
      </OverviewNavigationProvider>,
    );
  });
}

function tierOption(label: string): HTMLElement {
  const match = [...container.querySelectorAll<HTMLElement>('a, span')].find(
    (element) => element.textContent === label && element.tagName !== 'NAV',
  );
  if (match === undefined) throw new Error(`no tier option labelled ${label}`);
  return match;
}

beforeEach(() => {
  routerStub.push.mockClear();
  routerStub.replace.mockClear();
  window.history.replaceState({}, '', '/overview');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('overview switcher focus', () => {
  it('moves focus to the option that replaces the activated link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(pageData(75))));

    renderSwitcher(50, '/overview');

    const link = tierOption('75');
    expect(link.tagName).toBe('A');
    link.focus();
    expect(document.activeElement).toBe(link);

    await act(async () => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await Promise.resolve();
    });

    // The activated anchor is gone — React swapped in the active <span> — and
    // without the focus handoff the browser drops focus to <body>.
    const active = tierOption('75');
    expect(active.tagName).toBe('SPAN');
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(active);
  });

  it('leaves focus alone when the click did not come from the focused element', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(pageData(75))));

    renderSwitcher(50, '/overview');

    // A pointer click never focuses the anchor first in jsdom, so there is no
    // focus to restore and the active option must not steal it.
    await act(async () => {
      tierOption('75').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(document.body);
  });
});
