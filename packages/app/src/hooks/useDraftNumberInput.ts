import { useState, type ChangeEvent, type KeyboardEvent } from 'react';

export type DraftNumberCommit = 'step' | 'blur';

/**
 * A number input whose typed text stays a draft until blur or Enter, so a half-typed value never
 * recomputes the page. Spinner clicks and arrow keys still commit at once: their input event has
 * no inputType and moves the value by at most one step. Any other change, including synthetic or
 * autofill events without an inputType, stays a draft.
 *
 * An adjacent slider shows `sliderValue` (a valid draft, else the committed value), so its thumb
 * sits at the typed number. Moving the slider is an explicit new choice: call `discardDraft`
 * before applying it, so the draft can never land on top of the slider's value.
 */
export function useDraftNumberInput(
  value: number,
  parse: (raw: string) => number | null,
  commit: (next: number, source: DraftNumberCommit) => void,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const parsedDraft = draft === null ? null : parse(draft);
  return {
    sliderValue: parsedDraft ?? value,
    discardDraft: () => setDraft(null),
    input: {
      value: draft ?? String(value),
      'aria-invalid': draft !== null && parsedDraft === null,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value;
        const next = parse(raw);
        const previous = parse(draft ?? String(value));
        const step = Number(event.target.step) || 1;
        const isStep =
          !(event.nativeEvent as InputEvent).inputType &&
          next !== null &&
          previous !== null &&
          next !== previous &&
          Math.abs(next - previous) <= step;
        if (!isStep) {
          setDraft(raw);
          return;
        }
        setDraft(null);
        commit(next, 'step');
      },
      onBlur: () => {
        setDraft(null);
        commit(parsedDraft ?? value, 'blur');
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      },
    },
  };
}
