import { describe, expect, it } from 'vitest';

import { InterpolatedResult } from './types';
import {
  getCostForType,
  getCostProviderLabel,
  getCostTypeLabel,
  getChartTitle,
  getMetricLabel,
  getMetricValue,
  getSortedResults,
  getThroughputForType,
  getTpPerMwForType,
  getValueLabel,
} from './ThroughputBarChart';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<InterpolatedResult> = {}): InterpolatedResult {
  const hwKey = overrides.hwKey ?? 'h100';
  return {
    hwKey,
    resultKey: overrides.resultKey ?? hwKey,
    value: 500,
    outputTputValue: 450,
    inputTputValue: 50,
    cost: 1.5,
    costInput: 0.8,
    costOutput: 2.2,
    tpPerMw: 1200,
    inputTpPerMw: 300,
    outputTpPerMw: 1100,
    concurrency: 64,
    nearestPoints: [],
    ...overrides,
  };
}

// =========================================================================
// getCostForType()
// =========================================================================

describe('getCostForType', () => {
  const result = makeResult({ cost: 1.5, costInput: 0.8, costOutput: 2.2 });

  it('returns total cost for "total" type', () => {
    expect(getCostForType(result, 'total')).toBe(1.5);
  });

  it('returns input cost for "input" type', () => {
    expect(getCostForType(result, 'input')).toBe(0.8);
  });

  it('returns output cost for "output" type', () => {
    expect(getCostForType(result, 'output')).toBe(2.2);
  });
});

// =========================================================================
// getCostTypeLabel()
// =========================================================================

describe('getCostTypeLabel', () => {
  it('returns "/M tok" for total', () => {
    expect(getCostTypeLabel('total')).toBe('/M tok');
  });

  it('returns "/M input tok" for input', () => {
    expect(getCostTypeLabel('input')).toBe('/M input tok');
  });

  it('returns "/M output tok" for output', () => {
    expect(getCostTypeLabel('output')).toBe('/M output tok');
  });
});

// =========================================================================
// getThroughputForType()
// =========================================================================

describe('getThroughputForType', () => {
  const result = makeResult({ value: 500, outputTputValue: 450, inputTputValue: 50 });

  it('returns total value (value) for "total" type', () => {
    expect(getThroughputForType(result, 'total')).toBe(500);
  });

  it('returns input throughput for "input" type', () => {
    expect(getThroughputForType(result, 'input')).toBe(50);
  });

  it('returns output throughput for "output" type', () => {
    expect(getThroughputForType(result, 'output')).toBe(450);
  });
});

// =========================================================================
// getTpPerMwForType()
// =========================================================================

describe('getTpPerMwForType', () => {
  const result = makeResult({ tpPerMw: 1200, inputTpPerMw: 300, outputTpPerMw: 1100 });

  it('returns total tpPerMw for "total" type', () => {
    expect(getTpPerMwForType(result, 'total')).toBe(1200);
  });

  it('returns input tpPerMw for "input" type', () => {
    expect(getTpPerMwForType(result, 'input')).toBe(300);
  });

  it('returns output tpPerMw for "output" type', () => {
    expect(getTpPerMwForType(result, 'output')).toBe(1100);
  });
});

// =========================================================================
// getMetricValue()
// =========================================================================

describe('getMetricValue', () => {
  const result = makeResult({
    value: 500,
    outputTputValue: 450,
    inputTputValue: 50,
    tpPerMw: 1200,
    cost: 1.5,
    costInput: 0.8,
    costOutput: 2.2,
  });

  it('returns total value for "throughput" metric with total type', () => {
    expect(getMetricValue(result, 'throughput', 'total')).toBe(500);
  });

  it('returns output throughput for "throughput" metric with output type', () => {
    expect(getMetricValue(result, 'throughput', 'output')).toBe(450);
  });

  it('returns input throughput for "throughput" metric with input type', () => {
    expect(getMetricValue(result, 'throughput', 'input')).toBe(50);
  });

  it('returns total tpPerMw for "power" metric with total type', () => {
    expect(getMetricValue(result, 'power', 'total')).toBe(1200);
  });

  it('returns input tpPerMw for "power" metric with input type', () => {
    expect(getMetricValue(result, 'power', 'input')).toBe(300);
  });

  it('returns output tpPerMw for "power" metric with output type', () => {
    expect(getMetricValue(result, 'power', 'output')).toBe(1100);
  });

  it('returns total cost for "cost" metric with total type', () => {
    expect(getMetricValue(result, 'cost', 'total')).toBe(1.5);
  });

  it('returns input cost for "cost" metric with input type', () => {
    expect(getMetricValue(result, 'cost', 'input')).toBe(0.8);
  });

  it('returns output cost for "cost" metric with output type', () => {
    expect(getMetricValue(result, 'cost', 'output')).toBe(2.2);
  });
});

