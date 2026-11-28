import { describe, expect, it } from 'bun:test';

import { Scenario } from '../catalog/data-mappings';
import { resolveEffectiveScenario } from './default-scenario';

describe('resolveEffectiveScenario', () => {
  describe('availability gate (rule 1)', () => {
    it('returns null while availability has not loaded, even if the selection looks valid', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.AgenticTraces,
          availableScenarios: [
            Scenario.OneK_OneK,
            Scenario.OneK_EightK,
            Scenario.EightK_OneK,
            Scenario.AgenticTraces,
          ],
          availabilityLoaded: false,
        }),
      ).toBeNull();
    });

    it('returns null pre-availability regardless of the selected sequence', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.EightK_OneK,
          availableScenarios: [Scenario.EightK_OneK],
          availabilityLoaded: false,
        }),
      ).toBeNull();
    });
  });

  describe('availability-driven AgentX default (rule 2)', () => {
    it('opens the Agentic scenario whenever the model has data and the user has not chosen', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.EightK_OneK,
          availableScenarios: [Scenario.EightK_OneK, Scenario.AgenticTraces],
          availabilityLoaded: true,
          scenarioExplicit: false,
        }),
      ).toBe(Scenario.AgenticTraces);
    });

    it('yields to an explicit selection', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.EightK_OneK,
          availableScenarios: [Scenario.EightK_OneK, Scenario.AgenticTraces],
          availabilityLoaded: true,
          scenarioExplicit: true,
        }),
      ).toBe(Scenario.EightK_OneK);
    });

    it('keeps the app default when the model has no Agentic data', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.EightK_OneK,
          availableScenarios: [Scenario.EightK_OneK],
          availabilityLoaded: true,
          scenarioExplicit: false,
        }),
      ).toBe(Scenario.EightK_OneK);
    });

    it('does not apply before availability has loaded', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.EightK_OneK,
          availableScenarios: [Scenario.EightK_OneK, Scenario.AgenticTraces],
          availabilityLoaded: false,
          scenarioExplicit: false,
        }),
      ).toBeNull();
    });
  });

  describe('honors a valid selection (rule 3a)', () => {
    it('keeps AgenticTraces when the model actually has agentic data (dsr1 case)', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.AgenticTraces,
          availableScenarios: [Scenario.EightK_OneK, Scenario.AgenticTraces],
          availabilityLoaded: true,
        }),
      ).toBe(Scenario.AgenticTraces);
    });

    it('keeps a fixed-seq selection when available', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.OneK_OneK,
          availableScenarios: [Scenario.OneK_OneK, Scenario.EightK_OneK],
          availabilityLoaded: true,
        }),
      ).toBe(Scenario.OneK_OneK);
    });
  });

  describe('fallback ordering when the selection is unavailable (rule 3b/3c)', () => {
    it('for a fixed-seq-only model, an agentic selection falls back to 8k/1k, not the raw first entry (llama70b case)', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.AgenticTraces,
          availableScenarios: [Scenario.EightK_OneK],
          availabilityLoaded: true,
        }),
      ).toBe(Scenario.EightK_OneK);
    });

    it('prefers 8k/1k over availableScenarios[0] when both 1k/1k and 8k/1k exist', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.AgenticTraces,
          availableScenarios: [Scenario.OneK_OneK, Scenario.EightK_OneK],
          availabilityLoaded: true,
        }),
      ).toBe(Scenario.EightK_OneK);
    });

    it('falls back to availableScenarios[0] when 8k/1k is not available', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.AgenticTraces,
          availableScenarios: [Scenario.OneK_OneK, Scenario.OneK_EightK],
          availabilityLoaded: true,
        }),
      ).toBe(Scenario.OneK_OneK);
    });

    it('never resolves to AgenticTraces via fallback when the model lacks it', () => {
      const result = resolveEffectiveScenario({
        selectedScenario: Scenario.AgenticTraces,
        availableScenarios: [Scenario.OneK_OneK, Scenario.OneK_EightK, Scenario.EightK_OneK],
        availabilityLoaded: true,
      });
      expect(result).not.toBe(Scenario.AgenticTraces);
      expect(result).toBe(Scenario.EightK_OneK);
    });

    it('returns the selection itself when the model has no sequences at all', () => {
      expect(
        resolveEffectiveScenario({
          selectedScenario: Scenario.OneK_OneK,
          availableScenarios: [],
          availabilityLoaded: true,
        }),
      ).toBe(Scenario.OneK_OneK);
    });
  });
});
