// Merged from tabs.cy.ts and first-load-navigation.cy.ts
// to reduce per-file Cypress startup overhead (~500ms per file)

import { keepLaunchModal } from '../support/e2e';

describe('Chart Section Tabs — E2E', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
  });

  it('updates the URL path when switching tabs', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').click();
    cy.url().should('include', '/evaluation');

    cy.get('[data-testid="tab-trigger-historical"]').click();
    cy.url().should('include', '/historical');

    cy.get('[data-testid="tab-trigger-calculator"]').click();
    cy.url().should('include', '/calculator');

    cy.get('[data-testid="tab-trigger-gpu-specs"]').click();
    cy.url().should('include', '/gpu-specs');

    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.url().should('include', '/inference');
  });

  it('opens GPU Reliability from the footer link', () => {
    cy.get('[data-testid="tab-trigger-reliability"]').should('not.exist');

    cy.get('[data-testid="footer-link-reliability"]').scrollIntoView().click();
    cy.url().should('include', '/reliability');
    cy.get('[data-testid="reliability-chart-display"]').should('exist');
  });

  it('shows mobile chart select dropdown on small viewport', () => {
    cy.viewport(375, 812);
    cy.visit('/inference');
    cy.get('[data-testid="mobile-chart-select"]').should('be.visible');
  });
});

describe('First-load navigation', () => {
  // These specs need the launch modal to actually show on first load.
  before(keepLaunchModal);

  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-starred');
        // Snoozed, not cleared: dismissing the launch modal below makes the
        // star modal the next eligible landing nudge, and its corner card
        // would sit over the footer links these specs click.
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.removeItem('inferencex-agentic-results-modal-dismissed');
        win.localStorage.removeItem('inferencex-agentic-results-banner-dismissed');
      },
    });

    // The launch modal is centered behind a backdrop, so it owns the first
    // interaction — dismiss it before exercising the page underneath.
    cy.get('[data-testid="launch-modal"]').should('be.visible');
    cy.get('[data-testid="launch-modal-dismiss"]').click();
    cy.get('[data-testid="launch-modal"]').should('not.exist');
    cy.get('body').should('not.have.attr', 'data-scroll-locked');
  });

  it('navigates to articles from the footer after the launch modal is dismissed', () => {
    cy.get('[data-testid="footer-link-articles"]').scrollIntoView().click();
    cy.location('pathname').should('eq', '/blog');
  });

  it('navigates to overview from the top-level header link', () => {
    cy.get('[data-testid="nav-link-overview"]').click();
    cy.location('pathname').should('eq', '/overview');
  });

  it('navigates to dashboard from the header with one click', () => {
    cy.get('[data-testid="nav-link-dashboard"]').click();
    cy.location('pathname').should('eq', '/inference');
  });

  it('navigates to comparisons from the header with one click', () => {
    cy.get('[data-testid="nav-link-compare"]').click();
    cy.location('pathname').should('eq', '/compare');
  });

  it('navigates to AgentX from the header with one click', () => {
    cy.get('[data-testid="nav-link-agentx"]')
      .should('have.attr', 'href', '/agentx')
      .find('[data-nav-badge="agentx"]')
      .should('be.visible')
      .and('have.text', 'NEW');
    cy.get('[data-testid="nav-link-agentx"]').click();
    cy.location('pathname').should('eq', '/agentx');
  });

  it('navigates to overview and the full dashboard from the landing CTAs', () => {
    cy.get('[data-testid="landing-overview-link"]')
      .should('have.attr', 'href', '/overview')
      .click();
    cy.location('pathname').should('eq', '/overview');

    cy.visit('/');
    cy.get('[data-testid="landing-full-dashboard-link"]')
      .should('have.attr', 'href', '/inference')
      .click();
    cy.location('pathname').should('eq', '/inference');
  });

  it('leads the landing page with the AgentX hero and its three CTAs', () => {
    cy.get('[data-testid="compare-agentx-primary"]').within(() => {
      // The hero owns /compare's h1; on the landing page it is a section heading.
      cy.get('h2').should('have.text', 'Compare Realistic Agentic Inference Perf');
      cy.get('h1').should('not.exist');
      cy.get('[data-testid="compare-agentx-overview-link"]')
        .should('contain.text', 'Overview')
        .and('have.attr', 'href', '/overview');
      cy.get('[data-testid="compare-agentx-dashboard-link"]')
        .should('contain.text', 'Full dashboard')
        .and('have.attr', 'href', '/inference/kimi-k3?i_seq=agentic-traces&i_optimal=1');
      cy.get('[data-testid="compare-agentx-methodology-link"]')
        .should('contain.text', 'Methodology Deep Dive')
        .and('have.attr', 'href', '/agentx');
      cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 5);
      // Editorial order, not alphabetical — see FEATURED_AGENTX_MODEL_SLUGS.
      cy.get('[data-testid^="compare-agentx-model-"]').then(($rows) => {
        const slugs = [...$rows].map((row) =>
          (row.dataset.testid ?? '').replace('compare-agentx-model-', ''),
        );
        expect(slugs).to.deep.equal([
          'kimi-k3',
          'deepseek-v4',
          'glm-5-2',
          'minimax-m3',
          'qwen-3-5',
        ]);
      });
    });
    cy.get('[data-testid="compare-agentx-overview-link"]').click();
    cy.location('pathname').should('eq', '/overview');
  });

  it('navigates to submissions from the landing CTA', () => {
    cy.get('[data-testid="landing-submissions-link"]').click();
    cy.location('pathname').should('eq', '/submissions');
  });
});
