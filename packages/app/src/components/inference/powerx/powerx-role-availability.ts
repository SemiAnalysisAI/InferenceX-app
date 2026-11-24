import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import type { AvailabilityIndex } from '@/lib/benchmarks/availability-index';

/** The scenario the PowerX filters select besides the model: sequence and precisions. */
export interface PowerXRoleScenario {
  sequence: string;
  precisions: readonly string[];
}

/**
 * The display models (from `models`, in that order) with disaggregated prefill/decode
 * results for the scenario, matched the way the inference filters match availability
 * lines: the model's DB keys, the line's sequence and one of the selected precisions.
 */
export function modelsWithRoleData(
  availability: AvailabilityIndex | undefined,
  scenario: PowerXRoleScenario,
  models: readonly string[],
): string[] {
  if (!availability) return [];
  return models.filter((model) =>
    (DISPLAY_MODEL_TO_DB[model] ?? [model]).some((key) =>
      (availability.linesByModel.get(key) ?? []).some(
        (line) =>
          line.disagg &&
          line.sequence === scenario.sequence &&
          scenario.precisions.includes(line.precision),
      ),
    ),
  );
}
