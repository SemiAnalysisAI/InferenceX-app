'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';

import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';

import { useInference } from '@/components/inference/InferenceContext';
import { GPU_SPECS } from '@/lib/constants';

// Memoized InputGroup component for GPU cost inputs
const GpuCostInputGroup = memo(
  ({
    gpuKey,
    gpuLabel,
    inputValue,
    error,
    onChange,
  }: {
    gpuKey: string;
    gpuLabel: string;
    inputValue: string;
    error: string;
    onChange: (value: string) => void;
  }) => {
    return (
      <div className="flex flex-col gap-2">
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>{gpuLabel}:</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id={`cost-input-${gpuKey}`}
            type="number"
            step="0.01"
            min="0"
            value={inputValue}
            placeholder=""
            onChange={(e) => {
              onChange(e.target.value);
            }}
            className={error ? 'text-destructive' : ''}
            aria-invalid={!!error}
          />
        </InputGroup>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  },
);

GpuCostInputGroup.displayName = 'GpuCostInputGroup';

const CustomPowers = memo(({ loading }: { loading: boolean }) => {
  // Use the shared hardware context to ensure both charts use the same state

  const {
    selectedYAxisMetric,
    selectedPrecisions,
    selectedModel,
    selectedSequence,
    setUserPowers,
  } = useInference();

  const [inputErrors, setInputErrors] = useState<{ [gpuKey: string]: string }>({});
  const [defaultValues, setDefaultValues] = useState<{ [gpuKey: string]: string }>({});
  const [lastCalculatedValues, setLastCalculatedValues] = useState<{
    [gpuKey: string]: string | number;
  }>({});

  // Track previous filter values to detect changes within this component
  const previousFiltersRef = useRef({
    model: selectedModel,
    sequence: selectedSequence,
    precisions: selectedPrecisions,
    yAxisMetric: selectedYAxisMetric,
  });

  // One power input per physical GPU — derived from GPU_SPECS (deduplicated by design).
  const stableGpus = React.useMemo(() => {
    return Object.entries(GPU_SPECS)
      .filter(([, specs]) => specs.power > 0)
      .map(([base, specs]) => ({ base, label: base.toUpperCase(), specs }));
  }, []);

  // Initialize default values and auto-apply so chart renders immediately
  useEffect(() => {
    const defaults: { [gpuKey: string]: string } = {};
    const numericDefaults: { [gpuKey: string]: number } = {};

    stableGpus.forEach((gpu) => {
      defaults[gpu.base] = gpu.specs.power.toString();
      numericDefaults[gpu.base] = gpu.specs.power;
    });

    setDefaultValues(defaults);
    setLastCalculatedValues(defaults);
    setInputErrors({});
    setUserPowers(numericDefaults);
  }, [stableGpus, setUserPowers]);

  // Reset last calculated values when filters change (model, sequence, precision, y-axis)
  useEffect(() => {
    const prevFilters = previousFiltersRef.current;
    const filtersChanged =
      prevFilters.model !== selectedModel ||
      prevFilters.sequence !== selectedSequence ||
      prevFilters.precisions.join(',') !== selectedPrecisions.join(',') ||
      prevFilters.yAxisMetric !== selectedYAxisMetric;

    if (filtersChanged) {
      // Reset last calculated values to defaults when filters change
      setLastCalculatedValues(defaultValues);
      setInputErrors({});

      // Update previous filters
      previousFiltersRef.current = {
        model: selectedModel,
        sequence: selectedSequence,
        precisions: selectedPrecisions,
        yAxisMetric: selectedYAxisMetric,
      };
    }
  }, [selectedModel, selectedSequence, selectedPrecisions, selectedYAxisMetric, defaultValues]);

  // Validate input value
  const validateInput = useCallback((value: string): string => {
    if (!value.trim()) {
      return '';
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return 'Must be a valid number';
    }
    if (numValue < 0) {
      return 'Must be a positive number';
    }

    return '';
  }, []);

  // Handle input change with validation
  const handleInputChange = useCallback(
    (gpuKey: string, value: string) => {
      const validationError = validateInput(value);

      setInputErrors((prev) => ({
        ...prev,
        [gpuKey]: validationError,
      }));
      setLastCalculatedValues((prev) => ({
        ...prev,
        [gpuKey]: value,
      }));
    },
    [validateInput, setLastCalculatedValues, setUserPowers],
  );

  // Handle reset button click
  const handleReset = useCallback(() => {
    track('inference_custom_powers_reset', {
      metric: selectedYAxisMetric,
      gpuCount: stableGpus.length,
    });
    const defaultInputs: { [gpuKey: string]: number } = {};

    stableGpus.forEach((gpu) => {
      defaultInputs[gpu.base] = gpu.specs.power;
    });

    setUserPowers(defaultInputs);
    setLastCalculatedValues(defaultInputs);
    setInputErrors({});

    // Don't update lastCalculatedValues here - we want to keep the last calculated values
    // so that when reset is clicked, we can compare the new (default) values with the last calculated values
  }, [stableGpus]);

  // Handle recalculate button click
  const handleRecalculate = useCallback(() => {
    const hasErrors = Object.values(inputErrors).some((error) => error !== '');
    if (hasErrors) {
      return;
    }
    track('inference_custom_powers_calculated', {
      metric: selectedYAxisMetric,
      gpuCount: stableGpus.length,
    });

    // Store the current values as the last calculated values before calculating
    const currentValues: { [gpuKey: string]: number } = {};
    stableGpus.forEach((gpu) => {
      const currentValue = lastCalculatedValues[gpu.base] ?? 0;
      if (currentValue) {
        currentValues[gpu.base] = parseFloat(currentValue.toString());
      }
    });
    setUserPowers(currentValues);

    // costs.calculateCosts();
  }, [inputErrors, stableGpus, lastCalculatedValues]);

  // Show skeleton when hardware data is loading
  // Use loading flag from useChartData to ensure consistency with parent component
  if (loading || stableGpus.length === 0) {
    return (
      <div className="space-y-4 p-4 lg:p-8 border rounded-md bg-muted/30 mb-6">
        <div className="space-y-0">
          <h3 className="text-lg font-medium">Custom GPU Costs</h3>
          <p className="text-sm text-muted-foreground">
            Enter your own Token Throughput per All in Utility MW (tok/s/MW) values for each GPU.
            These values will be used to calculate custom power metrics.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => {
              const skeletonId = `skeleton-input-${index + 1}`;
              return (
                <div key={skeletonId} className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="self-end-safe justify-self-end-safe flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="custom-powers-section"
      className="space-y-4 p-4 lg:p-8 border rounded-md bg-muted/10 mb-6"
    >
      <div className="space-y-0">
        <h3 className="text-lg font-medium">Custom GPU Powers</h3>
        <p className="text-sm text-muted-foreground">
          Enter your own Token Throughput per All in Utility MW (tok/s/MW) values for each GPU.
          These values will be used to calculate custom power metrics.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
          {stableGpus.map((gpu) => {
            const inputValue = lastCalculatedValues[gpu.base] ?? '';
            const error = inputErrors[gpu.base];

            return (
              <GpuCostInputGroup
                key={gpu.base}
                gpuKey={gpu.base}
                gpuLabel={gpu.label}
                inputValue={inputValue.toString()}
                error={error}
                onChange={(value) => {
                  handleInputChange(gpu.base, value);
                }}
              />
            );
          })}
        </div>
        <div className="self-end-safe justify-self-end-safe flex gap-2">
          <Button
            onClick={handleReset}
            variant="ghost"
            aria-label="Reset to defaults"
            title="Reset to defaults"
          >
            Reset
          </Button>
          <Button
            data-testid="custom-powers-calculate"
            onClick={handleRecalculate}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Calculating...
              </>
            ) : (
              'Calculate'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

CustomPowers.displayName = 'CustomPowers';

export default CustomPowers;
