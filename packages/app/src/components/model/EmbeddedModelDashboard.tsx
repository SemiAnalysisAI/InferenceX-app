'use client';

import type { ChipBasis } from '@/lib/benchmarks/chip-basis';
import { GlobalFilterProvider } from '@/providers/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { EphemeralUrlStateContext } from '@/hooks/useUrlState';
import { toModel, toSequence } from '@/lib/compare/compare-enum-coerce';
import { DEFAULT_Y_AXIS_METRIC } from '@/lib/routing/url-state';

export default function EmbeddedModelDashboard({
  displayName,
  sequence,
  yAxisMetric = DEFAULT_Y_AXIS_METRIC,
  lockedFrameworks,
  minimalChrome,
  chipBasis,
}: {
  displayName: string;
  sequence: string;
  yAxisMetric?: string;
  lockedFrameworks?: readonly string[];
  minimalChrome?: boolean;
  chipBasis?: ChipBasis;
}) {
  return (
    <EphemeralUrlStateContext.Provider value={true}>
      <GlobalFilterProvider
        initialModel={toModel(displayName)}
        initialSequence={toSequence(sequence)}
        initialChipBasis={chipBasis}
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
