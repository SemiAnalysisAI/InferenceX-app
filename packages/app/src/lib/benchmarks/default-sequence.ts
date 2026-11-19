import { Sequence } from '../catalog/data-mappings';

export function resolveEffectiveSequence({
  selectedSequence,
  availableSequences,
  availabilityLoaded,
  sequenceExplicit = false,
}: {
  selectedSequence: Sequence;
  availableSequences: Sequence[];
  availabilityLoaded: boolean;
  sequenceExplicit?: boolean;
}): Sequence | null {
  if (!availabilityLoaded) return null;

  if (!sequenceExplicit && availableSequences.includes(Sequence.AgenticTraces)) {
    return Sequence.AgenticTraces;
  }

  if (availableSequences.includes(selectedSequence)) return selectedSequence;

  if (availableSequences.includes(Sequence.EightK_OneK)) return Sequence.EightK_OneK;

  return availableSequences[0] ?? selectedSequence;
}
