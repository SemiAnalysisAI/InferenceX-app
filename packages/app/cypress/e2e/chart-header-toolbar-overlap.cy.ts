/**
 * Regression: the chart action toolbar (view toggle, download, reset
 * zoom) renders as an absolute overlay in the chart figure's top-right corner
 * from `md` up. The chart heading spanned the full card width, so at reduced
 * tab widths (browser side panel, split screen) a long title — e.g. the
 * default "Total Tokens per $1 TCO (Owning - Hyperscaler) vs. P90
 * Interactivity" — wrapped underneath the toolbar and was covered by it.
 *
 * The heading now reserves the overlay's width (`md:mr-80`), so the title and
 * toolbar bounding boxes must never intersect at any viewport width, in both
 * Chart and Table views. Below `md` the toolbar is a normal-flow row above
 * the card (#948), which must stay overlap-free too.
 */

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const boxOf = ($el: JQuery): Box => {
  const r = $el[0].getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

const intersects = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** md boundary, side-panel width (the reported repro), lg, and full desktop. */
const OVERLAY_WIDTHS = [768, 880, 1024, 1280] as const;
/** Below md the toolbar renders as a normal-flow row above the card. */
const FLOW_WIDTH = 500;

function assertHeaderClearsToolbar(width: number) {
  cy.viewport(width, 900);
  cy.get('[data-testid="chart-figure"]')
    .first()
    .within(() => {
      cy.get('.export-buttons').should('be.visible');
      cy.get('h2').should('be.visible');
      cy.get('.export-buttons').then(($toolbar) => {
        const toolbar = boxOf($toolbar);
        cy.get('h2').then(($title) => {
          const title = boxOf($title);
          expect(
            intersects(title, toolbar),
            `title ${JSON.stringify(title)} must not intersect toolbar ${JSON.stringify(
              toolbar,
            )} at ${width}px`,
          ).to.eq(false);
        });
      });
    });
}

function assertToolbarActionsPresent() {
  // Sharing applies to the whole comparison and lives in the page controls,
  // while download, view mode, and zoom remain scoped to each chart figure.
  cy.get('[data-testid="inference-chart-display"] > section')
    .first()
    .find('[data-testid="share-button"]')
    .should('be.visible');
  cy.get('[data-testid="chart-figure"]')
    .first()
    .within(() => {
      cy.get('[data-testid="inference-chart-view-btn"]').should('be.visible');
      cy.get('[data-testid="inference-table-view-btn"]').should('be.visible');
      cy.get('[data-testid="export-button"]').should('be.visible');
      cy.get('[data-testid="zoom-reset-button"]').should('be.visible');
    });
}

describe('chart header toolbar overlap', () => {
  before(() => {
    cy.viewport(1280, 900);
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="x-axis-mode-interactivity"]').click();
    cy.get('[data-testid="chart-figure"]').first().find('h2').should('not.be.empty');
  });

  it('keeps every toolbar action available in chart view', () => {
    cy.viewport(1280, 900);
    assertToolbarActionsPresent();
  });

  for (const width of OVERLAY_WIDTHS) {
    it(`chart view: title and toolbar do not overlap at ${width}px`, () => {
      assertHeaderClearsToolbar(width);
    });
  }

  it(`chart view: title and toolbar do not overlap at ${FLOW_WIDTH}px (normal-flow toolbar)`, () => {
    assertHeaderClearsToolbar(FLOW_WIDTH);
  });

  it('table view: title and toolbar do not overlap across widths', () => {
    cy.viewport(1280, 900);
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="inference-table-view-btn"]')
      .click();
    cy.get('[data-testid="chart-figure"]').first().find('table').should('be.visible');
    for (const width of [...OVERLAY_WIDTHS, FLOW_WIDTH]) {
      assertHeaderClearsToolbar(width);
    }
    assertToolbarActionsPresent();
    // Restore chart view for any spec that runs after this one.
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="inference-chart-view-btn"]')
      .click();
  });
});
