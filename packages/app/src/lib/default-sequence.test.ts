import { describe, expect, it } from 'vitest';

import { Sequence } from './data-mappings';
import { resolveEffectiveSequence } from './default-sequence';

describe('resolveEffectiveSequence', () => {
  describe('availability gate (rule 1)', () => {
    it('returns null while availability has not loaded, even if the selection looks valid', () => {
      // Pre-availability, availableSequences is the static fallback (which
      // contains AgenticTraces). Resolving here would fetch + label an agentic
      // scenario for a fixed-seq-only model, so we hold off.
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

  describe('honors a valid selection (rule 2a)', () => {
    it('keeps AgenticTraces when the model actually has agentic data (dsr1 case)', () => {
      // DeepSeek-R1 in the seeded DB has both agentic and 8k/1k — an explicit
      // agentic selection (e.g. a shared ?i_seq= link) must survive.
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

  describe('fallback ordering when the selection is unavailable (rule 2b/2c)', () => {
    it('for a fixed-seq-only model, an agentic selection falls back to 8k/1k, not the raw first entry (llama70b case)', () => {
      // Llama-3.3-70B has only 8k/1k in the seeded DB. An agentic selection is
      // unavailable, so it must resolve to a fixed-seq scenario — here the sole
      // available one.
      expect(
        resolveEffectiveSequence({
          selectedSequence: Sequence.AgenticTraces,
          availableSequences: [Sequence.EightK_OneK],
          availabilityLoaded: true,
        }),
      ).toBe(Sequence.EightK_OneK);
    });

    it('prefers 8k/1k over availableSequences[0] when both 1k/1k and 8k/1k exist', () => {
      // DB row order can surface 1k/1k first. 8k/1k is the app default
      // scenario, so prefer it rather than snapping to 1k/1k.
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
      // Degenerate case: keeps a non-null value so the type contract holds; the
      // chart shows empty. (availabilityLoaded true but zero sequences.)
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
