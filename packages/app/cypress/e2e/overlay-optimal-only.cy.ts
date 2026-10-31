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

  it('exports exact PNG ratios with official and overlay points without resizing the live chart', () => {
    let originalWidth: number;
    let originalHeight: number;
    let png = '';
    cy.get('[data-testid="d3-chart-svg"]')
      .first()
      .then(($svg) => {
        const bounds = $svg[0].getBoundingClientRect();
        originalWidth = bounds.width;
        originalHeight = bounds.height;
      });
    cy.window().then((win) => {
      cy.stub(win.HTMLAnchorElement.prototype, 'click').callsFake(
        function (this: HTMLAnchorElement) {
          if (this.download.endsWith('.png')) {
            png = this.href;
            const exported = win.document.querySelector('#chart-0-export')!;
            expect(exported.querySelectorAll('.dot-group').length).to.be.greaterThan(0);
            expect(exported.querySelectorAll('.unofficial-overlay-pt').length).to.be.greaterThan(0);
          }
        },
      );
    });
    (
      [
        ['16:9', 16 / 9],
        ['1:1', 1],
      ] as const
    ).forEach(([ratio, expected]) => {
      cy.then(() => {
        png = '';
      });
      cy.get('[data-testid="chart-figure"] [data-testid="export-button"]').first().click();
      cy.get('[data-testid="png-aspect-ratio"]').select(ratio);
      cy.get('[data-testid="export-png-button"]').click();
      cy.wrap(null, { timeout: 30000 })
        .should(() => {
          expect(png).to.match(/^data:image\/png;base64,/u);
        })
        .then(
          () =>
            new Cypress.Promise<void>((resolve, reject) => {
              const image = new Image();
              image.addEventListener('load', () => {
                try {
                  expect(image.naturalWidth / image.naturalHeight).to.eq(expected);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
              image.addEventListener('error', () => reject(new Error('PNG decode failed')));
              image.src = png;
            }),
        );
      cy.get('[data-testid="d3-chart-svg"]')
        .first()
        .should(($svg) => {
          const bounds = $svg[0].getBoundingClientRect();
          expect(bounds.width).to.eq(originalWidth);
          expect(bounds.height).to.eq(originalHeight);
        });
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