// =========================================================================
// getMetricLabel()
// =========================================================================

describe('getMetricLabel', () => {
  it('returns power label for power metric with total type', () => {
    expect(getMetricLabel('power', 'interactivity_to_throughput', 'total')).toBe(
      'Tokens per Provisioned All-in Megawatt (tok/s/MW)',
    );
  });

  it('returns input power label for power metric with input type', () => {
    expect(getMetricLabel('power', 'interactivity_to_throughput', 'input')).toBe(
      'Input Tokens per Provisioned All-in Megawatt (tok/s/MW)',
    );
  });

  it('returns output power label for power metric with output type', () => {
    expect(getMetricLabel('power', 'interactivity_to_throughput', 'output')).toBe(
      'Output Tokens per Provisioned All-in Megawatt (tok/s/MW)',
    );
  });

  it('returns cost label with total cost type', () => {
    expect(getMetricLabel('cost', 'interactivity_to_throughput', 'total')).toBe('Cost ($/M tok)');
  });

  it('returns cost label with input cost type', () => {
    expect(getMetricLabel('cost', 'interactivity_to_throughput', 'input')).toBe(
      'Cost ($/M input tok)',
    );
  });

  it('returns cost label with output cost type', () => {
    expect(getMetricLabel('cost', 'interactivity_to_throughput', 'output')).toBe(
      'Cost ($/M output tok)',
    );
  });

  it('returns throughput label for interactivity_to_throughput mode with total type', () => {
    expect(getMetricLabel('throughput', 'interactivity_to_throughput', 'total')).toBe(
      'Throughput per GPU (tok/s/gpu)',
    );
  });

  it('returns input throughput label for interactivity_to_throughput mode with input type', () => {
    expect(getMetricLabel('throughput', 'interactivity_to_throughput', 'input')).toBe(
      'Input Throughput per GPU (tok/s/gpu)',
    );
  });

  it('returns output throughput label for interactivity_to_throughput mode with output type', () => {
    expect(getMetricLabel('throughput', 'interactivity_to_throughput', 'output')).toBe(
      'Output Throughput per GPU (tok/s/gpu)',
    );
  });

  it('returns interactivity label for throughput_to_interactivity mode', () => {
    expect(getMetricLabel('throughput', 'throughput_to_interactivity', 'total')).toBe(
      'Interactivity (tok/s/user)',
    );
  });
});

// =========================================================================
// getValueLabel()
// =========================================================================

