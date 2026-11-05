// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pathname: '/agentic-workload-explorer', locale: 'en' }));

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => state.locale }));
vi.mock('@/components/agentic-workload-explorer/section-nav', () => ({ SectionNav: () => null }));
vi.mock('@/components/agentic-workload-explorer/snapshot-stamp', () => ({
  SnapshotStamp: () => null,
}));
vi.mock('@/components/agentic-workload-explorer/trace-version-selector', () => ({
  TraceVersionSelector: () => null,
}));

import { ExplorerShell } from '../explorer-shell';

function headingTags(pathname: string, locale = 'en'): string[] {
  state.pathname = pathname;
  state.locale = locale;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(ExplorerShell, null, 'body')));
  const tags = [...container.querySelectorAll('h1, h2')].map((el) => el.tagName);
  act(() => root.unmount());
  return tags;
}

afterEach(() => {
  state.pathname = '/agentic-workload-explorer';
  state.locale = 'en';
});

describe('ExplorerShell heading level', () => {
  it('leaves the overview h1 to its TabIntro', () => {
    expect(headingTags('/agentic-workload-explorer')).toEqual(['H2']);
    expect(headingTags('/zh/agentic-workload-explorer', 'zh')).toEqual(['H2']);
  });

  it('gives every section page an h1 in both locales', () => {
    expect(headingTags('/agentic-workload-explorer/graphs')).toEqual(['H1']);
    expect(headingTags('/zh/agentic-workload-explorer/streaming', 'zh')).toEqual(['H1']);
  });
});
