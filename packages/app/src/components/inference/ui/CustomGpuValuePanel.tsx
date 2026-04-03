'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { useInference } from '@/components/inference/InferenceContext';
import {
  buildAppliedCustomGpuValues,
  buildDefaultCustomGpuValues,
  didCustomGpuPanelFiltersChange,
  validateCustomGpuValueInput,
  type CustomGpuPanelFilters,
} from '@/components/inference/ui/custom-gpu-value-panel-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { track } from '@/lib/analytics';
import { GPU_SPECS } from '@/lib/constants';

type GpuSpec = (typeof GPU_SPECS)[keyof typeof GPU_SPECS];
type GpuValuePanelKind = 'costs' | 'powers';

const PANEL_CONFIG: Record<
  GpuValuePanelKind,
  {
    title: string;
    description: string;
    sectionTestId: string;
    calculateTestId: string;
    inputIdPrefix: string;
    resetEvent: string;
    calculatedEvent: string;
    getDefaultValue: (specs: GpuSpec) => number;
  }
> = {
  costs: {
    title: 'Custom GPU Costs',
    description:
      'Enter your own TCO (Total Cost of Ownership) values for each GPU in $/GPU/hr. These values will be used to calculate custom cost metrics.',
    sectionTestId: 'custom-costs-section',
    calculateTestId: 'custom-costs-calculate',
    inputIdPrefix: 'cost-input',
    resetEvent: 'inference_custom_costs_reset',
    calculatedEvent: 'inference_custom_costs_calculated',
    getDefaultValue: (specs) => specs.costr,
  },
  powers: {
    title: 'Custom GPU Powers',
    description:
      'Enter your own Token Throughput per All in Utility MW (tok/s/MW) values for each GPU. These values will be used to calculate custom power metrics.',
    sectionTestId: 'custom-powers-section',
    calculateTestId: 'custom-powers-calculate',
    // Preserve legacy input IDs so existing Cypress selectors keep passing.
    inputIdPrefix: 'cost-input',
    resetEvent: 'inference_custom_powers_reset',
    calculatedEvent: 'inference_custom_powers_calculated',
    getDefaultValue: (specs) => specs.power,
  },
};

interface GpuValueInputGroupProps {
  gpuKey: string;
  gpuLabel: string;
  inputIdPrefix: string;
  inputValue: string;
  error: string;
  onChange: (value: string) => void;
}

const GpuValueInputGroup = memo(
  ({ gpuKey, gpuLabel, inputIdPrefix, inputValue, error, onChange }: GpuValueInputGroupProps) => {
    return (
      <div className="flex flex-col gap-2">
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>{gpuLabel}:</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id={`${inputIdPrefix}-${gpuKey}`}
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

GpuValueInputGroup.displayName = 'GpuValueInputGroup';

function renderSkeleton(title: string, description: string) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`skeleton-input-${index + 1}`} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Skeleton className="h-9 flex-1" />
              </div>
            </div>
          ))}
        </div>
        <div className="self-end-safe justify-self-end-safe flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </CardContent>
    </Card>
  );
}

const CustomGpuValuePanel = memo(
  ({ loading, kind }: { loading: boolean; kind: GpuValuePanelKind }) => {
    const {
      selectedYAxisMetric,
      selectedPrecisions,
      selectedModel,
      selectedSequence,
      setUserCosts,
      setUserPowers,
    } = useInference();

    const config = PANEL_CONFIG[kind];
    const applyValues = kind === 'costs' ? setUserCosts : setUserPowers;

    const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
    const [defaultValues, setDefaultValues] = useState<Record<string, string>>({});
    const [lastCalculatedValues, setLastCalculatedValues] = useState<
      Record<string, string | number>
    >({});

    const previousFiltersRef = useRef<CustomGpuPanelFilters>({
      model: selectedModel,
      sequence: selectedSequence,
      precisions: selectedPrecisions,
      yAxisMetric: selectedYAxisMetric,
    });

    const stableGpus = React.useMemo(() => {
      // One input per physical GPU, and GPUs with a zero default for this metric are omitted.
      return Object.entries(GPU_SPECS)
        .filter(([, specs]) => config.getDefaultValue(specs) > 0)
        .map(([base, specs]) => ({ base, label: base.toUpperCase(), specs }));
    }, [config]);

    useEffect(() => {
      const { defaultValues: defaults, numericDefaults } = buildDefaultCustomGpuValues(
        stableGpus,
        config.getDefaultValue,
      );

      setDefaultValues(defaults);
      setLastCalculatedValues(defaults);
      setInputErrors({});
      applyValues(numericDefaults);
    }, [applyValues, config, stableGpus]);

    useEffect(() => {
      const prevFilters = previousFiltersRef.current;
      const currentFilters: CustomGpuPanelFilters = {
        model: selectedModel,
        sequence: selectedSequence,
        precisions: selectedPrecisions,
        yAxisMetric: selectedYAxisMetric,
      };
      const filtersChanged = didCustomGpuPanelFiltersChange(prevFilters, currentFilters);

      if (filtersChanged) {
        setLastCalculatedValues(defaultValues);
        setInputErrors({});
        previousFiltersRef.current = currentFilters;
      }
    }, [defaultValues, selectedModel, selectedPrecisions, selectedSequence, selectedYAxisMetric]);

    const handleInputChange = useCallback((gpuKey: string, value: string) => {
      const validationError = validateCustomGpuValueInput(value);

      setInputErrors((prev) => ({
        ...prev,
        [gpuKey]: validationError,
      }));
      setLastCalculatedValues((prev) => ({
        ...prev,
        [gpuKey]: value,
      }));
    }, []);

    const handleReset = useCallback(() => {
      track(config.resetEvent, {
        metric: selectedYAxisMetric,
        gpuCount: stableGpus.length,
      });

      const { numericDefaults } = buildDefaultCustomGpuValues(stableGpus, config.getDefaultValue);

      applyValues(numericDefaults);
      setLastCalculatedValues(numericDefaults);
      setInputErrors({});
    }, [applyValues, config, selectedYAxisMetric, stableGpus]);

    const handleRecalculate = useCallback(() => {
      const hasErrors = Object.values(inputErrors).some((error) => error !== '');
      if (hasErrors) return;

      track(config.calculatedEvent, {
        metric: selectedYAxisMetric,
        gpuCount: stableGpus.length,
      });

      const currentValues = buildAppliedCustomGpuValues(stableGpus, lastCalculatedValues);
      applyValues(currentValues);
    }, [applyValues, config, inputErrors, lastCalculatedValues, selectedYAxisMetric, stableGpus]);

    if (loading || stableGpus.length === 0) {
      return renderSkeleton(config.title, config.description);
    }

    return (
      <Card data-testid={config.sectionTestId}>
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
            {stableGpus.map((gpu) => (
              <GpuValueInputGroup
                key={gpu.base}
                gpuKey={gpu.base}
                gpuLabel={gpu.label}
                inputIdPrefix={config.inputIdPrefix}
                inputValue={(lastCalculatedValues[gpu.base] ?? '').toString()}
                error={inputErrors[gpu.base] ?? ''}
                onChange={(value) => {
                  handleInputChange(gpu.base, value);
                }}
              />
            ))}
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
              data-testid={config.calculateTestId}
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
        </CardContent>
      </Card>
    );
  },
);

CustomGpuValuePanel.displayName = 'CustomGpuValuePanel';

export default CustomGpuValuePanel;
