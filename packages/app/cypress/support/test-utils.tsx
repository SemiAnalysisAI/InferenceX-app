import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { InferenceContext } from '@/components/inference/InferenceContext';
import { EvaluationContext } from '@/components/evaluation/EvaluationContext';
import { ReliabilityContext } from '@/components/reliability/ReliabilityContext';
import { GlobalFilterContext } from '@/components/GlobalFilterContext';
import { UnofficialRunContext } from '@/components/unofficial-run-provider';

import type { InferenceChartContextType } from '@/components/inference/types';
import type { EvaluationChartContextType } from '@/components/evaluation/types';
import type { ReliabilityChartContextType } from '@/components/reliability/types';
import type { GlobalFilterContextType } from '@/components/GlobalFilterContext';
import type { UnofficialRunContextType } from '@/components/unofficial-run-provider';

import {
  createMockInferenceContext,
  createMockEvaluationContext,
  createMockReliabilityContext,
  createMockGlobalFilterContext,
  createMockUnofficialRunContext,
} from './mock-data';

export interface ProviderOverrides {
  inference?: Partial<InferenceChartContextType>;
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
    const value = createMockInferenceContext(overrides.inference);
    tree = <InferenceContext.Provider value={value}>{tree}</InferenceContext.Provider>;
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
