const selectCustomPowerMetric = () => {
  cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
  cy.get('[data-slot="select-item"]')
    .contains('Token Throughput per All in Utility MW (Custom User Values)')
    .click({ force: true });
};

describe('Custom User Values', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="model-selector"]').should('be.visible');
  });

  describe('Custom Chip Costs', () => {
    it('opens the custom tier from the caption selector with badges seeded from the tier', () => {
      cy.get('[data-testid="cost-tier-selector"]').first().click();
      cy.get('[data-testid="cost-tier-custom"]').click();
      cy.get('[data-testid="cost-tier-selector"]')
        .first()
        .should('contain.text', 'Custom User Values');
      cy.get('[data-testid="custom-costs-section"]').should('not.exist');
      cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]')
        .first()
        .should(($input) => {
          const val = parseFloat($input.val() as string);
          expect(val).to.be.greaterThan(0);
        });
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .should('have.length.greaterThan', 0);
    });

    it('re-prices the chart as a badge is edited', () => {
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .first()
        .should(($el) => {
          expect(($el[0] as any).__data__).to.not.equal(undefined);
        })
        .then(($el) => {
          const initialY = ($el[0] as any).__data__.y;
          cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]').each(($input) => {
            cy.wrap($input).clear().type('9999');
          });
          cy.get('[data-testid="scatter-graph"]')
            .first()
            .find('svg .dot-group')
            .first()
            .should(($newEl) => {
              const newY = ($newEl[0] as any).__data__.y;
              expect(newY).to.not.equal(initialY);
            });
        });
    });

    it('re-opening the custom tier quotes the reseeded prices, not the earlier typing', () => {
      cy.get('[data-testid="cost-tier-selector"]').first().click();
      cy.get('[data-testid="cost-tier-custom"]').click();
      cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]')
        .first()
        .clear()
        .type('9');
      cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]')
        .first()
        .should('have.value', '9');
      cy.get('[data-testid="cost-tier-selector"]').first().click();
      cy.get('[data-testid="cost-tier-hyperscaler"]').click();
      cy.get('[data-testid="cost-tier-selector"]').first().click();
      cy.get('[data-testid="cost-tier-custom"]').click();
      cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]')
        .first()
        .should(($input) => {
          const val = parseFloat($input.val() as string);
          expect(val).to.be.greaterThan(0);
          expect(val).to.not.equal(9);
        });
    });

    it('editing a badge on a published tier switches to the custom tier', () => {
      cy.get('[data-testid="cost-tier-selector"]').first().click();
      cy.get('[data-testid="cost-tier-hyperscaler"]').click();
      cy.get('[data-testid="cost-tier-selector"]')
        .first()
        .should('contain.text', 'Owning at Large Hyperscaler Volume');
      cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]')
        .first()
        .clear()
        .type('7');
      cy.get('[data-testid="cost-tier-selector"]')
        .first()
        .should('contain.text', 'Custom User Values');
      cy.get('[data-testid="inference-tco-badge"] input[id^="cost-input-"]')
        .first()
        .should('have.value', '7');
    });
  });

  describe('Custom Chip Powers', () => {
    it('Calculate button applies the newly entered power values (regression: stale closure)', () => {
      selectCustomPowerMetric();
      cy.get('[data-testid="custom-powers-section"]').scrollIntoView().should('be.visible');
      cy.get('[data-testid="custom-powers-section"]').should('contain.text', 'Custom Chip Powers');

      cy.get('[data-testid="custom-powers-section"] input[id^="cost-input-"]')
        .first()
        .should(($input) => {
          const val = parseFloat($input.val() as string);
          expect(val).to.be.greaterThan(0);
        });

      cy.get('[data-testid="custom-powers-calculate"]').click();
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .should('have.length.greaterThan', 0);

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .first()
        .should(($el) => {
          expect(($el[0] as any).__data__).to.not.equal(undefined);
        })
        .then(($el) => {
          const initialY = ($el[0] as any).__data__.y;
          cy.get('[data-testid="custom-powers-section"] input[id^="cost-input-"]').each(
            ($input) => {
              cy.wrap($input).clear().type('99999');
            },
          );

          cy.get('[data-testid="custom-powers-calculate"]').click();

          cy.get('[data-testid="scatter-graph"]')
            .first()
            .find('svg .dot-group')
            .first()
            .should(($newEl) => {
              const newY = ($newEl[0] as any).__data__.y;
              expect(newY).to.not.equal(initialY);
            });
        });
    });
  });
});
