/**
 * Clicking an official SKU's legend "X" must remove that series even while an
 * unofficial-run overlay is loaded.
 *
 * Regression: with an overlay active, the chart reads official visibility from
 * `localOfficialOverride` (the unified overlay-mode selection), but the legend
 * X routed straight to the inference action domain's `removeHwType`, which mutates
 * `activeHwTypes` — a set the chart ignores in overlay mode. The click
 * appeared to do nothing. The legend toggle already had the overlay-aware
 * split (`unifiedToggle`); the X now shares it (`handleRemoveHwType`).
 */
import { interceptDerivedAgenticMetrics, unlockAgenticGate, selectXAxisMode } from '../support/e2e';
import {
  countVisible,
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

describe('Official legend X works while an unofficial overlay is loaded', () => {
  before(() => {
    // Use distinct hardware so the engine-comparison exclusion policy does
    // not resolve the official and unofficial rows as one competing family.
    interceptOverlayRun({ overlayHardware: 'h100' });
    // Agentic charts default to Interactivity, where the overlay renders. The
    // derived-metrics fetch now happens only under E2E Normalized Interactivity,
    // so the stub below is a guard against a stray request rather than a
    // dependency of this suite.
    interceptDerivedAgenticMetrics();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@unofficialRun');
    // Explicitly select Interactivity so this suite does not depend on the default.
    selectXAxisMode('interactivity');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      REAL_CONFIGS.length,
    );
  });

  // Cypress clears intercepts between tests, so the derived-metrics stub is
  // re-registered per test rather than once in `before`. Until #736 the
  // agentic default was E2E Normalized Interactivity, so the fetch happened
  // during `before` while the stub was still alive and React Query held the
  // result for the rest of the spec. The default no longer fetches, so any
  // later switch into that mode issues a fresh request.
  beforeEach(() => {
    interceptDerivedAgenticMetrics();
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
    // The overlay series is untouched — hiding an official SKU must not disturb
    // it. All five overlay points stay visible under Optimal Only: they are
    // non-dominated on the interactivity axes, and since #736 lacking persisted
    // traces no longer excludes them from the frontier.
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length);
    });
    // Inactive row: the hover affordance flips to the "+" restore indicator
    // (explicit "clicking the name brings it back"), and the Hide X is gone.
    cy.get('[data-testid="chart-legend"] [title^="Show B300"]').should('exist');
    // Best per SKU lives in the Quick Filters dialog now.
    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filter-best-per-sku"]').should(
      'have.attr',
      'data-state',
      'unchecked',
    );
    cy.contains('button', 'Done').click();
    cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');
    cy.get(
      '[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="B300"]',
    ).should('not.exist');
  });

  it('keeps the official SKU hidden when chart metrics change', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.contains('[role="option"]', 'Cost per Million Total Tokens (Owning - Hyperscaler)').click({
      force: true,
    });

    cy.get('[data-testid="chart-legend"] [title^="Show B300"]').should('exist');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points after Y-axis change').to.eq(0);
    });

    selectXAxisMode('ttft');
    cy.get('[data-testid="chart-legend"] [title^="Show B300"]').should('exist');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay points after metric changes').to.be.greaterThan(
        0,
      );
    });
  });

  it('re-activating the SKU from the legend restores the official points', () => {
    cy.get('[data-testid="chart-legend"]').contains('B300').click();
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points after re-add').to.be.greaterThan(0);
    });
  });
});
