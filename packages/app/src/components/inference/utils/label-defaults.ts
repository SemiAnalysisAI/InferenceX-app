import type { ScenarioKind } from '@/lib/data-mappings';

export interface LabelState {
  showPointLabels: boolean;
  useAdvancedLabels: boolean;
  showLineLabels: boolean;
}

type LabelUrlParams = Partial<
  Record<'i_label' | 'i_nolabel' | 'i_advlabel' | 'i_linelabel', string>
>;

export function resolveLabelState(kind: ScenarioKind, params: LabelUrlParams): LabelState {
  const agentic = kind === 'agentic';

  let showPointLabels = agentic;
  if (params.i_nolabel === '1' || params.i_label === '0') showPointLabels = false;
  else if (params.i_label === '1') showPointLabels = true;
  else if (params.i_advlabel === '1') showPointLabels = true;

  return {
    showPointLabels,
    useAdvancedLabels:
      params.i_advlabel === '1' ? true : params.i_advlabel === '0' ? false : agentic,
    showLineLabels:
      params.i_linelabel === '1' ? true : params.i_linelabel === '0' ? false : !agentic,
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
