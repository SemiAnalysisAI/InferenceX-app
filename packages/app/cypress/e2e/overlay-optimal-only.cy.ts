import { interceptDerivedAgenticMetrics, unlockAgenticGate, selectXAxisMode } from '../support/e2e';
import {
  countVisible,
  DOMINATED_CONFIG,
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

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
    selectXAxisMode('interactivity');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      OVERLAY_CONFIGS.length,
    );
  });

  beforeEach(() => {
    interceptDerivedAgenticMetrics();
  });

  it('drops only the dominated overlay point in the default Optimal Only view', () => {
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points').to.eq(REAL_CONFIGS.length);
    });
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
