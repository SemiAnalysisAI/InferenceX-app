// @vitest-environment jsdom
import { act, memo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityRow } from '@/lib/api/api';
import { type AvailabilityIndex, indexAvailability } from '@/lib/benchmarks/availability-index';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { Model } from '@/lib/catalog/data-mappings';
import {
  CLIENT_PATHNAME_CHANGE_EVENT,
  isPageviewPathnameChange,
} from '@/lib/routing/client-navigation';
import type * as UrlStateModule from '@/lib/routing/url-state';

const mocks = vi.hoisted(() => ({
  pathname: '/',
  availability: {
    data: undefined as AvailabilityIndex | undefined,
    error: null as Error | null,
    isError: false,
    isPending: true,
    refetch: vi.fn(),
  },
  workflow: { data: undefined, isLoading: false, error: null as Error | null },
  getUrlParam: vi.fn((_key: string): string | undefined => undefined),
  setUrlParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock('@/hooks/api/use-availability', () => ({
  useAvailability: () => mocks.availability,
}));
vi.mock('@/hooks/api/use-workflow-info', () => ({
  useWorkflowInfo: () => mocks.workflow,
}));
vi.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({ getUrlParam: mocks.getUrlParam, setUrlParams: mocks.setUrlParams }),
}));
vi.mock('@/lib/routing/url-state', async (importOriginal) => ({
  ...(await importOriginal<typeof UrlStateModule>()),
  hasExplicitUrlParam: () => false,
  refreshUrlParams: () => ({}),
}));
vi.mock('@/providers/unofficial-run-provider', () => ({
  useUnofficialRun: () => ({ availableModelsAndSequences: [] }),
}));

import {
  GlobalFilterProvider,
  useGlobalFilterActions,
  useGlobalFilterSelection,
  type GlobalFilterActionsContextType,
} from './GlobalFilterContext';

const AVAILABILITY = indexAvailability(
  compactAvailability([
    { model: 'kimik3', isl: 8192, osl: 1024, benchmark_type: 'single_turn', precision: 'fp4' },
    { model: 'dsr1', isl: 8192, osl: 1024, benchmark_type: 'single_turn', precision: 'fp4' },
  ] as AvailabilityRow[]),
);

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let actions: GlobalFilterActionsContextType | undefined;
let sequenceResolved: boolean | undefined;
let pathnameEvents: Event[] = [];
const recordPathnameEvent = (event: Event) => pathnameEvents.push(event);

const Probe = memo(() => {
  actions = useGlobalFilterActions();
  sequenceResolved = useGlobalFilterSelection().sequenceResolved;
  return null;
});

function render(initialModel?: Model): void {
  act(() =>
    root?.render(
      <GlobalFilterProvider initialModel={initialModel}>
        <Probe />
      </GlobalFilterProvider>,
    ),
  );
}

function mountAt(path: string, initialModel?: Model): void {
  mocks.pathname = path;
  window.history.replaceState(null, '', path);
  container = document.createElement('div');
  root = createRoot(container);
  render(initialModel);
}

function settleAvailability(initialModel?: Model): void {
  mocks.availability.data = AVAILABILITY;
  mocks.availability.isPending = false;
  render(initialModel);
}

const pageviews = () => pathnameEvents.filter(isPageviewPathnameChange);

beforeEach(() => {
  mocks.availability.data = undefined;
  mocks.availability.isPending = true;
  mocks.setUrlParams.mockReset();
  actions = undefined;
  sequenceResolved = undefined;
  pathnameEvents = [];
  window.addEventListener(CLIENT_PATHNAME_CHANGE_EVENT, recordPathnameEvent);
});

afterEach(() => {
  window.removeEventListener(CLIENT_PATHNAME_CHANGE_EVENT, recordPathnameEvent);
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('GlobalFilterProvider model path sync pageviews', () => {
  it('canonicalizes a bare route without a pageview as flags settle and non-model filters change', () => {
    mountAt('/infx/calculator', Model.Kimi_K3);
    expect(sequenceResolved).toBe(false);

    settleAvailability(Model.Kimi_K3);
    expect(sequenceResolved).toBe(true);
    act(() => actions?.setTcoBasis('external'));

    expect(window.location.pathname).toBe('/infx/calculator/kimi-k3');
    expect(pathnameEvents).toHaveLength(1);
    expect(pageviews()).toHaveLength(0);
  });

  it('does not count the bare profit estimator settling onto its slug as a pageview', () => {
    mountAt('/infx/profit-estimator', Model.DeepSeek_V4_Pro);
    settleAvailability(Model.DeepSeek_V4_Pro);

    expect(window.location.pathname).toBe('/infx/profit-estimator/deepseek-v4');
    expect(pageviews()).toHaveLength(0);
  });

  it('records exactly one pageview when the user switches the model', () => {
    mountAt('/infx/calculator/kimi-k3', Model.Kimi_K3);
    settleAvailability(Model.Kimi_K3);
    expect(pathnameEvents).toHaveLength(0);

    act(() => actions?.setSelectedModel(Model.DeepSeek_R1));
    act(() => actions?.setTcoBasis('external'));

    expect(window.location.pathname).toBe('/infx/calculator/deepseek-r1');
    expect(pathnameEvents).toHaveLength(1);
    expect(pageviews()).toHaveLength(1);
  });

  it('records a pageview when the user moves a bare route onto another model', () => {
    mountAt('/zh/infx/historical');
    settleAvailability();
    expect(pathnameEvents).toHaveLength(0);

    act(() => actions?.setSelectedModel(Model.Kimi_K3));

    expect(window.location.pathname).toBe('/zh/infx/historical/kimi-k3');
    expect(pageviews()).toHaveLength(1);
  });

  it('does not count programmatic model corrections as pageviews', () => {
    mountAt('/infx/historical/kimi-k3', Model.Kimi_K3);
    settleAvailability(Model.Kimi_K3);

    act(() => actions?.setSelectedModel(Model.DeepSeek_R1, { userSelection: false }));

    expect(window.location.pathname).toBe('/infx/historical/deepseek-r1');
    expect(pathnameEvents).toHaveLength(1);
    expect(pageviews()).toHaveLength(0);
  });
});
