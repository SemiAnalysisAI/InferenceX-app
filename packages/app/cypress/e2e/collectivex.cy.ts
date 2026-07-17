import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import {
  buildDataset,
  makeCollectiveXDataset,
  makeRawShard,
} from '@/components/collectivex/test-fixture';
import type { CollectiveXDataset } from '@/components/collectivex/types';

// The neutral view: one run's measured series plus its full case coverage,
// served from the CollectiveX database via /api/v1/collectivex/latest,
// /api/v1/collectivex/runs (picker listing), and /api/v1/collectivex/runs/{id}.
const SOURCE_SHA = 'c'.repeat(40);
const dataset = makeCollectiveXDataset();
const runId = dataset.run.run_id;
const ADMIN_TOKEN_KEY = 'collectivex-admin-token';

function installLatest(body: CollectiveXDataset | Record<string, unknown> = dataset) {
  cy.intercept('GET', '/api/v1/collectivex/latest*', { body }).as('latest');
}

function installRuns() {
  cy.intercept('GET', '/api/v1/collectivex/runs?*', {
    body: { version: 1, runs: [buildRunSummary(dataset)] },
  }).as('runs');
}

function installRun(body: CollectiveXDataset = dataset) {
  cy.intercept('GET', `/api/v1/collectivex/runs/${runId}*`, { body }).as('run');
}

function openCollectiveX() {
  cy.visit('/collectivex');
  cy.wait('@latest');
  cy.get('[data-testid="collectivex-display"]').should('be.visible');
}

