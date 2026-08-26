// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OverviewEngineScope, OverviewPageData } from '@/lib/overview-data';

const routerStub = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
}));

import { OverviewNavigationProvider, useOverviewData } from './overview-navigation';
import { OverviewEngineScopeSwitcher } from './overview-scorecard';
import { OVERVIEW_STRINGS } from './overview-strings';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function pageData(engineScope: OverviewEngineScope): OverviewPageData {
  return {
    models: [],
    tier: 50,
    engineScope,
    comparisonMode: 'hardware',
    referenceHardware: 'b200',
    modelScope: 'default',
    rowScope: 'all',
    hardwareRowScope: 'all',
    unchangedRowCount: 0,
    emptyRowCount: 0,
    historicalWindow: null,
  };
}

/** Mirrors the real page: the scope comes from the payload in context, so the
 *  active option moves when the response lands. */
function Body() {
  const data = useOverviewData();
  return (
    <OverviewEngineScopeSwitcher
      engineScope={data.engineScope}
      tier={data.tier}
      comparisonMode={data.comparisonMode}
      referenceHardware={data.referenceHardware}
      modelScope={data.modelScope}
      rowScope={data.rowScope}
      hardwareRowScope={data.hardwareRowScope}
      locale="en"
      strings={OVERVIEW_STRINGS.en}
    />
  );
}

function renderSwitcher(engineScope: OverviewEngineScope, href: string) {
  act(() => {
    root.render(
      <OverviewNavigationProvider initialData={pageData(engineScope)} initialHref={href}>
        <Body />
      </OverviewNavigationProvider>,
    );
  });
}

function scopeOption(scope: OverviewEngineScope): HTMLElement {
  const match = container.querySelector<HTMLElement>(`[data-overview-engine-scope="${scope}"]`);
  if (match === null) throw new Error(`no engine scope option ${scope}`);
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(pageData('all'))));

    renderSwitcher('community', '/overview');

    const link = scopeOption('all');
    expect(link.tagName).toBe('A');
    link.focus();
    expect(document.activeElement).toBe(link);

    await act(async () => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await Promise.resolve();
    });

    // The activated anchor is gone — React swapped in the active <span> — and
    // without the focus handoff the browser drops focus to <body>.
    const active = scopeOption('all');
    expect(active.tagName).toBe('SPAN');
    expect(active.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(active);
  });

  it('leaves focus alone when the click did not come from the focused element', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(pageData('all'))));

    renderSwitcher('community', '/overview');

    // A pointer click never focuses the anchor first in jsdom, so there is no
    // focus to restore and the active option must not steal it.
    await act(async () => {
      scopeOption('all').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(document.body);
  });
});
