'use client';

import {
  type Dispatch,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { track } from '@/lib/analytics/analytics';
import { perfRulerAxisMetricKey } from '@/hooks/usePerfRulerAxisReset';
import {
  EMPTY_PERF_RULER_STATE,
  MAX_PERF_RULERS,
  type PerfRulerMeasurement,
  type PerfRulerState,
  clearPerfRulers,
  parsePerfRulers,
} from '@/lib/d3-chart/layers/perf-ruler';

export const PERSISTED_PERF_RULER_CHART_ID = 'chart-0';

export interface PerfRulerStore {
  chartId: string;
  state: PerfRulerState;
  setState: Dispatch<SetStateAction<PerfRulerState>>;
  pending: readonly PerfRulerMeasurement[] | null;
  commitPending: (
    resolved: readonly PerfRulerMeasurement[],
    remaining: readonly PerfRulerMeasurement[] | null,
  ) => void;
  discardPending: () => void;
}

export function persistedPerfRulerAxisKey(
  graphs: readonly { chartDefinition: { chartType: string; x_scale_field: string } }[],
  xAxisMode: string,
  yAxisMetric: string,
): string | null {
  const wantedType = xAxisMode === 'interactivity' ? 'interactivity' : 'e2e';
  const graph =
    graphs.find((candidate) => candidate.chartDefinition.chartType === wantedType) ?? graphs[0];
  if (!graph) return null;
  return perfRulerAxisMetricKey(`${xAxisMode}:${graph.chartDefinition.x_scale_field}`, yAxisMetric);
}

export const PerfRulerStoreContext = createContext<PerfRulerStore | undefined>(undefined);

export function usePerfRulerStore(): PerfRulerStore | undefined {
  return useContext(PerfRulerStoreContext);
}

export function usePerfRulerStoreValue(
  chartId: string,
  initialSerialized: string | undefined,
  axisMetricKey: string | null,
): PerfRulerStore {
  const [state, setState] = useState<PerfRulerState>(EMPTY_PERF_RULER_STATE);
  const [pending, setPending] = useState<readonly PerfRulerMeasurement[] | null>(() => {
    const parsed = parsePerfRulers(initialSerialized).rulers;
    return parsed.length > 0 ? parsed : null;
  });
  const linkRulerCountRef = useRef(pending?.length ?? 0);
  const sharedLoadReportedRef = useRef(false);

  const [appliedAxisMetricKey, setAppliedAxisMetricKey] = useState(axisMetricKey);
  if (axisMetricKey !== null && axisMetricKey !== appliedAxisMetricKey) {
    setAppliedAxisMetricKey(axisMetricKey);
    if (appliedAxisMetricKey !== null) {
      setState(clearPerfRulers);
      setPending(null);
    }
  }

  const commitPending = useCallback(
    (
      resolved: readonly PerfRulerMeasurement[],
      remaining: readonly PerfRulerMeasurement[] | null,
    ) => {
      if (resolved.length > 0) {
        setState((prev) => {
          const rulers = [
            ...prev.rulers,
            ...resolved.map((ruler, index) => ({ ...ruler, id: prev.nextId + index })),
          ];
          while (rulers.length > MAX_PERF_RULERS) rulers.shift();
          return { rulers, draft: prev.draft, nextId: prev.nextId + resolved.length };
        });
        if (!sharedLoadReportedRef.current) {
          sharedLoadReportedRef.current = true;
          track('interactivity_perf_ruler_shared_load', { count: linkRulerCountRef.current });
        }
      }
      setPending(remaining);
    },
    [],
  );
  const discardPending = useCallback(() => setPending(null), []);

  return useMemo(
    () => ({ chartId, state, setState, pending, commitPending, discardPending }),
    [chartId, state, pending, commitPending, discardPending],
  );
}
