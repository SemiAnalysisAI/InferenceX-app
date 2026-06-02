import type {
  BarMetric,
  CalculatorMode,
  CostProvider,
  CostType,
  InterpolatedResult,
} from './types';

/** Get the throughput value for the selected token type. */
export function getThroughputForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.inputTputValue;
  if (costType === 'output') return d.outputTputValue;
  return d.value; // total
}

/** Get the tok/s/MW value for the selected token type. */
export function getTpPerMwForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.inputTpPerMw;
  if (costType === 'output') return d.outputTpPerMw;
  return d.tpPerMw; // total
}

export function getMetricValue(
  d: InterpolatedResult,
  barMetric: BarMetric,
  costType: CostType,
): number {
  switch (barMetric) {
    case 'power': {
      return getTpPerMwForType(d, costType);
    }
    case 'cost': {
      return getCostForType(d, costType);
    }
    default: {
      return getThroughputForType(d, costType);
    }
  }
}

export function getMetricLabel(
  barMetric: BarMetric,
  mode: CalculatorMode,
  costType: CostType,
): string {
  const tokenTypePrefix = costType === 'input' ? 'Input ' : costType === 'output' ? 'Output ' : '';
  switch (barMetric) {
    case 'power': {
      return `${tokenTypePrefix}Tokens per Provisioned All-in Megawatt (tok/s/MW)`;
    }
    case 'cost': {
      return `Cost ($${getCostTypeLabel(costType)})`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${tokenTypePrefix}Throughput per GPU (tok/s/gpu)`
        : 'Interactivity (tok/s/user)';
    }
  }
}

export function getValueLabel(
  d: InterpolatedResult,
  barMetric: BarMetric,
  mode: CalculatorMode,
  costType: CostType,
): string {
  switch (barMetric) {
    case 'power': {
      return `${getTpPerMwForType(d, costType).toFixed(0)} tok/s/MW`;
    }
    case 'cost': {
      return `$${getCostForType(d, costType).toFixed(3)}${getCostTypeLabel(costType)}`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${getThroughputForType(d, costType).toFixed(1)} tok/s/gpu`
        : `${getThroughputForType(d, costType).toFixed(1)} tok/s/user`;
    }
  }
}

export function getCostProviderLabel(provider: CostProvider): string {
  switch (provider) {
    case 'costh': {
      return 'Owning - Hyperscaler';
    }
    case 'costn': {
      return 'Owning - Neocloud';
    }
    case 'costr': {
      return 'Renting - 3yr Rental';
    }
  }
}

export function getChartTitle(
  barMetric: BarMetric,
  mode: CalculatorMode,
  targetValue: number,
  costType: CostType,
  costProvider?: CostProvider,
): string {
  const targetLabel =
    mode === 'interactivity_to_throughput'
      ? `${targetValue} tok/s/user Interactivity`
      : `${targetValue} tok/s/gpu Throughput`;

  const tokenTypeLabel =
    costType === 'input' ? 'Input' : costType === 'output' ? 'Output' : 'Total';

  switch (barMetric) {
    case 'power': {
      return `${tokenTypeLabel} Tokens per Provisioned All-in Megawatt at ${targetLabel}`;
    }
    case 'cost': {
      const providerLabel = getCostProviderLabel(costProvider || 'costh');
      return `Cost per Million ${tokenTypeLabel} Tokens (${providerLabel}) at ${targetLabel}`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${tokenTypeLabel} Token Throughput per GPU at ${targetLabel}`
        : `Interactivity at ${targetLabel}`;
    }
  }
}

export function getSortedResults(
  results: InterpolatedResult[],
  barMetric: BarMetric,
  costType: CostType,
): InterpolatedResult[] {
  const sorted = [...results];
  switch (barMetric) {
    case 'power': {
      // Most efficient first (descending)
      sorted.sort((a, b) => getTpPerMwForType(b, costType) - getTpPerMwForType(a, costType));
      return sorted;
    }
    case 'cost': {
      // Cheapest first (ascending cost)
      sorted.sort((a, b) => getCostForType(a, costType) - getCostForType(b, costType));
      return sorted;
    }
    default: {
      // Highest throughput first (descending, using token-type-appropriate value)
      sorted.sort((a, b) => getThroughputForType(b, costType) - getThroughputForType(a, costType));
      return sorted;
    }
  }
}

export function getCostForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.costInput;
  if (costType === 'output') return d.costOutput;
  return d.cost;
}

export function getCostTypeLabel(costType: CostType): string {
  if (costType === 'input') return '/M input tok';
  if (costType === 'output') return '/M output tok';
  return '/M tok';
}
