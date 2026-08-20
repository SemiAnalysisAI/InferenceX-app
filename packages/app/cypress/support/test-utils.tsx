import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import { EvaluationContext } from '@/components/evaluation/EvaluationContext';
import { ReliabilityContext } from '@/components/reliability/ReliabilityContext';
import {
  GlobalFilterActionsContext,
  GlobalFilterAvailabilityContext,
  GlobalFilterRunContext,
  GlobalFilterSelectionContext,
  GlobalFilterWorkflowContext,
} from '@/components/GlobalFilterContext';
import {
  UnofficialRunContext,
  type UnofficialRunContextType,
} from '@/components/unofficial-run-provider';

import type { EvaluationChartContextType } from '@/components/evaluation/types';
import type { ReliabilityChartContextType } from '@/components/reliability/types';

import {
  createMockInferenceContextValues,
  createMockEvaluationContext,
  createMockReliabilityContext,
  createMockGlobalFilterContexts,
  createMockUnofficialRunContext,
  type GlobalFilterContextOverrides,
  type MockInferenceContextValues,
} from './mock-data';

export interface ProviderOverrides {
  inference?: Partial<MockInferenceContextValues>;
  evaluation?: Partial<EvaluationChartContextType>;
  reliability?: Partial<ReliabilityChartContextType>;
  globalFilters?: GlobalFilterContextOverrides;
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
    const value = createMockInferenceContextValues(overrides.inference);
    tree = (
      <InferenceContextsProvider data={value} filters={value} display={value} actions={value}>
        {tree}
      </InferenceContextsProvider>
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
    const values = createMockGlobalFilterContexts(overrides.globalFilters);
    tree = (
      <GlobalFilterActionsContext.Provider value={values.actions}>
        <GlobalFilterSelectionContext.Provider value={values.selection}>
          <GlobalFilterRunContext.Provider value={values.run}>
            <GlobalFilterAvailabilityContext.Provider value={values.availability}>
              <GlobalFilterWorkflowContext.Provider value={values.workflow}>
                {tree}
              </GlobalFilterWorkflowContext.Provider>
            </GlobalFilterAvailabilityContext.Provider>
          </GlobalFilterRunContext.Provider>
        </GlobalFilterSelectionContext.Provider>
      </GlobalFilterActionsContext.Provider>
    );
  }

  if (overrides.unofficial !== undefined) {
    const value = createMockUnofficialRunContext(overrides.unofficial);
    tree = <UnofficialRunContext.Provider value={value}>{tree}</UnofficialRunContext.Provider>;
  }

  tree = <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>;

  cy.mount(tree);
}
