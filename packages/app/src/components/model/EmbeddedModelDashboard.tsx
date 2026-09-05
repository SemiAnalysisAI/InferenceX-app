'use client';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { EphemeralUrlStateContext } from '@/hooks/useUrlState';
import { toModel, toSequence } from '@/lib/compare-enum-coerce';
import { DEFAULT_Y_AXIS_METRIC } from '@/lib/url-state';

/**
 * Live InferenceX dashboard embedded on a `/model/[slug]` page, without the
 * header section (title, description, and model/scenario/metric/chip
 * selectors). The view is seeded to the page's model, its featured scenario
 * (AgentX where available, otherwise 8K→1K), and the default
 * total-tokens-per-$ y-axis metric; every chip config with data is
 * auto-selected so the embed renders populated charts on first paint.
 *
 * The whole embed runs inside an ephemeral URL-state scope: its providers are
 * the same ones the primary dashboards use, and those persist their state in
 * the module-scoped store in `url-state.ts` that survives client-side
 * navigations. Without the scope, the embed's auto-populated selection (all
 * chip configs, seeded model/scenario) would overwrite that store, so
 * Back-navigating to a bare `/inference` would rebuild WITH the embed's state
 * — auto-populated chip configs and an unfolded config changelog the user
 * never selected.
 */
export default function EmbeddedModelDashboard({
  displayName,
  sequence,
  yAxisMetric = DEFAULT_Y_AXIS_METRIC,
  lockedFrameworks,
  minimalChrome,
}: {
  displayName: string;
  sequence: string;
  /** Initial y-axis metric; the dashboard default when omitted. */
  yAxisMetric?: string;
  /**
   * Pin the chart to these framework families (see `InferenceProvider`). Used
   * by `/embed/model/[slug]?framework=vllm` so a host page shows only the
   * serving engine it documents.
   */
  lockedFrameworks?: readonly string[];
  /** Chart + plain legend only; see `InferenceProvider.minimalChrome`. */
  minimalChrome?: boolean;
}) {
  return (
    <EphemeralUrlStateContext.Provider value={true}>
      <GlobalFilterProvider
        initialModel={toModel(displayName)}
        initialSequence={toSequence(sequence)}
      >
        <InferenceProvider
          activeTab="inference"
          initialYAxisMetric={yAxisMetric}
          autoSelectAllGpus
          lockedFrameworks={lockedFrameworks}
          minimalChrome={minimalChrome}
        >
          <InferenceChartDisplay embedded />
        </InferenceProvider>
      </GlobalFilterProvider>
    </EphemeralUrlStateContext.Provider>
  );
}