describe('getValueLabel', () => {
  it('formats total power metric value', () => {
    const result = makeResult({ tpPerMw: 1234 });
    expect(getValueLabel(result, 'power', 'interactivity_to_throughput', 'total')).toBe(
      '1234 tok/s/MW',
    );
  });

  it('formats input power metric value', () => {
    const result = makeResult({ inputTpPerMw: 456 });
    expect(getValueLabel(result, 'power', 'interactivity_to_throughput', 'input')).toBe(
      '456 tok/s/MW',
    );
  });

  it('formats output power metric value', () => {
    const result = makeResult({ outputTpPerMw: 987 });
    expect(getValueLabel(result, 'power', 'interactivity_to_throughput', 'output')).toBe(
      '987 tok/s/MW',
    );
  });

  it('formats cost metric value with total type', () => {
    const result = makeResult({ cost: 1.567 });
    expect(getValueLabel(result, 'cost', 'interactivity_to_throughput', 'total')).toBe(
      '$1.567/M tok',
    );
  });

  it('formats cost metric value with input type', () => {
    const result = makeResult({ costInput: 0.823 });
    expect(getValueLabel(result, 'cost', 'interactivity_to_throughput', 'input')).toBe(
      '$0.823/M input tok',
    );
  });

  it('formats total throughput value in interactivity_to_throughput mode', () => {
    const result = makeResult({ value: 456.7 });
    expect(getValueLabel(result, 'throughput', 'interactivity_to_throughput', 'total')).toBe(
      '456.7 tok/s/gpu',
    );
  });

  it('formats input throughput value when costType is input', () => {
    const result = makeResult({ inputTputValue: 55.3 });
    expect(getValueLabel(result, 'throughput', 'interactivity_to_throughput', 'input')).toBe(
      '55.3 tok/s/gpu',
    );
  });

  it('formats output throughput value when costType is output', () => {
    const result = makeResult({ outputTputValue: 401.2 });
    expect(getValueLabel(result, 'throughput', 'interactivity_to_throughput', 'output')).toBe(
      '401.2 tok/s/gpu',
    );
  });

  it('formats interactivity value in throughput_to_interactivity mode', () => {
    const result = makeResult({ value: 32.5 });
    expect(getValueLabel(result, 'throughput', 'throughput_to_interactivity', 'total')).toBe(
      '32.5 tok/s/user',
    );
  });
});

// =========================================================================
// getCostProviderLabel()
// =========================================================================

describe('getCostProviderLabel', () => {
  it('returns "Owning - Hyperscaler" for costh', () => {
    expect(getCostProviderLabel('costh')).toBe('Owning - Hyperscaler');
  });

  it('returns "Owning - Neocloud" for costn', () => {
    expect(getCostProviderLabel('costn')).toBe('Owning - Neocloud');
  });

  it('returns "Renting - 3yr Rental" for costr', () => {
    expect(getCostProviderLabel('costr')).toBe('Renting - 3yr Rental');
  });
});

// =========================================================================
// getChartTitle()
// =========================================================================

describe('getChartTitle', () => {
  it('returns total throughput title with interactivity target label', () => {
    const title = getChartTitle('throughput', 'interactivity_to_throughput', 30, 'total');
    expect(title).toBe('Total Token Throughput per GPU at 30 tok/s/user Interactivity');
  });

  it('returns input throughput title when costType is input', () => {
    const title = getChartTitle('throughput', 'interactivity_to_throughput', 30, 'input');
    expect(title).toBe('Input Token Throughput per GPU at 30 tok/s/user Interactivity');
  });

  it('returns output throughput title when costType is output', () => {
    const title = getChartTitle('throughput', 'interactivity_to_throughput', 30, 'output');
    expect(title).toBe('Output Token Throughput per GPU at 30 tok/s/user Interactivity');
  });

  it('returns interactivity title in throughput_to_interactivity mode', () => {
    const title = getChartTitle('throughput', 'throughput_to_interactivity', 500, 'total');
    expect(title).toBe('Interactivity at 500 tok/s/gpu Throughput');
  });

  it('returns total power title with target label', () => {
    const title = getChartTitle('power', 'interactivity_to_throughput', 25, 'total');
    expect(title).toBe(
      'Total Tokens per Provisioned All-in Megawatt at 25 tok/s/user Interactivity',
    );
  });

  it('returns input power title when costType is input', () => {
    const title = getChartTitle('power', 'interactivity_to_throughput', 25, 'input');
    expect(title).toBe(
      'Input Tokens per Provisioned All-in Megawatt at 25 tok/s/user Interactivity',
    );
  });

  it('returns output power title when costType is output', () => {
    const title = getChartTitle('power', 'interactivity_to_throughput', 25, 'output');
    expect(title).toBe(
      'Output Tokens per Provisioned All-in Megawatt at 25 tok/s/user Interactivity',
    );
  });

  it('returns cost title with provider and cost type', () => {
    const title = getChartTitle('cost', 'interactivity_to_throughput', 30, 'input', 'costh');
    expect(title).toBe(
      'Cost per Million Input Tokens (Owning - Hyperscaler) at 30 tok/s/user Interactivity',
    );
  });

  it('returns cost title with total cost type and neocloud provider', () => {
    const title = getChartTitle('cost', 'interactivity_to_throughput', 30, 'total', 'costn');
    expect(title).toBe(
      'Cost per Million Total Tokens (Owning - Neocloud) at 30 tok/s/user Interactivity',
    );
  });

  it('returns cost title with output cost type and rental provider', () => {
    const title = getChartTitle('cost', 'interactivity_to_throughput', 30, 'output', 'costr');
    expect(title).toBe(
      'Cost per Million Output Tokens (Renting - 3yr Rental) at 30 tok/s/user Interactivity',
    );
  });

  it('defaults to hyperscaler when no costProvider is specified for cost', () => {
    const title = getChartTitle('cost', 'throughput_to_interactivity', 500, 'total');
    expect(title).toBe(
      'Cost per Million Total Tokens (Owning - Hyperscaler) at 500 tok/s/gpu Throughput',
    );
  });
});

