/**
 * E2E tests for the eval-samples drawer share-link feature.
 *
 * When `E2E_FIXTURES=1`, the Next.js server itself returns fixture data from
 * `cypress/fixtures/api/*.json` for every API route, so these tests just
 * visit pages and assert on the rendered UI — no `cy.intercept` needed.
 *
 * Coverage:
 *   - Share button is visible inside the open drawer.
 *   - Opening the drawer mirrors e_drawer to the share URL.
 *   - Setting a filter / search also appears in the share URL.
 *   - Visiting with e_drawer + e_dfilter + e_dq restores drawer + filter + search.
 *   - Missing e_drawer key → silent no-op (drawer stays closed).
 */

const dismissModal = (win: Window) => {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
};

function visitEvalTable(queryString = '') {
  cy.visit(`/evaluation${queryString}`, { onBeforeLoad: dismissModal });
  cy.get('[data-testid="evaluation-chart-display"]').should('be.visible');
  cy.get('[data-testid="evaluation-view-toggle"]').contains('Table').click();
  cy.get('[data-testid="evaluation-results-table"]').should('be.visible');
}

function openFirstDrawer() {
  cy.get('[data-testid="evaluation-results-table"]')
    .find('button')
    .contains('Prompts')
    .first()
    .click();
  // Wait for drawer dialog to mount
  cy.get('[data-testid="eval-drawer-share-button"]').should('be.visible');
}

// ---------------------------------------------------------------------------
// Share button presence
// ---------------------------------------------------------------------------

describe('Eval Drawer — Share button', () => {
  before(() => {
    visitEvalTable();
  });

  it('shows at least one Prompts button in the evaluation table', () => {
    cy.get('[data-testid="evaluation-results-table"]')
      .find('button')
      .contains('Prompts')
      .should('exist');
  });

  it('opens the drawer and renders the Share button', () => {
    openFirstDrawer();
    cy.get('[data-testid="eval-drawer-share-button"]').should('be.visible');
    cy.get('body').type('{esc}');
  });
});

// ---------------------------------------------------------------------------
// Share URL encoding
// ---------------------------------------------------------------------------

describe('Eval Drawer — Share URL encodes filter and search', () => {
  beforeEach(() => {
    visitEvalTable();
    openFirstDrawer();
  });

  it('share URL includes e_drawer after opening a row', () => {
    cy.get('[data-testid="eval-drawer-share-button"]').click();
    cy.get('[data-testid="eval-drawer-share-button-url-input"]')
      .invoke('val')
      .should('match', /[?&]e_drawer=[^&]+/u);
  });

  it('share URL includes e_dfilter=failed after switching filter', () => {
    cy.contains('button', 'Failed').click();
    cy.get('[data-testid="eval-drawer-share-button"]').click();
    cy.get('[data-testid="eval-drawer-share-button-url-input"]')
      .invoke('val')
      .should('include', 'e_dfilter=failed');
  });

  it('share URL includes e_dq after typing a search', () => {
    cy.get('[aria-label="Search samples on this page"]').clear().type('lemon');
    cy.get('[data-testid="eval-drawer-share-button"]').click();
    cy.get('[data-testid="eval-drawer-share-button-url-input"]')
      .invoke('val')
      .should('include', 'e_dq=lemon');
  });
});

// ---------------------------------------------------------------------------
// Restore from URL params
// ---------------------------------------------------------------------------

describe('Eval Drawer — Restore from URL params', () => {
  // Capture the composite drawer key dynamically from the first row so the
  // test is not coupled to a specific fixture value.
  let drawerKey: string;

  before(() => {
    visitEvalTable();
    openFirstDrawer();

    cy.get('[data-testid="eval-drawer-share-button"]').click();
    cy.get('[data-testid="eval-drawer-share-button-url-input"]')
      .invoke('val')
      .then((url) => {
        const match = /[?&]e_drawer=([^&]+)/u.exec(String(url));
        if (match) drawerKey = decodeURIComponent(match[1]);
      });
  });

  it('re-opens the drawer when e_drawer is in the URL', () => {
    cy.then(() => {
      visitEvalTable(`?e_drawer=${encodeURIComponent(drawerKey)}`);
      cy.get('[data-testid="eval-drawer-share-button"]', { timeout: 8000 }).should('be.visible');
    });
  });

  it('restores filter=failed when e_dfilter=failed is in the URL', () => {
    cy.then(() => {
      visitEvalTable(`?e_drawer=${encodeURIComponent(drawerKey)}&e_dfilter=failed`);
      cy.get('[data-testid="eval-drawer-share-button"]', { timeout: 8000 }).should('be.visible');
      cy.contains('button', 'Failed').should('have.attr', 'aria-pressed', 'true');
    });
  });

  it('restores search text when e_dq is in the URL', () => {
    cy.then(() => {
      visitEvalTable(`?e_drawer=${encodeURIComponent(drawerKey)}&e_dq=lemon`);
      cy.get('[data-testid="eval-drawer-share-button"]', { timeout: 8000 }).should('be.visible');
      cy.get('[aria-label="Search samples on this page"]').should('have.value', 'lemon');
    });
  });
});

// ---------------------------------------------------------------------------
// Missing-row fallback — silent no-op
// ---------------------------------------------------------------------------

describe('Eval Drawer — Missing row is a silent no-op', () => {
  it('leaves the drawer closed when the e_drawer key has no match', () => {
    visitEvalTable('?e_drawer=nonexistent~row~fp4~sglang~none~0~1~8~');
    cy.wait(1500);
    cy.get('[data-testid="eval-drawer-share-button"]').should('not.exist');
  });
});
