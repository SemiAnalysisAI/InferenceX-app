import { buildRunSummary } from '@/components/collectivex/reader';
import {
  buildDataset,
  makeCollectiveXDataset,
  makeRawShard,
} from '@/components/collectivex/test-fixture';
import type { CollectiveXDataset } from '@/components/collectivex/types';

// The neutral view: one run's measured series plus its full case coverage. The route
// serves the resolved dataset at /latest.json, a run listing at /runs.json, and a
// specific run at /runs/{id}.json. No channel/digest/promotion layer remains.
const SOURCE_SHA = 'c'.repeat(40);
const dataset = makeCollectiveXDataset();
const runId = dataset.run.run_id;

function installLatest(body: CollectiveXDataset | Record<string, unknown> = dataset) {
  cy.intercept('GET', '/collectivex-data/1/latest.json', { body }).as('latest');
}

function installRuns() {
  cy.intercept('GET', '/collectivex-data/1/runs.json', {
    body: { version: 1, runs: [buildRunSummary(dataset)] },
  }).as('runs');
}

function installRun(body: CollectiveXDataset = dataset) {
  cy.intercept('GET', `/collectivex-data/1/runs/${runId}.json`, { body }).as('run');
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

describe('CollectiveX availability states', () => {
  it('reports a missing run', () => {
    cy.intercept('GET', '/collectivex-data/1/latest.json', {
      statusCode: 404,
      headers: { 'X-CollectiveX-Status': 'runs-unavailable' },
    }).as('missing');
    cy.visit('/collectivex');
    cy.wait('@missing');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'CollectiveX request failed (404).');
    cy.get('[data-testid="collectivex-error-version-select"]').should('contain.text', 'V1');
  });

  it('reports an unavailable GitHub source', () => {
    cy.intercept('GET', '/collectivex-data/1/latest.json', {
      statusCode: 503,
      headers: { 'X-CollectiveX-Status': 'source-unavailable' },
    }).as('down');
    cy.visit('/collectivex');
    cy.wait('@down');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'CollectiveX request failed (503).');
  });

  it('renders the loading state while the run resolves', () => {
    // "slow" is a reserved alias word in Cypress 15.
    cy.intercept('GET', '/collectivex-data/1/latest.json', { body: dataset, delay: 500 }).as(
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
