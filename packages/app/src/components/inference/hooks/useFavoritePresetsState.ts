'use client';

import { useCallback, useRef, useState } from 'react';

import type { FavoritePreset } from '@/components/favorites/favorite-presets';

/**
 * State primitives + guard machinery for the favorite-presets flow. Extracted
 * from {@link InferenceProvider}.
 *
 * The `applyPreset` orchestration and the two preset effects (URL `?preset=`
 * loading and the deferred timeline-range resolver) are intentionally kept in
 * the context, not here: they drive setters from *every* other state cluster
 * (model / sequence / precision / y-metric / GPUs / dates / date-range /
 * high-contrast). Splitting them out would only reintroduce the coupling as a
 * long argument list. This hook owns the pieces that are pure preset state:
 *
 * - `pendingHwFilter` — deferred GPU legend filter awaiting `hwTypesWithData`.
 * - `activePresetId` — currently-applied preset (drives the dropdown highlight).
 * - `presetHwFilterRef` — persists the preset's desired hw filter beyond
 *   `pendingHwFilter` consumption; cleared when the user changes filters.
 * - `presetGuardRef` — when true, programmatic filter changes made *during* an
 *   apply don't deactivate the preset. `FavoritePresetsDropdown` also reads it.
 * - preset-version refs used by the timeline resolver to ignore stale async work.
 *
 * `clearPresetOnChange` is stable (memoized on `[]`) so the context can build
 * each `*AndClear` setter with its own `useCallback` and keep a stable identity
 * across renders — the provider value memo depends on those identities.
 */
export interface FavoritePresetsState {
  pendingHwFilter: string[] | null;
  setPendingHwFilter: (filter: string[] | null) => void;
  activePresetId: string | null;
  setActivePresetId: React.Dispatch<React.SetStateAction<string | null>>;
  presetHwFilterRef: React.RefObject<string[] | null>;
  presetGuardRef: React.RefObject<boolean>;

  // Refs coordinating the async URL / timeline preset flows (owned here so the
  // context's applyPreset + effects mutate a single source of truth).
  urlPresetAppliedRef: React.RefObject<boolean>;
  presetVersionRef: React.RefObject<number>;
  pendingPresetVersionRef: React.RefObject<number>;
  pendingTimelinePreset: FavoritePreset['config'] | null;
  setPendingTimelinePreset: React.Dispatch<React.SetStateAction<FavoritePreset['config'] | null>>;

  /**
   * Clears the active preset on a *user-initiated* change. No-ops while the
   * preset guard is set (i.e. during a programmatic apply). Stable identity.
   */
  clearPresetOnChange: () => void;
}

export function useFavoritePresetsState(): FavoritePresetsState {
  const [pendingHwFilter, setPendingHwFilter] = useState<string[] | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  // Persists the preset's desired hw filter beyond pendingHwFilter consumption.
  // Cleared when the user manually changes filters (clearing the preset).
  const presetHwFilterRef = useRef<string[] | null>(null);

  // Ref guard: when true, filter changes don't clear the active preset.
  // FavoritePresetsDropdown sets this while applying a preset so its own
  // programmatic setter calls don't accidentally deactivate it.
  const presetGuardRef = useRef(false);

  const urlPresetAppliedRef = useRef(false);
  const presetVersionRef = useRef(0);
  const pendingPresetVersionRef = useRef(0);
  const [pendingTimelinePreset, setPendingTimelinePreset] = useState<
    FavoritePreset['config'] | null
  >(null);

  const clearPresetOnChange = useCallback(() => {
    if (presetGuardRef.current) return;
    setActivePresetId((prev) => (prev === null ? prev : null));
    presetHwFilterRef.current = null;
  }, []);

  return {
    pendingHwFilter,
    setPendingHwFilter,
    activePresetId,
    setActivePresetId,
    presetHwFilterRef,
    presetGuardRef,
    urlPresetAppliedRef,
    presetVersionRef,
    pendingPresetVersionRef,
    pendingTimelinePreset,
    setPendingTimelinePreset,
    clearPresetOnChange,
  };
}
