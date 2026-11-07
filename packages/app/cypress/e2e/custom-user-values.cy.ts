const selectCustomPowerMetric = () => {
  cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
  cy.get('[data-slot="select-item"]')
    .contains('Token Throughput per All in Utility MW (Custom user values)')
    .click({ force: true });
};

describe('Custom user values', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/infx/inference?g_model=DeepSeek-V4-Pro');
    cy.get('[data-testid="model-selector"]').should('be.visible');
  });

  describe('Custom Chip Costs', () => {
    it('re-prices the chart as a badge is edited', () => {
      cy.get('[data-testid="cost-tier-selector"]').first().click();
      cy.get('[data-testid="cost-tier-custom"]').click();
      cy.scatterPoints()
        .should('have.length.greaterThan', 0)
        .then((points) => {
          const initialY = points[0].datum.y;
          cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]').each(($input) => {
            cy.wrap($input).clear().type('9999');
          });
          cy.scatterPoints().should((next) => {
            expect(next[0].datum.y).to.not.equal(initialY);
          });
        });
    });

    it('editing a badge on a published tier switches to the custom tier', () => {
      cy.get('[data-testid="cost-tier-selector"]').first().click();
      cy.get('[data-testid="cost-tier-hyperscaler"]').click();
      cy.get('[data-testid="cost-tier-selector"]')
        .first()
        .should('contain.text', 'Owning at large hyperscaler volume');
      cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]')
        .first()
        .clear()
        .type('7');
      cy.get('[data-testid="cost-tier-selector"]')
        .first()
        .should('contain.text', 'Custom user values');
      cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]')
        .first()
        .should('have.value', '7');
    });
  });

  describe('Custom Chip Powers', () => {
    it('Calculate button applies the newly entered power values (regression: stale closure)', () => {
      selectCustomPowerMetric();
      cy.get('[data-testid="custom-powers-section"]').scrollIntoView().should('be.visible');

      cy.get('[data-testid="custom-powers-calculate"]').click();
      cy.scatterPoints()
        .should('have.length.greaterThan', 0)
        .then((points) => {
          const initialY = points[0].datum.y;
          cy.get('[data-testid="custom-powers-section"] input[id^="cost-input-"]').each(
            ($input) => {
              cy.wrap($input).clear().type('99999');
            },
          );

          cy.get('[data-testid="custom-powers-calculate"]').click();

          cy.scatterPoints().should((next) => {
            expect(next[0].datum.y).to.not.equal(initialY);
          });
        });
    });
  });
});
