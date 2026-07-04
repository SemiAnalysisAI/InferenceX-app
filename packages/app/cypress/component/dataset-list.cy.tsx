import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { DatasetList } from '@/components/datasets/dataset-list';
import type { DatasetRecord } from '@/hooks/api/use-datasets';

const datasets: DatasetRecord[] = [
  {
    id: 'ds-1',
    slug: 'cc-traces-weka-full',
    label: 'cc-traces-weka (full)',
    variant: 'full',
    description: 'Every captured request, unmodified.',
    hf_url: 'https://huggingface.co/datasets/semianalysisai/cc-traces-weka-full',
    license: 'apache-2.0',
    conversation_count: 1234,
    summary: {
      totalIn: 5_000_000,
      totalOut: 250_000,
      cachedPct: 0.82,
      mainTurns: 9800,
      subagentGroups: 540,
    },
    ingested_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'ds-2',
    slug: 'cc-traces-weka-256k',
    label: 'cc-traces-weka (256k)',
    variant: '256k',
    description: 'Turns trimmed to a 256k context window.',
    hf_url: null,
    license: 'apache-2.0',
    conversation_count: 980,
    summary: {
      totalIn: 3_200_000,
      totalOut: 180_000,
      cachedPct: 0.79,
      mainTurns: 7600,
      subagentGroups: 410,
    },
    ingested_at: '2026-06-19T00:00:00Z',
  },
];

function createMockRouter() {
  return {
    push: cy.stub(),
    replace: cy.stub(),
    refresh: cy.stub(),
    back: cy.stub(),
    forward: cy.stub(),
    prefetch: cy.stub().resolves(),
  };
}

function mountList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cy.mount(
    <AppRouterContext.Provider value={createMockRouter()}>
      <QueryClientProvider client={queryClient}>
        <DatasetList />
      </QueryClientProvider>
    </AppRouterContext.Provider>,
  );
}

describe('DatasetList', () => {
  it('renders a card per dataset with its summary stats', () => {
    cy.intercept('GET', '/api/v1/datasets', { statusCode: 200, body: datasets }).as('list');
    mountList();
    cy.wait('@list');
    cy.contains('cc-traces-weka (full)').should('be.visible');
    cy.contains('cc-traces-weka (256k)').should('be.visible');
    cy.contains('1,234').should('be.visible'); // conversation_count, localized
    cy.contains('82%').should('be.visible'); // cachedPct
    cy.get('a[href="/datasets/cc-traces-weka-full"]').should('exist');
  });

  it('shows the empty state when no datasets are ingested', () => {
    cy.intercept('GET', '/api/v1/datasets', { statusCode: 200, body: [] }).as('empty');
    mountList();
    cy.wait('@empty');
    cy.contains('No datasets ingested yet.').should('be.visible');
  });

  it('shows the error state when the request fails', () => {
    cy.intercept('GET', '/api/v1/datasets', { statusCode: 500, body: { error: 'boom' } }).as('err');
    mountList();
    cy.wait('@err');
    cy.contains('Failed to load datasets.').should('be.visible');
  });
});
