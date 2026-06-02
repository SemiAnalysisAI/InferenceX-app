'use client';

import { type Dispatch, type RefObject, type SetStateAction, useCallback } from 'react';

import type { Model, Sequence } from '@/lib/data-mappings';

/**
 * Wraps the inference filter setters so that any user-initiated change clears the
 * active favorite preset (unless guarded mid-apply). Extracted verbatim from
 * InferenceProvider. The shared `presetGuardRef` and `presetHwFilterRef` remain
 * owned by the provider (also read by preset loading + the context value) and are
 * passed in so all consumers read the same refs.
 */
export function usePresetClearSetters(params: {
  setSelectedModel: (v: Model) => void;
  setSelectedSequence: (v: Sequence) => void;
  setSelectedPrecisions: (v: string[]) => void;
  setSelectedYAxisMetric: (v: string) => void;
  setSelectedGPUs: (v: string[]) => void;
  setSelectedDates: (v: string[]) => void;
  setSelectedDateRange: (v: { startDate: string; endDate: string }) => void;
  setActivePresetId: Dispatch<SetStateAction<string | null>>;
  presetGuardRef: RefObject<boolean>;
  presetHwFilterRef: RefObject<string[] | null>;
}) {
  const {
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisions,
    setSelectedYAxisMetric,
    setSelectedGPUs,
    setSelectedDates,
    setSelectedDateRange,
    setActivePresetId,
    presetGuardRef,
    presetHwFilterRef,
  } = params;

  const clearPresetOnChange = useCallback(() => {
    if (presetGuardRef.current) return;
    setActivePresetId((prev) => (prev === null ? prev : null));
    presetHwFilterRef.current = null;
  }, []);
  const setSelectedModelAndClear = useCallback(
    (v: Model) => {
      setSelectedModel(v);
      clearPresetOnChange();
    },
    [setSelectedModel, clearPresetOnChange],
  );
  const setSelectedSequenceAndClear = useCallback(
    (v: Sequence) => {
      setSelectedSequence(v);
      clearPresetOnChange();
    },
    [setSelectedSequence, clearPresetOnChange],
  );
  const setSelectedPrecisionsAndClear = useCallback(
    (v: string[]) => {
      setSelectedPrecisions(v);
      clearPresetOnChange();
    },
    [setSelectedPrecisions, clearPresetOnChange],
  );
  const setSelectedYAxisMetricAndClear = useCallback(
    (v: string) => {
      setSelectedYAxisMetric(v);
      clearPresetOnChange();
    },
    [setSelectedYAxisMetric, clearPresetOnChange],
  );
  const setSelectedGPUsAndClear = useCallback(
    (v: string[]) => {
      setSelectedGPUs(v);
      clearPresetOnChange();
    },
    [setSelectedGPUs, clearPresetOnChange],
  );
  const setSelectedDatesAndClear = useCallback(
    (v: string[]) => {
      setSelectedDates(v);
      clearPresetOnChange();
    },
    [setSelectedDates, clearPresetOnChange],
  );
  const setSelectedDateRangeAndClear = useCallback(
    (v: { startDate: string; endDate: string }) => {
      setSelectedDateRange(v);
      clearPresetOnChange();
    },
    [setSelectedDateRange, clearPresetOnChange],
  );

  return {
    setSelectedModelAndClear,
    setSelectedSequenceAndClear,
    setSelectedPrecisionsAndClear,
    setSelectedYAxisMetricAndClear,
    setSelectedGPUsAndClear,
    setSelectedDatesAndClear,
    setSelectedDateRangeAndClear,
  };
}
