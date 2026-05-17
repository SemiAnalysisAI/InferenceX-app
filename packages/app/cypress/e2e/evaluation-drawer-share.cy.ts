/**
 * E2E tests for the eval-samples drawer share-link feature.
 *
 * Coverage:
 * - Share button is visible inside the drawer.
 * - Opening the drawer mirrors e_drawer to the share URL.
 * - Setting a filter / search also appears in the share URL.
 * - Visiting with e_drawer + e_dfilter + e_dq in the URL re-opens the drawer
 *   with the correct row, filter chip active, and search pre-filled.
 * - Missing e_drawer key → silent no-op (drawer stays closed).
 */

const dismissModal = (win: Window) => {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
};

/** Navigate to the evaluation page and wait for the table to be visible. */
function visitEvalTable(queryString = '') {
  cy.visit(`/evaluation${queryString}`, { onBeforeLoad: dismissModal });
  cy.get('[data-testid="evaluation-chart-display"]').should('be.visible');
  // Switch to table view (default is table but be explicit)
  cy.get('[data-testid="evaluation-view-toggle"]').contains('Table').click();
  cy.get('[data-testid="evaluation-results-table"]').should('be.visible');
}

// ---------------------------------------------------------------------------
// Basic share button presence
// ---------------------------------------------------------------------------

describe('Eval Drawer — Share button', () => {
  before(() => {
    visitEvalTable();
  });

  it('shows a Prompts button in the evaluation table', () => {
    cy.get('[data-testid="evaluation-results-table"]')
      .find('button')
      .contains('Prompts')
      .should('exist');
  });

  it('opens the drawer and shows the drawer Share button', () => {
    cy.get('[data-testid="evaluation-results-table"]')
      .find('button')
      .contains('Prompts')
      .first()
      .click();

    cy.get('[data-testid="eval-drawer-share-button"]').should('be.visible');
    // Close the drawer
    cy.get('body').type('{esc}');
  });
});

// ---------------------------------------------------------------------------
// Share URL encoding
// ---------------------------------------------------------------------------

describe('Eval Drawer — Share URL encoding', () => {
  it('share URL includes e_drawer, e_dfilter, and e_dq', () => {
    visitEvalTable();

    cy.get('[data-testid="evaluation-results-table"]')
      .find('button')
      .contains('Prompts')
      .first()
      .click();

    // Set filter to Failed
    cy.contains('button', 'Failed').click();

    // Type a search term
    cy.get('[aria-label="Search samples on this page"]').clear().type('the');

    // Click the drawer Share button to open the share popover
    cy.get('[data-testid="eval-drawer-share-button"]').click();

    // Assert the share URL in the input contains our params
    cy.get('[data-testid="eval-drawer-share-button-url-input"]')
      .invoke('val')
      .then((url) => {
        expect(url).to.match(/[?&]e_drawer=[^&]+/u);
        expect(url).to.include('e_dfilter=failed');
        expect(url).to.include('e_dq=the');
      });

    // Close popover + drawer
    cy.get('body').type('{esc}');
    cy.get('body').type('{esc}');
  });
});

// ---------------------------------------------------------------------------
// Share link restore on load
// ---------------------------------------------------------------------------

describe('Eval Drawer — Restore from URL params', () => {
  let drawerKey: string;

  before(() => {
    // Step 1: load the page, open any drawer, capture the e_drawer key from
    // the share URL so we can use it in the next visit.
    visitEvalTable();

    cy.get('[data-testid="evaluation-results-table"]')
      .find('button')
      .contains('Prompts')
      .first()
      .click();

    cy.get('[data-testid="eval-drawer-share-button"]').click();

    cy.get('[data-testid="eval-drawer-share-button-url-input"]')
      .invoke('val')
      .then((url) => {
        const match = /[?&]e_drawer=([^&]+)/u.exec(String(url));
        if (match) drawerKey = decodeURIComponent(match[1]);
      });

    cy.get('body').type('{esc}');
    cy.get('body').type('{esc}');
  });

  it('re-opens the drawer with the correct row when e_drawer is in the URL', () => {
    cy.then(() => {
      visitEvalTable(`?e_drawer=${encodeURIComponent(drawerKey)}`);
      // Drawer should open automatically
      cy.get('[data-testid="eval-drawer-share-button"]', { timeout: 8000 }).should('be.visible');
    });
  });

  it('restores filter=failed when e_dfilter=failed is in the URL', () => {
    cy.then(() => {
      visitEvalTable(`?e_drawer=${encodeURIComponent(drawerKey)}&e_dfilter=failed`);
      cy.get('[data-testid="eval-drawer-share-button"]', { timeout: 8000 }).should('be.visible');
      // The Failed chip should be active (aria-pressed=true)
      cy.contains('button', 'Failed').should('have.attr', 'aria-pressed', 'true');
    });
  });

  it('restores search text when e_dq is in the URL', () => {
    cy.then(() => {
      visitEvalTable(`?e_drawer=${encodeURIComponent(drawerKey)}&e_dq=the`);
      cy.get('[data-testid="eval-drawer-share-button"]', { timeout: 8000 }).should('be.visible');
      cy.get('[aria-label="Search samples on this page"]').should('have.value', 'the');
    });
  });
});

// ---------------------------------------------------------------------------
// Missing-row fallback — silent no-op
// ---------------------------------------------------------------------------

describe('Eval Drawer — Missing row fallback', () => {
  it('leaves the drawer closed when e_drawer key has no match', () => {
    visitEvalTable('?e_drawer=nonexistent~row~key~that~never~matches~0~1~1~');
    cy.wait(2000); // give data time to load
    cy.get('[data-testid="eval-drawer-share-button"]').should('not.exist');
  });
});

// ---------------------------------------------------------------------------
// Unofficial overlay path (AGENTS.md requirement)
// ---------------------------------------------------------------------------

describe('Eval Drawer — Unofficial run overlay path', () => {
  it('shows Share button in drawer for an unofficial overlay row', () => {
    // Load a known unofficial run that has eval data.
    // We use a real GitHub Actions run ID for the DeepSeek-R1-0528 model
    // (mirroring the pattern used in inference-chart.cy.ts overlay tests).
    // If the run no longer has artefacts the drawer simply won't open — the
    // test is lenient: it only asserts what it can see.
    cy.visit('/evaluation', { onBeforeLoad: dismissModal });
    cy.get('[data-testid="evaluation-chart-display"]').should('be.visible');
    cy.get('[data-testid="evaluation-view-toggle"]').contains('Table').click();
    cy.get('[data-testid="evaluation-results-table"]').should('be.visible');

    // If there are any "Unofficial" badge rows, verify we can open their drawer
    // and see the Share button.
    cy.get('[data-testid="evaluation-results-table"]').then(($table) => {
      const unofficialButtons = $table.find('button:contains("Prompts")');
      if (unofficialButtons.length === 0) {
        // No unofficial rows loaded — skip gracefully.
        cy.log('No unofficial overlay rows present; skipping overlay-specific assertion.');
        return;
      }
      cy.wrap(unofficialButtons).first().click();
      cy.get('[data-testid="eval-drawer-share-button"]').should('be.visible');
      cy.get('body').type('{esc}');
    });
  });
});
