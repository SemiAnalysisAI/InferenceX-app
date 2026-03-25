'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DISPLAY_MODEL_TO_DB, islOslToSequence } from '@semianalysisai/inferencex-constants';

import { useAvailability } from '@/hooks/api/use-availability';
import { useWorkflowInfo } from '@/hooks/api/use-workflow-info';
import { useUrlState } from '@/hooks/useUrlState';
import {
  Model,
  MODEL_OPTIONS,
  Precision,
  PRECISION_OPTIONS,
  Sequence,
  SEQUENCE_OPTIONS,
} from '@/lib/data-mappings';
import type { AvailabilityRow, WorkflowInfoResponse } from '@/lib/api';

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

export function GlobalFilterProvider({ children }: { children: ReactNode }) {
  const { hasUrlParam, getUrlParam, setUrlParams } = useUrlState();

  // ── Core filter state ─────────────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState<Model>(() => {
    const urlModel = getUrlParam('g_model');
    if (urlModel && Object.values(Model).includes(urlModel as Model)) {
      return urlModel as Model;
    }
    return Model.DeepSeek_R1;
  });

  const [selectedSequence, setSelectedSequence] = useState<Sequence>(() => {
    const urlSeq = getUrlParam('i_seq');
    if (urlSeq && Object.values(Sequence).includes(urlSeq as Sequence)) return urlSeq as Sequence;
    return Sequence.EightK_OneK;
  });

  const [selectedPrecisions, setSelectedPrecisionsRaw] = useState<string[]>(() => {
    const urlPrec = getUrlParam('i_prec');
    if (urlPrec) {
      const precs = urlPrec.split(',').filter((p) => PRECISION_OPTIONS.includes(p as any));
      if (precs.length > 0) return precs;
    }
    return [Precision.FP4];
  });
  const setSelectedPrecisions = useCallback((precisions: string[]) => {
    setSelectedPrecisionsRaw(precisions);
  }, []);

  // ── Run date / run ID ─────────────────────────────────────────────────────
  const [selectedRunDate, setSelectedRunDateBase] = useState<string>(
    () => getUrlParam('g_rundate') || '',
  );
  const [selectedRunDateRev, setSelectedRunDateRev] = useState(0);

  const [selectedRunId, setSelectedRunId] = useState<string>(() => getUrlParam('g_runid') || '');

  // ── Availability data ─────────────────────────────────────────────────────
  const { data: availabilityRows } = useAvailability();

  const dbModelKey = useMemo(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? selectedModel,
    [selectedModel],
  );

  // Pre-filter availability rows by model once
  const modelRows = useMemo(
    () => availabilityRows?.filter((r) => r.model === dbModelKey) ?? [],
    [availabilityRows, dbModelKey],
  );

  // Models that have any data
  const availableModels = useMemo(() => {
    if (!availabilityRows) return MODEL_OPTIONS;
    return MODEL_OPTIONS.filter((m) => {
      const key = DISPLAY_MODEL_TO_DB[m] ?? m;
      return availabilityRows.some((r) => r.model === key);
    });
  }, [availabilityRows]);

  // Sequences available for the selected model
  const availableSequences = useMemo(() => {
    if (!availabilityRows) return SEQUENCE_OPTIONS;
    const seqs = [
      ...new Set(
        modelRows
          .map((r) => islOslToSequence(r.isl, r.osl))
          .filter((s): s is Sequence => s !== null),
      ),
    ];
    return seqs.length > 0 ? seqs : SEQUENCE_OPTIONS;
  }, [availabilityRows, modelRows]);

  // Synchronously validated sequence
  const effectiveSequence = useMemo(() => {
    if (availableSequences.includes(selectedSequence)) return selectedSequence;
    return availableSequences[0] ?? selectedSequence;
  }, [availableSequences, selectedSequence]);

  // Precisions available for the selected model + sequence
  const availablePrecisions = useMemo(() => {
    if (!availabilityRows) return ['fp4'];
    const rows = modelRows.filter((r) => islOslToSequence(r.isl, r.osl) === effectiveSequence);
    const precs = [...new Set(rows.map((r) => r.precision))].sort();
    return precs.length > 0 ? precs : ['fp4'];
  }, [availabilityRows, modelRows, effectiveSequence]);

  // Synchronously validated precisions
  const effectivePrecisions = useMemo(() => {
    const valid = selectedPrecisions.filter((p) => availablePrecisions.includes(p));
    if (valid.length > 0) return valid;
    return availablePrecisions.length > 0 ? [availablePrecisions[0]] : selectedPrecisions;
  }, [selectedPrecisions, availablePrecisions]);

  // Dates available for selected model + sequence + precisions
  const availableDates = useMemo(() => {
    if (!availabilityRows) return [];
    const seqRows = modelRows.filter((r) => islOslToSequence(r.isl, r.osl) === effectiveSequence);
    const rows = seqRows.filter((r) => effectivePrecisions.includes(r.precision));
    if (rows.length === 0) {
      return [...new Set(seqRows.map((r) => r.date))].sort();
    }
    return [...new Set(rows.map((r) => r.date))].sort();
  }, [availabilityRows, modelRows, effectiveSequence, effectivePrecisions]);

  // When true, keep the user's date if available; otherwise always use latest
  const userPickedDateRef = useRef(!!getUrlParam('g_rundate'));

  const setSelectedRunDateManual = useCallback((date: string) => {
    userPickedDateRef.current = true;
    setSelectedRunDateBase(date);
    setSelectedRunDateRev((v) => v + 1);
  }, []);

  const effectiveRunDate = useMemo(() => {
    if (availableDates.length === 0) return selectedRunDate;
    const latest = availableDates[availableDates.length - 1];
    if (userPickedDateRef.current && selectedRunDate && availableDates.includes(selectedRunDate)) {
      return selectedRunDate;
    }
    return latest;
  }, [availableDates, selectedRunDate]);

  // Sync selectedRunDate state when effectiveRunDate changes
  useEffect(() => {
    if (availableDates.length > 0 && effectiveRunDate !== selectedRunDate) {
      setSelectedRunDateBase(effectiveRunDate);
      setSelectedRunDateRev((v) => v + 1);
    }
  }, [effectiveRunDate, availableDates]);

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

  useEffect(() => {
    if (availableRuns && Object.keys(availableRuns).length > 0) {
      if (!urlInitRef.current.runIdApplied && hasUrlParam('g_runid')) {
        const urlRunId = getUrlParam('g_runid')!;
        urlInitRef.current.runIdApplied = true;
        if (Object.keys(availableRuns).includes(urlRunId)) {
          setSelectedRunId(urlRunId);
          return;
        }
      }
      urlInitRef.current.runIdApplied = true;

      if (
        !selectedRunId ||
        (selectedRunId && !Object.keys(availableRuns).includes(selectedRunId))
      ) {
        const runIds = Object.keys(availableRuns);
        const maxRunId = runIds.reduce((max, id) => (id > max ? id : max), runIds[0]);
        setSelectedRunId(maxRunId);
      }
    } else if (selectedRunId !== '') {
      setSelectedRunId('');
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
  const context = useContext(GlobalFilterContext);
  if (context === undefined) {
    throw new Error('useGlobalFilters must be used within a GlobalFilterProvider');
  }
  return context;
}
