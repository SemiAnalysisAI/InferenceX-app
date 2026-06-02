'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';

export interface CalculatorSelections {
  visibleHwKeys: Set<string>;
  selectedBars: Set<string>;
  setSelectedBars: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleGpuVisibility: (hwKey: string) => void;
  removeGpu: (hwKey: string) => void;
  handleResetGpus: () => void;
  handleBarSelect: (resultKey: string) => void;
}

/**
 * Owns the calculator's GPU-visibility and bar-selection state, plus the effect
 * that resets visible GPUs when the available set changes. The caller still
 * clears bar selection on results change (it needs `results`, which depends on
 * `visibleHwKeys` from here). Extracted from ThroughputCalculatorDisplay
 * unchanged.
 */
export function useCalculatorSelections(availableHwKeys: string[]): CalculatorSelections {
  const [visibleHwKeys, setVisibleHwKeys] = useState<Set<string>>(new Set());
  const [selectedBars, setSelectedBars] = useState<Set<string>>(new Set());

  // Track previous available keys to detect when the GPU set changes
  const prevAvailableKeyRef = useRef<string>('');

  // Reset visible GPUs when the available set changes (model/sequence/precision change or customer filter toggle)
  useEffect(() => {
    if (availableHwKeys.length === 0) return;
    const key = [...availableHwKeys].toSorted().join(',');
    if (key !== prevAvailableKeyRef.current) {
      prevAvailableKeyRef.current = key;
      setVisibleHwKeys(new Set(availableHwKeys));
    }
  }, [availableHwKeys]);

  const toggleGpuVisibility = useCallback(
    (hwKey: string) => {
      setVisibleHwKeys((prev) => {
        const allVisible = prev.size === availableHwKeys.length;
        const isVisible = prev.has(hwKey);

        if (isVisible) {
          if (allVisible) {
            // If all visible and clicking one, solo it
            return new Set([hwKey]);
          } else if (prev.size === 1) {
            // If only one visible and clicking it, show all
            return new Set(availableHwKeys);
          }
          // Remove it
          const next = new Set(prev);
          next.delete(hwKey);
          return next;
        }
        // Add it
        const next = new Set([...prev, hwKey]);
        return next;
      });
      track('calculator_gpu_toggled', { gpu: hwKey });
    },
    [availableHwKeys],
  );

  const removeGpu = useCallback((hwKey: string) => {
    setVisibleHwKeys((prev) => {
      const next = new Set(prev);
      next.delete(hwKey);
      return next;
    });
  }, []);

  const handleResetGpus = useCallback(() => {
    setVisibleHwKeys(new Set(availableHwKeys));
    track('calculator_gpu_reset', { gpuCount: availableHwKeys.length });
  }, [availableHwKeys]);

  // Handle bar selection: click to toggle (uses resultKey for unique identification)
  const handleBarSelect = useCallback((resultKey: string) => {
    setSelectedBars((prev) => {
      const next = new Set(prev);
      if (next.has(resultKey)) {
        next.delete(resultKey);
        track('calculator_bar_deselected', { resultKey });
      } else {
        next.add(resultKey);
        track('calculator_bar_selected', { resultKey, totalSelected: next.size });
      }
      return next;
    });
  }, []);

  return {
    visibleHwKeys,
    selectedBars,
    setSelectedBars,
    toggleGpuVisibility,
    removeGpu,
    handleResetGpus,
    handleBarSelect,
  };
}
