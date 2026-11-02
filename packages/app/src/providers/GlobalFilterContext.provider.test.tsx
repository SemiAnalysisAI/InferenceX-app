// @vitest-environment jsdom
import { act, memo, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Model, Precision, Sequence } from '@/lib/catalog/data-mappings';

const mocks = vi.hoisted(() => ({
  featureGateUnlocked: false,
  featureGateHydratesUnlocked: false,
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
  setNavigationModel: vi.fn(),
  workflowDates: vi.fn(),
}));

vi.mock('@/lib/runtime/use-feature-gate', async () => {
  const react = await import('react');
  return {
    useFeatureGate: () => {
      const [hydrated, setHydrated] = react.useState(false);
      const hydrateUnlocked = mocks.featureGateHydratesUnlocked;
      react.useEffect(() => {
        if (hydrateUnlocked) setHydrated(true);
      }, [hydrateUnlocked]);
      return mocks.featureGateUnlocked || (hydrateUnlocked && hydrated);
    },
  };
});

vi.mock('@/hooks/api/use-availability', () => ({
  useAvailability: () => mocks.availability,
}));
vi.mock('@/hooks/api/use-workflow-info', () => ({
  useWorkflowInfo: (date: string) => {
    mocks.workflowDates(date);
    return mocks.workflow;
  },
}));
vi.mock('@/lib/routing/inference-navigation-state', () => ({
  setInferenceNavigationModel: mocks.setNavigationModel,
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
const consumerModels: Model[] = [];
const consumerRequestModels: Model[] = [];
const actionSnapshots: GlobalFilterActionsContextType[] = [];
let availabilitySnapshot: GlobalFilterAvailabilityContextType | undefined;
let selectionSnapshot: GlobalFilterSelectionContextType | undefined;

const SelectionProbe = memo(() => {
  selectionSnapshot = useGlobalFilterSelection();
  const model = selectionSnapshot.selectedModel;
  consumerModels.push(model);
  useEffect(() => {
    consumerRequestModels.push(model);
  }, [model]);
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

function ProviderHarness({
  initialModel = Model.DeepSeek_V4_Pro,
  initialRunDate,
}: {
  initialModel?: Model;
  initialRunDate?: string;
}) {
  const [, setRevision] = useState(0);
  rerenderProvider = () => setRevision((revision) => revision + 1);
  return (
    <GlobalFilterProvider
      initialModel={initialModel}
      initialRunDate={initialRunDate}
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

function mountProvider(initialModel?: Model, initialRunDate?: string): void {
  container = document.createElement('div');
  root = createRoot(container);
  act(() =>
    root?.render(<ProviderHarness initialModel={initialModel} initialRunDate={initialRunDate} />),
  );
}

beforeEach(() => {
  mocks.featureGateUnlocked = false;
  mocks.featureGateHydratesUnlocked = false;
  consumerModels.length = 0;
  consumerRequestModels.length = 0;
  mocks.setNavigationModel.mockClear();
  mocks.workflowDates.mockClear();
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
  it.each([false, true])(
    'never mounts fallback consumers while Flash hydrates (saved=%s)',
    (saved) => {
      mocks.featureGateHydratesUnlocked = true;
      if (saved) {
        // The proxy canonicalizes the saved query before SSR; both initialModel
        // and the still-preserved URL selection therefore name Flash.
        window.history.replaceState({}, '', '/inference/glm-5-3-flash?g_model=GLM-5.3-Flash');
        mocks.getUrlParam.mockImplementation((key) =>
          key === 'g_model' ? Model.GLM_5_3_Flash : undefined,
        );
      }
      mountProvider(Model.GLM_5_3_Flash, '2026-10-21');
      expect(consumerModels.length).toBeGreaterThan(0);
      expect({
        renders: new Set(consumerModels),
        requestEffects: new Set(consumerRequestModels),
        navigationModels: new Set(mocks.setNavigationModel.mock.calls.map(([model]) => model)),
        initialWorkflowDate: mocks.workflowDates.mock.calls[0]?.[0],
      }).toEqual({
        renders: new Set([Model.GLM_5_3_Flash]),
        requestEffects: new Set([Model.GLM_5_3_Flash]),
        navigationModels: new Set([Model.GLM_5_3_Flash]),
        initialWorkflowDate: '',
      });
      expect(mocks.workflowDates).toHaveBeenLastCalledWith('2026-10-21');
    },
  );

  it('does not delay public model consumers or their workflow query', () => {
    mountProvider(Model.Kimi_K3, '2026-10-21');
    expect(consumerModels[0]).toBe(Model.Kimi_K3);
    expect(mocks.workflowDates).toHaveBeenNthCalledWith(1, '2026-10-21');
  });

  it('preserves public SSR content while withholding gated model consumers', () => {
    const content = <span>public dashboard</span>;
    expect(
      renderToString(
        <GlobalFilterProvider initialModel={Model.Kimi_K3}>{content}</GlobalFilterProvider>,
      ),
    ).toContain('public dashboard');
    expect(
      renderToString(
        <GlobalFilterProvider initialModel={Model.GLM_5_3_Flash}>{content}</GlobalFilterProvider>,
      ),
    ).toBe('');
  });

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
    expect(availabilitySnapshot?.availableModels).not.toContain(Model.GLM_5_3_Flash);
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

  it('keeps Flash out of shared selectors while availability is loading or failed', () => {
    mocks.featureGateUnlocked = true;
    mocks.availability.data = undefined;
    mountProvider();
    expect(availabilitySnapshot?.availableModels).not.toContain(Model.GLM_5_3_Flash);
    act(() => {
      mocks.availability.isError = true;
      rerenderProvider?.();
    });
    expect(availabilitySnapshot?.availableModels).not.toContain(Model.GLM_5_3_Flash);
    act(() => selectModel?.(Model.GLM_5_3_Flash));
    expect(availabilitySnapshot?.availableSequences).toEqual([Sequence.AgenticTraces]);
  });

  it('offers Flash once its own database observations exist', () => {
    mocks.featureGateUnlocked = true;
    mocks.availability.data = [
      {
        model: 'glm5.3flash',
        precision: 'fp8',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
      },
    ];
    mountProvider();
    expect(availabilitySnapshot?.availableModels).toContain(Model.GLM_5_3_Flash);
    expect(availabilitySnapshot?.availableModels).not.toContain(Model.GLM_5_2);
  });

  it('offers an unofficial Flash run while published availability is still loading', () => {
    mocks.featureGateUnlocked = true;
    mocks.availability.data = undefined;
    mocks.unofficialAvailable = [
      { model: Model.GLM_5_3_Flash, sequence: Sequence.AgenticTraces, precision: Precision.FP4 },
    ];
    mountProvider();
    act(() => selectModel?.(Model.GLM_5_3_Flash));
    expect(availabilitySnapshot?.availableModels).toContain(Model.GLM_5_3_Flash);
    expect(availabilitySnapshot?.availableSequences).toEqual([Sequence.AgenticTraces]);
    expect(selectionSnapshot?.effectiveSequence).toBe(Sequence.AgenticTraces);
  });

  it('does not unlock Flash from observations, an unofficial run, or an explicit selection', () => {
    mocks.availability.data = [
      { model: 'glm5.3flash', precision: 'fp8', sequence: 'agentic-traces' },
    ];
    mocks.unofficialAvailable = [
      { model: Model.GLM_5_3_Flash, sequence: Sequence.AgenticTraces, precision: Precision.FP8 },
    ];
    mountProvider();
    act(() => selectModel?.(Model.GLM_5_3_Flash));
    expect(availabilitySnapshot?.availableModels).not.toContain(Model.GLM_5_3_Flash);
    expect(selectionSnapshot?.selectedModel).not.toBe(Model.GLM_5_3_Flash);
  });

  it('removes the active Flash selection and availability immediately on relock', () => {
    mocks.featureGateUnlocked = true;
    mocks.unofficialAvailable = [
      { model: Model.GLM_5_3_Flash, sequence: Sequence.AgenticTraces, precision: Precision.FP8 },
    ];
    mountProvider();
    act(() => selectModel?.(Model.GLM_5_3_Flash));
    expect(selectionSnapshot?.selectedModel).toBe(Model.GLM_5_3_Flash);
    act(() => {
      mocks.featureGateUnlocked = false;
      rerenderProvider?.();
    });
    expect(selectionSnapshot?.selectedModel).toBe(Model.Kimi_K3);
    expect(availabilitySnapshot?.availableModels).not.toContain(Model.GLM_5_3_Flash);
  });

  it('auto-selects a previously locked unofficial Flash run when the gate is enabled', () => {
    mocks.unofficialAvailable = [
      { model: Model.GLM_5_3_Flash, sequence: Sequence.AgenticTraces, precision: Precision.FP8 },
    ];
    mountProvider();
    expect(selectionSnapshot?.selectedModel).not.toBe(Model.GLM_5_3_Flash);
    act(() => {
      mocks.featureGateUnlocked = true;
      rerenderProvider?.();
    });
    expect(selectionSnapshot?.selectedModel).toBe(Model.GLM_5_3_Flash);
    expect(selectionSnapshot?.effectiveSequence).toBe(Sequence.AgenticTraces);
  });
});
