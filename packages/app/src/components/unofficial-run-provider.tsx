'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { UnofficialBanner } from '@/components/ui/unofficial-banner';
import { computeToggle } from '@/hooks/useTogglableSet';
import type { EvalRow } from '@/lib/api';
import { normalizeEvalHardwareKey } from '@/lib/chart-utils';

import type { Model, Sequence } from '@/lib/data-mappings';

import { UnofficialRunContext, type UnofficialRunContextType } from './unofficial-run-context';
import {
  type AvailableModelSequence,
  buildChartData,
  parseAvailableModelsAndSequences,
  type UnofficialChartData,
  type UnofficialRunInfo,
} from './unofficial-run-utils';

const UNOFFICIAL_RUN_PARAM_RE = /^unofficialruns?$/iu;

export function UnofficialRunProvider({ children }: { children: ReactNode }) {
  const [unofficialRunInfos, setUnofficialRunInfos] = useState<UnofficialRunInfo[]>([]);
  const unofficialRunInfo = unofficialRunInfos[0] ?? null;
  const [unofficialChartData, setUnofficialChartData] = useState<UnofficialChartData | null>(null);
  const [unofficialEvalRows, setUnofficialEvalRows] = useState<EvalRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModelsAndSequences, setAvailableModelsAndSequences] = useState<
    AvailableModelSequence[]
  >([]);

  // --- Shared overlay toggle state (unified across both charts) ---
  const [activeOverlayHwTypes, setActiveOverlayHwTypes] = useState<Set<string>>(new Set());
  const [localOfficialOverride, setLocalOfficialOverrideRaw] = useState<Set<string> | null>(null);

  // Derive all overlay hw types from chart data
  const allOverlayHwTypes = useMemo(() => {
    const hwTypes = new Set<string>();
    if (unofficialChartData) {
      for (const group of Object.values(unofficialChartData)) {
        for (const chartType of [group.e2e, group.interactivity]) {
          chartType.data.forEach((p) => {
            if (p.hwKey) hwTypes.add(p.hwKey as string);
          });
        }
      }
    }
    if (unofficialEvalRows) {
      unofficialEvalRows.forEach((row) => {
        const hwKey = normalizeEvalHardwareKey(row.hardware, row.framework, row.spec_method);
        if (hwKey !== 'unknown') hwTypes.add(hwKey);
      });
    }
    return hwTypes;
  }, [unofficialChartData, unofficialEvalRows]);

  // Reset overlay state when chart data changes. Done during render with a
  // prev-value comparison instead of an effect so the reset commits in the same
  // render rather than after an extra pass. `allOverlayHwTypes` is memoized, so
  // its identity only changes when the underlying overlay data changes.
  const [prevOverlayHwTypes, setPrevOverlayHwTypes] = useState(allOverlayHwTypes);
  if (allOverlayHwTypes !== prevOverlayHwTypes) {
    setPrevOverlayHwTypes(allOverlayHwTypes);
    setActiveOverlayHwTypes(allOverlayHwTypes);
    setLocalOfficialOverrideRaw(null);
  }

  const toggleOverlayHwType = useCallback(
    (key: string) => {
      setActiveOverlayHwTypes((prev) => computeToggle(prev, key, allOverlayHwTypes));
    },
    [allOverlayHwTypes],
  );

  const resetOverlayHwTypes = useCallback(() => {
    setActiveOverlayHwTypes(allOverlayHwTypes);
  }, [allOverlayHwTypes]);

  const setLocalOfficialOverride = useCallback(
    (v: Set<string> | null) => setLocalOfficialOverrideRaw(v),
    [],
  );

  const setActiveOverlayHwTypesStable = useCallback(
    (v: Set<string>) => setActiveOverlayHwTypes(v),
    [],
  );

  const clearUnofficialRun = useCallback(() => {
    setUnofficialRunInfos([]);
    setUnofficialChartData(null);
    setUnofficialEvalRows(null);
    setError(null);
    setAvailableModelsAndSequences([]);
    const url = new URL(window.location.href);
    for (const key of url.searchParams.keys()) {
      if (UNOFFICIAL_RUN_PARAM_RE.test(key)) url.searchParams.delete(key);
    }
    window.history.pushState({}, '', url);
  }, []);

  /**
   * Drop a single run from the URL + state. Since benchmark rows are tagged
   * with `run_url` and eval rows have their own `run_url`, we can filter local
   * state by the dismissed run's URL/id without refetching the remaining runs.
   */
  const dismissRun = useCallback(
    (runId: string) => {
      const target = unofficialRunInfos.find((r) => String(r.id) === runId);
      if (!target) return;

      const remaining = unofficialRunInfos.filter((r) => String(r.id) !== runId);

      // Rewrite URL to the remaining IDs (or drop param if none left).
      const url = new URL(window.location.href);
      const existingKeys: string[] = [];
      for (const key of url.searchParams.keys()) {
        if (UNOFFICIAL_RUN_PARAM_RE.test(key)) existingKeys.push(key);
      }
      for (const key of existingKeys) url.searchParams.delete(key);
      if (remaining.length > 0) {
        url.searchParams.set('unofficialruns', remaining.map((r) => r.id).join(','));
      }
      window.history.pushState({}, '', url);

      if (remaining.length === 0) {
        setUnofficialRunInfos([]);
        setUnofficialChartData(null);
        setUnofficialEvalRows(null);
        setError(null);
        setAvailableModelsAndSequences([]);
        return;
      }

      setUnofficialRunInfos(remaining);

      // Filter chart data by stamped `run_url`. A row belongs to the dismissed
      // run if its URL matches exactly OR the numeric id parses to the same.
      const belongsToDismissed = (rowUrl?: string | null) => {
        if (!rowUrl) return false;
        if (rowUrl === target.url) return true;
        const m = rowUrl.match(/\/runs\/(\d+)/u);
        return m !== null && m[1] === runId;
      };

      // Compute the filtered chart data BEFORE any setState so we can pass the
      // same value to setUnofficialChartData and parseAvailableModelsAndSequences.
      // Writing to an outer variable from inside a setState updater and then
      // reading it synchronously is unsafe: React 18 invokes updaters during
      // render, not at the call site, so the read would see the initial null.
      const nextChartData: UnofficialChartData | null = unofficialChartData
        ? (() => {
            const next: UnofficialChartData = {};
            for (const [key, group] of Object.entries(unofficialChartData)) {
              const e2eData = group.e2e.data.filter((d) => !belongsToDismissed(d.run_url));
              const intvData = group.interactivity.data.filter(
                (d) => !belongsToDismissed(d.run_url),
              );
              if (e2eData.length === 0 && intvData.length === 0) continue;
              next[key] = {
                e2e: { data: e2eData, gpus: group.e2e.gpus },
                interactivity: { data: intvData, gpus: group.interactivity.gpus },
              };
            }
            return next;
          })()
        : null;
      setUnofficialChartData(nextChartData);
      // Re-derive available (model, sequence) pairs from surviving runs so the
      // model/sequence picker doesn't still offer combos that only existed in
      // the dismissed run.
      setAvailableModelsAndSequences(parseAvailableModelsAndSequences(nextChartData));

      setUnofficialEvalRows((prev) =>
        prev ? prev.filter((row) => !belongsToDismissed(row.run_url)) : prev,
      );
    },
    [unofficialRunInfos, unofficialChartData],
  );

  // Build a url → index lookup. Keyed by the full run.url AND by the numeric id
  // as a string, since `updateRepoUrl` can rewrite hosts/orgs between the
  // overlay rendering path and the run metadata.
  const runIndexByUrl = useMemo(() => {
    const map: Record<string, number> = {};
    unofficialRunInfos.forEach((info, idx) => {
      if (info.url) map[info.url] = idx;
      if (info.id !== undefined && info.id !== null) map[String(info.id)] = idx;
    });
    return map;
  }, [unofficialRunInfos]);

  const getOverlayData = useCallback(
    (model: Model, sequence: Sequence, chartType: 'e2e' | 'interactivity') => {
      if (!unofficialChartData) return null;
      const dataKey = `${model}_${sequence}`;
      const chartGroup = unofficialChartData[dataKey];
      if (!chartGroup) return null;
      const dataForChart = chartType === 'e2e' ? chartGroup.e2e : chartGroup.interactivity;
      return { data: dataForChart.data, hardwareConfig: dataForChart.gpus };
    },
    [unofficialChartData],
  );

  useEffect(() => {
    const load = () => {
      const params = new URLSearchParams(window.location.search);
      let unofficialRunIdParam: string | undefined;
      for (const [key, value] of params) {
        if (UNOFFICIAL_RUN_PARAM_RE.test(key) && value) {
          unofficialRunIdParam = value;
          break;
        }
      }
      if (!unofficialRunIdParam) {
        setUnofficialRunInfos([]);
        setUnofficialChartData(null);
        setUnofficialEvalRows(null);
        setError(null);
        setAvailableModelsAndSequences([]);
        return;
      }

      setLoading(true);
      setError(null);

      // Pass the raw param value through — it may be a single id or a comma-separated list.
      // encodeURIComponent preserves commas while escaping any accidental whitespace/symbols.
      fetch(`/api/unofficial-run?runId=${encodeURIComponent(unofficialRunIdParam)}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to fetch unofficial run');

          setUnofficialRunInfos(Array.isArray(data.runInfos) ? data.runInfos : []);
          const chartData = buildChartData(data.benchmarks ?? []);
          setUnofficialChartData(chartData);
          setUnofficialEvalRows(data.evaluations ?? []);
          setAvailableModelsAndSequences(parseAvailableModelsAndSequences(chartData));
        })
        .catch((caughtError) => {
          setError(caughtError instanceof Error ? caughtError.message : 'Unknown error');
          setUnofficialRunInfos([]);
          setUnofficialChartData(null);
          setUnofficialEvalRows(null);
          setAvailableModelsAndSequences([]);
        })
        .finally(() => setLoading(false));
    };

    load();
    window.addEventListener('popstate', load);
    return () => window.removeEventListener('popstate', load);
  }, []);

  const contextValue = useMemo<UnofficialRunContextType>(
    () => ({
      isUnofficialRun: unofficialRunInfos.length > 0,
      unofficialRunInfo,
      unofficialRunInfos,
      runIndexByUrl,
      unofficialChartData,
      unofficialEvalRows,
      loading,
      error,
      clearUnofficialRun,
      dismissRun,
      availableModelsAndSequences,
      getOverlayData,
      activeOverlayHwTypes,
      setActiveOverlayHwTypes: setActiveOverlayHwTypesStable,
      allOverlayHwTypes,
      toggleOverlayHwType,
      resetOverlayHwTypes,
      localOfficialOverride,
      setLocalOfficialOverride,
    }),
    [
      unofficialRunInfo,
      unofficialRunInfos,
      runIndexByUrl,
      unofficialChartData,
      unofficialEvalRows,
      loading,
      error,
      clearUnofficialRun,
      dismissRun,
      availableModelsAndSequences,
      getOverlayData,
      activeOverlayHwTypes,
      setActiveOverlayHwTypesStable,
      allOverlayHwTypes,
      toggleOverlayHwType,
      resetOverlayHwTypes,
      localOfficialOverride,
      setLocalOfficialOverride,
    ],
  );

  return (
    <UnofficialRunContext.Provider value={contextValue}>
      {unofficialRunInfos.length > 0 && (
        <UnofficialBanner
          runs={unofficialRunInfos}
          onDismissRun={dismissRun}
          onDismissAll={clearUnofficialRun}
        />
      )}
      {children}
    </UnofficialRunContext.Provider>
  );
}