describe('CollectiveX neutral run view', () => {
  beforeEach(() => {
    installLatest();
    openCollectiveX();
  });

  it('shows the run header, coverage stats, and revision-pinned source links', () => {
    cy.get('[data-testid="collectivex-run-conclusion"]')
      .should('contain.text', `#${runId}`)
      .and('contain.text', 'success');
    cy.get('[data-testid="collectivex-display"]')
      .should('contain.text', `${dataset.run.measured_cases}/${dataset.run.requested_cases}`)
      .and('contain.text', String(dataset.series.length));
    cy.get('[data-testid="collectivex-version-select"]').should('contain.text', 'V1');
    cy.get('[data-testid="collectivex-source-link"]').should(
      'have.attr',
      'href',
      `https://github.com/SemiAnalysisAI/InferenceX/tree/${SOURCE_SHA}/experimental/CollectiveX`,
    );
    cy.get('[data-testid="collectivex-methodology-link"]')
      .should('contain.text', 'Methodology')
      .and(
        'have.attr',
        'href',
        `https://github.com/SemiAnalysisAI/InferenceX/blob/${SOURCE_SHA}/experimental/CollectiveX/docs/methodology.md`,
      );
  });

  it('renders the default decode round-trip chart for the EP8 scale-up series', () => {
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'Round trip (measured) · decode · p99')
      .and('contain.text', 'deepep-v2');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('only exposes dimensions that vary in the current matrix', () => {
    cy.get('[data-testid="collectivex-ep-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-phase-toggle"]').should('be.visible');
    cy.get('[data-testid="collectivex-precision-toggle"]').should('be.visible');
    cy.get('[data-testid="collectivex-sku-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-backend-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-mode-toggle"]').should('not.exist');
    cy.get('[data-testid="collectivex-fabric-scope-toggle"]').should('not.exist');
    cy.get('[data-testid="collectivex-routing-select"]').should('not.exist');
  });

  it('selects the EP16 series through the identity controls', () => {
    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP16').click();

    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'mori')
      .and('contain.text', 'EP16');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('exposes the kernel-mode toggle when a run measured both modes and pins the LL series', () => {
    const withLowLatency = buildDataset({
      shards: [makeRawShard(), makeRawShard({ mode: 'low-latency' })],
    });
    installLatest(withLowLatency);
    cy.reload();
    cy.wait('@latest');

    cy.get('[data-testid="collectivex-mode-toggle"]').should('be.visible');
    cy.get('[data-testid="collectivex-main-chart"]').should('contain.text', 'deepep-v2');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);

    cy.get('[data-testid="collectivex-mode-toggle"]').contains('Low-latency').click();
    cy.get('[data-testid="chart-legend"]').should('contain.text', 'low-latency');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('selects the available phase when a partial run only measured prefill', () => {
    const prefill = buildDataset({ shards: [makeRawShard({ phase: 'prefill' })] });
    installLatest(prefill);
    cy.reload();
    cy.wait('@latest');
    cy.get('[data-testid="collectivex-phase-toggle"]').should('contain.text', 'Prefill');
    cy.get('[data-testid="collectivex-main-chart"]').should('contain.text', 'prefill');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('clears the chart when the sole series is toggled off in the legend', () => {
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.get('[data-testid="chart-legend"] input[type="checkbox"]:checked')
      .first()
      .uncheck({ force: true });
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('not.exist');
  });

  it('pins a compact tooltip on point click', () => {
    cy.get('[data-testid="collectivex-explorer-chart"] .point').first().click({ force: true });
    cy.get('[data-chart-tooltip]:visible')
      .should('contain.text', 'Click elsewhere to dismiss')
      .and('contain.text', 'Round trip (measured) p99:')
      .and('contain.text', 'Latency p50 / p90 / p95 / p99')
      .and('not.contain.text', 'Expert CV')
      .and('not.contain.text', 'evidence=');
  });

  it('lists runs on demand and pins a specific run by id', () => {
    installRuns();
    installRun();
    cy.get('[data-testid="collectivex-load-runs"]').click();
    cy.wait('@runs');
    cy.get('[data-testid="collectivex-run-select"]').click();
    cy.contains('[role="option"]', `#${runId}`).click();
    cy.wait('@run');
    cy.get('[data-testid="collectivex-run-conclusion"]').should('contain.text', `#${runId}`);
  });

  it('keeps the chart on top and presents the matrix inventory', () => {
    cy.get('[data-testid="collectivex-main-chart"]').should('be.visible');
    cy.get('[data-testid="collectivex-inventory"]')
      .should('contain.text', 'Matrix case inventory')
      .and('contain.text', `${dataset.coverage.length} cases`);
    cy.get('[data-testid="collectivex-inventory-table"]')
      .should('contain.text', 'H200-DGXC')
      .and('contain.text', 'B300');
  });
});

describe('CollectiveX run deletion', () => {
  beforeEach(() => {
    installLatest();
    openCollectiveX();
  });

  it('deletes the shown run after confirm + token prompt and remembers the token', () => {
    cy.intercept('DELETE', `/api/v1/collectivex/runs/${runId}`, (request) => {
      expect(request.headers.authorization).to.eq('Bearer test-token');
      request.reply({ deleted: true, runId });
    }).as('deleteRun');
    cy.window().then((win) => {
      win.localStorage.removeItem(ADMIN_TOKEN_KEY);
      cy.stub(win, 'confirm').returns(true);
      cy.stub(win, 'prompt').returns('test-token');
    });

    cy.get('[data-testid="collectivex-delete-run"]').click();
    cy.wait('@deleteRun');
    // Successful deletion invalidates the dataset queries → latest refetches.
    cy.wait('@latest');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(ADMIN_TOKEN_KEY)).to.eq('test-token');
    });
  });

  it('clears a stale stored token and reports unauthorized on 401', () => {
    cy.intercept('DELETE', `/api/v1/collectivex/runs/${runId}`, { statusCode: 401 }).as(
      'delete401',
    );
    cy.window().then((win) => {
      win.localStorage.setItem(ADMIN_TOKEN_KEY, 'stale-token');
      cy.stub(win, 'confirm').returns(true);
      cy.stub(win, 'alert').as('unauthorizedAlert');
    });

    cy.get('[data-testid="collectivex-delete-run"]').click();
    cy.wait('@delete401');
    cy.get('@unauthorizedAlert').should('have.been.calledWith', 'Invalid admin token.');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(ADMIN_TOKEN_KEY)).to.eq(null);
    });
  });

  it('does nothing when the confirmation is declined', () => {
    let deleteRequests = 0;
    cy.intercept('DELETE', `/api/v1/collectivex/runs/${runId}`, () => {
      deleteRequests += 1;
    });
    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(false);
    });

    cy.get('[data-testid="collectivex-delete-run"]').click();
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
    cy.then(() => expect(deleteRequests).to.eq(0));
  });
});

describe('CollectiveX availability states', () => {
  it('reports a missing run', () => {
    cy.intercept('GET', '/api/v1/collectivex/latest*', {
      statusCode: 404,
      body: { error: 'Not found' },
    }).as('missing');
    cy.visit('/collectivex');
    cy.wait('@missing');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'API error: 404');
    cy.get('[data-testid="collectivex-error-version-select"]').should('contain.text', 'V1');
  });

  it('reports an unavailable backend', () => {
    cy.intercept('GET', '/api/v1/collectivex/latest*', {
      statusCode: 503,
      body: { error: 'unavailable' },
    }).as('down');
    cy.visit('/collectivex');
    cy.wait('@down');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'API error: 503');
  });

  it('renders the loading state while the run resolves', () => {
    // "slow" is a reserved alias word in Cypress 15.
    cy.intercept('GET', '/api/v1/collectivex/latest*', { body: dataset, delay: 500 }).as(
      'slowLatest',
    );
    cy.visit('/collectivex');
    cy.get('[data-testid="collectivex-loading"]').should('be.visible');
    cy.wait('@slowLatest');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
  });

  it('does not query database availability for the isolated page', () => {
    let availabilityRequests = 0;
    cy.intercept('GET', '/api/v1/availability', (request) => {
      availabilityRequests += 1;
      request.reply([]);
    });
    installLatest();
    cy.visit('/collectivex');
    cy.wait('@latest');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
    cy.then(() => expect(availabilityRequests).to.eq(0));
  });
});
