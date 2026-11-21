import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { DatasetList } from '@/components/datasets/dataset-list';
import type { DatasetRecord } from '@/hooks/api/use-datasets';
import { createMockRouter } from '../support/mock-router';

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

function mountList(locale: 'en' | 'zh' = 'en') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cy.mount(
    <AppRouterContext.Provider value={createMockRouter()}>
      <PathnameContext.Provider value={locale === 'zh' ? '/zh/infx/agentx' : '/infx/agentx'}>
        <QueryClientProvider client={queryClient}>
          <DatasetList />
        </QueryClientProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}

describe('DatasetList', () => {
  for (const locale of ['en', 'zh'] as const) {
    for (const width of [1280, 390]) {
      it(`describes the 256K dataset with missing metadata in ${locale} at ${width}px`, () => {
        cy.viewport(width, 844);
        const slug = 'cc-traces-weka-062126-256k';
        cy.intercept('GET', '/api/v1/datasets', {
          statusCode: 200,
          body: [{ ...datasets[1], slug, description: null }, datasets[0]],
        }).as('list');
        mountList(locale);
        cy.wait('@list');
        const prefix = locale === 'zh' ? '/zh' : '';
        cy.get(`a[href="${prefix}/infx/agentx/${slug}"]`)
          .find('[data-testid="dataset-description"]')
          .should('be.visible')
          .and('contain.text', '256,000')
          .and('contain.text', locale === 'zh' ? 'input 与 output 合计' : 'input + output')
          .and('contain.text', locale === 'zh' ? '相对时间' : 'relative timing');
        cy.get(`a[href="${prefix}/infx/agentx/cc-traces-weka-full"]`)
          .find('[data-testid="dataset-description"]')
          .should('have.text', datasets[0].description);
        if (width === 1280) {
          cy.get('[data-testid="dataset-description"]').should(($descriptions) => {
            const tops = $descriptions
              .toArray()
              .map((p) => p.nextElementSibling!.getBoundingClientRect().top);
            expect(tops[0], 'conversation statistics align across cards').to.be.closeTo(tops[1], 1);
          });
        }
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
        });
      });
    }
  }
});
