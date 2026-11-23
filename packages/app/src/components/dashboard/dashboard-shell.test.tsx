// @test-environment jsdom
import { describe, expect, it, mock } from 'bun:test';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

const passthrough = ({ children }: { children?: ReactNode }) => children;

// The app bundles next/dynamic as the App Router build, which throws a failed chunk to the
// nearest error boundary. Plain module resolution would load the Pages Router build instead.
const appDynamic = await import('next/dist/shared/lib/app-dynamic');
mock.module('next/dynamic', () => appDynamic);
mock.module('next/navigation', () => ({ usePathname: () => '/infx/inference' }));
mock.module('@/providers/GlobalFilterContext', () => ({ GlobalFilterProvider: passthrough }));
mock.module('@/components/dashboard/tab-nav', () => ({ TabNav: () => null }));
mock.module('@/providers/unofficial-run-provider', () => ({
  UnofficialRunBanner: () => null,
  UnofficialRunProvider: passthrough,
}));
// The nudge engine's chunk fails to load, as a ChunkLoadError after a deploy does.
mock.module('@/components/nudges/nudge-engine', () => {
  throw new Error('ChunkLoadError: nudge-engine');
});

const { DashboardShell } = await import('./dashboard-shell');

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DashboardShell', () => {
  it('keeps the dashboard when the nudge engine chunk fails to load', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(DashboardShell, null, createElement('p', null, 'chart')));
      // Let the rejected import settle and React render what the lazy component resolves to.
      const settled = Promise.withResolvers<void>();
      setTimeout(settled.resolve, 50);
      await settled.promise;
    });
    expect(container.querySelector('main')?.textContent).toBe('chart');
    act(() => root.unmount());
  });
});
