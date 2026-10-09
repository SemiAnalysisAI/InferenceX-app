'use client';

import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

export interface RangeOption<T extends string> {
  id: T;
  label: string;
  title?: string;
  /** Chinese label/title for /zh pages; falls back to the English value. */
  labelZh?: string;
  titleZh?: string;
}

/** Compact button row for picking a chart's time range. */
export function RangeToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: RangeOption<T>[];
  onChange: (v: T) => void;
}) {
  const zh = useLocale() === 'zh';
  return (
    <div className="inline-flex flex-wrap items-stretch gap-0.5 rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={zh ? (o.titleZh ?? o.title) : o.title}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'inline-flex min-h-6 items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
            value === o.id
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {zh ? (o.labelZh ?? o.label) : o.label}
        </button>
      ))}
    </div>
  );
}

export type DayRange = '7d' | '14d' | '30d';

export const DAY_RANGES: RangeOption<DayRange>[] = [
  {
    id: '7d',
    label: '7D',
    title: "Snapshot's final 7 days",
    labelZh: '7 天',
    titleZh: '快照最后 7 天',
  },
  {
    id: '14d',
    label: '14D',
    title: "Snapshot's final 14 days",
    labelZh: '14 天',
    titleZh: '快照最后 14 天',
  },
  {
    id: '30d',
    label: '30D',
    title: "Snapshot's final 30 days",
    labelZh: '30 天',
    titleZh: '快照最后 30 天',
  },
];

export const DAY_RANGE_DAYS: Record<DayRange, number> = { '7d': 7, '14d': 14, '30d': 30 };
