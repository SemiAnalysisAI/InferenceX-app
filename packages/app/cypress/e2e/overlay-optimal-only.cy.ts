/**
 * Unofficial runs do not have persisted request traces, so they cannot join
 * the canonical E2E Normalized Interactivity frontier. Optimal Only must hide
 * them on every AgentX axis; Show All remains the explicit way to inspect them.
 */
import { interceptDerivedAgenticMetrics, unlockAgenticGate } from '../support/e2e';
import {
  countVisible,
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

describe('Overlay points follow canonical Optimal Only policy (agentic interactivity)', () => {
  before(() => {
    interceptOverlayRun();
    // The agentic default mode is E2E Normalized Interactivity (which suppresses overlays and
    // fetches derived metrics) — stub the fetch, then switch to the
    // Interactivity mode this suite is about.
    interceptDerivedAgenticMetrics();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@unofficialRun');
    // Interactivity is nested under the Advanced menu on agentic charts.
    cy.get('[data-testid="x-axis-mode-advanced"]').click();
    cy.get('[data-testid="x-axis-mode-interactivity"]').click();
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    cy.get('[data-testid="x-axis-mode-advanced"]')
      .should('have.attr', 'data-state', 'active')
      .and('contain.text', 'Interactivity');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      REAL_CONFIGS.length,
    );
  });

  it('hides trace-less overlay points in the default Optimal Only view', () => {
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    // The deterministic derived-metric stub puts all five official rows on the
    // canonical frontier.
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points').to.eq(REAL_CONFIGS.length);
    });
    // Overlay rows have no persisted trace ids and therefore no canonical
    // frontier membership.
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(0);
    });
  });

  it('shows all overlay points when Optimal Only is turned off', () => {
    cy.get('#scatter-hide-non-optimal').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length);
    });
  });

  it('re-hides trace-less overlay points when Optimal Only is re-enabled', () => {
    cy.get('#scatter-hide-non-optimal').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(0);
    });
  });
});
