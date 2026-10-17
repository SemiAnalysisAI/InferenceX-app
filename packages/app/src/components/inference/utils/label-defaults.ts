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
 * Viewports at least this wide open the agentic chart with the full detail
 * view: run names in coloured boxes and a parallelism chip ("DEP8",
 * "2xDEP8+1xDEP32") on every point. There is room for both beside the curves.
 */
export const WIDE_CHART_QUERY = '(min-width: 1024px)';

export interface LabelViewport {
  /** Whether `WIDE_CHART_QUERY` matches. */
  wide: boolean;
}

/**
 * Agentic charts open with per-point parallelism chips on wide viewports,
 * where they fit beside the curves. On a phone the same chips on every point
 * made the chart a wall of text that hid the curves, so narrow viewports open
 * with them off; the parallelism of any point is one tap away in its tooltip,
 * and the Parallelism Labels toggle turns the chips on (`i_advlabel=1`).
 * Fixed-sequence charts open with point labels off at every width.
 */
export function resolveLabelState(
  kind: ScenarioKind,
  params: LabelUrlParams,
  viewport?: LabelViewport,
): LabelState {
  const detailed = kind === 'agentic' && viewport?.wide === true;
  let showPointLabels = detailed;
  if (params.i_nolabel === '1' || params.i_label === '0') showPointLabels = false;
  else if (params.i_label === '1') showPointLabels = true;
  else if (params.i_advlabel === '1') showPointLabels = true;

  return {
    showPointLabels,
    useAdvancedLabels:
      params.i_advlabel === '1' ? true : params.i_advlabel === '0' ? false : detailed,
    // Line labels are on by default in every scenario. They name the curve
    // rather than the point, so they are how series are told apart without
    // hovering.
    showLineLabels: params.i_linelabel === '1' ? true : params.i_linelabel !== '0',
  };
}

export function serializeLabelState(
  kind: ScenarioKind,
  state: LabelState,
  viewport?: LabelViewport,
): LabelUrlParams {
  const defaults = resolveLabelState(kind, {}, viewport);

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
