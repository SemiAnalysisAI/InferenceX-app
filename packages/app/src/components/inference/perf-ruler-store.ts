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

import { track } from '@/lib/analytics';
import { perfRulerAxisMetricKey } from '@/hooks/usePerfRulerAxisReset';
import {
  EMPTY_PERF_RULER_STATE,
  MAX_PERF_RULERS,
  type PerfRulerMeasurement,
  type PerfRulerState,
  clearPerfRulers,
  parsePerfRulers,
} from '@/lib/d3-chart/layers/perf-ruler';

/**
 * @file perf-ruler-store.ts
 * @description Provider-owned Perf Ruler state for the primary inference
 * chart, so completed rulers persist in share links (`i_rulers`). Lives
 * beside `InferenceContext` rather than inside it so `ScatterGraph` can
 * consume the store without importing the (heavily mocked) provider module.
 */

/**
 * The chart instance whose Perf Rulers persist in share links. `ChartDisplay`
 * mounts the primary chart as `chart-${graphIndex}` and only graph 0 is ever
 * visible; the replay chart (`replay-chart-0`) draws interpolated frames of
 * the same curves and must NOT bind, or every ruler would render twice and
 * the replay's prune pass could delete rulers the main chart still shows.
 */
export const PERSISTED_PERF_RULER_CHART_ID = 'chart-0';

/**
 * Perf-ruler store for the persisted chart. Lives in its own context rather
 * than the Display domain so a ruler commit does not rerender every display
 * consumer, and so harnesses that mount `InferenceContextsProvider` with
 * static mock values (no store) keep the chart's component-local fallback.
 *
 * `state` holds COMMITTED rulers: the D3 layer renders them and `i_rulers`
 * serializes them. `pending` holds rulers parsed from the share link whose
 * curves may not have been drawn yet — data, `i_gpus`, comparison dates,
 * and `?unofficialrun=` overlays all arrive after the chart's first draw,
 * and the chart prunes any committed ruler whose curve path is absent from
 * the DOM. The chart therefore commits a pending ruler only once BOTH of
 * its curve paths exist (see the perf-ruler decoration effect in
 * ScatterGraph); rulers whose curves never appear stay pending, invisible
 * and unserialized, until an axis change or an explicit clear discards them.
 */
export interface PerfRulerStore {
  chartId: string;
  state: PerfRulerState;
  setState: Dispatch<SetStateAction<PerfRulerState>>;
  pending: readonly PerfRulerMeasurement[] | null;
  /**
   * Commit share-link rulers whose curves now exist (`resolved`, iso-x
   * already clamped to the pair's overlap) and keep `remaining` pending.
   */
  commitPending: (
    resolved: readonly PerfRulerMeasurement[],
    remaining: readonly PerfRulerMeasurement[] | null,
  ) => void;
  /** Drop share-link rulers that were never committed (toggle-off, clear). */
  discardPending: () => void;
}

/**
 * Axis identity of the chart `ChartDisplay` renders as `chart-0`, for the
 * store's axis reset. `graphs` is always `[interactivity, e2e]`, but
 * ChartDisplay shows the e2e graph for every non-interactivity x mode
 * (`visibleGraphs`), so the rendered chart — not `graphs[0]` — is what the
 * rulers were placed on. The x mode itself is part of the identity as well:
 * the derived agentic modes (e2e-normalized interactivity, …) override the
 * e2e graph's `x_scale_field` inside ChartDisplay only, so here the same
 * definition still reads `<pctl>_e2el` for those modes. Percentile changes
 * are already encoded in `x_scale_field`. Null while no graph exists.
 */
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

/** Provided by `InferenceProvider`; exported for chart component tests. */
export const PerfRulerStoreContext = createContext<PerfRulerStore | undefined>(undefined);

/** The persisted-ruler store, or undefined outside `InferenceProvider`. */
export function usePerfRulerStore(): PerfRulerStore | undefined {
  return useContext(PerfRulerStoreContext);
}

/**
 * Owns the persisted perf-ruler state. Exported so component tests can host a
 * real store around a chart without the full provider.
 *
 * `axisMetricKey` is the persisted chart's axis identity
 * ({@link persistedPerfRulerAxisKey}), or null while no chart definition exists.
 * The axis reset runs HERE, not through `usePerfRulerAxisReset` in the chart:
 * that hook adjusts state during the chart's render, which is only legal for
 * the chart's own state — updating a provider's state from a child's render
 * is a React error. Same semantics: a change of either axis metric clears
 * committed rulers (redrawn curves would give a ratio nobody placed) and
 * discards pending ones (they were placed on the old axes). The null → key
 * transition on first data is not a change, so share-link rulers survive
 * the load; the x-mode fallback for fixed sequences also settles before any
 * chart definition exists.
 */
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
  // `interactivity_perf_ruler_shared_load` fires once per store — once per
  // opened link — with the number of rulers the link carried, the first time
  // any of them renders. Rulers commit per curve arrival (below), so a
  // per-commit event would count one link several times with partial counts.
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
          // Fresh ids from the live counter: a ruler placed by hand before the
          // share-link rulers resolved must keep its own join key.
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
