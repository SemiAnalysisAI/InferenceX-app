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

export default function ReliabilityChartControls() {
  const { dateRange, setDateRange } = useReliabilityContext();

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col space-y-1.5 sm:w-45">
        <LabelWithTooltip
          htmlFor="date-range-select"
          label="Date Range"
          tooltip="Time window for calculating GPU reliability metrics. Longer ranges provide more stable statistics but may not reflect recent changes in hardware performance."
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
            <SelectValue placeholder="Select date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last-3-days">Last 3 days</SelectItem>
            <SelectItem value="last-7-days">Last 7 days</SelectItem>
            <SelectItem value="last-month">Last month</SelectItem>
            <SelectItem value="last-3-months">Last 3 months</SelectItem>
            <SelectItem value="all-time">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </TooltipProvider>
  );
}
