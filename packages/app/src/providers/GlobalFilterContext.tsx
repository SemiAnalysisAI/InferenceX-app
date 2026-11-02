'use client';

import { usePathname } from 'next/navigation';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DISPLAY_MODEL_TO_DB, rowToSequence } from '@semianalysisai/inferencex-constants';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function isEnumValue<T extends Record<string, string>>(e: T, v: string): v is T[keyof T] {
  return (Object.values(e) as string[]).includes(v);
}

import { useAvailability } from '@/hooks/api/use-availability';
import { useWorkflowInfo } from '@/hooks/api/use-workflow-info';
import { useUrlState } from '@/hooks/useUrlState';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';
import {
  hasExplicitUrlParam,
  refreshUrlParams,
  type UrlStateParams,
} from '@/lib/routing/url-state';
import { modelRoutePathnameRewrite, routeModelForPathname } from '@/lib/routing/model-routes';
import { replaceClientPathname } from '@/lib/routing/client-navigation';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import type { RunInfo } from '@/components/inference/types';
import {
  getModelDefaultPrecisions,
  isSequenceHiddenForModel,
  Model,
  MODEL_OPTIONS,
  isModelVisible,
  modelRequiresObservations,
  Precision,
  PRECISION_OPTIONS,
  Sequence,
  SEQUENCE_OPTIONS,
} from '@/lib/catalog/data-mappings';
import { inferenceModelForPathname } from '@/lib/routing/inference-model-slug';
import { setInferenceNavigationModel } from '@/lib/routing/inference-navigation-state';
import { computeAutoSwitchDecision } from '@/lib/benchmarks/unofficial-run-auto-switch';
import {
  countCurvesByPrecision,
  resolveEffectivePrecisions,
} from '@/lib/benchmarks/default-precisions';
import { resolveEffectiveSequence } from '@/lib/benchmarks/default-sequence';
import type { AvailabilityRow, WorkflowInfoResponse } from '@/lib/api/api';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';

const RUNDATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const RUNID_RE = /^[A-Za-z0-9_-]{1,64}$/u;

const APP_DEFAULT_SEQUENCE = Sequence.EightK_OneK;

export interface GlobalFilterSelectionContextType {
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  tcoBasis: TcoBasis;
  effectiveSequence: Sequence;
  sequenceResolved: boolean;
  effectivePrecisions: string[];
}

export interface ModelSelectionOptions {
  /**
   * Defaults to true. Pass false for programmatic corrections so the path sync they cause is not
   * recorded as a virtual pageview.
   */
  userSelection?: boolean;
}

export interface GlobalFilterActionsContextType {
  setTcoBasis: (basis: TcoBasis) => void;
  setSelectedModel: (model: Model, options?: ModelSelectionOptions) => void;
  setSelectedSequence: (sequence: Sequence) => void;
  setSelectedPrecisions: (precisions: string[]) => void;
  setSelectedRunDate: (date: string) => void;
  setSelectedRunId: (id: string) => void;
}

export interface GlobalFilterRunContextType {
  selectedRunDate: string;
  selectedRunDateRev: number;
  selectedRunId: string;
  effectiveRunDate: string;
}

export interface GlobalFilterAvailabilityContextType {
  availableModels: Model[];
  availableSequences: Sequence[];
  availablePrecisions: string[];
  availableDates: string[];
  availabilityRows: AvailabilityRow[] | undefined;
  availabilitySettled: boolean;
  availabilityError: string | null;
  availabilityIsError: boolean;
  retryAvailability: () => void;
}

export interface GlobalFilterWorkflowContextType {
  availableRuns: Record<string, RunInfo>;
  workflowLoading: boolean;
  workflowError: string | null;
}

export const GlobalFilterSelectionContext = createContext<
  GlobalFilterSelectionContextType | undefined
>(undefined);
export const GlobalFilterActionsContext = createContext<GlobalFilterActionsContextType | undefined>(
  undefined,
);
export const GlobalFilterRunContext = createContext<GlobalFilterRunContextType | undefined>(
  undefined,
);
export const GlobalFilterAvailabilityContext = createContext<
  GlobalFilterAvailabilityContextType | undefined
