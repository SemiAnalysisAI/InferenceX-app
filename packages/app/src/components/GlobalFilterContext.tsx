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

// useLayoutEffect warns during SSR; alias to useEffect on the server (no-op there anyway).
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function isEnumValue<T extends Record<string, string>>(e: T, v: string): v is T[keyof T] {
  return (Object.values(e) as string[]).includes(v);
}

import { useAvailability } from '@/hooks/api/use-availability';
import { useWorkflowInfo } from '@/hooks/api/use-workflow-info';
import { useUrlState } from '@/hooks/useUrlState';
import { hasExplicitUrlParam, refreshUrlParams, type UrlStateParams } from '@/lib/url-state';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import type { RunInfo } from '@/components/inference/types';
import {
  Model,
  MODEL_OPTIONS,
  Precision,
  PRECISION_OPTIONS,
  Sequence,
  SEQUENCE_OPTIONS,
} from '@/lib/data-mappings';
import { inferenceModelForPathname } from '@/lib/inference-model-slug';
import { computeAutoSwitchDecision } from '@/lib/unofficial-run-auto-switch';
import { countCurvesByPrecision, resolveEffectivePrecisions } from '@/lib/default-precisions';
import { resolveEffectiveSequence } from '@/lib/default-sequence';
import type { AvailabilityRow, WorkflowInfoResponse } from '@/lib/api';
const RUNDATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const RUNID_RE = /^[A-Za-z0-9_-]{1,64}$/u;

// Placeholder for the public (non-null) `effectiveSequence` during the window
// before availability has loaded. It stays on the fixed-sequence app default
// until availability confirms whether the selected model has AgentX data, so a
// fixed-seq-only model never flashes an agentic label. Consumers that must not
// act on an unresolved sequence gate on `sequenceResolved` instead.
// (Declared after the import block so it never references `Sequence` above its import.)
const APP_DEFAULT_SEQUENCE = Sequence.EightK_OneK;

export interface GlobalFilterSelectionContextType {
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  effectiveSequence: Sequence;
  /**
   * Whether `effectiveSequence` reflects the selected model's real availability
   * rather than the pre-load placeholder.
   */
  sequenceResolved: boolean;
  effectivePrecisions: string[];
}

export interface GlobalFilterActionsContextType {
  setSelectedModel: (model: Model) => void;
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
  /** True once the database availability request has either succeeded or failed. */
  availabilitySettled: boolean;
  availabilityError: string | null;
}

export interface GlobalFilterWorkflowContextType {
  availableRuns: Record<string, RunInfo>;
  workflowLoading: boolean;
  workflowError: string | null;
}

/** @internal Exported for focused provider tests and Cypress provider wrapping. */
export const GlobalFilterSelectionContext = createContext<
  GlobalFilterSelectionContextType | undefined
>(undefined);
/** @internal Exported for focused provider tests and Cypress provider wrapping. */
export const GlobalFilterActionsContext = createContext<GlobalFilterActionsContextType | undefined>(
  undefined,
);
/** @internal Exported for focused provider tests and Cypress provider wrapping. */
export const GlobalFilterRunContext = createContext<GlobalFilterRunContextType | undefined>(
  undefined,
);
/** @internal Exported for focused provider tests and Cypress provider wrapping. */
export const GlobalFilterAvailabilityContext = createContext<
  GlobalFilterAvailabilityContextType | undefined
>(undefined);
/** @internal Exported for focused provider tests and Cypress provider wrapping. */
export const GlobalFilterWorkflowContext = createContext<
  GlobalFilterWorkflowContextType | undefined
>(undefined);

/** Transform API response into the run map consumed by selectors and displays. */
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

