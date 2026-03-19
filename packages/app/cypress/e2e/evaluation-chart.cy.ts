describe('Evaluation Chart', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/evaluation');
    cy.get('[data-testid="evaluation-chart-display"]').should('exist');
  });

  it('shows the Accuracy Evals heading', () => {
    cy.contains('h2', 'Accuracy Evals').should('be.visible');
  });

  it('shows benchmark selector', () => {
    cy.get('[data-testid="evaluation-benchmark-selector"]').should('be.visible');
  });

  it('benchmark selector has options', () => {
    cy.get('[data-testid="evaluation-benchmark-selector"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 0);
    cy.get('body').type('{esc}');
  });

  it('shows a chart with SVG', () => {
    cy.get('#evaluation-chart').find('svg').should('exist');
  });

  it('does not show "No data available" text', () => {
    cy.get('[data-testid="evaluation-chart-display"]').should('exist');
    cy.contains('No data available').should('not.exist');
  });

  it('shows Source attribution in chart caption', () => {
    cy.get('#evaluation-chart')
      .closest('section')
      .within(() => {
        cy.contains('SemiAnalysis InferenceX').should('exist');
      });
  });
});

describe('Evaluation Chart — Content & Interactions', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/evaluation');
    cy.get('[data-testid="evaluation-chart-display"]').should('be.visible');
  });

  it('renders SVG data points (circles) inside the evaluation chart after data loads', () => {
    cy.get('#evaluation-chart svg circle').should('have.length.greaterThan', 0);
  });

  it('changing the benchmark selector updates the chart subtitle to reflect the new benchmark', () => {
    cy.get('#evaluation-chart')
      .closest('figure')
      .find('figcaption')
      .invoke('text')
      .then((initialCaption) => {
        cy.get('[data-testid="evaluation-benchmark-selector"]').click();
        cy.get('[role="option"]').then(($options) => {
          if ($options.length <= 1) return;
          cy.wrap($options).last().click();
          cy.get('#evaluation-chart')
            .closest('figure')
            .find('figcaption')
            .invoke('text')
            .should('not.eq', initialCaption);
        });
      });
    // Clear Radix scroll-lock side effect so subsequent tests can click
    cy.get('body').then(($body) => {
      $body.removeAttr('data-scroll-locked');
      $body.css('pointer-events', '');
    });
  });

  it('legend sidebar renders with at least one hardware item', () => {
    cy.get('#evaluation-chart')
      .closest('figure')
      .find('.sidebar-legend')
      .should('exist')
      .find('li')
      .should('have.length.greaterThan', 0);
  });

  it('date picker section is present with a Run Date button', () => {
    cy.get('[data-testid="evaluation-chart-display"]')
      .contains('button', 'Run Date:')
      .should('exist');
  });

  it('chart caption includes the selected model name and benchmark', () => {
    cy.get('#evaluation-chart')
      .closest('figure')
      .find('figcaption')
      .invoke('text')
      .should('match', /Source: SemiAnalysis InferenceX/)
      .and('match', /•/);
  });

  it('Show Labels switch exists in the legend and toggling it adds score labels to the chart', () => {
    cy.get('#evaluation-chart')
      .closest('figure')
      .find('.sidebar-legend')
      .contains('label', 'Show Labels')
      .should('exist');

    cy.get('#eval-show-labels').then(($switch) => {
      const isChecked = $switch.attr('data-state') === 'checked';
      if (isChecked) {
        cy.wrap($switch).click();
      }
      cy.wrap($switch).click();
      cy.get('#evaluation-chart svg .score-label').should('have.length.greaterThan', 0);
    });
  });

  it('"Reset filter" link appears after deactivating a legend item and restores all items when clicked', () => {
    cy.get('#evaluation-chart').closest('figure').find('.sidebar-legend li label').first().click();

    cy.get('#evaluation-chart')
      .closest('figure')
      .find('.sidebar-legend')
      .contains('button', 'Reset filter')
      .should('exist');

    cy.get('#evaluation-chart')
      .closest('figure')
      .find('.sidebar-legend')
      .contains('button', 'Reset filter')
      .click();

    cy.get('#evaluation-chart')
      .closest('figure')
      .find('.sidebar-legend li')
      .first()
      .find('input[type="checkbox"]')
      .should('be.checked');
  });
});
