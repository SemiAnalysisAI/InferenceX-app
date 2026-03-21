describe('Reliability Chart', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/reliability');
    cy.get('[data-testid="reliability-chart-display"]').should('exist');
  });

  it('shows the GPU Reliability heading', () => {
    cy.contains('h2', 'GPU Reliability').should('be.visible');
  });

  it('shows the date range selector', () => {
    cy.get('[data-testid="reliability-date-range"]').should('be.visible');
  });

  it('date range selector has options including All time', () => {
    cy.get('[data-testid="reliability-date-range"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 0);
    cy.contains('[role="option"]', 'All time').should('exist');
    cy.get('body').type('{esc}');
  });

  it('changing date range updates the displayed selection', () => {
    cy.get('[data-testid="reliability-date-range"]').click();
    cy.contains('[role="option"]', 'Last 7 days').click();
    cy.get('[data-testid="reliability-date-range"]').should('contain', 'Last 7 days');
  });

  it('shows a chart with SVG', () => {
    cy.get('#reliability-chart').find('svg').should('exist');
  });

  it('does not show "No data available" text', () => {
    cy.get('[data-testid="reliability-chart-display"]').should('exist');
    cy.contains('No data available').should('not.exist');
  });

  it('shows Source attribution in chart caption', () => {
    cy.get('#reliability-chart')
      .closest('section')
      .within(() => {
        cy.contains('SemiAnalysis InferenceX').should('exist');
      });
  });
});

describe('Reliability Chart — Content & Interactions', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/reliability');
    cy.get('[data-testid="reliability-chart-display"]').should('be.visible');
  });

  it('renders SVG bar rectangles inside the reliability chart after data loads', () => {
    cy.get('#reliability-chart svg rect.bar').should('have.length.greaterThan', 0);
  });

  it('switching date range from default to "Last 7 days" changes the chart display', () => {
    cy.get('#reliability-chart svg rect.bar').should('have.length.greaterThan', 0);

    cy.get('#reliability-chart svg rect.bar')
      .its('length')
      .then((initialCount) => {
        cy.get('[data-testid="reliability-date-range"]').click();
        cy.contains('[role="option"]', 'Last 7 days').click();

        // "Last 7 days" may have fewer bars or no bars at all (empty overlay shown).
        cy.get('#reliability-chart svg').should('exist');
        cy.document().then((doc) => {
          const newCount = doc.querySelectorAll('#reliability-chart svg rect.bar').length;
          expect(newCount !== initialCount || newCount === 0).to.equal(true);
        });

        // Reset back to All time so subsequent tests have data
        cy.get('[data-testid="reliability-date-range"]').click();
        cy.contains('[role="option"]', 'All time').click();
        cy.get('#reliability-chart svg rect.bar').should('have.length.greaterThan', 0);
      });
  });

  it('legend sidebar renders with at least one hardware item', () => {
    cy.get('#reliability-chart')
      .closest('figure')
      .find('.sidebar-legend')
      .should('exist')
      .find('li')
      .should('have.length.greaterThan', 0);
  });

  it('percentage labels are rendered on bars', () => {
    cy.get('#reliability-chart svg .value-label')
      .should('have.length.greaterThan', 0)
      .first()
      .invoke('text')
      .should('match', /\d+\.\d+%/);
  });

  it('High Contrast toggle exists and can be enabled', () => {
    cy.get('#reliability-chart')
      .closest('figure')
      .find('.sidebar-legend')
      .contains('label', 'High Contrast')
      .should('exist');

    cy.get('#reliability-high-contrast').click();
    cy.get('#reliability-high-contrast').should('have.attr', 'data-state', 'checked');
  });

  it('chart Y-axis shows percentage labels (0% to 100%)', () => {
    cy.get('#reliability-chart svg')
      .find('.tick text')
      .should('have.length.greaterThan', 0)
      .then(($ticks) => {
        const texts = Array.from($ticks).map((el) => el.textContent || '');
        const hasPercentage = texts.some((t) => /\d+%/.test(t));
        expect(hasPercentage).to.equal(true);
      });
  });

  it('"Reset filter" link appears after deactivating a legend item and restores all items', () => {
    cy.get('#reliability-chart')
      .closest('figure')
      .find('.sidebar-legend li label')
      .then(($labels) => {
        if ($labels.length < 2) {
          // With only one model the toggle is a no-op (solo mode), so "Reset filter" cannot appear
          cy.log('Skipping: only one legend item — toggle cannot deactivate it');
          return;
        }

        // First click unchecks all others, which shows "Reset filter"
        cy.wrap($labels.first()).click();

        cy.get('#reliability-chart')
          .closest('figure')
          .find('.sidebar-legend')
          .contains('button', 'Reset filter')
          .should('exist');

        cy.get('#reliability-chart')
          .closest('figure')
          .find('.sidebar-legend')
          .contains('button', 'Reset filter')
          .click();

        cy.get('#reliability-chart')
          .closest('figure')
          .find('.sidebar-legend li')
          .first()
          .find('input[type="checkbox"]')
          .should('be.checked');
      });
  });
});
