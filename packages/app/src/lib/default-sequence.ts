import { Sequence } from './data-mappings';

/**
 * Effective-sequence resolution.
 *
 * `selectedSequence` defaults to {@link Sequence.EightK_OneK}, but the user may
 * have selected a scenario the model doesn't offer (e.g. Agentic Workloads via a
 * shared `?i_seq=` link on a fixed-seq-only model). This helper turns the raw
 * user/default selection into the sequence the chart should actually render,
 * given what the selected model offers.
 *
 * Three rules, in order:
 *
 * 1. **Availability gate.** Until availability rows have loaded we do NOT know
 *    which sequences the model has. Resolving eagerly here would pick the static
 *    fallback list (which contains every scenario) and make the page fetch +
 *    label a scenario the model may not have — e.g. an agentic `?i_seq=` link on
 *    Llama-3.3-70B — then snap to an available scenario once availability
 *    arrives: a visible flash plus a wasted request. When `availabilityLoaded`
 *    is false we return `null`; callers gate data fetching and selector display
 *    on a non-null result (a loading skeleton covers this window, which is
 *    short).
 *
 * 2. **Availability-driven default.** `selectedSequence` starts at the app-wide default
 *    (`8k/1k`) until the user actually picks something, so it can't distinguish
 *    "the user wants 8K/1K" from "nobody has chosen yet". `sequenceExplicit`
 *    makes that distinction: while it is false, any model with Agentic Workloads
 *    data opens on that scenario instead of 8K/1K. Any explicit selection turns
 *    the flag on and this rule stops applying.
 *
 * 3. **Fallback ordering.** Otherwise: keep the user's `selectedSequence` if the
 *    model has it. Otherwise fall back to a sensible fixed-seq scenario.
 *    `availableSequences[0]` follows DB row order, which can surface `1k/1k`
 *    even when `8k/1k` exists — but `8k/1k` is the app default scenario, so
 *    prefer it when present. Only if neither the selection nor `8k/1k` is
 *    available do we fall to `availableSequences[0]`.
 */
export function resolveEffectiveSequence({
  selectedSequence,
  availableSequences,
  availabilityLoaded,
  sequenceExplicit = false,
}: {
  selectedSequence: Sequence;
  availableSequences: Sequence[];
  availabilityLoaded: boolean;
  /** Whether `selectedSequence` came from a real user/route choice. */
  sequenceExplicit?: boolean;
}): Sequence | null {
  // Rule 1: do not commit to a sequence before we know what the model has.
  if (!availabilityLoaded) return null;

  // Rule 2: nobody has chosen yet — prefer the real AgentX workload whenever
  // availability confirms that the selected model has data for it.
  if (!sequenceExplicit && availableSequences.includes(Sequence.AgenticTraces)) {
    return Sequence.AgenticTraces;
  }

  // Rule 3a: honor the user's / default selection when the model supports it.
  if (availableSequences.includes(selectedSequence)) return selectedSequence;

  // Rule 3b: prefer 8k/1k (the app default scenario) over whatever
  // availableSequences[0] happens to be (DB row order can yield 1k/1k).
  if (availableSequences.includes(Sequence.EightK_OneK)) return Sequence.EightK_OneK;

  // Rule 3c: last resort — first available, or the selection itself if the model
  // has no sequences at all (keeps the type non-null; downstream shows empty).
  return availableSequences[0] ?? selectedSequence;
}
