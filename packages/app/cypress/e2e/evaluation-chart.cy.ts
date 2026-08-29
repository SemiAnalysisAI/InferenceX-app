import { expectNoPageOverflow } from '../support/e2e';

describe('Evaluation Chart', () => {
  before(() => {
    cy.viewport(1440, 900);
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
    cy.viewport(1440, 900);
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

describe('Evaluation Chart — Simplified Chinese mobile path', () => {
  beforeEach(() => {
    cy.viewport(390, 900);
    cy.visit('/zh/evaluation', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        // The eval-samples toast fires 1.5s after load and covers the retry
        // button at this viewport — keep it dismissed for the whole suite.
        win.localStorage.setItem('inferencex-eval-samples-nudge-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="evaluation-chart-display"]').should('be.visible');
  });

  it('keeps table/chart actions reachable and localizes table labels and dates', () => {
    cy.contains('h2', '准确率评估').should('be.visible');
    cy.get('[data-testid="share-button"]')
      .should('be.visible')
      .and('have.attr', 'title', '分享当前视图');
    cy.get('[data-testid="evaluation-view-toggle"]').should('be.visible');
    cy.get('[data-testid="evaluation-results-table"]')
      .should('contain.text', '芯片')
      .and('contain.text', '精度')
      .and('contain.text', '日期')
      .and('contain.text', '年');
    cy.get('[data-testid="evaluation-view-toggle"]').contains('图表').click();
    cy.get('[data-testid="export-button"]')
      .should('be.visible')
      .and('have.attr', 'aria-label', '下载图表');
    expectNoPageOverflow();
  });

  it('distinguishes a fetch error from empty data and retries the failed query', () => {
    cy.fixture('api/evaluations.json').then((evaluations) => {
      // Flag-gated rather than attempt-counted: the page left over from the
      // previous test can fire a stray request after this intercept registers
      // (firefox does), which would silently consume the failure budget and
      // let the fresh page succeed without ever showing the error card.
      let attempts = 0;
      let succeed = false;
      cy.intercept('GET', '/api/v1/evaluations', (request) => {
        attempts += 1;
        request.reply(
          succeed ? { statusCode: 200, body: evaluations } : { statusCode: 500, body: {} },
        );
      });
      // Distinct URL: with testIsolation off, revisiting the beforeEach URL
      // does not reliably reload, so the intercept would never be exercised.
      cy.visit('/zh/evaluation?e2e=fetch-error');
      // Long timeout: the error card only renders after two failed attempts
      // separated by React Query's retry backoff, which can outlast the
      // default budget on a slow (firefox CI) page load.
      cy.get('[data-testid="evaluation-query-error"]', { timeout: 15000 })
        .should('contain.text', '评估数据加载失败。')
        .and('contain.text', '重试');
      cy.then(() => {
        succeed = true;
      });
      // Forced: the floating chart-actions row (absolute top-6 right-6 z-10)
      // overlaps the banner's right edge in the error state — a pre-existing
      // layout collision, not a localization regression. This test covers the
      // retry semantics, not tap reachability.
      cy.get('[data-testid="evaluation-query-error"]')
        .contains('button', '重试')
        .click({ force: true });
      cy.get('[data-testid="evaluation-query-error"]').should('not.exist');
      cy.get('[data-testid="evaluation-results-table"]').should('be.visible');
      cy.then(() => expect(attempts).to.be.at.least(3));
    });
  });

  it('keeps evaluation results visible while retrying failed availability metadata', () => {
    cy.fixture('api/availability.json').then((availability) => {
      cy.fixture('api/evaluations.json').then((evaluations) => {
        // Flag-gated for the same stray-request reason as the previous test.
        let availabilityAttempts = 0;
        let succeed = false;
        cy.intercept('GET', '/api/v1/availability*', (request) => {
          availabilityAttempts += 1;
          request.reply(
            succeed ? { statusCode: 200, body: availability } : { statusCode: 500, body: {} },
          );
        });
        cy.intercept('GET', '/api/v1/evaluations', { statusCode: 200, body: evaluations });
        cy.visit('/zh/evaluation?e2e=availability-retry');

        // Long timeout: same two-failures-plus-backoff delay as above.
        cy.get('[data-testid="evaluation-query-error"]', { timeout: 15000 })
          .should('contain.text', '筛选项可用性数据加载失败。')
          .and('contain.text', '重试');
        cy.get('[data-testid="evaluation-results-table"]').should('be.visible');
        cy.get('[data-testid="evaluation-view-toggle"]').contains('图表').click();
        cy.get('[data-testid="evaluation-query-error"]')
          .should('contain.text', '筛选项可用性数据加载失败。')
          .and('contain.text', '重试');
        cy.get('#evaluation-chart svg circle').should('have.length.greaterThan', 0);
        cy.then(() => {
          succeed = true;
        });
        // Forced for the same floating chart-actions overlap as above.
        cy.get('[data-testid="evaluation-query-error"]')
          .contains('button', '重试')
          .click({ force: true });
        cy.get('[data-testid="evaluation-query-error"]').should('not.exist');
        cy.get('#evaluation-chart svg circle').should('have.length.greaterThan', 0);
        cy.then(() => expect(availabilityAttempts).to.be.at.least(3));
      });
    });
  });

  it('renders a successful empty response without offering an error retry', () => {
    cy.intercept('GET', '/api/v1/evaluations', { statusCode: 200, body: [] });
    cy.visit('/zh/evaluation?e2e=empty-success');
    cy.contains('当前筛选条件下没有可用数据。').should('be.visible');
    cy.get('[data-testid="evaluation-view-toggle"]').contains('图表').click();
    cy.contains(/该模型暂无评估数据|所选模型与基准测试组合暂无评估数据/u).should('be.visible');
    cy.get('[data-testid="evaluation-query-error"]').should('not.exist');
  });
});
