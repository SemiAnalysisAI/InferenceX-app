// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPageData, OverviewTier } from '@/lib/overview-data';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { OverviewNavigationProvider, useOverviewNavigation } from './overview-navigation';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let selectTier: (() => void) | undefined;

function pageData(tier: OverviewTier): OverviewPageData {
  return {
    models: [],
    tier,
    engineScope: 'community',
    comparisonMode: 'hardware',
    referenceHardware: 'b200',
    modelScope: 'default',
    historyDays: 30,
    visibleHardware: ['b200', 'mi355x', 'b300', 'gb200', 'gb300'],
    historicalWindow: null,
  };
}

function Probe() {
  const navigation = useOverviewNavigation();
  selectTier = () => navigation.push('/overview?tier=75', ['tier']);
  return <output data-testid="tier">{navigation.data.tier}</output>;
}

function renderProvider(data: OverviewPageData, href: string) {
  act(() => {
    root.render(
      <OverviewNavigationProvider initialData={data} initialHref={href}>
        <Probe />
      </OverviewNavigationProvider>,
    );
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/overview');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  selectTier = undefined;
  vi.unstubAllGlobals();
});

describe('OverviewNavigationProvider', () => {
  it('ignores an older selector response after fresh server props arrive', async () => {
    let resolveSelectorRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveSelectorRequest = resolve;
          }),
      ),
    );

    renderProvider(pageData(50), '/overview');
    act(() => selectTier?.());

    expect(fetch).toHaveBeenCalledWith('/api/v1/overview?tier=75', {
      headers: { Accept: 'application/json' },
    });

    renderProvider(pageData(100), '/overview?tier=100');
    expect(container.querySelector('[data-testid="tier"]')?.textContent).toBe('100');

    await act(async () => {
      resolveSelectorRequest?.(Response.json(pageData(75)));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="tier"]')?.textContent).toBe('100');
  });
});
