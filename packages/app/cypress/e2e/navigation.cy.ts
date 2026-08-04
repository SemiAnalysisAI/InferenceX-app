// Merged from tabs.cy.ts and first-load-navigation.cy.ts
// to reduce per-file Cypress startup overhead (~500ms per file)

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
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-starred');
        win.localStorage.removeItem('inferencex-star-modal-dismissed');
        win.localStorage.removeItem('inferencex-kimi-k3-modal-dismissed');
        win.localStorage.removeItem('inferencex-kimi-k3-banner-dismissed');
      },
    });

    // Banner (inline) and overlay modal coexist in independent slots.
    cy.get('[data-testid="launch-modal"]').should('be.visible');
    cy.get('body').should('not.have.attr', 'data-scroll-locked');
  });

  it('navigates to articles from the footer while the launch modal is visible', () => {
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

  it('navigates to submissions from the landing CTA', () => {
    cy.get('[data-testid="landing-submissions-link"]').click();
    cy.location('pathname').should('eq', '/submissions');
  });
});
