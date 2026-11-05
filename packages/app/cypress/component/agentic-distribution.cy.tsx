import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { Distribution } from '@/components/inference/agentic-point/distribution';

const cssAnchor = document.createElement('noscript');
cssAnchor.id = '__next_css__DO_NOT_USE__';
document.head.append(cssAnchor);
require('@/app/globals.css');

function lognormalSample(count: number, mu: number, sigma: number): number[] {
  let seed = 987_654;
  const uniform = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed + 1) / 2147483649;
  };
  return Array.from({ length: count }, () => {
    const z = Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
    return Math.round(Math.exp(mu + sigma * z));
  });
}

const FIT_STROKE = '#a855f7';

function mountDistribution(values: number[], pathname = '/inference/agentic/96255') {
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <div style={{ width: 900, padding: 16 }}>
        <Distribution values={values} unit="tokens" />
      </div>
    </PathnameContext.Provider>,
  );
}

describe('Agentic ISL/OSL distribution', () => {
  it('bins on a log axis without a fitted overlay', () => {
    const values = lognormalSample(1500, 7.3, 0.9);
    mountDistribution(values);

    cy.contains('1,500 requests').should('be.visible');
    cy.contains('log scale').should('be.visible');
    cy.contains('lognormal fit').should('not.exist');
    cy.contains('μ=').should('not.exist');
    cy.get(`path[stroke="${FIT_STROKE}"]`).should('not.exist');
    cy.get('rect[opacity="0.55"]').should('have.length.greaterThan', 10);

    cy.get(
      'line[stroke="#3b82f6"], line[stroke="#22c55e"], line[stroke="#f59e0b"], line[stroke="#ef4444"]',
    ).should('have.length', 8);
  });

  it('spreads mass across the axis instead of piling it into the first bins', () => {
    mountDistribution(lognormalSample(1500, 7.3, 0.9));
    cy.get('rect[opacity="0.55"]').then(($bars) => {
      const heights = [...$bars].map((bar) => Number(bar.getAttribute('height')));
      const peakIndex = heights.indexOf(Math.max(...heights));
      expect(peakIndex).to.be.greaterThan(1);
      expect(peakIndex).to.be.lessThan(heights.length - 2);
    });
  });

  it('reports zero-token requests that a log axis cannot place', () => {
    const values = [...lognormalSample(400, 6, 0.8), 0, 0, 0];
    mountDistribution(values);
    cy.contains('400 requests').should('be.visible');
    cy.contains('3 requests with 0 tokens excluded from the log axis').should('be.visible');
  });

  it('still draws the histogram when every request is the same length', () => {
    mountDistribution(Array.from({ length: 50 }, () => 512));
    cy.contains('50 requests').should('be.visible');
    cy.get('rect[opacity="0.55"]').should('have.length.greaterThan', 0);
  });

  it('shows the empty placeholder when nothing can be plotted', () => {
    mountDistribution([]);
    cy.contains('No data').should('be.visible');
    cy.get(`path[stroke="${FIT_STROKE}"]`).should('not.exist');
  });

  it('renders in Simplified Chinese on the /zh route', () => {
    mountDistribution(lognormalSample(600, 7, 0.8), '/zh/inference/agentic/96255');
    cy.contains('600 个请求').should('be.visible');
    cy.contains('对数刻度').should('be.visible');
    cy.contains('数值（tokens，对数刻度）').should('be.visible');
    cy.contains('requests').should('not.exist');
  });
});