>(undefined);
export const GlobalFilterWorkflowContext = createContext<
  GlobalFilterWorkflowContextType | undefined
>(undefined);

export function buildRunInfo(data: WorkflowInfoResponse): Record<string, RunInfo> {
  const changelogsByRunId = new Map<string, (typeof data.changelogs)[number][]>();
  for (const changelog of data.changelogs) {
    const runId = String(changelog.workflow_run_id);
    const indexed = changelogsByRunId.get(runId);
    if (indexed) indexed.push(changelog);
    else changelogsByRunId.set(runId, [changelog]);
  }

  const runs: Record<string, RunInfo> = {};
  for (const run of data.runs) {
    const runId = String(run.github_run_id);
    const runChangelogs = changelogsByRunId.get(runId) ?? [];
    runs[runId] = {
      runId,
      runDate: run.created_at,
      runUrl: run.html_url ? `${run.html_url}/attempts/${run.run_attempt}` : '',
      conclusion: run.conclusion,
      ...(runChangelogs.length > 0 && {
        changelog: {
          entries: runChangelogs.map((changelog) => ({
            config_keys: changelog.config_keys,
            description: changelog.description,
            pr_link: changelog.pr_link,
            head_ref: changelog.head_ref,
            append_only: changelog.append_only,
          })),
        },
      }),
    };
  }
  return runs;
}

export function resolveEffectiveRunDate(
  requestedDate: string,
  availableDates: readonly string[],
  requestedExplicitly: boolean,
): string {
  if (availableDates.length === 0) return requestedDate;
  if (requestedExplicitly && requestedDate && availableDates.includes(requestedDate)) {
    return requestedDate;
  }
  return availableDates.at(-1)!;
}

export function latestRunId(availableRuns: Readonly<Record<string, RunInfo>>): string {
  let latest = '';
  let latestDate = '';
  for (const [runId, info] of Object.entries(availableRuns)) {
    const runDate = info.runDate ?? '';
    if (!latest || runDate >= latestDate) {
      latest = runId;
      latestDate = runDate;
    }
  }
  return latest;
}

export function resolveEffectiveRunId(
  requestedRunId: string,
  availableRuns: Readonly<Record<string, RunInfo>>,
): string {
  if (Object.keys(availableRuns).length === 0) return '';
  if (requestedRunId && Object.hasOwn(availableRuns, requestedRunId)) return requestedRunId;
  return latestRunId(availableRuns);
}

export function getRequestedRunUrlParams(
  requestedRunDate: string,
  requestedRunId: string,
): Pick<UrlStateParams, 'g_rundate' | 'g_runid'> {
  return {
    g_rundate: requestedRunDate,
    g_runid: requestedRunId,
  };
}

