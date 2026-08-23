import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { LandingQuickComparisons } from '@/components/landing/landing-page';

describe('Dormant Quick Comparisons section', () => {
  it('preserves the English rendering when the section is enabled', () => {
    cy.mount(
      <PathnameContext.Provider value="/">
        <LandingQuickComparisons locale="en" />
      </PathnameContext.Provider>,
    );

    cy.get('[data-testid="landing-quick-comparisons"]')
      .should('contain.text', 'Quick Comparisons')
      .and('contain.text', 'Kimi K3 — First Look');
    cy.get('[data-testid="curated-view-kimi-k3-launch"]').should(
      'have.attr',
      'href',
      '/inference?preset=kimi-k3-launch',
    );
  });

  it('renders Chinese chrome and preset copy when the section is enabled on /zh', () => {
    cy.mount(
      <PathnameContext.Provider value="/zh">
        <LandingQuickComparisons locale="zh" />
      </PathnameContext.Provider>,
    );

    cy.get('[data-testid="landing-quick-comparisons"]')
      .should('contain.text', '快速对比')
      .and('contain.text', '一键进入最热门的芯片推理基准测试对比')
      .and('contain.text', 'Kimi K3 — 首发基准测试');
    cy.get('[data-testid="curated-view-kimi-k3-launch"]').should(
      'have.attr',
      'href',
      '/zh/inference?preset=kimi-k3-launch',
    );
  });
});
