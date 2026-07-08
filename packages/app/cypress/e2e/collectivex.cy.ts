import { buildRunSummary } from '@/components/collectivex/reader';
import { makeCollectiveXDataset } from '@/components/collectivex/test-fixture';
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
    body: { format: 'collectivex.runs.v1', version: 1, runs: [buildRunSummary(dataset)] },
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
      .and('contain.text', 'nccl-ep');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('selects the EP16 scale-out series through the identity controls', () => {
    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP16').click();
    cy.get('[data-testid="collectivex-fabric-scope-toggle"]')
      .contains('button', 'Scale-out')
      .click();

    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'deepep')
      .and('contain.text', 'EP16');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('shows the empty state when no series matches the identity selection', () => {
    // The only EP8 series is scale-up, so a scale-out filter at EP8 matches nothing.
    cy.get('[data-testid="collectivex-fabric-scope-toggle"]')
      .contains('button', 'Scale-out')
      .click();
    cy.get('[data-testid="collectivex-empty-state"]').should('be.visible');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('not.exist');
  });

  it('clears the chart when the sole series is toggled off in the legend', () => {
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.get('[data-testid="chart-legend"] input[type="checkbox"]:checked')
      .first()
      .uncheck({ force: true });
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('not.exist');
  });

  it('notes that isolated sum is derived and never drives throughput', () => {
    cy.get('[data-testid="collectivex-operation-select"]').click();
    cy.contains('[role="option"]', 'Isolated sum').click();
    cy.get('[data-testid="collectivex-main-chart"]').should(
      'contain.text',
      'Isolated sum is derived',
    );
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

  it('keeps the chart on top and presents the matrix inventory in the default tab', () => {
    // The chart is not inside a tab: it stays visible alongside every tab.
    cy.get('[data-testid="collectivex-main-chart"]').should('be.visible');
    cy.get('[data-testid="collectivex-inventory"]')
      .should('contain.text', 'Matrix case inventory')
      .and('contain.text', `${dataset.coverage.length} of ${dataset.coverage.length} cases`);
    cy.get('[data-testid="collectivex-inventory-table"]')
      .should('contain.text', 'H200-DGXC')
      .and('contain.text', 'B300-SXM');
    cy.contains('[role="tab"]', 'Selected matrix case').click();
    cy.get('[data-testid="collectivex-inventory"]').should('not.exist');
    cy.get('[data-testid="collectivex-main-chart"]').should('be.visible');
  });

  it('jumps to the selected matrix case tab when a case is inspected', () => {
    cy.get('[data-testid="collectivex-inventory-table"] button[aria-label^="Inspect"]')
      .last()
      .click();
    cy.location('hash').should('eq', '#tab-case');
    cy.get('[data-testid="collectivex-case-detail"]').should(
      'contain.text',
      'Selected matrix case',
    );
  });

  it('exposes terminal coverage, retained attempts, and run provenance in Evidence', () => {
    cy.contains('[role="tab"]', 'Evidence').click();
    cy.get('[data-testid="collectivex-coverage-table"]')
      .should('contain.text', 'nccl-ep')
      .and('contain.text', 'deepep')
      .and('contain.text', 'unsupported');
    cy.get('[data-testid="collectivex-attempts-table"]').should('be.visible');
    cy.get('[data-testid="collectivex-provenance"]')
      .should('contain.text', `#${runId}`)
      .and('contain.text', 'Source bundles');
  });

  it('restores the active tab with browser history', () => {
    cy.contains('[role="tab"]', 'Evidence').click();
    cy.location('hash').should('eq', '#tab-evidence');
    cy.contains('[role="tab"]', 'Matrix case inventory').click();
    cy.location('hash').should('eq', '#tab-inventory');
    cy.go('back');
    cy.location('hash').should('eq', '#tab-evidence');
    cy.get('[data-testid="collectivex-provenance"]').should('be.visible');
  });

  it('disables source navigation when measured series span different revisions', () => {
    const mixed = makeCollectiveXDataset();
    mixed.series[1].build.source_sha = 'd'.repeat(40);
    installLatest(mixed);
    cy.reload();
    cy.wait('@latest');
    cy.get('[data-testid="collectivex-source-link"]')
      .should('have.attr', 'aria-disabled', 'true')
      .and('not.have.attr', 'href');
  });
});

describe('CollectiveX availability states', () => {
  it('reports a missing run listing as no published run', () => {
    cy.intercept('GET', '/collectivex-data/1/latest.json', {
      statusCode: 404,
      headers: { 'X-CollectiveX-Status': 'runs-unavailable' },
    }).as('missing');
    cy.visit('/collectivex');
    cy.wait('@missing');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'No CollectiveX run has been published yet.');
    cy.get('[data-testid="collectivex-error-version-select"]').should('contain.text', 'V1');
  });

  it('reports an unavailable GitHub source as a temporary outage', () => {
    cy.intercept('GET', '/collectivex-data/1/latest.json', {
      statusCode: 503,
      headers: { 'X-CollectiveX-Status': 'source-unavailable' },
    }).as('down');
    cy.visit('/collectivex');
    cy.wait('@down');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'The GitHub Actions run source is temporarily unavailable.');
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
