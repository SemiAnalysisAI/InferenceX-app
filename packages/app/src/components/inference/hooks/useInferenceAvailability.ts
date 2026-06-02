'use client';

import { useMemo } from 'react';

import { DISPLAY_MODEL_TO_DB, islOslToSequence } from '@semianalysisai/inferencex-constants';

import { buildAvailabilityHwKey } from '@/lib/chart-utils';
import { getHardwareConfig, getModelSortIndex, isKnownGpu } from '@/lib/constants';
import { getDisplayLabel } from '@/lib/utils';
import type { AvailabilityRow } from '@/lib/api';

/**
 * Pure availability derivations for the inference chart: the DB model keys for
 * the selected display model, the date-range picker's available dates, and the
 * GPU dropdown options. Extracted verbatim from InferenceProvider with identical
 * memo dependency arrays.
 */
export function useInferenceAvailability(params: {
  selectedModel: string;
  effectiveSequence: string;
  effectivePrecisions: string[];
  selectedGPUs: string[];
  availabilityRows: AvailabilityRow[] | undefined;
  availableDates: string[];
}) {
  const {
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
    selectedGPUs,
    availabilityRows,
    availableDates,
  } = params;

  // For GPU comparison date picker — use shared availability data from global filters
  const dbModelKeys = useMemo<string[]>(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );

  const dateRangeAvailableDates = useMemo(() => {
    if (selectedGPUs.length === 0) return availableDates;
    if (!availabilityRows) return availableDates;
    const rows = availabilityRows.filter((r) => {
      if (!dbModelKeys.includes(r.model)) return false;
      if (islOslToSequence(r.isl, r.osl) !== effectiveSequence) return false;
      if (!effectivePrecisions.includes(r.precision)) return false;
      if (!r.hardware) return false;
      const hwKey = buildAvailabilityHwKey(r.hardware, r.framework, r.spec_method, r.disagg);
      return selectedGPUs.includes(hwKey);
    });
    const dates = [...new Set(rows.map((r) => r.date))].toSorted();
    return dates.length > 0 ? dates : availableDates;
  }, [
    availabilityRows,
    dbModelKeys,
    effectiveSequence,
    effectivePrecisions,
    selectedGPUs,
    availableDates,
  ]);

  // GPU dropdown: only show configs that have data for current model + sequence + precision
  const availableGPUs = useMemo(() => {
    if (!availabilityRows) return [];
    const dbModelKeySet = new Set(dbModelKeys);
    const effectivePrecisionSet = new Set(effectivePrecisions);
    const hwKeys = new Set<string>();
    for (const r of availabilityRows) {
      if (!dbModelKeySet.has(r.model)) continue;
      if (islOslToSequence(r.isl, r.osl) !== effectiveSequence) continue;
      if (!effectivePrecisionSet.has(r.precision)) continue;
      if (!r.hardware) continue;
      const hwKey = buildAvailabilityHwKey(r.hardware, r.framework, r.spec_method, r.disagg);
      if (isKnownGpu(hwKey)) hwKeys.add(hwKey);
    }
    return [...hwKeys]
      .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
      .map((hw) => ({
        value: hw,
        label: getDisplayLabel(getHardwareConfig(hw)),
      }));
  }, [availabilityRows, dbModelKeys, effectiveSequence, effectivePrecisions]);

  return { dbModelKeys, dateRangeAvailableDates, availableGPUs };
}
