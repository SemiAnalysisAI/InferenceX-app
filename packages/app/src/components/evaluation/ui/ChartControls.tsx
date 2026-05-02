'use client';

import { useState } from 'react';

import { track } from '@/lib/analytics';
import { ChevronDownIcon } from 'lucide-react';

import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import { Button } from '@/components/ui/button';
import { ModelSelector, PrecisionSelector } from '@/components/ui/chart-selectors';
import { DatePicker } from '@/components/ui/date-picker';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function EvaluationChartControls() {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const handleDropdownOpenChange = (dropdownKey: string) => (isOpen: boolean) => {
    if (isOpen) {
      setOpenDropdown(dropdownKey);
      return;
    }
    setOpenDropdown((current) => (current === dropdownKey ? null : current));
  };

  const {
    selectedBenchmark,
    setSelectedBenchmark,
    selectedModel,
    setSelectedModel,
    selectedRunDate,
    setSelectedRunDate,
    availableBenchmarks,
    availableModels,
    availableDates,
    changelogEntries,
    selectedPrecisions,
    setSelectedPrecisions,
    availablePrecisions,
  } = useEvaluation();

  return (
    <TooltipProvider delayDuration={0}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Model Dropdown */}
        <ModelSelector
          value={selectedModel || ''}
          onChange={(value) => {
            setSelectedModel(value);
            track('evaluation_model_selected', { model: value });
          }}
          open={openDropdown === 'model'}
          onOpenChange={handleDropdownOpenChange('model')}
          availableModels={availableModels}
        />

        {/* Benchmark Dropdown */}
        <div className="flex flex-col space-y-1.5 lg:col-span-1">
          <LabelWithTooltip
            htmlFor="eval-benchmark-select"
            label="Benchmark"
            tooltip="The standardized test used to measure model performance. Common benchmarks include reasoning, coding, and knowledge-based evaluations."
          />
          <div>
            <MultiSelect
              options={availableBenchmarks.map((benchmark) => ({
                value: benchmark,
                label: benchmark.toUpperCase(),
              }))}
              value={selectedBenchmark ? [selectedBenchmark] : []}
              onChange={(values) => {
                const next = values[0];
                if (!next) return;
                setSelectedBenchmark(next);
                track('evaluation_benchmark_selected', { benchmark: next });
              }}
              open={openDropdown === 'benchmark'}
              onOpenChange={handleDropdownOpenChange('benchmark')}
              triggerId="eval-benchmark-select"
              triggerTestId="evaluation-benchmark-selector"
              placeholder="Select benchmark"
              minSelections={1}
              maxSelections={1}
              showClearAll={false}
              searchable={false}
              plainSelectedText
              showSelectionSummary={false}
            />
          </div>
        </div>

        {/* Precision Multiselect */}
        <PrecisionSelector
          id="eval-precision-select"
          value={selectedPrecisions}
          onChange={(value) => {
            setSelectedPrecisions(value);
            track('evaluation_precision_selected', { precision: value.join(',') });
          }}
          open={openDropdown === 'precision'}
          onOpenChange={handleDropdownOpenChange('precision')}
          availablePrecisions={availablePrecisions}
          data-testid="evaluation-precision-selector"
        />

        {/* Spacer */}
        <div className="flex flex-col space-y-1.5 lg:col-span-2" />
      </div>
      <div className="flex flex-col md:flex-row gap-2 md:items-center text-muted-foreground">
        {/* Date picker */}

        <DatePicker
          date={selectedRunDate}
          onChange={(date) => {
            setSelectedRunDate(date);
            track('evaluation_date_selected', { date });
          }}
          placeholder="Select run date"
          availableDates={availableDates}
        />

        {/* Changelog */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="self-start">
              <strong>Changelog</strong>
              <ChevronDownIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px]">
            <div className="flex flex-col gap-3">
              <div className="text-xs font-bold">New results on {selectedRunDate}</div>
              {changelogEntries.length > 0 ? (
                changelogEntries.map((entry) => (
                  <div key={entry.benchmark} className="flex flex-col gap-1 text-xs">
                    <div className="font-semibold">{entry.benchmark.toUpperCase()}</div>
                    <ul className="list-disc pl-4">
                      {entry.configs.map((config) => (
                        <li key={config}>{config}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  No new results for this model on this date.
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}
