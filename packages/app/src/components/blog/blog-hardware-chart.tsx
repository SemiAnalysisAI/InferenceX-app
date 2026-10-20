'use client';

import { useMemo } from 'react';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { EphemeralUrlStateContext } from '@/hooks/useUrlState';
import { toModel, toPrecisions, toSequence } from '@/lib/compare/compare-enum-coerce';
import { GlobalFilterProvider } from '@/providers/GlobalFilterContext';
import { UnofficialRunProvider } from '@/providers/unofficial-run-provider';

export function HardwareChart({
  model,
  a,
  b,
  metric,
  sequence = 'agentic-traces',
  precisions,
}: {
  model: string;
  a: string;
  b: string;
  metric?: string;
  sequence?: string;
  precisions?: string;
}) {
  const pair = useMemo(() => [a, b] as const, [a, b]);
  const initialPrecisions = useMemo(() => {
    const list = precisions?.split(',').flatMap((p) => toPrecisions(p.trim()) ?? []) ?? [];
    return list.length > 0 ? list : undefined;
  }, [precisions]);
  const initialModel = toModel(model);
  return (
    <div className="not-prose my-8">
      <EphemeralUrlStateContext.Provider value={true}>
        <UnofficialRunProvider>
          <GlobalFilterProvider
            initialModel={initialModel}
            initialSequence={toSequence(sequence)}
            initialPrecisions={initialPrecisions}
          >
            <InferenceProvider
              activeTab="compare"
              initialActiveHwTypes={[a, b]}
              compareGpuPair={pair}
              benchmarkQueryScope={`blog-pair:${a}:${b}`}
              initialBenchmarkModel={initialModel}
              initialYAxisMetric={metric}
            >
              <InferenceChartDisplay embedded />
            </InferenceProvider>
          </GlobalFilterProvider>
        </UnofficialRunProvider>
      </EphemeralUrlStateContext.Provider>
    </div>
  );
}
