'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { FAVORITE_PRESETS, type FavoritePreset } from '@/components/favorites/favorite-presets';

import type { Model, Sequence } from '@/lib/data-mappings';

/**
 * URL preset loading + timeline-range resolution for the inference chart.
 * Extracted verbatim from InferenceProvider. The shared `presetGuardRef` and
 * `presetHwFilterRef` are owned by the provider and passed in so the
 * preset-clear setters and context value continue to read the same refs.
 *
 * Returns `applyPreset` (exposed indirectly via the URL effect) — the provider
 * no longer needs it directly, but keeping it returned mirrors the original
 * single source of truth and lets tests drive it if needed.
 */
export function useInferencePresetLoading(params: {
  dateRangeAvailableDates: string[];
  presetGuardRef: RefObject<boolean>;
  presetHwFilterRef: RefObject<string[] | null>;
  setSelectedModel: (v: Model) => void;
  setSelectedSequence: (v: Sequence) => void;
  setSelectedPrecisions: (v: string[]) => void;
  setSelectedYAxisMetric: (v: string) => void;
  setSelectedGPUs: (v: string[]) => void;
  setSelectedDates: (v: string[]) => void;
  setSelectedDateRange: (v: { startDate: string; endDate: string }) => void;
  setActivePresetId: (v: string | null) => void;
  setHighContrast: (v: boolean) => void;
  setPendingHwFilter: (v: string[] | null) => void;
}) {
  const {
    dateRangeAvailableDates,
    presetGuardRef,
    presetHwFilterRef,
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisions,
    setSelectedYAxisMetric,
    setSelectedGPUs,
    setSelectedDates,
    setSelectedDateRange,
    setActivePresetId,
    setHighContrast,
    setPendingHwFilter,
  } = params;

  const urlPresetAppliedRef = useRef(false);
  const presetVersionRef = useRef(0);
  const [pendingTimelinePreset, setPendingTimelinePreset] = useState<
    FavoritePreset['config'] | null
  >(null);
  const pendingPresetVersionRef = useRef(0);

  // Once dateRangeAvailableDates resolves for a timeline preset, set the full
  // range. Done during render (not an effect): it converges because applying the
  // range clears pendingTimelinePreset, and avoids the extra stale-UI commit.
  if (pendingTimelinePreset && dateRangeAvailableDates.length > 0) {
    // Apply the range only if this is still the active preset version (a newer
    // applyPreset bumps presetVersionRef); either way the pending flag clears.
    if (pendingPresetVersionRef.current === presetVersionRef.current) {
      const first = dateRangeAvailableDates[0];
      const last = dateRangeAvailableDates.at(-1)!;
      presetGuardRef.current = true;
      setSelectedDateRange({ startDate: first, endDate: last });
      setSelectedDates([]);
      presetGuardRef.current = false;
    }
    setPendingTimelinePreset(null);
  }

  const applyPreset = useCallback(
    (preset: FavoritePreset) => {
      const version = ++presetVersionRef.current;
      const { config } = preset;
      presetGuardRef.current = true;
      setSelectedModel(config.model);
      setSelectedSequence(config.sequence);
      setSelectedPrecisions(config.precisions);
      setSelectedYAxisMetric(config.yAxisMetric);
      setPendingHwFilter(config.hwFilter ?? null);
      presetHwFilterRef.current = config.hwFilter ?? null;
      setActivePresetId(preset.id);
      setHighContrast(true);
      if (config.gpus && config.gpus.length > 0) {
        setSelectedGPUs(config.gpus);
        if (config.useDateRange) {
          setSelectedDateRange({ startDate: '', endDate: '' });
          setSelectedDates([]);
          pendingPresetVersionRef.current = version;
          setPendingTimelinePreset(config);
        } else {
          setSelectedDateRange({ startDate: '', endDate: '' });
          setSelectedDates([]);
        }
      } else {
        setSelectedGPUs([]);
        setSelectedDateRange({ startDate: '', endDate: '' });
        setSelectedDates([]);
      }
      presetGuardRef.current = false;
      track('favorite_preset_applied', {
        preset_id: preset.id,
        preset_title: preset.title,
        category: preset.category,
      });
    },
    [
      setSelectedModel,
      setSelectedSequence,
      setSelectedPrecisions,
      setSelectedYAxisMetric,
      setSelectedGPUs,
      setSelectedDates,
      setSelectedDateRange,
      setActivePresetId,
      setHighContrast,
    ],
  );

  useEffect(() => {
    if (urlPresetAppliedRef.current) return;
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const presetId = sp.get('preset');
    if (!presetId) return;
    const preset = FAVORITE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    urlPresetAppliedRef.current = true;
    sp.delete('preset');
    const search = sp.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    );
    applyPreset(preset);
  }, [applyPreset]);

  return { applyPreset };
}
