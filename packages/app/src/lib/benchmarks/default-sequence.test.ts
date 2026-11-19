import { describe, expect, it } from 'vitest';

import { Sequence } from '../catalog/data-mappings';
import { resolveEffectiveSequence } from './default-sequence';

describe('resolveEffectiveSequence', () => {
  describe('availability gate (rule 1)', () => {
    it('returns null while availability has not loaded, even if the selection looks valid', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.AgenticTraces,
          availableSequences: [
            Sequence.OneK_OneK,
            Sequence.OneK_EightK,
            Sequence.EightK_OneK,
            Sequence.AgenticTraces,
          ],
          availabilityLoaded: false,
        }),
      ).toBeNull();
    });

    it('returns null pre-availability regardless of the selected sequence', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.EightK_OneK,
          availableSequences: [Sequence.EightK_OneK],
          availabilityLoaded: false,
        }),
      ).toBeNull();
    });
  });

  describe('availability-driven AgentX default (rule 2)', () => {
    it('opens the Agentic scenario whenever the model has data and the user has not chosen', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.EightK_OneK,
          availableSequences: [Sequence.EightK_OneK, Sequence.AgenticTraces],
          availabilityLoaded: true,
          sequenceExplicit: false,
        }),
      ).toBe(Sequence.AgenticTraces);
    });

    it('yields to an explicit selection', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.EightK_OneK,
          availableSequences: [Sequence.EightK_OneK, Sequence.AgenticTraces],
          availabilityLoaded: true,
          sequenceExplicit: true,
        }),
      ).toBe(Sequence.EightK_OneK);
    });

    it('keeps the app default when the model has no Agentic data', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.EightK_OneK,
          availableSequences: [Sequence.EightK_OneK],
          availabilityLoaded: true,
          sequenceExplicit: false,
        }),
      ).toBe(Sequence.EightK_OneK);
    });

    it('does not apply before availability has loaded', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.EightK_OneK,
          availableSequences: [Sequence.EightK_OneK, Sequence.AgenticTraces],
          availabilityLoaded: false,
          sequenceExplicit: false,
        }),
      ).toBeNull();
    });
  });

  describe('honors a valid selection (rule 3a)', () => {
    it('keeps AgenticTraces when the model actually has agentic data (dsr1 case)', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.AgenticTraces,
          availableSequences: [Sequence.EightK_OneK, Sequence.AgenticTraces],
          availabilityLoaded: true,
        }),
      ).toBe(Sequence.AgenticTraces);
    });

    it('keeps a fixed-seq selection when available', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.OneK_OneK,
          availableSequences: [Sequence.OneK_OneK, Sequence.EightK_OneK],
          availabilityLoaded: true,
        }),
      ).toBe(Sequence.OneK_OneK);
    });
  });

  describe('fallback ordering when the selection is unavailable (rule 3b/3c)', () => {
    it('for a fixed-seq-only model, an agentic selection falls back to 8k/1k, not the raw first entry (llama70b case)', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.AgenticTraces,
          availableSequences: [Sequence.EightK_OneK],
          availabilityLoaded: true,
        }),
      ).toBe(Sequence.EightK_OneK);
    });

    it('prefers 8k/1k over availableSequences[0] when both 1k/1k and 8k/1k exist', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.AgenticTraces,
          availableSequences: [Sequence.OneK_OneK, Sequence.EightK_OneK],
          availabilityLoaded: true,
        }),
      ).toBe(Sequence.EightK_OneK);
    });

    it('falls back to availableSequences[0] when 8k/1k is not available', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.AgenticTraces,
          availableSequences: [Sequence.OneK_OneK, Sequence.OneK_EightK],
          availabilityLoaded: true,
        }),
      ).toBe(Sequence.OneK_OneK);
    });

    it('never resolves to AgenticTraces via fallback when the model lacks it', () => {
      const result = resolveEffectiveSequence({
        selectedSequence: Sequence.AgenticTraces,
        availableSequences: [Sequence.OneK_OneK, Sequence.OneK_EightK, Sequence.EightK_OneK],
        availabilityLoaded: true,
      });
      expect(result).not.toBe(Sequence.AgenticTraces);
      expect(result).toBe(Sequence.EightK_OneK);
    });

    it('returns the selection itself when the model has no sequences at all', () => {
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.OneK_OneK,
          availableSequences: [],
          availabilityLoaded: true,
        }),
      ).toBe(Sequence.OneK_OneK);
    });
  });
});
