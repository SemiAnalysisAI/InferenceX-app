describe('Custom User Values', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="model-selector"]').should('be.visible');
  });

  const selectCustomCostMetric = () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.get('[role="option"]')
      .contains('Cost per Million Total Tokens (Custom User Values)')
      .click({ force: true });
  };

  const selectCustomPowerMetric = () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.get('[role="option"]')
      .contains('Token Throughput per All in Utility MW (Custom User Values)')
      .click({ force: true });
  };

  describe('Custom GPU Costs', () => {
    it('renders the custom costs input section when custom cost metric is selected', () => {
      selectCustomCostMetric();
      cy.get('[data-testid="custom-costs-section"]').should('be.visible');
      cy.get('[data-testid="custom-costs-section"]').should('contain.text', 'Custom GPU Costs');
    });

    it('shows input fields pre-filled with default cost values', () => {
      // Custom cost metric still selected from previous test
      cy.get('[data-testid="custom-costs-section"] input[id^="cost-input-"]')
        .first()
        .should(($input) => {
          const val = parseFloat($input.val() as string);
          expect(val).to.be.greaterThan(0);
        });
    });

    // Regression test for stale closure bug: Calculate button must use the newly typed
    // values, not the original defaults captured when the callback was first created.
    it('Calculate button applies the newly entered cost values (regression: stale closure)', () => {
      // Apply defaults first — userCosts starts null so chart has no data until Calculate is clicked
      cy.get('[data-testid="custom-costs-calculate"]').click();
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .should('have.length.greaterThan', 0);

      // Capture the D3 bound y value of the first scatter point
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .first()
        .should(($el) => {
          // Ensure D3 data is bound
          expect(($el[0] as any).__data__).to.not.equal(undefined);
        })
        .then(($el) => {
          const initialY = ($el[0] as any).__data__.y;

          // Set ALL GPU costs to a very high value to force chart rescaling
          cy.get('[data-testid="custom-costs-section"] input[id^="cost-input-"]').each(($input) => {
            cy.wrap($input).clear().type('9999');
          });

          cy.get('[data-testid="custom-costs-calculate"]').click();

          // All points should have different y values since all costs changed
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

    it('Reset button restores default values', () => {
      cy.get('[data-testid="custom-costs-section"] input[id^="cost-input-"]')
        .first()
        .invoke('val')
        .then((defaultVal) => {
          cy.get(
            '[data-testid="custom-costs-section"] button[aria-label="Reset to defaults"]',
          ).click();

          cy.get('[data-testid="custom-costs-section"] input[id^="cost-input-"]')
            .first()
            .should('have.value', defaultVal);
        });
    });
  });

  describe('Custom GPU Powers', () => {
    it('renders the custom powers input section when custom power metric is selected', () => {
      selectCustomPowerMetric();
      cy.get('[data-testid="custom-powers-section"]').should('be.visible');
      cy.get('[data-testid="custom-powers-section"]').should('contain.text', 'Custom GPU Powers');
    });

    it('shows input fields pre-filled with default power values', () => {
      cy.get('[data-testid="custom-powers-section"] input[id^="cost-input-"]')
        .first()
        .should(($input) => {
          const val = parseFloat($input.val() as string);
          expect(val).to.be.greaterThan(0);
        });
    });

    // Regression test: same stale closure bug existed in CustomPowers
    it('Calculate button applies the newly entered power values (regression: stale closure)', () => {
      // Apply defaults first — userPowers starts null so chart has no data until Calculate is clicked
      cy.get('[data-testid="custom-powers-calculate"]').click();
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .should('have.length.greaterThan', 0);

      // Capture the D3 bound y value of the first scatter point
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .first()
        .should(($el) => {
          expect(($el[0] as any).__data__).to.not.equal(undefined);
        })
        .then(($el) => {
          const initialY = ($el[0] as any).__data__.y;
          // Set ALL GPU powers to an extreme value
          cy.get('[data-testid="custom-powers-section"] input[id^="cost-input-"]').each(
            ($input) => {
              cy.wrap($input).clear().type('99999');
            },
          );

          cy.get('[data-testid="custom-powers-calculate"]').click();

          // All points should have different y values since all powers changed
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
