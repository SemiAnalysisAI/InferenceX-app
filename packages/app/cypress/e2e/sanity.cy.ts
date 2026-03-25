// Merged from basic.cy.ts, navigation.cy.ts, and theme-toggle.cy.ts
// to reduce per-file Cypress startup overhead (~500ms per file)

describe('Page Load & Navigation', () => {
  before(() => {
    cy.visit('/');
  });

  it('page loads with correct title', () => {
    cy.title().should('contain', 'InferenceX');
  });

  it('page renders without JavaScript errors', () => {
    const errors: string[] = [];
    const knownBrowserErrors = ['navigator.storage.persisted'];

    cy.on('uncaught:exception', (err) => {
      const isKnown = knownBrowserErrors.some((known) => err.message.includes(known));
      if (!isKnown) {
        errors.push(err.message);
      }
      return false; // prevent Cypress from failing the test
    });

    // Re-visit to capture errors from a fresh load
    cy.visit('/');
    cy.get('[data-testid="scatter-graph"]').should('exist');
    cy.wrap(errors).should('have.length', 0);
  });

  it('page loads without 404 errors', () => {
    cy.visit('/');
    cy.get('[data-testid="scatter-graph"]').should('exist');
    cy.get('body').should('not.contain.text', 'Not Found');
  });
});

// Toggle visibility, click behavior, and aria-label are covered by
// cypress/component/mode-toggle.cy.tsx. Only the reload-persistence test
// requires a full page load (true e2e concern).
describe('Theme Toggle', () => {
  it('theme persists across page reload (localStorage)', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      win.localStorage.setItem('theme', 'light');
    });
    cy.visit('/');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.reload();
    cy.get('html').should('have.class', 'dark');
  });
});
