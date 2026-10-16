import type { ScenarioKind } from '@/lib/catalog/data-mappings';

export interface LabelState {
  showPointLabels: boolean;
  useAdvancedLabels: boolean;
  showLineLabels: boolean;
}

type LabelUrlParams = Partial<
  Record<'i_label' | 'i_nolabel' | 'i_advlabel' | 'i_linelabel', string>
>;

/**
 * Every scenario, agentic included, opens with per-point labels off. Printing
 * a parallelism chip ("DEP8", "2xDEP8+1xDEP32") on every agentic point made
 * the default chart a wall of text that hid the curves and pushed the run-name
 * line labels off their lines. The curves are identified by their line labels;
 * the parallelism of any point is one hover away in its tooltip, and the
 * Parallelism Labels toggle turns the chips back on (`i_advlabel=1`).
 *
 * `kind` is kept so scenarios can diverge again without changing callers.
 */
export function resolveLabelState(_kind: ScenarioKind, params: LabelUrlParams): LabelState {
  let showPointLabels = false;
  if (params.i_nolabel === '1' || params.i_label === '0') showPointLabels = false;
  else if (params.i_label === '1') showPointLabels = true;
  else if (params.i_advlabel === '1') showPointLabels = true;

  return {
    showPointLabels,
    useAdvancedLabels: params.i_advlabel === '1',
    // Line labels are on by default in every scenario. They name the curve
    // rather than the point, so they are how series are told apart without
    // hovering.
    showLineLabels: params.i_linelabel === '1' ? true : params.i_linelabel !== '0',
  };
}

export function serializeLabelState(kind: ScenarioKind, state: LabelState): LabelUrlParams {
  const defaults = resolveLabelState(kind, {});

  return {
    i_label:
      state.showPointLabels === defaults.showPointLabels ? '' : state.showPointLabels ? '1' : '0',
    i_advlabel:
      state.useAdvancedLabels === defaults.useAdvancedLabels
        ? ''
        : state.useAdvancedLabels
          ? '1'
          : '0',
    i_linelabel:
      state.showLineLabels === defaults.showLineLabels ? '' : state.showLineLabels ? '1' : '0',
  };
}
