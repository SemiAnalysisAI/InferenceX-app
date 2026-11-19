describe('Page Load & Navigation', () => {
  it('page renders without JavaScript errors', () => {
    const errors: string[] = [];
    const knownBrowserErrors = ['navigator.storage.persisted'];

    cy.on('uncaught:exception', (err) => {
      const isKnown = knownBrowserErrors.some((known) => err.message.includes(known));
      if (!isKnown) {
        errors.push(err.message);
      }
      return false;
    });

    cy.visit('/');
    cy.get('[data-testid="header"]').should('exist');
    cy.get('[data-testid="footer"]').should('exist');
    cy.wrap(errors).should('have.length', 0);
  });

  it('navigates from the footer to the land acknowledgement page', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });

    cy.get('[data-testid="footer-link-land-acknowledgement"]').scrollIntoView().click();

    cy.location('pathname').should('eq', '/land-acknowledgement');
    cy.get('[data-testid="land-acknowledgement-page"]').should('be.visible');
  });

  it('opens and preserves a direct link to an FAQ answer', () => {
    cy.visit('/about#faq-normalized-interactivity', {
      onBeforeLoad(win) {
        cy.stub(win.navigator.clipboard, 'writeText').as('writeFaqLink').resolves();
      },
    });

    cy.get('[data-testid^="faq-copy-link-"]')
      .should('have.length.greaterThan', 0)
      .each(($button) => {
        cy.wrap($button)
          .should('be.visible')
          .and('have.text', '')
          .and('have.attr', 'title', 'Copy link')
          .find('svg.lucide-link')
          .should('be.visible');
      });

    cy.get('#faq-normalized-interactivity')
      .should('be.visible')
      .within(() => {
        cy.get('a[href="#faq-normalized-interactivity"]').should('be.visible');
        cy.get('[data-testid="faq-copy-link-faq-normalized-interactivity"]')
          .should('be.visible')
          .and('have.text', '')
          .and('have.attr', 'title', 'Copy link')
          .find('svg.lucide-link')
          .should('be.visible');
        cy.get('[data-testid="faq-copy-link-faq-normalized-interactivity"]')
          .click()
          .should('have.attr', 'title', 'Copied')
          .find('svg.lucide-check')
          .should('be.visible');
      });
    cy.get('@writeFaqLink').should(
      'have.been.calledOnceWith',
      `${Cypress.config('baseUrl')}/about#faq-normalized-interactivity`,
    );
    cy.location('hash').should('eq', '#faq-normalized-interactivity');
  });
});

describe('Theme Toggle', () => {
  it('theme persists across page reload (localStorage)', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      win.localStorage.setItem('theme', 'light');
    });
    cy.visit('/');
    cy.get('[data-testid="theme-toggle"]')
      .should('have.attr', 'aria-label', 'Switch theme (currently light mode)')
      .click();
    cy.get('html').should('have.class', 'dark');
    cy.reload();
    cy.get('html').should('have.class', 'dark');
  });
});
