'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

import { useInference } from '@/components/inference/InferenceContext';
import { MAX_COMPARISON_GPUS } from '@/components/inference/utils/normalize-comparison-gpus';
import { useComparisonChangelogs } from '@/hooks/api/use-comparison-changelogs';
import { DateRangePicker, getQuickDateRangeShortcuts } from '@/components/ui/date-range-picker';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import ComparisonChangelog from './ComparisonChangelog';

export default function GpuComparisonCard() {
  const {
    selectedGPUs,
    setSelectedGPUs,
    availableGPUs,
    selectedDateRange,
    setSelectedDateRange,
    dateRangeAvailableDates,
    isCheckingAvailableDates,
    selectedPrecisions,
    selectedDates,
    setSelectedDates,
  } = useInference();

  const {
    changelogs,
    loading: changelogsLoading,
    totalDatesQueried,
  } = useComparisonChangelogs(selectedGPUs, selectedDateRange, dateRangeAvailableDates);

  const comparisonReady = selectedGPUs.length > 0;

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (comparisonReady) {
      setIsExpanded(true);
    }
  }, [comparisonReady]);

  const handleGPUChange = (value: string[]) => {
    setSelectedGPUs(value);
    track('inference_gpu_selected', {
      gpus: value.join(','),
    });
  };

  const handleDateRangeChange = (range: { startDate: string; endDate: string }) => {
    setSelectedDateRange(range);
    track('inference_date_range_changed', {
      startDate: range.startDate,
      endDate: range.endDate,
    });
  };

  return (
    <Card data-testid="gpu-comparison-card" className={cn(!isExpanded && 'py-3 md:py-4')}>
      <TooltipProvider delayDuration={0}>
        <div className={cn('flex flex-col', isExpanded ? 'gap-4' : 'gap-0')}>
          <button
            type="button"
            data-testid="gpu-comparison-expand-toggle"
            aria-expanded={isExpanded}
            className={cn(
              'group flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left outline-none ring-offset-background',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
            onClick={() => {
              setIsExpanded((prev) => {
                const next = !prev;
                track('inference_gpu_comparison_toggled', { expanded: next });
                return next;
              });
            }}
          >
            <h2 className="m-0 min-w-0 flex-1 text-lg font-semibold leading-none">
              GPU Comparison
            </h2>
            <ChevronDown
              className={cn(
                'no-export size-[1.125rem] shrink-0 self-center text-muted-foreground transition-all duration-200 group-hover:text-foreground',
                isExpanded && 'rotate-180',
              )}
              aria-hidden
            />
          </button>

          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out',
              isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className={cn('min-h-0', isExpanded ? 'overflow-visible' : 'overflow-hidden')}>
              <div className="flex flex-col gap-4 pb-0">
                {isExpanded && (
                  <p className="text-sm text-muted-foreground" role="status">
                    Select one or more GPUs for date range comparison.
                  </p>
                )}
                <div className="flex flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="gpu-config-select"
                    label="GPU Config"
                    tooltip={`Select up to ${MAX_COMPARISON_GPUS} GPU configurations to compare their historical performance over time. This allows for tracking how software updates may affect specific hardware.`}
                  />
                  <div data-testid="gpu-multiselect">
                    <MultiSelect
                      triggerId="gpu-config-select"
                      triggerTestId="gpu-multiselect-trigger"
                      options={availableGPUs}
                      value={selectedGPUs}
                      onChange={handleGPUChange}
                      placeholder="Select a GPU Config for comparison"
                      maxSelections={MAX_COMPARISON_GPUS}
                    />
                  </div>
                </div>

                <div className="flex flex-col space-y-1.5 md:max-w-xl">
                  <div
                    className={cn('flex flex-col space-y-1.5', !comparisonReady && 'opacity-60')}
                  >
                    <LabelWithTooltip
                      htmlFor="gpu-comparison-date-picker"
                      label="Comparison Date Range"
                      tooltip="Select the start and end dates for the historical comparison. The chart will show performance data for the selected GPU configs across this time range."
                    />
                    <DateRangePicker
                      triggerId="gpu-comparison-date-picker"
                      dateRange={selectedDateRange}
                      onChange={handleDateRangeChange}
                      placeholder="Select date range"
                      availableDates={dateRangeAvailableDates}
                      isCheckingAvailableDates={isCheckingAvailableDates}
                      disabled={!comparisonReady}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5" data-testid="date-range-shortcuts">
                    {getQuickDateRangeShortcuts(dateRangeAvailableDates).map(
                      ({ id, label, range, isAvailable }) => {
                        const canUse = comparisonReady && isAvailable && Boolean(range);
                        const isActive =
                          range !== null &&
                          selectedDateRange.startDate === range.startDate &&
                          selectedDateRange.endDate === range.endDate;
                        return (
                          <Button
                            key={id}
                            type="button"
                            variant={isActive ? 'secondary' : 'outline'}
                            size="sm"
                            disabled={!canUse}
                            data-testid={`date-shortcut-${id}`}
                            onClick={() => {
                              if (!range) return;
                              handleDateRangeChange(range);
                              track('inference_date_range_quick_select', {
                                label,
                                startDate: range.startDate,
                                endDate: range.endDate,
                              });
                            }}
                          >
                            {label}
                          </Button>
                        );
                      },
                    )}
                  </div>
                </div>

                {comparisonReady && (
                  <div className="border-t border-border pt-4 mt-1">
                    <ComparisonChangelog
                      changelogs={changelogs}
                      selectedGPUs={selectedGPUs}
                      selectedPrecisions={selectedPrecisions}
                      loading={changelogsLoading}
                      totalDatesQueried={totalDatesQueried}
                      selectedDates={selectedDates}
                      selectedDateRange={selectedDateRange}
                      expandWhenActive={
                        comparisonReady &&
                        Boolean(selectedDateRange.startDate && selectedDateRange.endDate)
                      }
                      onAddDate={(date) => {
                        if (!selectedDates.includes(date)) {
                          setSelectedDates([...selectedDates, date]);
                        }
                      }}
                      onRemoveDate={(date) => {
                        setSelectedDates(selectedDates.filter((d) => d !== date));
                      }}
                      onAddAllDates={(dates) => {
                        const merged = [...new Set([...selectedDates, ...dates])];
                        setSelectedDates(merged);
                      }}
                      firstAvailableDate={dateRangeAvailableDates[0]}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </Card>
  );
}
