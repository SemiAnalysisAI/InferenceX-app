'use client';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { toModel, toSequence } from '@/lib/compare-enum-coerce';
import { DEFAULT_Y_AXIS_METRIC } from '@/lib/url-state';

/**
 * Live InferenceX dashboard embedded on a `/model/[slug]` page, without the
 * header section (title, description, and model/scenario/metric/chip
 * selectors). The view is seeded to the page's model, its featured scenario
 * (AgentX where available, otherwise 8K→1K), and the default
 * total-tokens-per-$ y-axis metric; every chip config with data is
 * auto-selected so the embed renders populated charts on first paint.
 */
export default function EmbeddedModelDashboard({
  displayName,
  sequence,
}: {
  displayName: string;
  sequence: string;
}) {
  return (
    <GlobalFilterProvider
      initialModel={toModel(displayName)}
      initialSequence={toSequence(sequence)}
    >
      <InferenceProvider
        activeTab="inference"
        initialYAxisMetric={DEFAULT_Y_AXIS_METRIC}
        autoSelectAllGpus
      >
        <InferenceChartDisplay embedded />
      </InferenceProvider>
    </GlobalFilterProvider>
  );
}
