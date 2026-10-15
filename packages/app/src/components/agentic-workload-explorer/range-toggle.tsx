'use client';

import { useLocale } from '@/lib/i18n/use-locale';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';

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
    <SegmentedToggle
      value={value}
      onValueChange={onChange}
      role="group"
      ariaLabel={zh ? '时间范围' : 'Time range'}
      className="flex-wrap"
      options={options.map((option) => ({
        value: option.id,
        label: zh ? (option.labelZh ?? option.label) : option.label,
        title: zh ? (option.titleZh ?? option.title) : option.title,
      }))}
    />
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