export function resolveEffectiveRunId(
  requestedRunId: string,
  availableRuns: Readonly<Record<string, RunInfo>>,
): string {
  const runIds = Object.keys(availableRuns);
  if (runIds.length === 0) return '';
  if (requestedRunId && Object.hasOwn(availableRuns, requestedRunId)) return requestedRunId;
  return runIds.reduce((latest, runId) => (runId > latest ? runId : latest), runIds[0]);
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
  /**
   * Initial values used when no URL params are present. Lets per-route entry
   * points (e.g. `/compare/[a]-vs-[b]`) seed sensible defaults derived from
   * actual data, without forcing a second provider during server rendering.
   */
  initialModel?: Model;
  initialSequence?: Sequence;
  initialPrecisions?: string[];
  initialRunDate?: string;
  initialRunId?: string;
}) {
  const { getUrlParam, setUrlParams } = useUrlState();

  // ── Core filter state ─────────────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState<Model>(
    () => initialModel ?? Model.DeepSeek_V4_Pro,
  );

  const [selectedSequence, setSelectedSequenceRaw] = useState<Sequence>(() => {
    if (initialSequence) return initialSequence;
    const urlSeq = getUrlParam('i_seq');
    if (urlSeq && Object.values(Sequence).includes(urlSeq as Sequence)) return urlSeq as Sequence;
    // Default to the 8K/1K fixed-seq scenario; the effectiveSequence resolution
    // below prefers the Agentic scenario when availability confirms the model
    // has corresponding data, and handles models that lack 8K/1K entirely.
    return Sequence.EightK_OneK;
  });
  // Whether the scenario was chosen explicitly (seeded `initialSequence` prop,
  // URL `i_seq`, or a manual pick). Until then the availability-driven AgentX
  // default applies —
  // without this flag the initial `8k/1k` state is indistinguishable from a
  // deliberate 8K/1K selection, and the Agentic scenario could never win.
  //
  // Deliberately NOT seeded from `i_seq` here: this flag feeds the scenario
  // label rendered during the pre-availability window, and `getUrlParam` sees
  // the query string on the client but not on the server. Reading it in the
  // initializer would render a different label on each side and fail
  // hydration. The layout effect below applies `i_seq` (flag included) after
  // the first commit and before paint, which is how every other URL param
  // lands.
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
  // Whether the precision was chosen explicitly (seeded prop, URL `i_prec`,
  // preset, or manual toggle). Until then we auto-pick the densest precision
  // for the current model/sequence so FP8-heavy models don't open barren.
  const [precisionExplicit, setPrecisionExplicit] = useState<boolean>(
    () => initialValidPrecisions.length > 0,
  );
  const setSelectedPrecisions = useCallback((precisions: string[]) => {
    setSelectedPrecisionsRaw(precisions);
    setPrecisionExplicit(true);
  }, []);

  // ── Run date / run ID ─────────────────────────────────────────────────────
  const [requestedRunDate, setRequestedRunDate] = useState<string>(() => initialRunDate ?? '');
  const [selectedRunDateRev, setSelectedRunDateRev] = useState(0);
  const requestedRunDateExplicitRef = useRef(
    initialRunDate !== undefined || hasExplicitUrlParam('g_rundate'),
  );

  const [requestedRunId, setRequestedRunId] = useState<string>(() => initialRunId ?? '');

  // Apply URL param overrides synchronously after the first commit. Runs only
  // on the client (useEffect on server is a no-op). Updates state before paint
  // so users with shareable URLs (?i_seq=…&g_model=…) see their values without
  // flicker, and SSR/client hydration agree because initial state came from
  // props/defaults on both sides.
  // Soft navigations do not remount this provider, and `useUrlState` caches the
  // URL in a ref at first render — so without this, landing on
  // `/inference?g_model=Qwen-3.5-397B-A17B` via a <Link> kept whatever model
  // the previous page had (the default, DeepSeek). Every AgentX card on the
  // landing page pointed at the right URL and still opened the wrong model.
  // `usePathname` rather than `useSearchParams`: the latter forces every
  // statically-prerendered page that mounts this provider behind a Suspense
  // boundary, which fails the build on /ai-chart. Pathname changes on the
  // navigations that matter here — the AgentX cards and every share link live
  // on a different route from /inference.
  const pathname = usePathname();

  useIsomorphicLayoutEffect(() => {
    // Pull the live URL into the shared snapshot first: `getUrlParam` below and
    // the auto-switch guard further down both read from it, and on a soft
    // navigation it still holds the previous page's params.
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

    // `/inference/<model>` pins the model from the path. On first mount the
    // shell already seeded `initialModel` from the same pathname, so this is a
    // no-op; it matters on soft navigations between model pages (and to/from
    // `/inference`), which do not remount this provider. Applied before the
    // param reads so an explicit `?g_model=` share link still wins.
    const pathModel = inferenceModelForPathname(pathname);
    if (pathModel !== null) setSelectedModel(pathModel);
    applyIfEnum('g_model', Model, setSelectedModel);
    applyIfEnum('i_seq', Sequence, setSelectedSequence);
    const urlPrec = getUrlParam('i_prec');
    if (urlPrec) {
      const precs = urlPrec
        .split(',')
        .filter((p) => (PRECISION_OPTIONS as readonly string[]).includes(p));
      if (precs.length > 0) {
        setSelectedPrecisionsRaw(precs);
        setPrecisionExplicit(true);
      }
    }
    applyIfMatches('g_rundate', RUNDATE_RE, (date) => {
      requestedRunDateExplicitRef.current = true;
      setRequestedRunDate(date);
    });
    applyIfMatches('g_runid', RUNID_RE, setRequestedRunId);
    // Re-runs on client-side navigation as well as on mount. Keyed on the
    // pathname, which the Next router owns: the provider's own share-link
    // writes go through `history.replaceState` and never change it, so this
    // cannot fight a user changing filters in place. A param-only navigation
    // within /inference is therefore not picked up — no in-app link does that
    // today, and covering it would mean the Suspense bailout above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── Availability data ─────────────────────────────────────────────────────
  const {
    data: availabilityRows,
    error: availabilityQueryError,
    isPending: availabilityPending,
  } = useAvailability();
  const availabilitySettled = !availabilityPending;
  const availabilityError = availabilityQueryError ? availabilityQueryError.message : null;
  const { availableModelsAndSequences: unofficialAvailable } = useUnofficialRun();

  const dbModelKeys = useMemo<string[]>(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );

  // Pre-filter availability rows by model once
  const modelRows = useMemo(
    () => availabilityRows?.filter((r) => dbModelKeys.includes(r.model)) ?? [],
    [availabilityRows, dbModelKeys],
  );

  // Models that have any data (DB ∪ unofficial run)
  const availableModels = useMemo(() => {
    if (!availabilityRows) return MODEL_OPTIONS;
    const unofficialModels = new Set(unofficialAvailable.map((a) => a.model));
    return MODEL_OPTIONS.filter((m) => {
      if (unofficialModels.has(m)) return true;
      const keys = DISPLAY_MODEL_TO_DB[m] ?? [m];
      return availabilityRows.some((r) => keys.includes(r.model));
    });
  }, [availabilityRows, unofficialAvailable]);

  // Auto-switch the selected model when an unofficial run is loaded that
  // doesn't include the currently selected model. Without this, navigating
  // to `?unofficialrun=<id>` while the default `g_model=DeepSeek-R1` sticks
  // leaves the user staring at a chart with no overlay points — they'd have
  // to know to open the dropdown and pick the run's model themselves.
  //
  // Explicit URL intent is tracked separately from the mutable state mirrored
  // for provider remounts. Automatic model changes serialize like any other
  // filter, but must not become an explicit `g_model` that blocks the next
  // unofficial-run auto-switch.
  const lastAutoSwitchKeyRef = useRef<string>('');
  useEffect(() => {
    const decision = computeAutoSwitchDecision(
      unofficialAvailable,
      hasExplicitUrlParam('g_model') ? getUrlParam('g_model') : undefined,
      selectedModel,
      lastAutoSwitchKeyRef.current,
    );
    lastAutoSwitchKeyRef.current = decision.nextKey;
    if (decision.modelToSet !== null) {
      setSelectedModel(decision.modelToSet);
    }
  }, [unofficialAvailable, selectedModel]);

  // Sequences available for the selected model (DB ∪ unofficial run for this model).
  const availableSequences = useMemo(() => {
    const unofficialSeqs = unofficialAvailable
      .filter((a) => a.model === selectedModel)
      .map((a) => a.sequence as Sequence);
    if (!availabilityRows) {
      return unofficialSeqs.length > 0 ? [...new Set(unofficialSeqs)] : [...SEQUENCE_OPTIONS];
    }
    const dbSeqs = modelRows.map((r) => rowToSequence(r)).filter((s): s is Sequence => s !== null);
    const merged = [...new Set([...dbSeqs, ...unofficialSeqs])];
    return merged.length > 0 ? merged : [...SEQUENCE_OPTIONS];
  }, [availabilityRows, modelRows, unofficialAvailable, selectedModel]);

  // Whether we actually know the selected model's sequences yet. Availability
  // may arrive from the DB (`availabilityRows`) OR from a loaded unofficial run
  // (`unofficialAvailable` for this model) — either source lets us resolve a
  // trustworthy effectiveSequence. Until then `availableSequences` is the static
  // SEQUENCE_OPTIONS fallback (which contains every scenario), so resolving
  // eagerly would honor a selection the model may not have (e.g. agentic-traces
  // from a shared link on a fixed-seq-only model), fetch it, then snap once
  // availability lands (flash + wasted request).
  const availabilityLoaded = useMemo(
    () =>
      availabilityRows !== undefined || unofficialAvailable.some((a) => a.model === selectedModel),
    [availabilityRows, unofficialAvailable, selectedModel],
  );

  // Synchronously validated sequence.
  //
  // `resolveEffectiveSequence` returns null while availability is still loading
  // so InferenceProvider can gate the
  // benchmark fetch until the real sequence is known (no agentic fetch fires for
  // a fixed-seq-only model). For the non-null public `effectiveSequence` value
  // we retain the fixed-sequence placeholder until availability confirms the
  // AgentX scenario exists; the chart shows its normal loading skeleton until
  // `sequenceResolved` flips true.
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

  // Precisions available for the selected model + sequence (DB ∪ unofficial run)
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

  // Curve count per precision (distinct hw/framework/spec/disagg series) for the
  // selected model + sequence — drives the auto default toward the densest one.
  const precisionCurveCounts = useMemo(
    () => countCurvesByPrecision(modelRows.filter((r) => rowToSequence(r) === effectiveSequence)),
    [modelRows, effectiveSequence],
  );

  // Precisions present in a loaded unofficial run for the current model + sequence.
  const unofficialPrecisionsForSelection = useMemo(
    () =>
      unofficialAvailable
        .filter((a) => a.model === selectedModel && a.sequence === effectiveSequence)
        .flatMap((a) => a.precisions),
    [unofficialAvailable, selectedModel, effectiveSequence],
  );

  // Synchronously validated precisions. When the user hasn't explicitly chosen a
  // precision, auto-pick the densest (see resolveEffectivePrecisions).
  const effectivePrecisions = useMemo(
    () =>
      resolveEffectivePrecisions({
        selectedPrecisions,
        availablePrecisions,
        curveCounts: precisionCurveCounts,
        unofficialPrecisions: unofficialPrecisionsForSelection,
        explicit: precisionExplicit,
      }),
    [
      selectedPrecisions,
      availablePrecisions,
      precisionCurveCounts,
      unofficialPrecisionsForSelection,
      precisionExplicit,
    ],
  );

  // Dates available for selected model + sequence + precisions
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

  // ── Workflow info ─────────────────────────────────────────────────────────
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

  // ── URL sync ──────────────────────────────────────────────────────────────
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    setUrlParams({
      g_model: selectedModel,
      ...getRequestedRunUrlParams(requestedRunDate, requestedRunId),
      // Don't pin the sequence to the URL until it's resolved from real
      // availability — writing the pre-load placeholder (8k/1k) would clobber a
      // shared `?i_seq=agentic-traces` link before the model's availability
      // confirms it has agentic data.
      i_seq: sequenceResolved ? effectiveSequence : undefined,
      // Only pin the precision in the URL once chosen explicitly; in auto mode
      // leave it out so the link keeps following the per-model densest default.
      i_prec: precisionExplicit ? effectivePrecisions.join(',') : undefined,
    });
  }, [
    selectedModel,
    requestedRunDate,
    requestedRunId,
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
      effectiveSequence,
      sequenceResolved,
      effectivePrecisions,
    }),
    [
      selectedModel,
      selectedSequence,
      selectedPrecisions,
      effectiveSequence,
      sequenceResolved,
      effectivePrecisions,
    ],
  );

  const actionsValue = useMemo<GlobalFilterActionsContextType>(
    () => ({
      setSelectedModel,
      setSelectedSequence,
      setSelectedPrecisions,
      setSelectedRunDate: setSelectedRunDateManual,
      setSelectedRunId,
    }),
    [
      setSelectedModel,
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
    }),
    [
      availableModels,
      availableSequences,
      availablePrecisions,
      availableDates,
      availabilityRows,
      availabilitySettled,
      availabilityError,
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
