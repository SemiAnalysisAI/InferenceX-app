// @test-environment jsdom
import { act, memo, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';

import type { AvailabilityRow } from '@/lib/api/api';
import { type AvailabilityIndex, indexAvailability } from '@/lib/benchmarks/availability-index';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { Model, Scenario } from '@/lib/catalog/data-mappings';

const mocks = {
  availability: {
    data: undefined as AvailabilityIndex | undefined,
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
};

mock.module('@/hooks/api/use-availability', () => ({
  useAvailability: () => mocks.availability,
}));
mock.module('@/hooks/api/use-workflow-info', () => ({
  useWorkflowInfo: () => mocks.workflow,
}));
mock.module('@/hooks/useUrlState', () => ({
  useUrlState: () => ({ getUrlParam: mocks.getUrlParam, setUrlParams: mocks.setUrlParams }),
}));
const actual = { ...(await import('@/lib/routing/url-state')) };
mock.module('@/lib/routing/url-state', () => ({
  ...actual,
  hasExplicitUrlParam: (key: string) => mocks.hasExplicitUrlParam(key),
  refreshUrlParams: () => ({}),
}));
mock.module('@/providers/unofficial-run-provider', () => ({
  useUnofficialRun: () => ({ availableModelsAndScenarios: [] }),
}));

import {
  GlobalFilterProvider,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from './GlobalFilterContext';

const indexRows = (rows: readonly object[]) =>
  indexAvailability(compactAvailability(rows as AvailabilityRow[]));

const KIMI_K3_ROWS = [
  { model: 'kimik3', isl: null, osl: null, benchmark_type: 'agentic_traces' },
  { model: 'kimik3', isl: 8192, osl: 1024, benchmark_type: 'single_turn' },
];

const STALE_RUN_DATE = '2026-08-20';
const LATEST_RUN_DATE = '2026-09-01';
const KIMI_K3_DATED_ROWS = [
  { ...KIMI_K3_ROWS[0], precision: 'fp8', date: STALE_RUN_DATE },
  { ...KIMI_K3_ROWS[0], precision: 'fp8', date: LATEST_RUN_DATE },
];

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let observedScenario: Scenario | undefined;
let observedResolved: boolean | undefined;
let observedRunDate: string | undefined;
let observedPrecisions: string[] | undefined;

const ScenarioProbe = memo(() => {
  const selection = useGlobalFilterSelection();
  observedScenario = selection.effectiveScenario;
  observedResolved = selection.scenarioResolved;
  observedRunDate = useGlobalFilterRun().effectiveRunDate;
  observedPrecisions = selection.effectivePrecisions;
  return null;
});

function mountProvider(): void {
  container = document.createElement('div');
  root = createRoot(container);
  act(() =>
    root?.render(
      <GlobalFilterProvider initialModel={Model.Kimi_K3}>
        <ScenarioProbe />
      </GlobalFilterProvider>,
    ),
  );
}

beforeEach(() => {
  mocks.availability.data = indexRows(KIMI_K3_ROWS);
  mocks.getUrlParam.mockClear();
  mocks.setUrlParams.mockClear();
  mocks.hasExplicitUrlParam.mockClear();
  observedScenario = undefined;
  observedResolved = undefined;
  observedRunDate = undefined;
  observedPrecisions = undefined;
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
    expect(observedScenario).toBe(Scenario.AgenticTraces);
  });

  it('still honors an i_seq explicitly present in the current URL', () => {
    mocks.hasExplicitUrlParam.mockImplementation((key: string) => key === 'i_seq');
    mountProvider();
    expect(observedResolved).toBe(true);
    expect(observedScenario).toBe(Scenario.EightK_OneK);
  });
});

describe('GlobalFilterProvider stale i_prec snapshot', () => {
  beforeEach(() => {
    mocks.availability.data = indexRows(
      ['fp4', 'fp8'].map((precision) => ({
        ...KIMI_K3_ROWS[0],
        precision,
        hardware: precision === 'fp4' ? 'vr200' : 'h200',
        framework: 'trt',
        spec_method: 'none',
        disagg: false,
      })),
    );
    mocks.getUrlParam.mockImplementation((key) => (key === 'i_prec' ? 'fp8' : undefined));
  });

  afterEach(() => {
    mocks.getUrlParam.mockImplementation((key) => (key === 'i_seq' ? '8k/1k' : undefined));
  });

  it('ignores retained TPU FP8 when the destination has no precision parameter', () => {
    mocks.hasExplicitUrlParam.mockReturnValue(false);
    mountProvider();
    expect(observedPrecisions).toEqual(['fp4', 'fp8']);
  });

  it('still honors an explicit FP8 share link', () => {
    mocks.hasExplicitUrlParam.mockImplementation((key) => key === 'i_prec');
    mountProvider();
    expect(observedPrecisions).toEqual(['fp8']);
  });
});

describe('GlobalFilterProvider stale g_rundate snapshot', () => {
  beforeEach(() => {
    mocks.availability.data = indexRows(KIMI_K3_DATED_ROWS);
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

const mount = (Probe: ComponentType, initialChipBasis?: 'pool' | 'total') => {
  container = document.createElement('div');
  root = createRoot(container);
  act(() =>
    root?.render(
      <GlobalFilterProvider initialModel={Model.Kimi_K3} initialChipBasis={initialChipBasis}>
        <Probe />
      </GlobalFilterProvider>,
    ),
  );
};

describe('GlobalFilterProvider chip basis', () => {
  let observedChipBasis: string | undefined;
  const ChipBasisProbe = memo(() => {
    observedChipBasis = useGlobalFilterSelection().chipBasis;
    return null;
  });

  beforeEach(() => {
    mocks.hasExplicitUrlParam.mockImplementation((key: string) => key === 'g_chips');
    mocks.getUrlParam.mockImplementation((key: string) => (key === 'g_chips' ? 'pool' : undefined));
  });
  afterEach(() => {
    mocks.getUrlParam.mockImplementation((key: string) => (key === 'i_seq' ? '8k/1k' : undefined));
  });

  it('applies g_chips from the URL on dashboard pages', () => {
    mocks.getUrlParam.mockImplementation((key: string) =>
      key === 'g_chips' ? 'total' : undefined,
    );
    mount(ChipBasisProbe);
    expect(observedChipBasis).toBe('total');
  });

  it('keeps an embed’s server-resolved basis over the URL', () => {
    mount(ChipBasisProbe, 'total');
    expect(observedChipBasis).toBe('total');
  });
});
