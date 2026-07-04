'use client';

import { track } from '@/lib/analytics';

import { useReliabilityContext } from '@/components/reliability/ReliabilityContext';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    dateRangeLabel: 'Date Range',
    dateRangeTooltip:
      'Time window for calculating GPU reliability metrics. Longer ranges provide more stable statistics but may not reflect recent changes in hardware performance.',
    dateRangePlaceholder: 'Select date range',
    last3Days: 'Last 3 days',
    last7Days: 'Last 7 days',
    lastMonth: 'Last month',
    last3Months: 'Last 3 months',
    allTime: 'All time',
  },
  zh: {
    dateRangeLabel: '时间范围',
    dateRangeTooltip:
      '计算 GPU 可靠性指标的时间窗口。更长的范围可提供更稳定的统计数据，但可能无法反映近期的硬件性能变化。',
    dateRangePlaceholder: '选择时间范围',
    last3Days: '最近 3 天',
    last7Days: '最近 7 天',
    lastMonth: '最近一个月',
    last3Months: '最近三个月',
    allTime: '全部时间',
  },
} as const;

export default function ReliabilityChartControls() {
  const { dateRange, setDateRange } = useReliabilityContext();
  const t = STRINGS[useLocale()];

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col space-y-1.5 sm:w-45">
        <LabelWithTooltip
          htmlFor="date-range-select"
          label={t.dateRangeLabel}
          tooltip={t.dateRangeTooltip}
        />
        <Select
          value={dateRange}
          onValueChange={(value) => {
            setDateRange(value);
            track('reliability_date_range_changed', { dateRange: value });
          }}
        >
          <SelectTrigger
            id="date-range-select"
            data-testid="reliability-date-range"
            className="w-full"
          >
            <SelectValue placeholder={t.dateRangePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last-3-days">{t.last3Days}</SelectItem>
            <SelectItem value="last-7-days">{t.last7Days}</SelectItem>
            <SelectItem value="last-month">{t.lastMonth}</SelectItem>
            <SelectItem value="last-3-months">{t.last3Months}</SelectItem>
            <SelectItem value="all-time">{t.allTime}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </TooltipProvider>
  );
}
