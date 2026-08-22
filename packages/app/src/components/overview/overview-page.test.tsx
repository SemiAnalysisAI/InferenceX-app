// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPageData } from '@/lib/overview-data';

import { OverviewPageContent } from './overview-page';
import type { OverviewLocale } from './overview-strings';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_DATA: OverviewPageData = {
  models: [],
  tier: 50,
  engineScope: 'community',
  comparisonMode: 'hardware',
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

function renderPage(locale: OverviewLocale) {
  act(() => {
    root.render(<OverviewPageContent data={EMPTY_DATA} locale={locale} />);
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/overview');
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('OverviewPageContent failure states', () => {
  it.each([
    ['en', 'No overview results match this selection.'],
    ['zh', '没有符合当前筛选条件的总览结果。'],
  ] as const)('renders the localized empty state for %s', (locale, message) => {
    renderPage(locale);

    const empty = container.querySelector('[data-testid="overview-empty-state"]');
    expect(empty?.textContent).toBe(message);
    expect(container.querySelector('[data-testid="overview-desktop-matrix"]')).toBeNull();
    expect(container.querySelector('[data-testid="overview-mobile-list"]')).toBeNull();
  });

  it.each([
    ['en', 'Could not load the selected comparison. Showing the last successfully loaded data.'],
    ['zh', '无法加载所选对比，当前显示的是上次成功加载的数据。'],
  ] as const)(
    'renders a localized recoverable navigation alert for %s',
    async (locale, message) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('network down'))),
      );
      window.history.replaceState({}, '', locale === 'zh' ? '/zh/overview' : '/overview');
      renderPage(locale);

      const tierLink = [...container.querySelectorAll<HTMLAnchorElement>('a')].find(
        (link) => link.textContent === '75',
      );
      expect(tierLink).toBeDefined();

      await act(async () => {
        tierLink?.click();
        await Promise.resolve();
        await Promise.resolve();
      });

      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toBe(message);
      expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    },
  );
});
