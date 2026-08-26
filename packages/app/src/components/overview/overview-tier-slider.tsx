'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import {
  OVERVIEW_TIERS,
  type OverviewComparisonMode,
  type OverviewEngineScope,
  type OverviewHardwareRowScope,
  type OverviewModelScope,
  type OverviewReferenceHardware,
  type OverviewRowScope,
  type OverviewTier,
} from '@/lib/overview-data';
import { overviewTierHref } from '@/lib/overview-links';

import { useOverviewNavigation, useOverviewNavigationError } from './overview-navigation';

interface OverviewTierSliderProps {
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
  comparisonMode: OverviewComparisonMode;
  referenceHardware: OverviewReferenceHardware;
  modelScope: OverviewModelScope;
  rowScope: OverviewRowScope;
  hardwareRowScope: OverviewHardwareRowScope;
  locale: 'en' | 'zh';
  label: string;
  unit: string;
}

function tierIndex(tier: OverviewTier): number {
  return OVERVIEW_TIERS.indexOf(tier);
}

export function OverviewTierSlider({
  tier,
  engineScope,
  comparisonMode,
  referenceHardware,
  modelScope,
  rowScope,
  hardwareRowScope,
  locale,
  label,
  unit,
}: OverviewTierSliderProps) {
  const navigation = useOverviewNavigation();
  const navigationError = useOverviewNavigationError();
  const pointerActive = useRef(false);
  const committedIndex = useRef(tierIndex(tier));
  const [selectedIndex, setSelectedIndex] = useState(() => tierIndex(tier));

  useEffect(() => {
    const index = tierIndex(tier);
    committedIndex.current = index;
    // A payload settling mid-drag must not yank the thumb away from the stop
    // the pointer is choosing; the gesture's own pointerup/cancel settles it.
    if (!pointerActive.current) setSelectedIndex(index);
  }, [tier]);

  useEffect(() => {
    // A failed load leaves the settled tier behind while the thumb and URL
    // stay on the unsuccessful stop. Re-open the guard so activating that
    // same stop again retries the navigation instead of returning early.
    if (navigationError) committedIndex.current = tierIndex(tier);
  }, [navigationError, tier]);

  const selectedTier = OVERVIEW_TIERS[selectedIndex];
  const progress = (selectedIndex / (OVERVIEW_TIERS.length - 1)) * 100;

  const commit = (index: number) => {
    const nextTier = OVERVIEW_TIERS[index];
    if (index === committedIndex.current) return;
    committedIndex.current = index;

    track('overview_selector_changed', {
      control: 'tier',
      value: String(nextTier),
    });
    navigation.push(
      overviewTierHref(
        locale,
        nextTier,
        engineScope,
        comparisonMode,
        referenceHardware,
        modelScope,
        rowScope,
        hardwareRowScope,
      ),
      ['tier'],
    );
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextIndex = Number(event.currentTarget.value);
    setSelectedIndex(nextIndex);
    if (!pointerActive.current) commit(nextIndex);
  };

  return (
    <nav
      data-testid="overview-tier-switcher"
      aria-label={label}
      className="flex min-w-0 items-center gap-3 text-xs"
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="w-[min(18rem,calc(100vw-8.5rem))] min-w-0 pt-1">
        <div className="relative h-4">
          <input
            data-testid="overview-tier-slider"
            type="range"
            min={0}
            max={OVERVIEW_TIERS.length - 1}
            step={1}
            value={selectedIndex}
            aria-label={label}
            aria-valuetext={`${selectedTier} ${unit}`}
            data-tier={selectedTier}
            onChange={handleChange}
            onPointerDown={() => {
              pointerActive.current = true;
            }}
            onPointerUp={(event) => {
              pointerActive.current = false;
              commit(Number(event.currentTarget.value));
            }}
            onPointerCancel={() => {
              pointerActive.current = false;
              setSelectedIndex(tierIndex(tier));
            }}
            className="absolute top-1/2 z-10 h-1.5 w-full -translate-y-1/2 cursor-pointer appearance-none rounded-full bg-border accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-foreground [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:active:cursor-grabbing [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:active:cursor-grabbing"
            style={{
              background: `linear-gradient(to right, var(--foreground) 0%, var(--foreground) ${progress}%, var(--border) ${progress}%, var(--border) 100%)`,
            }}
          />
          <div
            data-testid="overview-tier-ridges"
            className="pointer-events-none absolute inset-0 z-20"
            aria-hidden="true"
          >
            {OVERVIEW_TIERS.map((option, index) => {
              const state =
                index === selectedIndex
                  ? 'selected'
                  : index < selectedIndex
                    ? 'filled'
                    : 'unfilled';
              return (
                <span
                  key={option}
                  data-testid="overview-tier-ridge"
                  data-tier-ridge={option}
                  data-state={state}
                  className={`absolute top-1/2 h-2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    state === 'selected'
                      ? 'opacity-0'
                      : state === 'filled'
                        ? 'bg-background/70'
                        : 'bg-foreground/35'
                  }`}
                  style={{ left: `${(index / (OVERVIEW_TIERS.length - 1)) * 100}%` }}
                />
              );
            })}
          </div>
        </div>
        <div className="relative mt-1 h-4 tabular-nums" aria-hidden="true">
          {OVERVIEW_TIERS.map((option, index) => (
            <span
              key={option}
              data-tier-option={option}
              data-selected={option === selectedTier ? 'true' : undefined}
              className={`absolute -translate-x-1/2 ${
                option === selectedTier ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
              style={{ left: `${(index / (OVERVIEW_TIERS.length - 1)) * 100}%` }}
            >
              {option}
            </span>
          ))}
        </div>
      </div>
      <span className="shrink-0 text-muted-foreground">{unit}</span>
    </nav>
  );
}
