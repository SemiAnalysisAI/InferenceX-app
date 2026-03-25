'use client';

import { track } from '@/lib/analytics';
import { ChevronDown, Star } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useInference } from '@/components/inference/InferenceContext';
import { Badge } from '@/components/ui/badge';

import { FAVORITE_PRESETS, FavoritePreset } from './favorite-presets';

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
    dateRangeAvailableDates,
    activePresetId,
    setActivePresetId,
    presetGuardRef,
  } = useInference();

  const [isOpen, setIsOpen] = useState(false);

  // Version counter — increments on every preset apply/clear.
  // Async effects capture the version at start and bail if it's stale.
  const versionRef = useRef(0);

  // Pending preset waiting for dateRangeAvailableDates to resolve
  const [pendingTimelinePreset, setPendingTimelinePreset] = useState<
    FavoritePreset['config'] | null
  >(null);
  const pendingVersionRef = useRef(0);

  // Once dateRangeAvailableDates resolves for a timeline preset, set the full range.
  useEffect(() => {
    if (!pendingTimelinePreset || dateRangeAvailableDates.length === 0) return;
    if (pendingVersionRef.current !== versionRef.current) {
      setPendingTimelinePreset(null);
      return;
    }

    const first = dateRangeAvailableDates[0];
    const last = dateRangeAvailableDates[dateRangeAvailableDates.length - 1];

    presetGuardRef.current = true;
    setSelectedDateRange({ startDate: first, endDate: last });
    setSelectedDates([]);
    presetGuardRef.current = false;

    setPendingTimelinePreset(null);
  }, [
    pendingTimelinePreset,
    dateRangeAvailableDates,
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

        if (config.useDateRange) {
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
