'use client';

import { useEffect, useRef } from 'react';

import { track } from '@/lib/analytics';
import type { UrlStateKey } from '@/lib/url-state';

/**
 * Debounced analytics for inference GPU/date selections plus the once-on-mount
 * chart-view event. Extracted verbatim from InferenceProvider — same effect
 * dependency arrays (intentionally narrow), same 3s debounce, same mount guards.
 */
export function useInferenceSelectionTracking(params: {
  activeHwTypes: Set<string>;
  activeDates: Set<string>;
  selectedModel: string;
  effectiveSequence: string;
  activePresetId: string | null;
  selectedYAxisMetric: string;
  getUrlParam: (key: UrlStateKey) => string | undefined;
}) {
  const {
    activeHwTypes,
    activeDates,
    selectedModel,
    effectiveSequence,
    activePresetId,
    selectedYAxisMetric,
    getUrlParam,
  } = params;

  // ── Debounced GPU selection tracking ─────────────────────────────────────
  // Fire after 3s of no changes so we capture the "settled" selection.
  // Skip the first render (initial data load) to avoid noise.

  // Scatter chart — tracks activeHwTypes
  const scatterTrackMounted = useRef(false);
  useEffect(() => {
    if (!scatterTrackMounted.current) {
      scatterTrackMounted.current = true;
      return;
    }
    if (activeHwTypes.size === 0) return;
    const timer = setTimeout(() => {
      const gpus = [...activeHwTypes].toSorted();
      track('inference_gpu_selection_settled', {
        gpus,
        gpu_count: gpus.length,
        model: selectedModel,
        sequence: effectiveSequence,
        preset_id: activePresetId,
        yAxisMetric: selectedYAxisMetric,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeHwTypes]);

  // Interactivity / E2E chart — tracks activeDates (date+gpu pairs)
  const e2eTrackMounted = useRef(false);
  useEffect(() => {
    if (!e2eTrackMounted.current) {
      e2eTrackMounted.current = true;
      return;
    }
    if (activeDates.size === 0) return;
    const timer = setTimeout(() => {
      const pairs = [...activeDates].toSorted();
      track('interactivity_selection_settled', {
        date_gpu_pairs: pairs,
        pair_count: pairs.length,
        gpus: [...new Set(pairs.map((p) => p.split('_').slice(1).join('_')))].toSorted(),
        model: selectedModel,
        sequence: effectiveSequence,
        yAxisMetric: selectedYAxisMetric,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeDates]);

  // Fire once on mount to capture the initial y-axis metric (default or URL-restored)
  useEffect(() => {
    track('inference_chart_view', {
      yAxisMetric: selectedYAxisMetric,
      source: getUrlParam('i_metric') ? 'url' : 'default',
    });
  }, []);
}
