describe('Evaluation Chart', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/evaluation');
    cy.get('[data-testid="evaluation-chart-display"]').should('exist');
    cy.get('[data-testid="evaluation-view-toggle"]').contains('Chart').click();
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
    cy.get('[data-testid="evaluation-view-toggle"]').contains('Chart').click();
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
      .should('match', /Source: SemiAnalysis InferenceX/u)
      .and('match', /•/u);
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

describe('Evaluation sample sharing', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/eval-samples*', {
      statusCode: 200,
      body: {
        samples: [
          {
            docId: 0,
            prompt: 'What is 1 + 1?',
            target: '2',
            response: '2',
            rawResponse: null,
            demonstrations: null,
            passed: true,
            score: 1,
            metrics: {},
          },
        ],
        total: 1,
        passedTotal: 1,
        failedTotal: 0,
        source: 'db',
        offset: 0,
      },
    });
    cy.visit('/evaluation');
    cy.get('[data-testid="evaluation-chart-display"]').should('be.visible');
    cy.get('[data-testid="evaluation-view-toggle"]').contains('Table').click();
  });

  it('copies and restores a link to the prompt drawer', () => {
    cy.on(
      'uncaught:exception',
      (error) =>
        !error.message.includes('Hydration failed') &&
        !error.message.includes('Minified React error #418'),
    );
    cy.get('[title="View per-sample prompts and responses"]').first().click();

    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').as('writeDrawerLink').resolves();
    });
    cy.get('[data-testid="eval-drawer-share-button"]').click();
    cy.contains('[data-testid="eval-drawer-share-button"]', 'Copied').should('be.visible');

    cy.get('@writeDrawerLink')
      .should('have.been.calledOnce')
      .then((stub) => {
        const sharedUrl = String((stub as sinon.SinonStub).firstCall.args[0]);
        const params = new URL(sharedUrl).searchParams;
        expect(params.get('eval')).to.match(/^\d+$/);
        expect(params.has('sample')).to.equal(false);
        cy.visit(sharedUrl);
      });

    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[data-testid="eval-drawer-share-button"]').should('be.visible');
    cy.get('[role="dialog"] li > button[aria-expanded="true"]').should('not.exist');
  });

  it('does not apply a stale sample id to a manually opened drawer', () => {
    cy.visit('/evaluation?sample=0');
    cy.get('[data-testid="evaluation-chart-display"]').should('be.visible');
    cy.get('[title="View per-sample prompts and responses"]').first().click();

    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"] li > button[aria-expanded="true"]').should('not.exist');
  });

  it('copies and restores a link to one expanded sample', () => {
    cy.on(
      'uncaught:exception',
      (error) =>
        !error.message.includes('Hydration failed') &&
        !error.message.includes('Minified React error #418'),
    );
    cy.get('[title="View per-sample prompts and responses"]').first().click();
    cy.get('[role="dialog"] li > button').first().click();

    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').as('writeShareLink').resolves();
    });
    cy.get('[data-testid^="eval-sample-share-"]').click();
    cy.contains('[data-testid^="eval-sample-share-"]', 'Copied').should('be.visible');

    cy.get('@writeShareLink')
      .should('have.been.calledOnce')
      .then((stub) => {
        const sharedUrl = String((stub as sinon.SinonStub).firstCall.args[0]);
        expect(new URL(sharedUrl).searchParams.get('eval')).to.match(/^\d+$/);
        expect(new URL(sharedUrl).searchParams.get('sample')).to.match(/^\d+$/);
        cy.visit(sharedUrl);
      });

    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[aria-expanded="true"]').should('exist');
    cy.get('[data-testid^="eval-sample-share-"]').scrollIntoView().should('be.visible');
  });
});
