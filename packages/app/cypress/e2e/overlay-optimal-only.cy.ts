/**
 * Overlay (unofficial run) points must respect the "Optimal Only" toggle the
 * same way official points do.
 *
 * Regression: with Optimal Only ON (the default — `i_optimal !== '0'`),
 * official non-pareto points are hidden via `isPointVisible`, but overlay X
 * markers rendered every point unconditionally. On the agentic interactivity
 * chart this made an e2e-dominated config (TP8 C=4 in the GLM5.2 B300 hicache
 * run) look like a pareto point: its X marker stayed visible sitting on the
 * dashed roofline (the monotone spline between C=8 and C=2 passes within
 * ~0.5% of it) while the official twin was hidden.
 */
import { unlockAgenticGate } from '../support/e2e';
import {
  countVisible,
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

describe('Overlay points respect Optimal Only (agentic interactivity)', () => {
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
    cy.get('[data-testid="x-axis-mode-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      REAL_CONFIGS.length,
    );
  });

  // Optimal Only defaults ON (i_optimal !== '0') — the DEFAULT view is where
  // the regression lived: official C=4 hidden, overlay C=4 X still drawn.
  it('hides the e2e-dominated overlay point in the default Optimal Only view', () => {
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    // Official parity check: 4 of 5 official dots visible.
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points').to.eq(REAL_CONFIGS.length - 1);
    });
    // The overlay must hide its C=4 too — 4 of 5 X markers visible.
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length - 1);
    });
  });

  it('shows all overlay points when Optimal Only is turned off', () => {
    cy.get('#scatter-hide-non-optimal').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length);
    });
  });

  it('re-hides the e2e-dominated overlay point when Optimal Only is re-enabled', () => {
    cy.get('#scatter-hide-non-optimal').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length - 1);
    });
  });
});
