'use client';

import { useCallback, useEffect, useState } from 'react';

import { TABLEAU_10 } from '@/lib/constants';
import type { Model, Sequence } from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';
import type { HardwareConfig, InferenceData, TrackedConfig } from '@/components/inference/types';

/**
 * Up-to-6 pinned data points for the "Performance Over Time" drill-down, plus
 * the auto-clear that fires when the top-level selectors change. Extracted from
 * {@link InferenceProvider}.
 *
 * `hardwareConfig` is passed in (rather than owned here) because it comes from
 * `useChartData`; `addTrackedConfig` reads it to build the display label. The
 * auto-clear effect's trigger values (model / sequence / precisions / y-metric)
 * are passed in so the effect keeps the exact same dependency list — and thus
 * the exact same clearing semantics — as the original context.
 */
export interface TrackedConfigsState {
  trackedConfigs: TrackedConfig[];
  addTrackedConfig: (point: InferenceData, chartType: string) => void;
  removeTrackedConfig: (id: string) => void;
  clearTrackedConfigs: () => void;
}

export function useTrackedConfigsState(args: {
  hardwareConfig: HardwareConfig;
  selectedModel: Model;
  effectiveSequence: Sequence;
  effectivePrecisions: string[];
  selectedYAxisMetric: string;
}): TrackedConfigsState {
  const {
    hardwareConfig,
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
    selectedYAxisMetric,
  } = args;

  const [trackedConfigs, setTrackedConfigs] = useState<TrackedConfig[]>([]);

  const buildTrackedConfigId = useCallback((point: InferenceData): string => {
    let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}`;
    if (point.disagg) {
      key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
    }
    return key;
  }, []);

  const addTrackedConfig = useCallback(
    (point: InferenceData, chartType: string) => {
      setTrackedConfigs((prev) => {
        const id = buildTrackedConfigId(point);
        if (prev.some((c) => c.id === id)) {
          return prev.filter((c) => c.id !== id);
        }
        if (prev.length >= 6) return prev;

        const hwConfig = hardwareConfig[point.hwKey];
        const label = hwConfig
          ? `${getDisplayLabel(hwConfig)} — TP${point.tp} conc=${point.conc} ${point.precision.toUpperCase()}`
          : `${point.hwKey} — TP${point.tp} conc=${point.conc} ${point.precision.toUpperCase()}`;

        const color = TABLEAU_10[prev.length % TABLEAU_10.length];
        return [
          ...prev,
          {
            id,
            hwKey: point.hwKey as string,
            precision: point.precision,
            tp: point.tp,
            conc: point.conc,
            label,
            color,
            chartType,
            disagg: point.disagg,
            num_prefill_gpu: point.num_prefill_gpu,
            num_decode_gpu: point.num_decode_gpu,
          },
        ];
      });
    },
    [buildTrackedConfigId, hardwareConfig],
  );

  const removeTrackedConfig = useCallback((id: string) => {
    setTrackedConfigs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearTrackedConfigs = useCallback(() => {
    setTrackedConfigs([]);
  }, []);

  // Clear tracked configs whenever the top-level selectors change.
  useEffect(() => {
    setTrackedConfigs((prev) => (prev.length > 0 ? [] : prev));
  }, [selectedModel, effectiveSequence, effectivePrecisions, selectedYAxisMetric]);

  return { trackedConfigs, addTrackedConfig, removeTrackedConfig, clearTrackedConfigs };
}
