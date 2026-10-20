// @vitest-environment jsdom
import { act, memo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Model, Precision, Sequence } from '@/lib/catalog/data-mappings';

const mocks = vi.hoisted(() => ({
  availability: {
    data: [] as unknown[] | undefined,
    error: null as Error | null,
    isError: false,
    isPending: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
  workflow: {
    data: undefined as
      | {
          runs: Record<string, unknown>[];
          changelogs: Record<string, unknown>[];
          configs: unknown[];
          runConfigs: unknown[];
        }
      | undefined,
    isLoading: false,
    error: null as Error | null,
  },
  unofficialAvailable: [] as { model: string; sequence: string; precision: string }[],
  getUrlParam: vi.fn<(key: string) => string | undefined>(() => undefined),
  setUrlParams: vi.fn(),
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
vi.mock('@/providers/unofficial-run-provider', () => ({
  useUnofficialRun: () => ({ availableModelsAndSequences: mocks.unofficialAvailable }),
}));

import {
  GlobalFilterProvider,
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterSelection,
  useGlobalFilterWorkflow,
  type GlobalFilterActionsContextType,
  type GlobalFilterAvailabilityContextType,
  type GlobalFilterSelectionContextType,
} from './GlobalFilterContext';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let rerenderProvider: (() => void) | undefined;
let selectModel: ((model: Model) => void) | undefined;
let selectionRenders = 0;
let actionRenders = 0;
let workflowRenders = 0;
const actionSnapshots: GlobalFilterActionsContextType[] = [];
let availabilitySnapshot: GlobalFilterAvailabilityContextType | undefined;
let selectionSnapshot: GlobalFilterSelectionContextType | undefined;

const SelectionProbe = memo(() => {
  selectionSnapshot = useGlobalFilterSelection();
  selectionRenders += 1;
  return null;
});

const ActionProbe = memo(() => {
  const actions = useGlobalFilterActions();
  selectModel = actions.setSelectedModel;
  actionRenders += 1;
  return null;
});

const WorkflowProbe = memo(() => {
  useGlobalFilterWorkflow();
  workflowRenders += 1;
  return null;
});

const AvailabilityProbe = memo(() => {
  availabilitySnapshot = useGlobalFilterAvailability();
  return null;
});

const ActionIdentityProbe = memo(() => {
  useGlobalFilterSelection();
  actionSnapshots.push(useGlobalFilterActions());
  return null;
});

function ProviderHarness() {
  const [, setRevision] = useState(0);
  rerenderProvider = () => setRevision((revision) => revision + 1);
  return (
    <GlobalFilterProvider
      initialModel={Model.DeepSeek_V4_Pro}
      initialSequence={Sequence.EightK_OneK}
      initialPrecisions={[Precision.FP4]}
    >
      <SelectionProbe />
      <ActionProbe />
      <WorkflowProbe />
      <AvailabilityProbe />
      <ActionIdentityProbe />
    </GlobalFilterProvider>
  );
}

function mountProvider(): void {
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root?.render(<ProviderHarness />));
}

beforeEach(() => {
  mocks.availability.data = [];
  mocks.availability.error = null;
  mocks.availability.isError = false;
  mocks.availability.isPending = false;
  mocks.availability.refetch.mockReset();
  mocks.workflow.data = undefined;
  mocks.workflow.isLoading = false;
  mocks.workflow.error = null;
  mocks.unofficialAvailable = [];
  mocks.getUrlParam.mockReset();
  mocks.getUrlParam.mockReturnValue(undefined);
  mocks.setUrlParams.mockReset();
  rerenderProvider = undefined;
  selectModel = undefined;
  selectionRenders = 0;
  actionRenders = 0;
  workflowRenders = 0;
  actionSnapshots.length = 0;
  availabilitySnapshot = undefined;
  selectionSnapshot = undefined;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('GlobalFilterProvider context isolation', () => {
  it('does not notify selection or action consumers when workflow data changes', () => {
    mountProvider();

    act(() => {
      mocks.workflow.data = {
        runs: [
          {
            github_run_id: 42,
            name: 'run',
            conclusion: 'success',
            run_attempt: 1,
            html_url: 'https://example.test/runs/42',
            created_at: '2026-08-20T00:00:00Z',
            date: '2026-08-20',
          },
        ],
        changelogs: [],
        configs: [],
        runConfigs: [],
      };
      rerenderProvider?.();
    });

    expect(workflowRenders).toBe(2);
    expect(selectionRenders).toBe(1);
    expect(actionRenders).toBe(1);
  });

  it('does not notify workflow-only consumers when selection changes', () => {
    mountProvider();

    act(() => selectModel?.(Model.DeepSeek_R1));

    expect(selectionRenders).toBe(2);
    expect(workflowRenders).toBe(1);
  });

  it('keeps every action identity stable across selection updates', () => {
    mountProvider();
    const initialActions = actionSnapshots[0];

    act(() => selectModel?.(Model.DeepSeek_R1));

    expect(actionSnapshots).toHaveLength(2);
    expect(actionSnapshots[1]).toBe(initialActions);
    expect(actionSnapshots[1].setSelectedModel).toBe(initialActions.setSelectedModel);
    expect(actionSnapshots[1].setSelectedSequence).toBe(initialActions.setSelectedSequence);
    expect(actionSnapshots[1].setSelectedPrecisions).toBe(initialActions.setSelectedPrecisions);
    expect(actionSnapshots[1].setSelectedRunDate).toBe(initialActions.setSelectedRunDate);
    expect(actionSnapshots[1].setSelectedRunId).toBe(initialActions.setSelectedRunId);
  });

  it('exposes availability failure state and the matching refetch callback', () => {
    mountProvider();

    act(() => {
      mocks.availability.error = new Error('availability failed');
      mocks.availability.isError = true;
      rerenderProvider?.();
    });

    expect(availabilitySnapshot?.availabilityIsError).toBe(true);
    availabilitySnapshot?.retryAvailability();
    expect(mocks.availability.refetch).toHaveBeenCalledOnce();
  });

  it('does not offer Muse in shared selectors without its measurements', () => {
    mocks.availability.data = [
      { model: 'kimik3', precision: 'fp4', sequence: 'agentic-traces' },
    ] as unknown[];
    mountProvider();

    expect(availabilitySnapshot?.availableModels).not.toContain(Model.Muse_Spark_Open);
    expect(availabilitySnapshot?.availableModels).toContain(Model.Kimi_K3);
    expect(availabilitySnapshot?.availableModels).not.toContain(Model.DeepSeek_V4_Pro);
  });

  it('offers Muse in shared selectors once measurements exist', () => {
    mocks.availability.data = [
      { model: 'musespark', precision: 'fp4', sequence: 'agentic-traces' },
    ] as unknown[];
    mountProvider();

    expect(availabilitySnapshot?.availableModels).toContain(Model.Muse_Spark_Open);
  });

  it('offers Muse from an unofficial AgentX run without a special selector exception', () => {
    mocks.unofficialAvailable = [
      { model: Model.Muse_Spark_Open, sequence: Sequence.AgenticTraces, precision: Precision.FP4 },
    ];
    mountProvider();
    act(() => selectModel?.(Model.Muse_Spark_Open));

    expect(availabilitySnapshot?.availableModels).toContain(Model.Muse_Spark_Open);
    expect(availabilitySnapshot?.availableSequences).toEqual([Sequence.AgenticTraces]);
    expect(selectionSnapshot?.effectiveSequence).toBe(Sequence.AgenticTraces);
    expect(selectionSnapshot?.sequenceResolved).toBe(true);
  });

  it('keeps the no-data Muse sequence fallback AgentX-only', () => {
    mountProvider();
    act(() => selectModel?.(Model.Muse_Spark_Open));
    expect(availabilitySnapshot?.availableSequences).toEqual([Sequence.AgenticTraces]);
  });
});

describe('GlobalFilterProvider TCO basis share links', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The default basis is a build-time flag read at module load, so each case loads the provider.
  async function tcoBasisFor(urlValue: string | undefined) {
    vi.resetModules();
    const { GlobalFilterProvider: Provider, useGlobalFilterSelection: useSelection } =
      await import('./GlobalFilterContext');
    mocks.getUrlParam.mockImplementation((key) => (key === 'g_tco' ? urlValue : undefined));
    let basis: string | undefined;
    function Probe() {
      basis = useSelection().tcoBasis;
      return null;
    }
    container = document.createElement('div');
    root = createRoot(container);
    act(() =>
      root?.render(
        <Provider initialModel={Model.DeepSeek_V4_Pro} initialSequence={Sequence.EightK_OneK}>
          <Probe />
        </Provider>,
      ),
    );
    return basis;
  }

  it.each([
    ['external', 'external'],
    ['internal', 'internal'],
    [undefined, 'internal'],
    ['owner', 'internal'],
  ])('reads g_tco=%s as %s under the public default', async (value, expected) => {
    expect(await tcoBasisFor(value)).toBe(expected);
  });

  it.each([
    ['internal', 'internal'],
    ['external', 'external'],
    [undefined, 'external'],
    ['owner', 'external'],
  ])('reads g_tco=%s as %s when the deployment defaults to External', async (value, expected) => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_TCO_BASIS', 'external');
    expect(await tcoBasisFor(value)).toBe(expected);
  });
});
