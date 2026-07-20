/**
 * Clicking an official SKU's legend "X" must remove that series even while an
 * unofficial-run overlay is loaded.
 *
 * Regression: with an overlay active, the chart reads official visibility from
 * `localOfficialOverride` (the unified overlay-mode selection), but the legend
 * X routed straight to InferenceContext's `removeHwType`, which mutates
 * `activeHwTypes` — a set the chart ignores in overlay mode. The click
 * appeared to do nothing. The legend toggle already had the overlay-aware
 * split (`unifiedToggle`); the X now shares it (`handleRemoveHwType`).
 */
import { unlockAgenticGate } from '../support/e2e';
import {
  countVisible,
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

describe('Official legend X works while an unofficial overlay is loaded', () => {
  before(() => {
    interceptOverlayRun();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@unofficialRun');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      REAL_CONFIGS.length,
    );
  });

  it('shows official points and an official legend entry initially', () => {
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points').to.be.greaterThan(0);
    });
    cy.get('[data-testid="chart-legend"]').contains('B300').should('exist');
    // Active row: the hover affordance is the "Hide" X with an explicit tooltip.
    cy.get('[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="B300"]')
      .should('have.attr', 'title')
      .and('match', /^Hide B300/u);
  });

  it('clicking the official SKU X hides its points but keeps the overlay', () => {
    // The X only becomes opaque on row hover (CSS group-hover), which Cypress
    // events don't trigger — force the click on the always-present element.
    // Target the OFFICIAL row's X: the overlay run row is listed first and has
    // its own (no-op) X, so `.first()` would hit the wrong one. The official
    // label is "B300 (SGLang)" — case-sensitive match excludes the overlay
    // row's lowercase branch name.
    cy.get('[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="B300"]')
      .first()
      .click({ force: true });

    // Every official point belongs to the removed B300 series → all hidden.
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points after remove').to.eq(0);
    });
    // The overlay series is untouched (Optimal Only default keeps 4 of 5).
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length - 1);
    });
    // Inactive row: the hover affordance flips to the "+" restore indicator
    // (explicit "clicking the name brings it back"), and the Hide X is gone.
    cy.get('[data-testid="chart-legend"] [title^="Show B300"]').should('exist');
    cy.get(
      '[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="B300"]',
    ).should('not.exist');
  });

  it('re-activating the SKU from the legend restores the official points', () => {
    cy.get('[data-testid="chart-legend"]').contains('B300').click();
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points after re-add').to.be.greaterThan(0);
    });
  });
});
