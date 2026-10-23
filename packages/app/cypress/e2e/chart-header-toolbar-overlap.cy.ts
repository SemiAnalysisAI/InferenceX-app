import { selectXAxisMode } from '../support/e2e';

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

const OVERLAY_WIDTHS = [768, 880, 1024, 1280] as const;
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
    selectXAxisMode('interactivity');
    cy.get('[data-testid="chart-figure"]').first().find('h2').should('not.be.empty');
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
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="inference-chart-view-btn"]')
      .click();
  });
});
