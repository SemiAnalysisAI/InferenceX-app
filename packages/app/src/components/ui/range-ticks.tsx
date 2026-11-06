import * as d3 from 'd3';

import { cn } from '@/lib/shared/utils';

const RANGE_TICK_COUNT = 5;
const PHONE_RANGE_TICK_COUNT = 3;

export function rangeTicks(min: number, max: number, count = RANGE_TICK_COUNT): number[] {
  return max > min ? d3.ticks(min, max, count) : [];
}

export function RangeTicks({ min, max }: { min: number; max: number }) {
  const ticks = rangeTicks(min, max);
  const phoneTicks = rangeTicks(min, max, PHONE_RANGE_TICK_COUNT);
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
