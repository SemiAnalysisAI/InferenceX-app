import { interceptDerivedAgenticMetrics, unlockAgenticGate, selectXAxisMode } from '../support/e2e';
import {
  countVisible,
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

describe('Official legend X works while an unofficial overlay is loaded', () => {
  before(() => {
    interceptOverlayRun({ overlayHardware: 'h100' });
    interceptDerivedAgenticMetrics();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@unofficialRun');
    selectXAxisMode('interactivity');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      REAL_CONFIGS.length,
    );
  });

  beforeEach(() => {
    interceptDerivedAgenticMetrics();
  });

  it('clicking the official SKU X hides its points but keeps the overlay', () => {
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points').to.be.greaterThan(0);
    });
    cy.get('[data-testid="chart-legend"]').contains('B300').should('exist');
    cy.get('[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="B300"]')
      .should('have.attr', 'title')
      .and('match', /^Hide B300/u);

    cy.get('[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="B300"]')
      .first()
      .click({ force: true });

    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
      expect(countVisible($dots), 'visible official points after remove').to.eq(0);
    });
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length);
    });
    cy.get('[data-testid="chart-legend"] [title^="Show B300"]').should('exist');
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
    cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
    cy.contains('[data-slot="select-item"]', /^Cost per Million Total Tokens$/u).click({
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
