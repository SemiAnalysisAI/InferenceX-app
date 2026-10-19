import type { CostType, InterpolatedResult } from './types';

export function getThroughputForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.inputTputValue;
  if (costType === 'output') return d.outputTputValue;
  return d.value;
}

export function getTpPerMwForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.inputTpPerMw;
  if (costType === 'output') return d.outputTpPerMw;
  return d.tpPerMw;
}

export function getComparableTpPerMwForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'total') return d.tpPerMw;
  if (typeof d.inputTokenShare !== 'number' || !Number.isFinite(d.inputTokenShare)) {
    return getTpPerMwForType(d, costType);
  }
  const share = Math.max(0, Math.min(1, d.inputTokenShare));
  return d.tpPerMw * (costType === 'input' ? share : 1 - share);
}
