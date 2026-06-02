'use client';

import { useCallback, useState } from 'react';

import { TABLEAU_10 } from '@/lib/constants';
import { getDisplayLabel } from '@/lib/utils';

import type { HardwareConfig, InferenceData, TrackedConfig } from '@/components/inference/types';

/**
 * Tracked-config selection state for the inference chart (up to 6 pinned
 * configs). Extracted verbatim from InferenceProvider. The setter is returned so
 * the provider's selector-deps render block can still clear tracked configs when
 * the top-level selectors change.
 */
export function useTrackedConfigs(hardwareConfig: HardwareConfig) {
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

  return {
    trackedConfigs,
    setTrackedConfigs,
    addTrackedConfig,
    removeTrackedConfig,
    clearTrackedConfigs,
  };
}
