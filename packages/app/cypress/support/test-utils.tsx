import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  InferenceComparisonContext,
  InferenceCoreContext,
  InferenceTrackingContext,
} from '@/components/inference/InferenceContext';
import { EvaluationContext } from '@/components/evaluation/EvaluationContext';
import { ReliabilityContext } from '@/components/reliability/ReliabilityContext';
import {
  GlobalFilterContext,
  type GlobalFilterContextType,
} from '@/components/GlobalFilterContext';
import {
  UnofficialRunContext,
  type UnofficialRunContextType,
} from '@/components/unofficial-run-provider';

import type { EvaluationChartContextType } from '@/components/evaluation/types';
import type { ReliabilityChartContextType } from '@/components/reliability/types';

import {
  type MockInferenceContext,
  createMockInferenceContext,
  createMockEvaluationContext,
  createMockReliabilityContext,
  createMockGlobalFilterContext,
  createMockUnofficialRunContext,
} from './mock-data';

export interface ProviderOverrides {
  inference?: Partial<MockInferenceContext>;
  evaluation?: Partial<EvaluationChartContextType>;
  reliability?: Partial<ReliabilityChartContextType>;
  globalFilters?: Partial<GlobalFilterContextType>;
  unofficial?: Partial<UnofficialRunContextType>;
}

/**
 * Build a nested provider tree from the given overrides.
 * Only providers whose keys are present in `overrides` are included;
 * the rest are omitted so components that don't need them aren't forced
 * into a provider. A `QueryClientProvider` is always included as the
 * outermost wrapper since any React Query hook will need it.
 */
export function mountWithProviders(
  component: React.ReactElement,
  overrides: ProviderOverrides = {},
): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  let tree = component;

  if (overrides.inference !== undefined) {
    // One flat mock value satisfies all three split inference contexts; feed it
    // to each provider so a component reading any sub-context resolves against
    // the same override object.
    const value = createMockInferenceContext(overrides.inference);
    tree = (
      <InferenceCoreContext.Provider value={value}>
        <InferenceComparisonContext.Provider value={value}>
          <InferenceTrackingContext.Provider value={value}>
            {tree}
          </InferenceTrackingContext.Provider>
        </InferenceComparisonContext.Provider>
      </InferenceCoreContext.Provider>
    );
  }

  if (overrides.evaluation !== undefined) {
    const value = createMockEvaluationContext(overrides.evaluation);
    tree = <EvaluationContext.Provider value={value}>{tree}</EvaluationContext.Provider>;
  }

  if (overrides.reliability !== undefined) {
    const value = createMockReliabilityContext(overrides.reliability);
    tree = <ReliabilityContext.Provider value={value}>{tree}</ReliabilityContext.Provider>;
  }

  if (overrides.globalFilters !== undefined) {
    const value = createMockGlobalFilterContext(overrides.globalFilters);
    tree = <GlobalFilterContext.Provider value={value}>{tree}</GlobalFilterContext.Provider>;
  }

  if (overrides.unofficial !== undefined) {
    const value = createMockUnofficialRunContext(overrides.unofficial);
    tree = <UnofficialRunContext.Provider value={value}>{tree}</UnofficialRunContext.Provider>;
  }

  tree = <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>;

  cy.mount(tree);
}
