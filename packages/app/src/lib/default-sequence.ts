import { Sequence } from './data-mappings';

/**
 * Effective-sequence resolution.
 *
 * `selectedSequence` defaults to {@link Sequence.AgenticTraces} (a deliberate
 * product choice — agentic-preferred), but not every model has agentic data.
 * This helper turns the raw user/default selection into the sequence the chart
 * should actually render, given what the selected model offers.
 *
 * Two rules, in order:
 *
 * 1. **Availability gate.** Until availability rows have loaded we do NOT know
 *    which sequences the model has. Resolving eagerly here would pick the static
 *    fallback list (which contains AgenticTraces) and make the page fetch + label
 *    an agentic scenario for fixed-seq-only models (e.g. Llama-3.3-70B), then
 *    snap to a fixed-seq scenario once availability arrives — a visible flash of
 *    "Agentic Traces" plus a wasted request. When `availabilityLoaded` is false
 *    we return `null`; callers gate data fetching and selector display on a
 *    non-null result (a loading skeleton covers this window, which is short).
 *
 * 2. **Fallback ordering.** Once availability is known: keep the user's
 *    `selectedSequence` if the model has it. Otherwise fall back to a sensible
 *    fixed-seq scenario. `availableSequences[0]` follows DB row order, which can
 *    surface `1k/1k` even when `8k/1k` exists — but `8k/1k` was the pre-agentic
 *    default for non-agentic models, so prefer it when present to match that
 *    long-standing behavior. Only if neither the selection nor `8k/1k` is
 *    available do we fall to `availableSequences[0]`.
 */
export function resolveEffectiveSequence({
  selectedSequence,
  availableSequences,
  availabilityLoaded,
}: {
  selectedSequence: Sequence;
  availableSequences: Sequence[];
  availabilityLoaded: boolean;
}): Sequence | null {
  // Rule 1: do not commit to a sequence before we know what the model has.
  if (!availabilityLoaded) return null;

  // Rule 2a: honor the user's / default selection when the model supports it.
  if (availableSequences.includes(selectedSequence)) return selectedSequence;

  // Rule 2b: prefer 8k/1k (the pre-agentic default for non-agentic models) over
  // whatever availableSequences[0] happens to be (DB row order can yield 1k/1k).
  if (availableSequences.includes(Sequence.EightK_OneK)) return Sequence.EightK_OneK;

  // Rule 2c: last resort — first available, or the selection itself if the model
  // has no sequences at all (keeps the type non-null; downstream shows empty).
  return availableSequences[0] ?? selectedSequence;
}
