/**
 * Per-model SEO routes: /historical/<model> and /calculator/<model> (and
 * their /zh siblings) render the tab seeded to the routed model. Switching
 * models on the page rewrites the pathname in place via history.replaceState
 * — no full page reload and no App Router remount.
 */
const visitOptions = {
  onBeforeLoad(win: Cypress.AUTWindow) {
    win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  },
};

type MarkerWindow = Cypress.AUTWindow & { __modelRouteNoReloadMarker?: boolean };

const unlockPointerEvents = () => {
  cy.document().then((doc) => {
    delete doc.body.dataset.scrollLocked;
    doc.body.style.removeProperty('pointer-events');
  });
};

describe('Per-model dashboard routes', () => {
  it('seeds /historical/<slug> to the routed model and rewrites the URL on switch without a reload', () => {
    cy.visit('/historical/minimax-m3', visitOptions);
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    cy.get('[data-testid="model-selector"]').should('contain.text', 'MiniMax');

    // A full page load (or App Router remount via hard navigation) would wipe
    // this marker; the in-place history.replaceState rewrite must keep it.
    cy.window().then((win) => {
      (win as MarkerWindow).__modelRouteNoReloadMarker = true;
    });
    unlockPointerEvents();
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').not('[aria-selected="true"]').first().click();

    cy.location('pathname').should('not.eq', '/historical/minimax-m3');
    cy.location('pathname').should('match', /^\/historical\/[a-z0-9-]+$/u);
    cy.window().its('__modelRouteNoReloadMarker').should('eq', true);
  });

  it('moves from the bare tab path to a slugged path when a non-default model is chosen', () => {
    cy.visit('/historical', visitOptions);
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    unlockPointerEvents();
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').not('[aria-selected="true"]').first().click();
    cy.location('pathname').should('match', /^\/historical\/[a-z0-9-]+$/u);
  });

  it('redirects alias slugs to the canonical model slug, keeping share-link params', () => {
    cy.visit('/calculator/kimi?i_seq=8k%2F1k', visitOptions);
    cy.location('pathname').should('eq', '/calculator/kimi-k26');
    cy.location('search').should('contain', 'i_seq=8k%2F1k');
  });

  it('language toggle follows the in-place rewritten per-model path', () => {
    cy.visit('/historical/minimax-m3', visitOptions);
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    unlockPointerEvents();
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').not('[aria-selected="true"]').first().click();
    cy.location('pathname')
      .should('match', /^\/historical\/[a-z0-9-]+$/u)
      .then((rewritten) => {
        cy.get('[data-testid="language-toggle"]').click();
        cy.location('pathname').should('eq', `/zh${rewritten}`);
      });
  });

  it('returns 404 for unknown model slugs', () => {
    cy.request({ url: '/historical/not-a-model', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
  });

  it('renders the /zh sibling with a model-specific Chinese intro', () => {
    cy.visit('/zh/historical/minimax-m3', visitOptions);
    cy.get('[data-testid="zh-tab-intro"]').should('be.visible').and('contain.text', 'MiniMax M3');
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
  });
});
