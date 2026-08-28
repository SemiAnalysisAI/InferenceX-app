import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { StackedAreaChart } from '@/components/inference/agentic-point/time-series-chart';

const sourceSeries = {
  local_compute: [{ t: 0, value: 300 }],
  'cache hit (HBM)': [{ t: 0, value: 400 }],
  'cache hit (CPU offload)': [{ t: 0, value: 200 }],
  'cache hit (NVMe offload)': [{ t: 0, value: 100 }],
  'cache hit (weka)': [{ t: 0, value: 50 }],
};

function mountChart(pathname: string) {
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <StackedAreaChart sourceSeries={sourceSeries} durationS={1} />
    </PathnameContext.Provider>,
  );
}

describe('Agentic prompt-token source chart', () => {
  it('labels and colors each physical vLLM cache tier', () => {
    mountChart('/inference/agentic/421');

    cy.contains('Prefill').should('be.visible');
    cy.contains('HBM Cache Hit').should('be.visible');
    cy.contains('CPU Offload Cache Hit').should('be.visible');
    cy.contains('NVMe Offload Cache Hit').should('be.visible');
    cy.contains('Cache Hit (weka)').should('be.visible');
    cy.get('path[fill="#3b82f6"]').should('exist');
    cy.get('path[fill="#22c55e"]').should('exist');
    cy.get('path[fill="#a855f7"]').should('exist');
  });

  it('renders tier labels in Simplified Chinese on the /zh route', () => {
    mountChart('/zh/inference/agentic/421');

    cy.contains('HBM cache 命中').should('be.visible');
    cy.contains('CPU offload cache 命中').should('be.visible');
    cy.contains('NVMe offload cache 命中').should('be.visible');
    cy.contains('weka cache 命中').should('be.visible');
    cy.contains('prefill token 占比').should('be.visible');
    cy.contains('% of prefill tokens').should('not.exist');
  });
});
