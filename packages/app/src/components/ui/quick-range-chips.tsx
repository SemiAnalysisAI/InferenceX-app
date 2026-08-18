'use client';

import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';
import {
  buildQuickRangePresets,
  matchActivePreset,
  type QuickRangePreset,
} from '@/lib/quick-range-presets';
import { cn } from '@/lib/utils';

export type QuickRangeChipsSource = 'inline' | 'dialog';

interface QuickRangeChipsProps {
  availableDates: string[];
  currentRange: { startDate: string; endDate: string };
  onApply: (range: { startDate: string; endDate: string }) => void;
  /**
   * Where the chips are rendered, used in analytics events so we can tell whether
   * the inline (low-friction) or in-dialog placement is the one users actually click.
   */
  source: QuickRangeChipsSource;
  /** Optional inject point for testing — defaults to `new Date()` at call time. */
  today?: Date;
  className?: string;
}

export function QuickRangeChips({
  availableDates,
  currentRange,
  onApply,
  source,
  today,
  className,
}: QuickRangeChipsProps) {
  // Hide the affordance entirely when there's not enough data — a single chip with
  // five disabled options would be more confusing than absence.
  if (availableDates.length < 2) return null;

  const presets = buildQuickRangePresets(today);
  const activeId = matchActivePreset(currentRange, availableDates, today);

  return (
    <div
      className={cn('flex flex-wrap gap-1.5', className)}
      data-testid="quick-range-chips"
      role="group"
      aria-label="Quick date range"
    >
      {presets.map((preset) => (
        <Chip
          key={preset.id}
          preset={preset}
          availableDates={availableDates}
          isActive={activeId === preset.id}
          onSelect={(range) => {
            track('inference_quick_range_selected', {
              id: preset.id,
              source,
              startDate: range.startDate,
              endDate: range.endDate,
            });
            onApply(range);
          }}
        />
      ))}
    </div>
  );
}

interface ChipProps {
  preset: QuickRangePreset;
  availableDates: string[];
  isActive: boolean;
  onSelect: (range: { startDate: string; endDate: string }) => void;
}

function Chip({ preset, availableDates, isActive, onSelect }: ChipProps) {
  const range = preset.getRange(availableDates);
  const disabled = range === null;

  const button = (
    <Button
      type="button"
      size="sm"
      variant={isActive ? 'default' : 'outline'}
      disabled={disabled}
      onClick={() => range && onSelect(range)}
      data-testid={`quick-range-chip-${preset.id}`}
      data-active={isActive ? 'true' : 'false'}
      aria-pressed={isActive}
      className="h-7 px-2.5 text-xs"
    >
      {preset.label}
    </Button>
  );

  if (!disabled) return button;

  // Tell the user *why* it's disabled — discoverability beats cleanliness for newcomers
  // who haven't yet understood the data model.
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>
        {/* span wrapper so the tooltip still triggers on the disabled button */}
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>Not enough data points in this window</TooltipContent>
    </TooltipRoot>
  );
}
