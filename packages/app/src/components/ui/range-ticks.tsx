import * as d3 from 'd3';

import { cn } from '@/lib/shared/utils';

const RANGE_TICK_COUNT = 5;
const PHONE_RANGE_TICK_COUNT = 3;
const MIN_LABEL_CLEARANCE = 0.1;

export function rangeTicks(min: number, max: number, count = RANGE_TICK_COUNT): number[] {
  if (max <= min) return [];
  return [
    min,
    ...d3
      .ticks(min, max, count)
      .filter((tick) => (tick - min) / (max - min) >= MIN_LABEL_CLEARANCE),
  ];
}

export function RangeTicks({
  min,
  max,
  compact = false,
}: {
  min: number;
  max: number;
  compact?: boolean;
}) {
  const phoneTicks = rangeTicks(min, max, PHONE_RANGE_TICK_COUNT);
  const ticks = compact ? phoneTicks : rangeTicks(min, max);
  const all = [...new Set([...ticks, ...phoneTicks])].toSorted((a, b) => a - b);
  return (
    <div
      className="relative h-4 text-xs tabular-nums text-muted-foreground"
      style={{ marginLeft: 8, marginRight: 8 }}
    >
      {all.map((tick) => (
        <span
          key={tick}
          className={cn(
            'absolute -translate-x-1/2',
            !phoneTicks.includes(tick) && 'max-sm:hidden',
            !ticks.includes(tick) && 'sm:hidden',
          )}
          style={{ left: `${((tick - min) / (max - min)) * 100}%` }}
        >
          {tick}
        </span>
      ))}
    </div>
  );
}
