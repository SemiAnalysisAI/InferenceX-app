import { Scenario } from '../catalog/data-mappings';

export function resolveEffectiveScenario({
  selectedScenario,
  availableScenarios,
  availabilityLoaded,
  scenarioExplicit = false,
}: {
  selectedScenario: Scenario;
  availableScenarios: Scenario[];
  availabilityLoaded: boolean;
  scenarioExplicit?: boolean;
}): Scenario | null {
  if (!availabilityLoaded) return null;

  if (!scenarioExplicit && availableScenarios.includes(Scenario.AgenticTraces)) {
    return Scenario.AgenticTraces;
  }

  if (availableScenarios.includes(selectedScenario)) return selectedScenario;

  if (availableScenarios.includes(Scenario.EightK_OneK)) return Scenario.EightK_OneK;

  return availableScenarios[0] ?? selectedScenario;
}
