export interface CustomGpuPanelFilters {
  model: string;
  sequence: string;
  precisions: string[];
  yAxisMetric: string;
}

export interface CustomGpuPanelEntry<TSpecs = unknown> {
  base: string;
  specs: TSpecs;
}

export function validateCustomGpuValueInput(value: string): string {
  if (!value.trim()) return '';

  const numValue = parseFloat(value);
  if (isNaN(numValue)) return 'Must be a valid number';
  if (numValue < 0) return 'Must be a non-negative number';

  return '';
}

export function didCustomGpuPanelFiltersChange(
  prevFilters: CustomGpuPanelFilters,
  currentFilters: CustomGpuPanelFilters,
): boolean {
  return (
    prevFilters.model !== currentFilters.model ||
    prevFilters.sequence !== currentFilters.sequence ||
    prevFilters.precisions.join(',') !== currentFilters.precisions.join(',') ||
    prevFilters.yAxisMetric !== currentFilters.yAxisMetric
  );
}

export function buildDefaultCustomGpuValues<TSpecs>(
  stableGpus: CustomGpuPanelEntry<TSpecs>[],
  getDefaultValue: (specs: TSpecs) => number,
): {
  defaultValues: Record<string, string>;
  numericDefaults: Record<string, number>;
} {
  const defaultValues: Record<string, string> = {};
  const numericDefaults: Record<string, number> = {};

  stableGpus.forEach((gpu) => {
    const defaultValue = getDefaultValue(gpu.specs);
    defaultValues[gpu.base] = defaultValue.toString();
    numericDefaults[gpu.base] = defaultValue;
  });

  return { defaultValues, numericDefaults };
}

export function buildAppliedCustomGpuValues(
  stableGpus: Array<{ base: string }>,
  lastCalculatedValues: Record<string, string | number>,
): Record<string, number> {
  const currentValues: Record<string, number> = {};

  stableGpus.forEach((gpu) => {
    const currentValue = lastCalculatedValues[gpu.base];

    if (typeof currentValue === 'string') {
      if (!currentValue.trim()) return;
      currentValues[gpu.base] = parseFloat(currentValue);
      return;
    }

    if (currentValue == null) return;
    currentValues[gpu.base] = currentValue;
  });

  return currentValues;
}
