'use client';

import { useMemo, useState } from 'react';

import { DISPLAY_MODEL_TO_DB, islOslToSequence } from '@semianalysisai/inferencex-constants';

import { useUrlState } from '@/hooks/useUrlState';
import type { AvailabilityRow } from '@/lib/api';
import { buildAvailabilityHwKey } from '@/lib/chart-utils';
import { getHardwareConfig, getModelSortIndex, isKnownGpu } from '@/lib/constants';
import type { Model, Sequence } from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';

/**
 * GPU / date comparison selection (inference-only, not global) plus the two
 * availability-derived memos that depend on it. Extracted from
 * {@link InferenceProvider}; see docs/state-ownership.md ("GPU comparison state"
 * and the availability cascade).
 *
 * The base setters are returned raw so the context can wrap them with the
 * preset-clearing `*AndClear` variants and reference them from the cross-cluster
 * auto-clear effects (which also touch `userCosts` / the preset guard and thus
 * stay in the context, per the "effect spans two clusters" rule).
 */
export interface GpuComparisonState {
  selectedGPUs: string[];
  setSelectedGPUs: React.Dispatch<React.SetStateAction<string[]>>;
  selectedDates: string[];
  setSelectedDates: React.Dispatch<React.SetStateAction<string[]>>;
  selectedDateRange: { startDate: string; endDate: string };
  setSelectedDateRange: React.Dispatch<
    React.SetStateAction<{ startDate: string; endDate: string }>
  >;
  isCheckingAvailableDates: boolean;
  showDateRangeDialog: boolean;
  setShowDateRangeDialog: React.Dispatch<React.SetStateAction<boolean>>;

  /** DB model keys for `selectedModel` (used by both memos and by the context). */
  dbModelKeys: string[];
  /** GPU configs with data for current model + sequence + precision, sorted. */
  availableGPUs: { value: string; label: string }[];
  /** Dates available for the current filter combo, narrowed by `selectedGPUs`. */
  dateRangeAvailableDates: string[];
}

export function useGpuComparisonState(args: {
  availabilityRows: AvailabilityRow[] | undefined;
  availableDates: string[];
  selectedModel: Model;
  effectiveSequence: Sequence;
  effectivePrecisions: string[];
}): GpuComparisonState {
  const {
    availabilityRows,
    availableDates,
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
  } = args;
  const { getUrlParam } = useUrlState();

  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    const urlDates = getUrlParam('i_dates');
    return urlDates ? urlDates.split(',').filter(Boolean) : [];
  });
  const [selectedDateRange, setSelectedDateRange] = useState<{
    startDate: string;
    endDate: string;
  }>(() => {
    const startDate = getUrlParam('i_dstart') || '';
    const endDate = getUrlParam('i_dend') || '';
    return startDate && endDate ? { startDate, endDate } : { startDate: '', endDate: '' };
  });
  const [isCheckingAvailableDates] = useState(false);
  const [showDateRangeDialog, setShowDateRangeDialog] = useState(false);

  const [selectedGPUs, setSelectedGPUs] = useState<string[]>(() => {
    const urlGpus = getUrlParam('i_gpus');
    return urlGpus ? urlGpus.split(',').filter(Boolean) : [];
  });

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
    const hwKeys = new Set<string>();
    for (const r of availabilityRows) {
      if (!dbModelKeys.includes(r.model)) continue;
      if (islOslToSequence(r.isl, r.osl) !== effectiveSequence) continue;
      if (!effectivePrecisions.includes(r.precision)) continue;
      if (!r.hardware) continue;
      const hwKey = buildAvailabilityHwKey(r.hardware, r.framework, r.spec_method, r.disagg);
      if (isKnownGpu(hwKey)) hwKeys.add(hwKey);
    }
    return [...hwKeys]
      .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
      .map((hw) => ({
        value: hw,
        label: getDisplayLabel(getHardwareConfig(hw, selectedModel)),
      }));
  }, [availabilityRows, dbModelKeys, effectiveSequence, effectivePrecisions, selectedModel]);

  return {
    selectedGPUs,
    setSelectedGPUs,
    selectedDates,
    setSelectedDates,
    selectedDateRange,
    setSelectedDateRange,
    isCheckingAvailableDates,
    showDateRangeDialog,
    setShowDateRangeDialog,
    dbModelKeys,
    availableGPUs,
    dateRangeAvailableDates,
  };
}