// =========================================================================
// getSortedResults()
// =========================================================================

describe('getSortedResults', () => {
  const results: InterpolatedResult[] = [
    makeResult({
      hwKey: 'a',
      value: 300,
      outputTputValue: 270,
      inputTputValue: 30,
      tpPerMw: 800,
      inputTpPerMw: 200,
      outputTpPerMw: 700,
      cost: 2.0,
      costInput: 1.0,
    }),
    makeResult({
      hwKey: 'b',
      value: 500,
      outputTputValue: 450,
      inputTputValue: 50,
      tpPerMw: 1200,
      inputTpPerMw: 100,
      outputTpPerMw: 1100,
      cost: 1.0,
      costInput: 0.5,
    }),
    makeResult({
      hwKey: 'c',
      value: 100,
      outputTputValue: 90,
      inputTputValue: 10,
      tpPerMw: 2000,
      inputTpPerMw: 500,
      outputTpPerMw: 1500,
      cost: 3.0,
      costInput: 1.5,
    }),
  ];

  it('sorts by total throughput descending for throughput metric with total type', () => {
    const sorted = getSortedResults(results, 'throughput', 'total');
    expect(sorted.map((r) => r.hwKey)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by output throughput descending for throughput metric with output type', () => {
    const sorted = getSortedResults(results, 'throughput', 'output');
    expect(sorted.map((r) => r.hwKey)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by input throughput descending for throughput metric with input type', () => {
    const sorted = getSortedResults(results, 'throughput', 'input');
    expect(sorted.map((r) => r.hwKey)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by total tpPerMw descending for power metric with total type', () => {
    const sorted = getSortedResults(results, 'power', 'total');
    expect(sorted.map((r) => r.hwKey)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by input tpPerMw descending for power metric with input type', () => {
    const sorted = getSortedResults(results, 'power', 'input');
    // inputTpPerMw: a=200, b=100, c=500 → descending: c, a, b
    expect(sorted.map((r) => r.hwKey)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by output tpPerMw descending for power metric with output type', () => {
    const sorted = getSortedResults(results, 'power', 'output');
    // outputTpPerMw: a=700, b=1100, c=1500 → descending: c, b, a
    expect(sorted.map((r) => r.hwKey)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by total cost ascending for cost metric', () => {
    const sorted = getSortedResults(results, 'cost', 'total');
    expect(sorted.map((r) => r.hwKey)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by input cost ascending for cost metric with input type', () => {
    const sorted = getSortedResults(results, 'cost', 'input');
    expect(sorted.map((r) => r.hwKey)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the original results array', () => {
    const original = [...results];
    getSortedResults(results, 'power', 'total');
    expect(results).toEqual(original);
  });

  it('handles empty results array', () => {
    expect(getSortedResults([], 'throughput', 'total')).toEqual([]);
  });

  it('handles single-element array', () => {
    const single = [makeResult({ hwKey: 'x', value: 100 })];
    const sorted = getSortedResults(single, 'throughput', 'total');
    expect(sorted).toHaveLength(1);
    expect(sorted[0].hwKey).toBe('x');
  });
});
