import { interceptDerivedAgenticMetrics, unlockAgenticGate, selectXAxisMode } from '../support/e2e';
import {
  countVisible,
  DOMINATED_CONFIG,
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

const OVERLAY_CONFIGS = [...REAL_CONFIGS, DOMINATED_CONFIG];

function chartSnapshot(svg: Element) {
  const clone = svg.cloneNode(true) as Element;
  // Trace metadata can finish loading during export without changing chart geometry.
  for (const mark of clone.querySelectorAll<SVGElement>('[data-trace-availability]')) {
    delete mark.dataset.traceAvailability;
  }
  return clone.outerHTML;
}

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
    let originalSvg: string;
    let png = '';
    const layouts: { width: number; height: number; axis: string | null; font: string }[] = [];
    cy.get('[data-testid="d3-chart-svg"]')
      .first()
      .then(($svg) => {
        const bounds = $svg[0].getBoundingClientRect();
        originalWidth = bounds.width;
        originalHeight = bounds.height;
        originalSvg = chartSnapshot($svg[0]);
      });
    cy.window().then((win) => {
      cy.stub(win.HTMLAnchorElement.prototype, 'click').callsFake(
        function (this: HTMLAnchorElement) {
          if (this.download.endsWith('.png')) {
            png = this.href;
            const exported = win.document.querySelector('#chart-0-export')!;
            expect(exported.querySelectorAll('.dot-group').length).to.be.greaterThan(0);
            expect(exported.querySelectorAll('.unofficial-overlay-pt').length).to.be.greaterThan(0);
            const svg = exported.querySelector<SVGSVGElement>('[data-testid="d3-chart-svg"]')!;
            const bounds = svg.getBoundingClientRect();
            const frame = exported.getBoundingClientRect();
            expect(bounds.bottom, 'entire plot fits above the footer').to.be.at.most(frame.bottom);
            expect(bounds.width / frame.width, 'plot uses the image width').to.be.greaterThan(0.85);
            expect(bounds.height / frame.height, 'plot uses the image height').to.be.greaterThan(
              0.5,
            );
            expect(svg.getAttribute('height'), 'SVG was re-rendered, not padded').not.to.eq('600');
            layouts.push({
              width: bounds.width,
              height: bounds.height,
              axis: svg.querySelector('.x-axis')!.getAttribute('transform'),
              font: win.getComputedStyle(svg.querySelector('.x-axis text')!).fontSize,
            });
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
          expect(chartSnapshot($svg[0]), 'export does not mutate live marks or defs').to.eq(
            originalSvg,
          );
        });
    });
    cy.then(() => {
      expect(layouts).to.have.length(2);
      expect(layouts[0].width).to.be.greaterThan(layouts[1].width);
      expect(layouts[0].height).to.be.lessThan(layouts[1].height);
      expect(layouts[0].axis).not.to.eq(layouts[1].axis);
      expect(layouts[0].font, 'text is re-laid out, not scaled').to.eq(layouts[1].font);
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
