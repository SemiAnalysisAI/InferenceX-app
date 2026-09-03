// @vitest-environment jsdom
import { act, memo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Model, Sequence } from '@/lib/data-mappings';
import type * as UrlStateModule from '@/lib/url-state';

/**
 * Regression coverage for the stale-`i_seq` snapshot bug behind the paramless
 * AgentX hero links (see `agentxDashboardHref`).
 *
 * The module-level URL snapshot retains self-written params across soft
 * navigations: every dashboard visit pins its resolved sequence via the
 * URL-sync effect, and `refreshUrlParams` does not evict keys absent from the
 * live URL. `getUrlParam('i_seq')` can therefore return the PREVIOUS page's
 * sequence on a navigation whose URL carries no `i_seq` at all. Applying that
 * value flips `sequenceExplicit`, which blocks the availability-driven AgentX
 * default — a bare `/inference/kimi-k3` hero link would open on 8K/1K.
 *
 * The provider must consult `hasExplicitUrlParam('i_seq')` (which IS refreshed
 * per navigation) before honoring the snapshot value.
 */

const mocks = vi.hoisted(() => ({
  availability: {
    data: [] as unknown[],
    error: null as Error | null,
    isSuccess: true,
  },
  workflow: {
    data: undefined,
    isLoading: false,
    error: null as Error | null,
  },
  getUrlParam: vi.fn((key: string): string | undefined => (key === 'i_seq' ? '8k/1k' : undefined)),
  setUrlParams: vi.fn(),
  hasExplicitUrlParam: vi.fn((_key: string) => false),
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
vi.mock('@/lib/url-state', async (importOriginal) => ({
  ...(await importOriginal<typeof UrlStateModule>()),
  hasExplicitUrlParam: (key: string) => mocks.hasExplicitUrlParam(key),
  refreshUrlParams: () => ({}),
}));
vi.mock('@/components/unofficial-run-provider', () => ({
  useUnofficialRun: () => ({ availableModelsAndSequences: [] }),
}));

import {
  GlobalFilterProvider,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from './GlobalFilterContext';

/** Kimi-K3 availability: both the Agentic and the 8K/1K scenario exist. */
const KIMI_K3_ROWS = [
  { model: 'kimik3', isl: null, osl: null, benchmark_type: 'agentic_traces' },
  { model: 'kimik3', isl: 8192, osl: 1024, benchmark_type: 'single_turn' },
];

/** Two Agentic run dates; a retained `g_rundate` snapshot points at the older one. */
const STALE_RUN_DATE = '2026-08-20';
const LATEST_RUN_DATE = '2026-09-01';
const KIMI_K3_DATED_ROWS = [
  { ...KIMI_K3_ROWS[0], precision: 'fp8', date: STALE_RUN_DATE },
  { ...KIMI_K3_ROWS[0], precision: 'fp8', date: LATEST_RUN_DATE },
];

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let observedSequence: Sequence | undefined;
let observedResolved: boolean | undefined;
let observedRunDate: string | undefined;

const SequenceProbe = memo(() => {
  const selection = useGlobalFilterSelection();
  observedSequence = selection.effectiveSequence;
  observedResolved = selection.sequenceResolved;
  observedRunDate = useGlobalFilterRun().effectiveRunDate;
  return null;
});

function mountProvider(): void {
  container = document.createElement('div');
  root = createRoot(container);
  act(() =>
    root?.render(
      <GlobalFilterProvider initialModel={Model.Kimi_K3}>
        <SequenceProbe />
      </GlobalFilterProvider>,
    ),
  );
}

beforeEach(() => {
  mocks.availability.data = KIMI_K3_ROWS;
  mocks.getUrlParam.mockClear();
  mocks.setUrlParams.mockClear();
  mocks.hasExplicitUrlParam.mockClear();
  observedSequence = undefined;
  observedResolved = undefined;
  observedRunDate = undefined;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('GlobalFilterProvider stale i_seq snapshot', () => {
  it('ignores a retained i_seq the current URL does not carry — AgentX default wins', () => {
    mocks.hasExplicitUrlParam.mockReturnValue(false);
    mountProvider();
    expect(observedResolved).toBe(true);
    expect(observedSequence).toBe(Sequence.AgenticTraces);
  });

  it('still honors an i_seq explicitly present in the current URL', () => {
    mocks.hasExplicitUrlParam.mockImplementation((key: string) => key === 'i_seq');
    mountProvider();
    expect(observedResolved).toBe(true);
    expect(observedSequence).toBe(Sequence.EightK_OneK);
  });
});

/**
 * The same snapshot-vs-live-URL split applies to the run pins. Every manual
 * date pick (and every blog "live chart" link) writes `g_rundate` into the
 * snapshot; `refreshUrlParams` never evicts it. If the provider honored that
 * retained value on a navigation whose URL carries no `g_rundate`, it would flip
 * the explicit-date flag and open a fresh dashboard on the OLD date instead of
 * the latest run — the "run date is not at the latest on a fresh load" bug.
 */
describe('GlobalFilterProvider stale g_rundate snapshot', () => {
  beforeEach(() => {
    mocks.availability.data = KIMI_K3_DATED_ROWS;
    mocks.getUrlParam.mockImplementation((key: string) =>
      key === 'g_rundate' ? STALE_RUN_DATE : undefined,
    );
  });

  afterEach(() => {
    mocks.getUrlParam.mockImplementation((key: string) => (key === 'i_seq' ? '8k/1k' : undefined));
  });

  it('ignores a retained g_rundate the current URL does not carry — latest date wins', () => {
    mocks.hasExplicitUrlParam.mockReturnValue(false);
    mountProvider();
    expect(observedRunDate).toBe(LATEST_RUN_DATE);
  });

  it('still pins a g_rundate explicitly present in the current URL', () => {
    mocks.hasExplicitUrlParam.mockImplementation((key: string) => key === 'g_rundate');
    mountProvider();
    expect(observedRunDate).toBe(STALE_RUN_DATE);
  });
});
