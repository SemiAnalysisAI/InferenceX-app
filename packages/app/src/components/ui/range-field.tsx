import type { ComponentProps } from 'react';

import { CONTROL_HEIGHT, rangeProgressStyle } from '@/components/ui/control-styles';
import { Input } from '@/components/ui/input';
import { RangeTicks } from '@/components/ui/range-ticks';
import { cn } from '@/lib/shared/utils';

export function RangeField({
  label,
  min,
  max,
  value,
  onSliderChange,
  onSliderCommit,
  sliderTestId,
  input,
  compact = false,
  className,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onSliderChange: (value: number) => void;
  onSliderCommit?: () => void;
  sliderTestId?: string;
  input: Omit<ComponentProps<typeof Input>, 'type'> & { 'data-testid'?: string };
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3 sm:gap-4', className)}>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-label={label}
          data-testid={sliderTestId}
          onChange={(event) => onSliderChange(Number(event.target.value))}
          onPointerUp={onSliderCommit}
          className={cn('range-slider block w-full', CONTROL_HEIGHT.default)}
          style={rangeProgressStyle(value, min, max)}
        />
        <div className="pointer-events-none -mt-3.5 md:-mt-2.5">
          <RangeTicks min={min} max={max} compact={compact} />
        </div>
      </div>
      <Input
        type="number"
        min={0}
        aria-label={label}
        {...input}
        className={cn(compact ? 'w-20' : 'w-24', 'shrink-0', input.className)}
      />
    </div>
  );
}