export function GlobalFilterProvider({
  children,
  initialModel,
  initialSequence,
  initialPrecisions,
  initialRunDate,
  initialRunId,
}: {
  children: ReactNode;
  initialModel?: Model;
  initialSequence?: Sequence;
  initialPrecisions?: string[];
  initialRunDate?: string;
  initialRunId?: string;
}) {
  const { getUrlParam, setUrlParams } = useUrlState();

  const pathname = usePathname();

  const featureGateUnlocked = useFeatureGate();
  const [featureGateReady, setFeatureGateReady] = useState(false);
  useEffect(() => setFeatureGateReady(true), []);
  const [requestedModel, setSelectedModel] = useState<Model>(
    () => initialModel ?? routeModelForPathname(pathname) ?? Model.DeepSeek_V4_Pro,
  );
  // Derive the safe value during render, including the first SSR/hydration render
  // and the render immediately after relocking. Every consumer sees this value.
  const selectedModel = isModelVisible(requestedModel, featureGateUnlocked)
    ? requestedModel
    : Model.Kimi_K3;
  useIsomorphicLayoutEffect(() => {
    setInferenceNavigationModel(selectedModel);
  }, [selectedModel]);
  // The model the user last picked. A path sync counts as a pageview only when it applies that pick.
  const userSelectedModelRef = useRef<Model | null>(null);
  const selectModel = useCallback(
    (model: Model, { userSelection = true }: ModelSelectionOptions = {}) => {
      if (!isModelVisible(model, featureGateUnlocked)) return;
      if (userSelection) userSelectedModelRef.current = model;
      setSelectedModel(model);
    },
    [featureGateUnlocked],
  );

  const [selectedSequence, setSelectedSequenceRaw] = useState<Sequence>(() => {
    if (initialSequence) return initialSequence;
    const urlSeq = hasExplicitUrlParam('i_seq') ? getUrlParam('i_seq') : undefined;
    if (urlSeq && Object.values(Sequence).includes(urlSeq as Sequence)) return urlSeq as Sequence;
    return Sequence.EightK_OneK;
  });
  const [sequenceExplicit, setSequenceExplicit] = useState<boolean>(
    () => initialSequence !== undefined,
  );
  const setSelectedSequence = useCallback((sequence: Sequence) => {
    setSelectedSequenceRaw(sequence);
    setSequenceExplicit(true);
  }, []);

  const initialValidPrecisions = useMemo(
    () =>
      (initialPrecisions ?? []).filter((p) => (PRECISION_OPTIONS as readonly string[]).includes(p)),
    [initialPrecisions],
  );
  const [selectedPrecisions, setSelectedPrecisionsRaw] = useState<string[]>(() =>
    initialValidPrecisions.length > 0 ? initialValidPrecisions : [Precision.FP4],
  );
  const [precisionExplicit, setPrecisionExplicit] = useState<boolean>(
    () => initialValidPrecisions.length > 0,
  );
  const setSelectedPrecisions = useCallback((precisions: string[]) => {
    setSelectedPrecisionsRaw(precisions);
    setPrecisionExplicit(true);
  }, []);

  const [requestedRunDate, setRequestedRunDate] = useState<string>(() => initialRunDate ?? '');
  const [selectedRunDateRev, setSelectedRunDateRev] = useState(0);
  const requestedRunDateExplicitRef = useRef(
    initialRunDate !== undefined || hasExplicitUrlParam('g_rundate'),
  );

  const [requestedRunId, setRequestedRunId] = useState<string>(() => initialRunId ?? '');
  const [tcoBasis, setTcoBasis] = useState<TcoBasis>(DEFAULT_TCO_BASIS);

  useIsomorphicLayoutEffect(() => {
    refreshUrlParams();
    const applyIfEnum = <T extends Record<string, string>>(
      key: 'g_model' | 'i_seq',
      enumType: T,
      apply: (v: T[keyof T]) => void,
    ) => {
      const value = getUrlParam(key);
      if (value !== undefined && isEnumValue(enumType, value)) apply(value);
    };
    const applyIfMatches = (
      key: 'g_rundate' | 'g_runid',
      pattern: RegExp,
      apply: (v: string) => void,
    ) => {
      const value = getUrlParam(key);
      if (value !== undefined && pattern.test(value)) apply(value);
    };

    const routeModel = routeModelForPathname(pathname);
    if (routeModel) setSelectedModel(routeModel);
    const pathModel = inferenceModelForPathname(pathname);
    if (pathModel !== null) setSelectedModel(pathModel);
    if (pathModel === null || hasExplicitUrlParam('g_model')) {
      applyIfEnum('g_model', Model, setSelectedModel);
    }
    if (hasExplicitUrlParam('i_seq')) {
      applyIfEnum('i_seq', Sequence, setSelectedSequence);
    }
    const urlPrec = hasExplicitUrlParam('i_prec') ? getUrlParam('i_prec') : undefined;
    if (urlPrec) {
      const precs = urlPrec
        .split(',')
        .filter((p) => (PRECISION_OPTIONS as readonly string[]).includes(p));
      if (precs.length > 0) {
        setSelectedPrecisionsRaw(precs);
        setPrecisionExplicit(true);
      }
    } else if (pathModel !== null) {
      setSelectedPrecisionsRaw(
        initialValidPrecisions.length > 0 ? initialValidPrecisions : [Precision.FP4],
      );
      setPrecisionExplicit(initialValidPrecisions.length > 0);
    }
    if (hasExplicitUrlParam('g_rundate')) {
      applyIfMatches('g_rundate', RUNDATE_RE, (date) => {
        requestedRunDateExplicitRef.current = true;
        setRequestedRunDate(date);
      });
    }
    if (hasExplicitUrlParam('g_runid')) {
      applyIfMatches('g_runid', RUNID_RE, setRequestedRunId);
    }
    setTcoBasis(getUrlParam('g_tco') === 'external' ? 'external' : DEFAULT_TCO_BASIS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const {
    data: availabilityRows,
    error: availabilityQueryError,
    isError: availabilityIsError,
    isPending: availabilityPending,
    refetch: refetchAvailability,
  } = useAvailability();
  const availabilitySettled = !availabilityPending;
  const availabilityError = availabilityQueryError ? availabilityQueryError.message : null;
  const retryAvailability = useCallback(() => {
    void refetchAvailability();
  }, [refetchAvailability]);
  const { availableModelsAndSequences: unofficialAvailable } = useUnofficialRun();

  const dbModelKeys = useMemo<string[]>(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );

  const modelRows = useMemo(
    () => availabilityRows?.filter((r) => dbModelKeys.includes(r.model)) ?? [],
    [availabilityRows, dbModelKeys],
  );

  const availableModels = useMemo(() => {
    const unofficialModels = new Set(unofficialAvailable.map((a) => a.model));
    return MODEL_OPTIONS.filter((m) => {
      if (!isModelVisible(m, featureGateUnlocked)) return false;
      if (unofficialModels.has(m)) return true;
      if (!availabilityRows) return !modelRequiresObservations(m);
      const keys = DISPLAY_MODEL_TO_DB[m] ?? [m];
      return availabilityRows.some((r) => keys.includes(r.model));
    });
  }, [availabilityRows, unofficialAvailable, featureGateUnlocked]);

  const lastAutoSwitchKeyRef = useRef<string>('');
  useEffect(() => {
    const decision = computeAutoSwitchDecision(
      unofficialAvailable.filter((entry) => isModelVisible(entry.model, featureGateUnlocked)),
      hasExplicitUrlParam('g_model') ? getUrlParam('g_model') : undefined,
      selectedModel,
      lastAutoSwitchKeyRef.current,
    );
    lastAutoSwitchKeyRef.current = decision.nextKey;
    if (decision.modelToSet !== null) {
      setSelectedModel(decision.modelToSet);
    }
  }, [unofficialAvailable, selectedModel, featureGateUnlocked]);

  const availableSequences = useMemo(() => {
    const unofficialSeqs = unofficialAvailable
      .filter((a) => a.model === selectedModel)
      .map((a) => a.sequence as Sequence);
    const dbSeqs = modelRows.map((r) => rowToSequence(r)).filter((s): s is Sequence => s !== null);
    const merged = [...new Set([...dbSeqs, ...unofficialSeqs])].filter(
      (s) => !isSequenceHiddenForModel(selectedModel, s),
    );
    return merged.length > 0
      ? merged
      : SEQUENCE_OPTIONS.filter((sequence) => !isSequenceHiddenForModel(selectedModel, sequence));
  }, [modelRows, unofficialAvailable, selectedModel]);

  const availabilityLoaded = useMemo(
    () =>
      availabilityRows !== undefined || unofficialAvailable.some((a) => a.model === selectedModel),
    [availabilityRows, unofficialAvailable, selectedModel],
  );

  const resolvedSequence = useMemo(
    () =>
      resolveEffectiveSequence({
        selectedSequence,
        availableSequences,
        availabilityLoaded,
        sequenceExplicit,
      }),
    [selectedSequence, availableSequences, availabilityLoaded, sequenceExplicit],
  );
  const sequenceResolved = resolvedSequence !== null;
  const effectiveSequence = resolvedSequence ?? APP_DEFAULT_SEQUENCE;

  const availablePrecisions = useMemo(() => {
    const unofficialPrecs = unofficialAvailable
      .filter((a) => a.model === selectedModel && a.sequence === effectiveSequence)
      .flatMap((a) => a.precisions);
    if (!availabilityRows) {
      return unofficialPrecs.length > 0 ? [...new Set(unofficialPrecs)].toSorted() : ['fp4'];
    }
    const rows = modelRows.filter((r) => rowToSequence(r) === effectiveSequence);
    const dbPrecs = rows.map((r) => r.precision);
    const merged = [...new Set([...dbPrecs, ...unofficialPrecs])].toSorted();
    return merged.length > 0 ? merged : ['fp4'];
  }, [availabilityRows, modelRows, effectiveSequence, unofficialAvailable, selectedModel]);

  const precisionCurveCounts = useMemo(
    () => countCurvesByPrecision(modelRows.filter((r) => rowToSequence(r) === effectiveSequence)),
    [modelRows, effectiveSequence],
  );

  const unofficialPrecisionsForSelection = useMemo(
    () =>
      unofficialAvailable
        .filter((a) => a.model === selectedModel && a.sequence === effectiveSequence)
        .flatMap((a) => a.precisions),
    [unofficialAvailable, selectedModel, effectiveSequence],
  );

  const effectivePrecisions = useMemo(
    () =>
      resolveEffectivePrecisions({
        selectedPrecisions,
        availablePrecisions,
        curveCounts: precisionCurveCounts,
        unofficialPrecisions: unofficialPrecisionsForSelection,
        explicit: precisionExplicit,
        modelDefaultPrecisions: getModelDefaultPrecisions(selectedModel, effectiveSequence),
      }),
    [
      selectedPrecisions,
      availablePrecisions,
      precisionCurveCounts,
      unofficialPrecisionsForSelection,
      precisionExplicit,
      selectedModel,
      effectiveSequence,
    ],
  );

  const availableDates = useMemo(() => {
    if (!availabilityRows) return [];
    const seqRows = modelRows.filter((r) => rowToSequence(r) === effectiveSequence);
    const rows = seqRows.filter((r) => effectivePrecisions.includes(r.precision));
    if (rows.length === 0) {
      return [...new Set(seqRows.map((r) => r.date))].toSorted();
    }
    return [...new Set(rows.map((r) => r.date))].toSorted();
  }, [availabilityRows, modelRows, effectiveSequence, effectivePrecisions]);

  const setSelectedRunDateManual = useCallback((date: string) => {
    requestedRunDateExplicitRef.current = true;
    setRequestedRunDate(date);
    setSelectedRunDateRev((revision) => revision + 1);
  }, []);

  const effectiveRunDate = resolveEffectiveRunDate(
    requestedRunDate,
    availableDates,
    requestedRunDateExplicitRef.current,
  );

  const {
    data: workflowData,
    isLoading: workflowLoading,
    error: workflowQueryError,
  } = useWorkflowInfo(effectiveRunDate);

  const workflowError = workflowQueryError ? workflowQueryError.message : null;

  const availableRuns = useMemo(
    () => (workflowData ? buildRunInfo(workflowData) : {}),
    [workflowData],
  );

  const effectiveRunId = useMemo(
    () => resolveEffectiveRunId(requestedRunId, availableRuns),
    [requestedRunId, availableRuns],
  );

  const setSelectedRunId = useCallback((runId: string) => {
    setRequestedRunId(runId);
  }, []);

  const isMountedRef = useRef(false);
  const syncedModelRef = useRef(selectedModel);
  useEffect(() => {
    // Do not canonicalize an explicitly unlocked deep link before localStorage
    // has been read by the existing feature-gate hook.
    if (!featureGateReady) return;
    const modelChanged = syncedModelRef.current !== selectedModel;
    syncedModelRef.current = selectedModel;
    const userSwitchedModel = modelChanged && userSelectedModelRef.current === selectedModel;
    if (modelChanged) userSelectedModelRef.current = null;
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    setUrlParams({
      g_model: selectedModel,
      ...getRequestedRunUrlParams(requestedRunDate, requestedRunId),
      g_tco: tcoBasis,
      i_seq: sequenceResolved ? effectiveSequence : undefined,
      i_prec: precisionExplicit ? effectivePrecisions.join(',') : undefined,
    });
    // Canonicalizing a bare route and settling non-model filters also rewrite the path, but only a
    // user's model switch is a new page.
    const pathnameRewrite = modelRoutePathnameRewrite(window.location.pathname, selectedModel);
    if (pathnameRewrite) {
      replaceClientPathname(pathnameRewrite, [], { pageview: userSwitchedModel });
    }
  }, [
    featureGateReady,
    selectedModel,
    requestedRunDate,
    requestedRunId,
    tcoBasis,
    effectiveSequence,
    sequenceResolved,
    effectivePrecisions,
    precisionExplicit,
    setUrlParams,
  ]);

  const selectionValue = useMemo<GlobalFilterSelectionContextType>(
    () => ({
      selectedModel,
      selectedSequence,
      selectedPrecisions,
      tcoBasis,
      effectiveSequence,
      sequenceResolved,
      effectivePrecisions,
    }),
    [
      selectedModel,
      selectedSequence,
      selectedPrecisions,
      tcoBasis,
      effectiveSequence,
      sequenceResolved,
      effectivePrecisions,
    ],
  );

  const actionsValue = useMemo<GlobalFilterActionsContextType>(
    () => ({
      setTcoBasis,
      setSelectedModel: selectModel,
      setSelectedSequence,
      setSelectedPrecisions,
      setSelectedRunDate: setSelectedRunDateManual,
      setSelectedRunId,
    }),
    [
      selectModel,
      setSelectedSequence,
      setSelectedPrecisions,
      setSelectedRunDateManual,
      setSelectedRunId,
    ],
  );

  const runValue = useMemo<GlobalFilterRunContextType>(
    () => ({
      selectedRunDate: effectiveRunDate,
      selectedRunDateRev,
      selectedRunId: effectiveRunId,
      effectiveRunDate,
    }),
    [effectiveRunDate, selectedRunDateRev, effectiveRunId],
  );

  const availabilityValue = useMemo<GlobalFilterAvailabilityContextType>(
    () => ({
      availableModels,
      availableSequences,
      availablePrecisions,
      availableDates,
      availabilityRows,
      availabilitySettled,
      availabilityError,
      availabilityIsError,
      retryAvailability,
    }),
    [
      availableModels,
      availableSequences,
      availablePrecisions,
      availableDates,
      availabilityRows,
      availabilitySettled,
      availabilityError,
      availabilityIsError,
      retryAvailability,
    ],
  );

  const workflowValue = useMemo<GlobalFilterWorkflowContextType>(
    () => ({ availableRuns, workflowLoading, workflowError }),
    [availableRuns, workflowLoading, workflowError],
  );

  return (
    <GlobalFilterActionsContext.Provider value={actionsValue}>
      <GlobalFilterSelectionContext.Provider value={selectionValue}>
        <GlobalFilterRunContext.Provider value={runValue}>
          <GlobalFilterAvailabilityContext.Provider value={availabilityValue}>
            <GlobalFilterWorkflowContext.Provider value={workflowValue}>
              {children}
            </GlobalFilterWorkflowContext.Provider>
          </GlobalFilterAvailabilityContext.Provider>
        </GlobalFilterRunContext.Provider>
      </GlobalFilterSelectionContext.Provider>
    </GlobalFilterActionsContext.Provider>
  );
}

export function useGlobalFilterSelection() {
  const context = useContext(GlobalFilterSelectionContext);
  if (context === undefined) {
    throw new Error('useGlobalFilterSelection must be used within a GlobalFilterProvider');
  }
  return context;
}

export function useGlobalFilterActions() {
  const context = useContext(GlobalFilterActionsContext);
  if (context === undefined) {
    throw new Error('useGlobalFilterActions must be used within a GlobalFilterProvider');
  }
  return context;
}

export function useGlobalFilterRun() {
  const context = useContext(GlobalFilterRunContext);
  if (context === undefined) {
    throw new Error('useGlobalFilterRun must be used within a GlobalFilterProvider');
  }
  return context;
}

export function useGlobalFilterAvailability() {
  const context = useContext(GlobalFilterAvailabilityContext);
  if (context === undefined) {
    throw new Error('useGlobalFilterAvailability must be used within a GlobalFilterProvider');
  }
  return context;
}

export function useGlobalFilterWorkflow() {
  const context = useContext(GlobalFilterWorkflowContext);
  if (context === undefined) {
    throw new Error('useGlobalFilterWorkflow must be used within a GlobalFilterProvider');
  }
  return context;
}
