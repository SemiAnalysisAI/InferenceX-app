// @test-environment jsdom
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi, mock } from 'bun:test';

import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

const mocks = { pathname: '/pwx' };

const actual = { ...(await import('next/navigation')) };
mock.module('next/navigation', () => ({
  ...actual,
  usePathname: () => mocks.pathname,
}));
const actual2 = { ...(await import('@/providers/unofficial-run-provider')) };
mock.module('@/providers/unofficial-run-provider', () => ({
  ...actual2,
  useUnofficialRun: () => ({ availableModelsAndSequences: [] }),
}));

let loadCount = 0;

interface Read {
  view: string | null;
  role: string;
  metric: string;
  compare: string;
  count: string;
}

let unmount: (() => void) | null = null;

afterEach(() => {
  unmount?.();
  unmount = null;
  document.body.innerHTML = '';
  unstubAllGlobals();
});

/**
 * Opens `/pwx?<query>` as a fresh page load and returns what the page reads, plus the
 * address bar after the page rewrote it. URL state is read once per module load, so every
 * case loads a fresh url-state. Bun caches modules per specifier, so a query string loads a
 * new copy, and mocking url-state with it hands that copy to the app modules.
 */
async function open(query: string): Promise<{ read: Read; url: URLSearchParams }> {
  window.history.replaceState(null, '', `/pwx?${query}`);
  stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json([]))),
  );
  loadCount += 1;
  const urlState = await import(`@/lib/routing/url-state?load=${loadCount}`);
  mock.module('@/lib/routing/url-state', () => urlState);
  const [
    { act },
    { createRoot },
    { QueryClient, QueryClientProvider },
    { InferenceProvider, useInferenceDisplay },
    { powerXCountFor, powerXViewFor },
    { PowerXSurfaceProvider },
    { GlobalFilterProvider },
    { setLiveAddressBar },
  ] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('@tanstack/react-query'),
    import('@/components/inference/InferenceContext'),
    import('@/components/inference/powerx/powerx-views'),
    import('@/components/inference/ui/powerx-surface'),
    import('@/providers/GlobalFilterContext'),
    import('@/lib/routing/url-state'),
  ]);
  // The PowerX chart keeps the address bar live, so the rewritten link shows up in it.
  setLiveAddressBar(true);
  let latest: Read | null = null;
  function Probe() {
    const { storedYAxisMetric, storedPowerCompare, powerRole, selectedYAxisMetric, powerCompare } =
      useInferenceDisplay();
    latest = {
      view: powerXViewFor(selectedYAxisMetric, powerCompare),
      role: powerRole,
      metric: storedYAxisMetric,
      compare: storedPowerCompare,
      count: powerXCountFor(storedYAxisMetric, storedPowerCompare),
    };
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <GlobalFilterProvider>
          <PowerXSurfaceProvider>
            <InferenceProvider activeTab="inference">
              <Probe />
            </InferenceProvider>
          </PowerXSurfaceProvider>
        </GlobalFilterProvider>
      </QueryClientProvider>,
    ),
  );
  unmount = () => act(() => root.unmount());
  for (let pass = 0; pass < 10; pass++) await act(() => sleep(0));
  // URL writes are debounced by 150 ms.
  await act(() => sleep(200));
  return { read: latest!, url: new URLSearchParams(window.location.search) };
}

describe('old PowerX links opened on /pwx', () => {
  it('opens i_pcompare=roles on Breakdown, split by GPU role', async () => {
    const { read, url } = await open('i_metric=y_measuredAvgPower&i_pcompare=roles');
    expect(read).toMatchObject({ view: 'breakdown', role: 'split', compare: 'breakdown' });
    expect(url.get('i_pcompare')).toBe('breakdown');
    expect(url.get('i_role')).toBe('split');
  });

  it.each([
    ['y_measuredPrefillAvgPower', 'y_measuredAvgPower', 'power', 'prefill'],
    ['y_measuredDecodeAvgPower', 'y_measuredAvgPower', 'power', 'decode'],
    ['y_measuredPrefillJPerInputToken', 'y_measuredJPerInputToken', 'energy', 'prefill'],
    ['y_measuredDecodeJPerOutputToken', 'y_measuredJPerOutputToken', 'energy', 'decode'],
  ])('reads the role metric %s as %s under a GPU role', async (legacy, metric, view, role) => {
    const { read, url } = await open(`i_metric=${legacy}`);
    expect(read).toMatchObject({ view, role, metric });
    expect(url.get('i_metric')).toBe(metric);
    expect(url.get('i_role')).toBe(role);
  });

  it('keeps an explicit i_role over the role an old metric implied', async () => {
    const { read } = await open('i_metric=y_measuredPrefillAvgPower&i_role=split');
    expect(read).toMatchObject({ role: 'split', metric: 'y_measuredAvgPower' });
  });

  it('opens an old i_pcompare=boundaries link on Boundary All', async () => {
    const { read } = await open('i_metric=y_measuredJPerOutputToken&i_pcompare=boundaries');
    expect(read).toMatchObject({ view: 'energy', role: 'all', count: 'both' });
  });
});
