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

  it('shows a copy-link button for every FAQ question', () => {
    cy.visit('/about');

    cy.get('[data-testid^="faq-copy-link-"]')
      .should('have.length', 15)
      .each(($button) => {
        cy.wrap($button)
          .should('be.visible')
          .and('have.text', '')
          .and('have.attr', 'title', 'Copy link')
          .find('svg.lucide-link')
          .should('be.visible');
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
    cy.get('[data-testid="theme-option-dark"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('[data-testid="splash-text"]').should('be.visible').and('have.text', 'AgentX is here!!');
  });
});

describe('Theme Toggle', () => {
  it('loads CS:GO on demand, persists it, and removes decorations on exit', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
        win.localStorage.setItem('minecraft-music', 'false');
        win.localStorage.setItem('minecraft-sound', 'false');
      },
    });
    cy.get('[data-testid="csgo-scene"]').should('not.exist');
    cy.window().then((win) => {
      expect(
        win.performance
          .getEntriesByType('resource')
          .some((r) => r.name.includes('/decorative/csgo/')),
      ).to.eq(false);
    });
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-option-csgo"]').click();
    cy.get('html').should('have.class', 'csgo');
    cy.get('[data-testid="csgo-theme-banner"]').should('be.visible');
    cy.get('[data-testid="csgo-scene"]')
      .should('have.attr', 'aria-hidden', 'true')
      .and('have.css', 'pointer-events', 'none');
    cy.reload();
    cy.get('html').should('have.class', 'csgo');
    cy.get('[data-testid="csgo-scene"] img').should(($img) => {
      expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
    });
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-option-light"]').click();
    cy.get('html').should('have.class', 'light');
    cy.get('[data-testid="csgo-scene"]').should('not.exist');
    cy.get('[data-testid="csgo-theme-banner"]').should('not.exist');
  });

  it('applies GTA from the picker, persists it, and removes decorations on exit', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      },
    });
    cy.get('[data-testid="gta-scene"]').should('not.exist');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-option-gta"]').click();
    cy.get('html').should('have.class', 'gta');
    cy.get('[data-testid="gta-theme-banner"]').should('be.visible');
    cy.get('[data-testid="gta-scene"]')
      .should('have.attr', 'aria-hidden', 'true')
      .and('have.css', 'pointer-events', 'none');
    cy.reload();
    cy.get('html').should('have.class', 'gta');
    cy.get('[data-testid="gta-scene"]').should('exist');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-option-light"]').click();
    cy.get('html').should('have.class', 'light');
    cy.get('[data-testid="gta-scene"]').should('not.exist');
    cy.get('[data-testid="gta-theme-banner"]').should('not.exist');
  });

  it('theme persists across page reload (localStorage)', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      win.localStorage.setItem('theme', 'light');
    });
    cy.visit('/');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-option-dark"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.reload();
    cy.get('html').should('have.class', 'dark');
  });
});
