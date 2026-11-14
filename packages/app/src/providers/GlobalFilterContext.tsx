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

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

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
  type UrlStateKey,
  type UrlStateParams,
} from '@/lib/routing/url-state';
import { modelRoutePathnameRewrite, routeModelForPathname } from '@/lib/routing/model-routes';
import { replaceClientPathname } from '@/lib/routing/client-navigation';
import { type AvailableModelSequence, useUnofficialRun } from '@/providers/unofficial-run-provider';
import type { RunInfo } from '@/components/inference/types';
import {
  getModelDefaultPrecisions,
  isSequenceHiddenForModel,
  Model,
  MODEL_OPTIONS,
  isModelVisible,
  isRegisteredModel,
  modelRequiresFeatureGate,
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
import type { WorkflowInfoResponse } from '@/lib/api/api';
import {
  type AvailabilityIndex,
  type AvailabilityLine,
  datesOfLines,
  linesForModels,
} from '@/lib/benchmarks/availability-index';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';
import { DEFAULT_CHIP_BASIS, type ChipBasis } from '@/lib/benchmarks/chip-basis';

const RUNDATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const RUNID_RE = /^[A-Za-z0-9_-]{1,64}$/u;

const APP_DEFAULT_SEQUENCE = Sequence.EightK_OneK;

export interface GlobalFilterSelectionContextType {
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  tcoBasis: TcoBasis;
  /** Which chips divide disaggregated input/output throughput. */
  chipBasis: ChipBasis;
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
  setChipBasis: (basis: ChipBasis) => void;
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
  availability: AvailabilityIndex | undefined;
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

/** Seed precisions the catalog knows, in their given order. */
export function validPrecisions(precisions: readonly string[] | undefined): string[] {
  return (precisions ?? []).filter((p) => (PRECISION_OPTIONS as readonly string[]).includes(p));
}

/** The model the provider requests on mount, before the route and URL params apply. */
export function initialRequestedModel(
  initialModel: Model | undefined,
  pathname: string | null | undefined,
): Model {
  return initialModel ?? routeModelForPathname(pathname) ?? Model.DeepSeek_V4_Pro;
}

/** The sequence the provider selects on mount. `urlSequence` is an explicit `i_seq` value. */
export function initialSelectedSequence(
  initialSequence: Sequence | undefined,
  urlSequence: string | undefined,
): Sequence {
  if (initialSequence) return initialSequence;
  if (urlSequence && Object.values(Sequence).includes(urlSequence as Sequence)) {
    return urlSequence as Sequence;
  }
  return Sequence.EightK_OneK;
}

/** A gated model renders as a public one until the gate unlocks. */
export function visibleSelectedModel(requested: Model, featureGateUnlocked: boolean): Model {
  return isModelVisible(requested, featureGateUnlocked) ? requested : Model.Kimi_K3_1_Pro;
}

export interface FilterNavigationOverrides {
  model?: Model;
  /** An explicit `i_seq`, which also marks the sequence explicit. */
  sequence?: Sequence;
  precisions?: { selected: string[]; explicit: boolean };
  /** An explicit `g_rundate`, which also marks the run date explicit. */
  runDate?: string;
  runId?: string;
  tcoBasis: TcoBasis;
  chipBasis?: ChipBasis;
}

/**
 * Selections the provider applies when `pathname` mounts or changes. The route's model wins over
 * the remembered `g_model` unless the URL names one.
 */
export function resolveFilterNavigationOverrides({
  pathname,
  getUrlParam,
  hasExplicitUrlParam: isExplicit,
  initialPrecisions,
  initialChipBasis,
}: {
  pathname: string | null | undefined;
  getUrlParam: (key: UrlStateKey) => string | undefined;
  hasExplicitUrlParam: (key: UrlStateKey) => boolean;
  /** The provider's `initialPrecisions`, already passed through `validPrecisions`. */
  initialPrecisions: string[];
  initialChipBasis: ChipBasis | undefined;
}): FilterNavigationOverrides {
  const overrides: FilterNavigationOverrides = {
    tcoBasis: getUrlParam('g_tco') === 'external' ? 'external' : DEFAULT_TCO_BASIS,
  };

  const routeModel = routeModelForPathname(pathname);
  if (routeModel) overrides.model = routeModel;
  const pathModel = inferenceModelForPathname(pathname);
  if (pathModel !== null) overrides.model = pathModel;
  if (pathModel === null || isExplicit('g_model')) {
    const urlModel = getUrlParam('g_model');
    if (urlModel !== undefined && isEnumValue(Model, urlModel)) overrides.model = urlModel;
  }

  if (isExplicit('i_seq')) {
    const urlSequence = getUrlParam('i_seq');
    if (urlSequence !== undefined && isEnumValue(Sequence, urlSequence)) {
      overrides.sequence = urlSequence;
    }
  }

  const urlPrec = isExplicit('i_prec') ? getUrlParam('i_prec') : undefined;
  if (urlPrec) {
    const precs = validPrecisions(urlPrec.split(','));
    if (precs.length > 0) overrides.precisions = { selected: precs, explicit: true };
  } else if (pathModel !== null) {
    overrides.precisions = {
      selected: initialPrecisions.length > 0 ? initialPrecisions : [Precision.FP4],
      explicit: initialPrecisions.length > 0,
    };
  }

  if (isExplicit('g_rundate')) {
    const urlRunDate = getUrlParam('g_rundate');
    if (urlRunDate !== undefined && RUNDATE_RE.test(urlRunDate)) overrides.runDate = urlRunDate;
  }
  if (isExplicit('g_runid')) {
    const urlRunId = getUrlParam('g_runid');
    if (urlRunId !== undefined && RUNID_RE.test(urlRunId)) overrides.runId = urlRunId;
  }
  // Profit-estimator routes carry no g_chips segment. Keep the session's basis there instead of
  // resetting it, and apply it again on return. Embeds resolve their own basis server-side
  // (`initialChipBasis`), and the URL must not override it on the client.
  if (initialChipBasis === undefined && isExplicit('g_chips')) {
    overrides.chipBasis = getUrlParam('g_chips') === 'total' ? 'total' : DEFAULT_CHIP_BASIS;
  }
  return overrides;
}

export interface FilterRequest {
  /** The rendered model, after the feature gate. */
  model: Model;
  selectedSequence: Sequence;
  sequenceExplicit: boolean;
  selectedPrecisions: string[];
  precisionExplicit: boolean;
  requestedRunDate: string;
  requestedRunDateExplicit: boolean;
  requestedRunId: string;
}

/**
 * The selection a freshly mounted provider settles on once its mount-time navigation pass has
 * run. It combines the `useState` initializers with `resolveFilterNavigationOverrides`.
 */
export function resolveMountedFilterRequest({
  pathname,
  initialModel,
  initialSequence,
  initialPrecisions,
  initialRunDate,
  initialRunId,
  getUrlParam,
  hasExplicitUrlParam: isExplicit,
  featureGateUnlocked,
}: {
  pathname: string;
  initialModel?: Model;
  initialSequence?: Sequence;
  initialPrecisions?: string[];
  initialRunDate?: string;
  initialRunId?: string;
  getUrlParam: (key: UrlStateKey) => string | undefined;
  hasExplicitUrlParam: (key: UrlStateKey) => boolean;
  featureGateUnlocked: boolean;
}): FilterRequest {
  const seedPrecisions = validPrecisions(initialPrecisions);
  const overrides = resolveFilterNavigationOverrides({
    pathname,
    getUrlParam,
    hasExplicitUrlParam: isExplicit,
    initialPrecisions: seedPrecisions,
    initialChipBasis: undefined,
  });
  const requestedModel = overrides.model ?? initialRequestedModel(initialModel, pathname);
  return {
    model: visibleSelectedModel(requestedModel, featureGateUnlocked),
    selectedSequence:
      overrides.sequence ??
      initialSelectedSequence(
        initialSequence,
        isExplicit('i_seq') ? getUrlParam('i_seq') : undefined,
      ),
    sequenceExplicit: overrides.sequence !== undefined || initialSequence !== undefined,
    selectedPrecisions:
      overrides.precisions?.selected ??
      (seedPrecisions.length > 0 ? seedPrecisions : [Precision.FP4]),
    precisionExplicit: overrides.precisions?.explicit ?? seedPrecisions.length > 0,
    requestedRunDate: overrides.runDate ?? initialRunDate ?? '',
    requestedRunDateExplicit:
      overrides.runDate !== undefined || initialRunDate !== undefined || isExplicit('g_rundate'),
    requestedRunId: overrides.runId ?? initialRunId ?? '',
  };
}

export function modelDbKeys(model: string): string[] {
  return DISPLAY_MODEL_TO_DB[model] ?? [model];
}

export function resolveAvailableModels(
  availability: AvailabilityIndex | undefined,
  unofficialAvailable: readonly AvailableModelSequence[],
  featureGateUnlocked: boolean,
): Model[] {
  const unofficialModels = new Set(unofficialAvailable.map((a) => a.model));
  const registered = MODEL_OPTIONS.filter((m) => {
    if (!isModelVisible(m, featureGateUnlocked)) return false;
    if (unofficialModels.has(m)) return true;
    if (!availability) return !modelRequiresObservations(m);
    return modelDbKeys(m).some((key) => availability.linesByModel.has(key));
  });
  const unregistered = [...unofficialModels].filter((m) => !isRegisteredModel(m)).toSorted();
  return [...registered, ...unregistered];
}

export function resolveAvailableSequences(
  modelLines: readonly AvailabilityLine[],
  unofficialAvailable: readonly AvailableModelSequence[],
  selectedModel: Model,
): Sequence[] {
  const unofficialSeqs = unofficialAvailable
    .filter((a) => a.model === selectedModel)
    .map((a) => a.sequence as Sequence);
  const dbSeqs = modelLines.map((line) => line.sequence).filter((s): s is Sequence => s !== null);
  const merged = [...new Set([...dbSeqs, ...unofficialSeqs])].filter(
    (s) => !isSequenceHiddenForModel(selectedModel, s),
  );
  return merged.length > 0
    ? merged
    : SEQUENCE_OPTIONS.filter((sequence) => !isSequenceHiddenForModel(selectedModel, sequence));
}

export function isAvailabilityLoaded(
  availability: AvailabilityIndex | undefined,
  unofficialAvailable: readonly AvailableModelSequence[],
  selectedModel: Model,
): boolean {
  return availability !== undefined || unofficialAvailable.some((a) => a.model === selectedModel);
}

export function unofficialPrecisionsFor(
  unofficialAvailable: readonly AvailableModelSequence[],
  selectedModel: Model,
  sequence: Sequence,
): string[] {
  return unofficialAvailable
    .filter((a) => a.model === selectedModel && a.sequence === sequence)
    .flatMap((a) => a.precisions);
}

export function resolveAvailablePrecisions(
  availability: AvailabilityIndex | undefined,
  sequenceLines: readonly AvailabilityLine[],
  unofficialPrecisions: readonly string[],
): string[] {
  if (!availability) {
    return unofficialPrecisions.length > 0
      ? [...new Set(unofficialPrecisions)].toSorted()
      : ['fp4'];
  }
  const dbPrecs = sequenceLines.map((line) => line.precision);
  const merged = [...new Set([...dbPrecs, ...unofficialPrecisions])].toSorted();
  return merged.length > 0 ? merged : ['fp4'];
}

export function resolveSelectionPrecisions({
  selectedPrecisions,
  availablePrecisions,
  curveCounts,
  unofficialPrecisions,
  explicit,
  selectedModel,
  sequence,
}: {
  selectedPrecisions: string[];
  availablePrecisions: string[];
  curveCounts: Record<string, number>;
  unofficialPrecisions: string[];
  explicit: boolean;
  selectedModel: Model;
  sequence: Sequence;
}): string[] {
  return resolveEffectivePrecisions({
    selectedPrecisions,
    availablePrecisions,
    curveCounts,
    unofficialPrecisions,
    explicit,
    modelDefaultPrecisions: getModelDefaultPrecisions(selectedModel, sequence),
  });
}

export function resolveAvailableDates(
  availability: AvailabilityIndex | undefined,
  sequenceLines: readonly AvailabilityLine[],
  effectivePrecisions: readonly string[],
): string[] {
  if (!availability) return [];
  const lines = sequenceLines.filter((line) => effectivePrecisions.includes(line.precision));
  return datesOfLines(availability, lines.length > 0 ? lines : sequenceLines);
}

export interface FilterSelection {
  effectiveSequence: Sequence;
  sequenceResolved: boolean;
  effectivePrecisions: string[];
  availableDates: string[];
  effectiveRunDate: string;
}

/**
 * The selection the provider derives from `request` and `availability`, step for step as its
 * memo chain does. Pass `undefined` availability for the state before it loads.
 */
export function resolveFilterSelection(
  availability: AvailabilityIndex | undefined,
  request: FilterRequest,
  unofficialAvailable: readonly AvailableModelSequence[] = [],
): FilterSelection {
  const { model } = request;
  const modelLines = availability ? linesForModels(availability, modelDbKeys(model)) : [];
  const resolvedSequence = resolveEffectiveSequence({
    selectedSequence: request.selectedSequence,
    availableSequences: resolveAvailableSequences(modelLines, unofficialAvailable, model),
    availabilityLoaded: isAvailabilityLoaded(availability, unofficialAvailable, model),
    sequenceExplicit: request.sequenceExplicit,
  });
  const effectiveSequence = resolvedSequence ?? APP_DEFAULT_SEQUENCE;
  const sequenceLines = modelLines.filter((line) => line.sequence === effectiveSequence);
  const unofficialPrecisions = unofficialPrecisionsFor(
    unofficialAvailable,
    model,
    effectiveSequence,
  );
  const effectivePrecisions = resolveSelectionPrecisions({
    selectedPrecisions: request.selectedPrecisions,
    availablePrecisions: resolveAvailablePrecisions(
      availability,
      sequenceLines,
      unofficialPrecisions,
    ),
    curveCounts: countCurvesByPrecision(sequenceLines),
    unofficialPrecisions,
    explicit: request.precisionExplicit,
    selectedModel: model,
    sequence: effectiveSequence,
  });
  const availableDates = resolveAvailableDates(availability, sequenceLines, effectivePrecisions);
  return {
    effectiveSequence,
    sequenceResolved: resolvedSequence !== null,
    effectivePrecisions,
    availableDates,
    effectiveRunDate: resolveEffectiveRunDate(
      request.requestedRunDate,
      availableDates,
      request.requestedRunDateExplicit,
    ),
  };
}

export function GlobalFilterProvider({
  children,
  initialModel,
  initialSequence,
  initialPrecisions,
  initialRunDate,
  initialRunId,
  initialChipBasis,
}: {
  children: ReactNode;
  initialModel?: Model;
  initialSequence?: Sequence;
  initialPrecisions?: string[];
  initialRunDate?: string;
  initialRunId?: string;
  /** Starting chip basis for surfaces without URL state, such as embeds. */
  initialChipBasis?: ChipBasis;
}) {
  const { getUrlParam, setUrlParams } = useUrlState();

  const pathname = usePathname();

  const featureGateUnlocked = useFeatureGate();
  const [featureGateReady, setFeatureGateReady] = useState(false);
  useEffect(() => setFeatureGateReady(true), []);
  const [requestedModel, setSelectedModel] = useState<Model>(() =>
    initialRequestedModel(initialModel, pathname),
  );
  const modelGatePending = modelRequiresFeatureGate(requestedModel) && !featureGateReady;
  // Derive the safe value during render, including the first SSR/hydration render
  // and the render immediately after relocking. Every consumer sees this value.
  const selectedModel = visibleSelectedModel(requestedModel, featureGateUnlocked);
  useIsomorphicLayoutEffect(() => {
    if (!modelGatePending) setInferenceNavigationModel(selectedModel);
  }, [selectedModel, modelGatePending]);
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

  const [selectedSequence, setSelectedSequenceRaw] = useState<Sequence>(() =>
    initialSelectedSequence(
      initialSequence,
      hasExplicitUrlParam('i_seq') ? getUrlParam('i_seq') : undefined,
    ),
  );
  const [sequenceExplicit, setSequenceExplicit] = useState<boolean>(
    () => initialSequence !== undefined,
  );
  const setSelectedSequence = useCallback((sequence: Sequence) => {
    setSelectedSequenceRaw(sequence);
    setSequenceExplicit(true);
  }, []);

  const initialValidPrecisions = useMemo(
    () => validPrecisions(initialPrecisions),
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
  const [chipBasis, setChipBasis] = useState<ChipBasis>(initialChipBasis ?? DEFAULT_CHIP_BASIS);

  useIsomorphicLayoutEffect(() => {
    refreshUrlParams();
    const overrides = resolveFilterNavigationOverrides({
      pathname,
      getUrlParam,
      hasExplicitUrlParam,
      initialPrecisions: initialValidPrecisions,
      initialChipBasis,
    });
    if (overrides.model !== undefined) setSelectedModel(overrides.model);
    if (overrides.sequence !== undefined) setSelectedSequence(overrides.sequence);
    if (overrides.precisions) {
      setSelectedPrecisionsRaw(overrides.precisions.selected);
      setPrecisionExplicit(overrides.precisions.explicit);
    }
    if (overrides.runDate !== undefined) {
      requestedRunDateExplicitRef.current = true;
      setRequestedRunDate(overrides.runDate);
    }
    if (overrides.runId !== undefined) setRequestedRunId(overrides.runId);
    setTcoBasis(overrides.tcoBasis);
    if (overrides.chipBasis !== undefined) setChipBasis(overrides.chipBasis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const {
    data: availability,
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

  const dbModelKeys = useMemo<string[]>(() => modelDbKeys(selectedModel), [selectedModel]);

  const modelLines = useMemo(
    () => (availability ? linesForModels(availability, dbModelKeys) : []),
    [availability, dbModelKeys],
  );

  const availableModels = useMemo(
    () => resolveAvailableModels(availability, unofficialAvailable, featureGateUnlocked),
    [availability, unofficialAvailable, featureGateUnlocked],
  );

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

  const availableSequences = useMemo(
    () => resolveAvailableSequences(modelLines, unofficialAvailable, selectedModel),
    [modelLines, unofficialAvailable, selectedModel],
  );

  const availabilityLoaded = useMemo(
    () => isAvailabilityLoaded(availability, unofficialAvailable, selectedModel),
    [availability, unofficialAvailable, selectedModel],
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

  const sequenceLines = useMemo(
    () => modelLines.filter((line) => line.sequence === effectiveSequence),
    [modelLines, effectiveSequence],
  );

  const unofficialPrecisionsForSelection = useMemo(
    () => unofficialPrecisionsFor(unofficialAvailable, selectedModel, effectiveSequence),
    [unofficialAvailable, selectedModel, effectiveSequence],
  );

  const availablePrecisions = useMemo(
    () => resolveAvailablePrecisions(availability, sequenceLines, unofficialPrecisionsForSelection),
    [availability, sequenceLines, unofficialPrecisionsForSelection],
  );

  const precisionCurveCounts = useMemo(
    () => countCurvesByPrecision(sequenceLines),
    [sequenceLines],
  );

  const effectivePrecisions = useMemo(
    () =>
      resolveSelectionPrecisions({
        selectedPrecisions,
        availablePrecisions,
        curveCounts: precisionCurveCounts,
        unofficialPrecisions: unofficialPrecisionsForSelection,
        explicit: precisionExplicit,
        selectedModel,
        sequence: effectiveSequence,
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

  const availableDates = useMemo(
    () => resolveAvailableDates(availability, sequenceLines, effectivePrecisions),
    [availability, sequenceLines, effectivePrecisions],
  );

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
  } = useWorkflowInfo(modelGatePending ? '' : effectiveRunDate);

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
      g_chips: chipBasis,
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
    chipBasis,
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
      chipBasis,
      effectiveSequence,
      sequenceResolved,
      effectivePrecisions,
    }),
    [
      selectedModel,
      selectedSequence,
      selectedPrecisions,
      tcoBasis,
      chipBasis,
      effectiveSequence,
      sequenceResolved,
      effectivePrecisions,
    ],
  );

  const actionsValue = useMemo<GlobalFilterActionsContextType>(
    () => ({
      setTcoBasis,
      setChipBasis,
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
      availability,
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
      availability,
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

  // A boundary can mount this provider after its own gate has hydrated. This
  // provider's hook still starts locked; do not mount query consumers with the
  // temporary fallback model. Ordinary public model SSR remains unchanged.
  if (modelGatePending) return null;

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
