'use client';

import { useMemo } from 'react';

import { filterRunsByModel } from '@/lib/utils';
import type { GlobalFilterContextType } from '@/components/GlobalFilterContext';

type AvailableRuns = GlobalFilterContextType['availableRuns'];

/**
 * Filters the global available runs down to the selected model + precisions and
 * resolves the effective selected run id (latest filtered run when the current
 * selection is not present). Extracted verbatim from InferenceProvider.
 *
 * NOTE: We intentionally do NOT sync effectiveSelectedRunId back to
 * GlobalFilterContext (setSelectedRunId). That would cause a full tree re-render
 * on every precision change because filteredAvailableRuns depends on
 * effectivePrecisions. Instead, InferenceContext exposes effectiveSelectedRunId
 * directly.
 */
export function useFilteredRuns(params: {
  availableRuns: AvailableRuns;
  modelPrefixes: string[];
  effectivePrecisions: string[];
  selectedRunId: string;
}) {
  const { availableRuns, modelPrefixes, effectivePrecisions, selectedRunId } = params;

  const filteredAvailableRuns = useMemo(
    () => filterRunsByModel(availableRuns, modelPrefixes, [...effectivePrecisions]),
    [availableRuns, modelPrefixes, effectivePrecisions],
  );

  const effectiveSelectedRunId = useMemo(() => {
    if (!filteredAvailableRuns) return selectedRunId;
    const filteredRunIds = Object.keys(filteredAvailableRuns);
    if (filteredRunIds.length === 0 || filteredRunIds.includes(selectedRunId)) return selectedRunId;
    return filteredRunIds.reduce((max, id) => (id > max ? id : max), filteredRunIds[0]);
  }, [filteredAvailableRuns, selectedRunId]);

  return { filteredAvailableRuns, effectiveSelectedRunId };
}
