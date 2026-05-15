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
        win.localStorage.removeItem('inferencex-dsv4-modal-dismissed');
        win.localStorage.removeItem('inferencex-dsv4-banner-dismissed-v2');
      },
    });

    // Banner (inline) and overlay modal coexist in independent slots.
    cy.get('[data-testid="dsv4-launch-modal"]').should('be.visible');
    cy.get('body').should('not.have.attr', 'data-scroll-locked');
  });

  it('navigates to articles with one click while the launch modal is visible', () => {
    cy.get('[data-testid="nav-link-blog"]').click();
    cy.location('pathname').should('eq', '/blog');
  });

  it('navigates to dashboard from the header with one click', () => {
    cy.get('[data-testid="nav-link-dashboard"]').click();
    cy.location('pathname').should('eq', '/inference');
  });

  it('navigates to comparisons from the header with one click', () => {
    cy.get('[data-testid="nav-link-compare"]').click();
    cy.location('pathname').should('eq', '/compare');
  });

  it('navigates to dashboard from the landing CTA with one click', () => {
    cy.contains('a', 'Open Dashboard').click();
    cy.location('pathname').should('eq', '/inference');
  });
});
