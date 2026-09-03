/**
 * Optimal Only must filter overlay (unofficial-run) points by the same rule it
 * applies to official ones: the Pareto frontier of the *selected* axes.
 *
 * Until #736 the rule was different — unofficial runs have no persisted request
 * traces, so they could never join the canonical E2E Normalized Interactivity
 * frontier and Optimal Only hid every one of them. That gating is gone, so an
 * overlay point now survives exactly when it is non-dominated on the axes on
 * screen, and Show All remains the way to inspect the rest.
 */
import { interceptDerivedAgenticMetrics, unlockAgenticGate, selectXAxisMode } from '../support/e2e';
import {
  countVisible,
  DOMINATED_CONFIG,
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

// The five real configs are all non-dominated on the interactivity axes, so a
// sixth, deliberately dominated point is what gives Optimal Only something to
// remove. Without it this suite would assert the same count either way and pass
// no matter what the filter did.
const OVERLAY_CONFIGS = [...REAL_CONFIGS, DOMINATED_CONFIG];

describe('Overlay points follow Optimal Only on the selected axes', () => {
  before(() => {
    interceptOverlayRun({ overlayConfigs: OVERLAY_CONFIGS });
    interceptDerivedAgenticMetrics();
    cy.visit(
      `/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tpPerGpu`,
      {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          unlockAgenticGate(win);
        },
      },
    );
    cy.wait('@unofficialRun');
    // Explicitly select Interactivity so this suite does not depend on the default.
    selectXAxisMode('interactivity');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    // All six are rendered; visibility is what Optimal Only changes.
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      OVERLAY_CONFIGS.length,
    );
  });

  // Cypress clears intercepts between tests, so the derived-metrics stub is
  // re-registered per test rather than once in `before`. Until #736 the agentic
  // default was E2E Normalized Interactivity, so the fetch happened during
  // `before` while the stub was still alive and React Query held the result for
  // the rest of the spec. The default no longer fetches.
  beforeEach(() => {
    interceptDerivedAgenticMetrics();
  });

  it('drops only the dominated overlay point in the default Optimal Only view', () => {
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points').to.eq(REAL_CONFIGS.length);
    });
    // Five of six survive: every real config is non-dominated on these axes, and
    // the overlay's trace-less rows are no longer excluded for lacking traces.
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length);
    });
  });

  it('shows all overlay points when Optimal Only is turned off', () => {
    cy.get('#scatter-hide-non-optimal').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(OVERLAY_CONFIGS.length);
    });
  });

  it('re-drops the dominated overlay point when Optimal Only is re-enabled', () => {
    cy.get('#scatter-hide-non-optimal').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length);
    });
  });
});
