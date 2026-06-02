'use client';

import {
  type ReactNode,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAvailability } from '@/hooks/api/use-availability';
import { useWorkflowInfo } from '@/hooks/api/use-workflow-info';
import { useUrlState } from '@/hooks/useUrlState';
import { useUnofficialRun } from '@/components/unofficial-run-context';
import { Model, Precision, PRECISION_OPTIONS, Sequence } from '@/lib/data-mappings';
import type { AvailabilityRow, WorkflowInfoResponse } from '@/lib/api';

import { useDerivedAvailability } from './global-filter/useDerivedAvailability';
import { useGlobalUrlInit } from './global-filter/useGlobalUrlInit';

interface RunInfo {
  runId: string;
  runDate: string;
  runUrl: string;
  conclusion: string | null;
  changelog?: {
    entries: {
      config_keys: string[];
      description: string;
      pr_link: string | null;
      head_ref: string;
    }[];
  };
}

export interface GlobalFilterContextType {
  // Shared filter state
  selectedModel: Model;
  setSelectedModel: (model: Model) => void;
  selectedSequence: Sequence;
  setSelectedSequence: (sequence: Sequence) => void;
  selectedPrecisions: string[];
  setSelectedPrecisions: (precisions: string[]) => void;

  // Effective (validated) values
  effectiveSequence: Sequence;
  effectivePrecisions: string[];

  // Run date & run ID
  selectedRunDate: string;
  setSelectedRunDate: (date: string) => void;
  selectedRunDateRev: number;
  selectedRunId: string;
  setSelectedRunId: (id: string) => void;

  // Derived availability
  availableModels: Model[];
  availableSequences: Sequence[];
  availablePrecisions: string[];
  availableDates: string[];
  effectiveRunDate: string;

  // Raw availability rows (shared with inference for GPU filtering)
  availabilityRows: AvailabilityRow[] | undefined;

  // Workflow info
  workflowInfo: { runInfoBySequence: Record<string, RunInfo> }[] | null;
  availableRuns: Record<string, RunInfo>;
  workflowLoading: boolean;
  workflowError: string | null;
}

/** @internal Exported for test provider wrapping only. */
export const GlobalFilterContext = createContext<GlobalFilterContextType | undefined>(undefined);

/** Transform API response into the shape the app expects. */
function buildRunInfo(data: WorkflowInfoResponse): Record<string, RunInfo> {
  const runs: Record<string, RunInfo> = {};
  for (const run of data.runs) {
    const runId = String(run.github_run_id);
    const runChangelogs = data.changelogs.filter((c) => c.workflow_run_id === run.github_run_id);
    runs[runId] = {
      runId,
      runDate: run.created_at,
      runUrl: run.html_url ? `${run.html_url}/attempts/${run.run_attempt}` : '',
      conclusion: run.conclusion,
      ...(runChangelogs.length > 0 && {
        changelog: {
          entries: runChangelogs.map((c) => ({
            config_keys: c.config_keys,
            description: c.description,
            pr_link: c.pr_link,
            head_ref: c.head_ref,
          })),
        },
      }),
    };
  }
  return runs;
}

