'use client';

import { track } from '@/lib/analytics';
import { ChevronDown, Star } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { useInference } from '@/components/inference/InferenceContext';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { Badge } from '@/components/ui/badge';

import {
  FAVORITE_PRESETS,
  FavoritePreset,
  findClosestDate,
  findConfigChangeDates,
  subtractMonths,
} from './favorite-presets';

export default function FavoritePresetsDropdown() {
  const {
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisions,
    setSelectedYAxisMetric,
    setSelectedGPUs,
    setSelectedDates,
    setSelectedDateRange,
    setHwFilter,
    selectAllHwTypes,
    availableDates,
    activePresetId,
    setActivePresetId,
    presetGuardRef,
  } = useInference();

  const [isOpen, setIsOpen] = useState(false);

  // Version counter — increments on every preset apply/clear.
  // Async effects capture the version at start and bail if it's stale.
  const versionRef = useRef(0);

  // Pending preset waiting for history data to resolve config change dates
  const [pendingTimelinePreset, setPendingTimelinePreset] = useState<
    FavoritePreset['config'] | null
  >(null);
  const pendingVersionRef = useRef(0);

  // Fetch history data when a timeline preset is pending
  const historyIslOsl = useMemo(
    () => (pendingTimelinePreset ? sequenceToIslOsl(pendingTimelinePreset.sequence) : null),
    [pendingTimelinePreset],
  );
  const { data: historyRows } = useBenchmarkHistory(
    pendingTimelinePreset?.model ?? '',
    historyIslOsl?.isl ?? 0,
    historyIslOsl?.osl ?? 0,
  );

  // Once history data arrives, compute config change dates and apply.
  // Guard prevents the wrapped setters from clearing the active preset.
  useEffect(() => {
    if (!pendingTimelinePreset || !historyRows || !availableDates.length) return;
    // Bail if a newer preset was applied while we were waiting
    if (pendingVersionRef.current !== versionRef.current) {
      setPendingTimelinePreset(null);
      return;
    }

    const months = pendingTimelinePreset.dateRangeMonths ?? 2;
    const latestDate = availableDates[availableDates.length - 1];
    const targetStart = subtractMonths(latestDate, months);
    const startDate = findClosestDate(availableDates, targetStart);

    const changeDates = findConfigChangeDates(
      historyRows,
      pendingTimelinePreset.gpus ?? [],
      pendingTimelinePreset.precisions,
      startDate,
      latestDate,
    );

    presetGuardRef.current = true;
    if (changeDates.length >= 2) {
      const first = changeDates[0];
      const last = changeDates[changeDates.length - 1];
      const intermediary = changeDates.slice(1, -1);
      setSelectedDateRange({ startDate: first, endDate: last });
      setSelectedDates(intermediary);
    } else if (changeDates.length === 1) {
      setSelectedDateRange({ startDate: changeDates[0], endDate: latestDate });
      setSelectedDates([]);
    } else {
      setSelectedDateRange({ startDate, endDate: latestDate });
      setSelectedDates([]);
    }
    presetGuardRef.current = false;

    setPendingTimelinePreset(null);
  }, [
    pendingTimelinePreset,
    historyRows,
    availableDates,
    setSelectedDateRange,
    setSelectedDates,
    presetGuardRef,
  ]);

  const applyPreset = useCallback(
    (preset: FavoritePreset) => {
      const version = ++versionRef.current;
      const { config } = preset;

      presetGuardRef.current = true;
      setSelectedModel(config.model);
      setSelectedSequence(config.sequence);
      setSelectedPrecisions(config.precisions);
      setSelectedYAxisMetric(config.yAxisMetric);
      setHwFilter(config.hwFilter ?? null);
      setActivePresetId(preset.id);

      if (config.gpus && config.gpus.length > 0) {
        setSelectedGPUs(config.gpus);

        if (config.useDateRange && config.dateRangeMonths) {
          setSelectedDateRange({ startDate: '', endDate: '' });
          setSelectedDates([]);
          pendingVersionRef.current = version;
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
      setHwFilter,
      setActivePresetId,
      presetGuardRef,
    ],
  );

  const clearPreset = useCallback(() => {
    ++versionRef.current;
    setActivePresetId(null);
    setSelectedGPUs([]);
    setSelectedDateRange({ startDate: '', endDate: '' });
    setSelectedDates([]);
    setHwFilter(null);
    selectAllHwTypes();
    setPendingTimelinePreset(null);

    track('favorite_preset_cleared');
  }, [
    setActivePresetId,
    setSelectedGPUs,
    setSelectedDateRange,
    setSelectedDates,
    setHwFilter,
    selectAllHwTypes,
  ]);

  const handlePresetClick = useCallback(
    (preset: FavoritePreset) => {
      if (activePresetId === preset.id) {
        clearPreset();
      } else {
        applyPreset(preset);
      }
    },
    [activePresetId, applyPreset, clearPreset],
  );

  // Auto-apply preset from URL param (e.g., /inference?g_preset=gb200-vs-b200)
  const searchParams = useSearchParams();
  const urlPresetAppliedRef = useRef(false);
  useEffect(() => {
    if (urlPresetAppliedRef.current) return;
    const presetId = searchParams.get('g_preset');
    if (!presetId) return;
    const preset = FAVORITE_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      urlPresetAppliedRef.current = true;
      applyPreset(preset);
      track('preset_applied_from_url', { preset_id: presetId });
      // Strip g_preset from URL to keep it clean
      const url = new URL(window.location.href);
      url.searchParams.delete('g_preset');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, [searchParams, applyPreset]);

  const activePreset = activePresetId
    ? FAVORITE_PRESETS.find((p) => p.id === activePresetId)
    : null;

  return (
    <div className="w-full" data-testid="favorites-dropdown">
      <button
        type="button"
        data-testid="favorites-toggle"
        onClick={() => {
          setIsOpen((prev) => !prev);
          track('favorites_dropdown_toggled', { open: !isOpen });
        }}
        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2">
          <Star
            className={`h-4 w-4 ${activePreset ? 'fill-primary text-primary' : 'text-muted-foreground'}`}
          />
          <span className={activePreset ? 'font-medium' : 'text-muted-foreground'}>
            {activePreset ? activePreset.title : 'Favorites'}
          </span>
          {activePreset && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Active
            </Badge>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="pt-2" data-testid="favorites-panel">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {FAVORITE_PRESETS.map((preset) => {
              const isActive = activePresetId === preset.id;
              const isGreyed = activePresetId !== null && !isActive;

              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`favorite-preset-${preset.id}`}
                  onClick={() => handlePresetClick(preset)}
                  className={`text-left rounded-md border px-3 py-2.5 transition-all duration-200 ${
                    isActive
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                      : isGreyed
                        ? 'border-border/50 opacity-50 hover:opacity-80 hover:bg-accent/50'
                        : 'border-border hover:bg-accent hover:border-primary/30'
                  }`}
                >
                  <p className="font-medium text-xs leading-tight mb-1">{preset.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {preset.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {preset.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[9px] px-1 py-0 leading-tight"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
