'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import {
  OVERVIEW_TIERS,
  type OverviewComparisonMode,
  type OverviewEngineScope,
  type OverviewHardwareRowScope,
  type OverviewModelScope,
  type OverviewReferenceHardware,
  type OverviewRowScope,
  type OverviewTier,
} from '@/lib/overview/overview-data';
import { overviewTierHref } from '@/lib/overview/overview-links';
import { rangeProgressStyle } from '@/components/ui/control-styles';
import { Label } from '@/components/ui/label';
import { rangeTickAnchorClass } from '@/components/ui/range-ticks';

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
    if (!pointerActive.current) setSelectedIndex(index);
  }, [tier]);

  useEffect(() => {
    if (navigationError) committedIndex.current = tierIndex(tier);
  }, [navigationError, tier]);

  const selectedTier = OVERVIEW_TIERS[selectedIndex];

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
      className="flex w-full min-w-0 flex-col gap-1.5 text-xs sm:w-72"
    >
      <Label htmlFor="overview-tier-slider">{`${label} (${unit})`}</Label>
      <div className="w-full min-w-0 pt-1">
        <div className="relative h-4">
          <input
            id="overview-tier-slider"
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
            className="range-slider absolute top-1/2 z-10 h-4 w-full -translate-y-1/2"
            style={rangeProgressStyle(selectedIndex, 0, OVERVIEW_TIERS.length - 1)}
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
              className={`absolute ${rangeTickAnchorClass(index, OVERVIEW_TIERS.length)} ${
                option === selectedTier ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
              style={{ left: `${(index / (OVERVIEW_TIERS.length - 1)) * 100}%` }}
            >
              {option}
            </span>
          ))}
        </div>
      </div>
    </nav>
  );
}