export function GlobalFilterProvider({
  children,
  initialModel,
  initialSequence,
  initialPrecisions,
}: {
  children: ReactNode;
  /**
   * Initial values used when no URL params are present. Lets per-route entry
   * points (e.g. `/compare/[a]-vs-[b]`) seed sensible defaults derived from
   * actual data — without these, every page falls back to FP4/8K-1K which
   * has no data for older GPUs (Hopper, CDNA 3).
   */
  initialModel?: Model;
  initialSequence?: Sequence;
  initialPrecisions?: string[];
}) {
  const { hasUrlParam, getUrlParam, setUrlParams } = useUrlState();

  // ── Core filter state ─────────────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState<Model>(
    () => initialModel ?? Model.DeepSeek_R1,
  );

  const [selectedSequence, setSelectedSequence] = useState<Sequence>(() => {
    if (initialSequence) return initialSequence;
    return Sequence.EightK_OneK;
  });

  const [selectedPrecisions, setSelectedPrecisionsRaw] = useState<string[]>(() => {
    if (initialPrecisions && initialPrecisions.length > 0) {
      const valid = initialPrecisions.filter((p) =>
        (PRECISION_OPTIONS as readonly string[]).includes(p),
      );
      if (valid.length > 0) return valid;
    }
    return [Precision.FP4];
  });
  const setSelectedPrecisions = useCallback((precisions: string[]) => {
    setSelectedPrecisionsRaw(precisions);
  }, []);

  // ── Run date / run ID ─────────────────────────────────────────────────────
  const [selectedRunDate, setSelectedRunDateBase] = useState<string>('');
  const [selectedRunDateRev, setSelectedRunDateRev] = useState(0);

  const [selectedRunId, setSelectedRunId] = useState<string>('');

  // Apply URL param overrides synchronously after the first commit (mount-only).
  useGlobalUrlInit({
    getUrlParam,
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisionsRaw,
    setSelectedRunDateBase,
    setSelectedRunId,
  });

  // ── Availability data ─────────────────────────────────────────────────────
  const { data: availabilityRows } = useAvailability();
  const { availableModelsAndSequences: unofficialAvailable } = useUnofficialRun();

  const {
    availableModels,
    availableSequences,
    effectiveSequence,
    availablePrecisions,
    effectivePrecisions,
    availableDates,
  } = useDerivedAvailability({
    availabilityRows,
    unofficialAvailable,
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    getUrlParam,
    setSelectedModel,
  });

  // When true, keep the user's date if available; otherwise always use latest
  const userPickedDateRef = useRef(Boolean(getUrlParam('g_rundate')));

  const setSelectedRunDateManual = useCallback((date: string) => {
    userPickedDateRef.current = true;
    setSelectedRunDateBase(date);
    setSelectedRunDateRev((v) => v + 1);
  }, []);

  const effectiveRunDate = useMemo(() => {
    if (availableDates.length === 0) return selectedRunDate;
    const latest = availableDates.at(-1)!;
    if (userPickedDateRef.current && selectedRunDate && availableDates.includes(selectedRunDate)) {
      return selectedRunDate;
    }
    return latest;
  }, [availableDates, selectedRunDate]);

  // Sync selectedRunDate to the derived effectiveRunDate during render. This is a
  // convergent adjustment — effectiveRunDate is computed from selectedRunDate and
  // availableDates and settles once they agree — so it avoids the extra commit a
  // useEffect would add.
  if (availableDates.length > 0 && effectiveRunDate !== selectedRunDate) {
    setSelectedRunDateBase(effectiveRunDate);
    setSelectedRunDateRev((v) => v + 1);
  }

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

  const workflowInfo = useMemo(
    () => (Object.keys(availableRuns).length > 0 ? [{ runInfoBySequence: availableRuns }] : null),
    [availableRuns],
  );

  // Auto-select latest run ID when availableRuns change
  const urlInitRef = useRef({ runIdApplied: false });

  // Clear the run selection during render when no runs are available (convergent:
  // once cleared, selectedRunId is '' and this no-ops).
  if (Object.keys(availableRuns).length === 0 && selectedRunId !== '') {
    setSelectedRunId('');
  }

  useEffect(() => {
    if (Object.keys(availableRuns).length === 0) return;

    if (!urlInitRef.current.runIdApplied && hasUrlParam('g_runid')) {
      const urlRunId = getUrlParam('g_runid')!;
      urlInitRef.current.runIdApplied = true;
      if (Object.keys(availableRuns).includes(urlRunId)) {
        setSelectedRunId(urlRunId);
        return;
      }
    }
    urlInitRef.current.runIdApplied = true;

    if (!selectedRunId || !Object.keys(availableRuns).includes(selectedRunId)) {
      const runIds = Object.keys(availableRuns);
      const maxRunId = runIds.reduce((max, id) => (id > max ? id : max), runIds[0]);
      setSelectedRunId(maxRunId);
    }
  }, [availableRuns, selectedRunId]);

  // ── URL sync ──────────────────────────────────────────────────────────────
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    setUrlParams({
      g_model: selectedModel,
      g_rundate: selectedRunDate,
      g_runid: selectedRunId,
      i_seq: effectiveSequence,
      i_prec: effectivePrecisions.join(','),
    });
  }, [
    selectedModel,
    selectedRunDate,
    selectedRunId,
    effectiveSequence,
    effectivePrecisions,
    setUrlParams,
  ]);

  const contextValue = useMemo<GlobalFilterContextType>(
    () => ({
      selectedModel,
      setSelectedModel,
      selectedSequence,
      setSelectedSequence,
      selectedPrecisions,
      setSelectedPrecisions,
      effectiveSequence,
      effectivePrecisions,
      selectedRunDate: effectiveRunDate,
      setSelectedRunDate: setSelectedRunDateManual,
      selectedRunDateRev,
      selectedRunId,
      setSelectedRunId,
      availableModels,
      availableSequences,
      availablePrecisions,
      availableDates,
      effectiveRunDate,
      availabilityRows,
      workflowInfo,
      availableRuns,
      workflowLoading,
      workflowError,
    }),
    [
      selectedModel,
      selectedSequence,
      selectedPrecisions,
      effectiveSequence,
      effectivePrecisions,
      effectiveRunDate,
      setSelectedRunDateManual,
      selectedRunDateRev,
      selectedRunId,
      availableModels,
      availableSequences,
      availablePrecisions,
      availableDates,
      availabilityRows,
      workflowInfo,
      availableRuns,
      workflowLoading,
      workflowError,
    ],
  );

  return (
    <GlobalFilterContext.Provider value={contextValue}>{children}</GlobalFilterContext.Provider>
  );
}

export function useGlobalFilters() {
  const context = use(GlobalFilterContext);
  if (context === undefined) {
    throw new Error('useGlobalFilters must be used within a GlobalFilterProvider');
  }
  return context;
}
