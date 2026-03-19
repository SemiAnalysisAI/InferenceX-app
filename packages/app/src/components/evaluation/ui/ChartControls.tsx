'use client';

import { track } from '@/lib/analytics';
import { ChevronDownIcon } from 'lucide-react';

import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '@/components/ui/chart-selectors';
import { DatePicker } from '@/components/ui/date-picker';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function EvaluationChartControls() {
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
  } = useEvaluation();

  return (
    <TooltipProvider delayDuration={0}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Model Dropdown */}
        <ModelSelector
          value={selectedModel || ''}
          onChange={(value) => {
            setSelectedModel(value);
            track('eval_model_selected', { model: value });
          }}
          availableModels={availableModels}
        />

        {/* Benchmark Dropdown */}
        <div className="flex flex-col space-y-1.5 lg:col-span-1">
          <LabelWithTooltip
            htmlFor="eval-benchmark-select"
            label="Benchmark"
            tooltip="The standardized test used to measure model performance. Common benchmarks include reasoning, coding, and knowledge-based evaluations."
          />
          <Select
            value={selectedBenchmark || ''}
            onValueChange={(value) => {
              setSelectedBenchmark(value);
              track('eval_benchmark_selected', { benchmark: value });
            }}
          >
            <SelectTrigger
              id="eval-benchmark-select"
              data-testid="evaluation-benchmark-selector"
              className="w-full"
            >
              <SelectValue placeholder="Select benchmark" />
            </SelectTrigger>
            <SelectContent>
              {availableBenchmarks.map((benchmark) => (
                <SelectItem key={benchmark} value={benchmark}>
                  {benchmark.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Spacer */}
        <div className="flex flex-col space-y-1.5 lg:col-span-3" />
      </div>
      <div className="flex flex-col md:flex-row gap-2 md:items-center text-muted-foreground">
        {/* Date picker */}

        <DatePicker
          date={selectedRunDate}
          onChange={(date) => {
            setSelectedRunDate(date);
            track('eval_date_selected', { date });
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
