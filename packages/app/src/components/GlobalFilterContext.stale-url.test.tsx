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
  getUrlParam: vi.fn((key: string): string | undefined =>
    key === 'i_seq' ? '8k/1k' : undefined,
  ),
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

import { GlobalFilterProvider, useGlobalFilterSelection } from './GlobalFilterContext';

/** Kimi-K3 availability: both the Agentic and the 8K/1K scenario exist. */
const KIMI_K3_ROWS = [
  { model: 'kimik3', isl: null, osl: null, benchmark_type: 'agentic_traces' },
  { model: 'kimik3', isl: 8192, osl: 1024, benchmark_type: 'single_turn' },
];

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let observedSequence: Sequence | undefined;
let observedResolved: boolean | undefined;

const SequenceProbe = memo(() => {
  const selection = useGlobalFilterSelection();
  observedSequence = selection.effectiveSequence;
  observedResolved = selection.sequenceResolved;
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
