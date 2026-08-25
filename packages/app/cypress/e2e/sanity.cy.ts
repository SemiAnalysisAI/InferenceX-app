// Merged from basic.cy.ts, navigation.cy.ts, theme-toggle.cy.ts, and land-acknowledgement.cy.ts
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
    cy.get('[data-testid="header"]').should('exist');
    cy.get('[data-testid="footer"]').should('exist');
    cy.wrap(errors).should('have.length', 0);
  });

  it('page loads without 404 errors', () => {
    cy.visit('/');
    cy.get('[data-testid="header"]').should('exist');
    cy.get('[data-testid="footer"]').should('exist');
  });

  it('navigates from the footer to the land acknowledgement page', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });

    cy.get('[data-testid="footer-link-land-acknowledgement"]').scrollIntoView().click();

    cy.location('pathname').should('eq', '/land-acknowledgement');
    cy.get('[data-testid="land-acknowledgement-page"]').within(() => {
      cy.get('h1').should('contain.text', 'Indigenous homelands');
      cy.get('[data-testid="land-acknowledgement-san-jose"]').should(
        'contain.text',
        'Muwekma Ohlone Tribe',
      );
      cy.get('[data-testid="land-acknowledgement-los-angeles"]').should('contain.text', 'Tongva');
      cy.get('[data-testid="land-acknowledgement-chicago"]').should(
        'contain.text',
        'Council of the Three Fires',
      );
    });
  });

  it('opens and preserves a direct link to an FAQ answer', () => {
    cy.visit('/about#faq-normalized-interactivity', {
      onBeforeLoad(win) {
        cy.stub(win.navigator.clipboard, 'writeText').as('writeFaqLink').resolves();
      },
    });

    cy.get('#faq-normalized-interactivity')
      .should('be.visible')
      .within(() => {
        cy.contains(
          'a[href="#faq-normalized-interactivity"]',
          'What is the difference between E2E Normalized Interactivity and Interactivity?',
        ).should('be.visible');
        cy.contains('The normalized value penalizes slow TTFT').should('be.visible');
        cy.get('[data-testid="faq-copy-link-faq-normalized-interactivity"]')
          .should('be.visible')
          .and('contain.text', 'Copy link')
          .click()
          .should('contain.text', 'Copied');
      });
    cy.get('@writeFaqLink').should(
      'have.been.calledOnceWith',
      `${Cypress.config('baseUrl')}/about#faq-normalized-interactivity`,
    );
    cy.location('hash').should('eq', '#faq-normalized-interactivity');
  });

  it('shows a copy-link button for every FAQ question', () => {
    cy.visit('/about');

    cy.get('[data-testid^="faq-copy-link-"]')
      .should('have.length', 15)
      .each(($button) => {
        cy.wrap($button).should('be.visible').and('contain.text', 'Copy link');
      });
  });
});

// Toggle visibility, click behavior, and aria-label are covered by
// cypress/component/mode-toggle.cy.tsx. Only the reload-persistence test
// requires a full page load (true e2e concern).
describe('Splash text', () => {
  it('announces AgentX on the landing page in both light and dark mode', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('theme', 'light');
      },
    });
    cy.get('html').should('not.have.class', 'dark');
    cy.get('[data-testid="splash-text"]').should('be.visible').and('have.text', 'AgentX is here!!');

    // Same splash after switching themes — it is no longer minecraft-only.
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('[data-testid="splash-text"]').should('be.visible').and('have.text', 'AgentX is here!!');
  });
});

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
