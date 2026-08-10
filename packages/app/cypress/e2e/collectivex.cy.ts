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
const comparisonDataset = buildDataset({
  shards: [makeRawShard(), makeRawShard({ precision: 'fp8' })],
  meta: {
    run_id: '159',
    generated_at: '2026-07-07T12:20:00Z',
    source_sha: 'd'.repeat(40),
  },
});
const incompleteDataset = buildDataset({
  shards: [],
  meta: {
    run_id: '161',
    generated_at: '2026-07-09T12:20:00Z',
    conclusion: 'failure',
  },
});
const kvDataset = buildDataset({
  shards: [makeRawShard()],
  kv: [
    {},
    {
      sku: 'mi355x',
      backend: 'mori-io',
      fabric: 'rdma',
      vendor: 'amd',
      status: 'invalid',
      reasons: ['transfer verification failed'],
    },
  ],
  meta: { run_id: '162', generated_at: '2026-08-07T12:20:00Z', source_sha: 'e'.repeat(40) },
});
const ADMIN_TOKEN_KEY = 'collectivex-admin-token';

function installRuns(bodies: CollectiveXDataset[] = [dataset]) {
  cy.intercept('GET', '/api/v1/collectivex/runs?*', {
    body: { version: 1, runs: bodies.map(buildRunSummary), discovery_complete: true },
  }).as('runs');
}

function installRun(body: CollectiveXDataset = dataset, alias = 'run') {
  cy.intercept('GET', `/api/v1/collectivex/runs/${body.run.run_id}*`, { body }).as(alias);
}

function openCollectiveX() {
  cy.visit('/collectivex');
  cy.wait('@runs');
  cy.wait('@run');
  cy.get('[data-testid="collectivex-display"]').should('be.visible');
}

describe('CollectiveX neutral run view', () => {
  beforeEach(() => {
    installRuns();
    installRun();
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
    cy.get('[data-testid="collectivex-runs-table"]').should('have.css', 'max-height', '448px');
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

  it('keeps loading bounded discovery batches until every run is listed', () => {
    let requests = 0;
    cy.intercept('GET', '/api/v1/collectivex/runs?*', (request) => {
      requests += 1;
      request.reply({
        body: {
          version: 1,
          runs: (requests === 1 ? [] : [dataset, comparisonDataset]).map(buildRunSummary),
          discovery_complete: requests > 1,
        },
      });
    }).as('progressiveRuns');

    cy.reload();
    cy.wait('@progressiveRuns');
    cy.wait('@progressiveRuns');
    cy.wait('@run');

    cy.get(`[data-testid="collectivex-run-row-${comparisonDataset.run.run_id}"]`).should(
      'be.visible',
    );
    cy.get(`[data-testid="collectivex-run-visible-${runId}"]`).should('be.checked');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.then(() => expect(requests).to.be.gte(2));
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

  it('renders an nccl-ep backend series end to end', () => {
    const ncclEp = buildDataset({
      shards: [makeRawShard({ backend: 'nccl-ep', implName: 'nccl-ep' })],
    });
    installRuns([ncclEp]);
    installRun(ncclEp);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');
    cy.get('[data-testid="collectivex-main-chart"]').should('contain.text', 'nccl-ep');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('switches the y-axis to per-GPU payload bandwidth', () => {
    cy.get('[data-testid="collectivex-y-axis-select"]').click();
    cy.contains('[role="option"]', 'Payload bandwidth').click();
    cy.get('[data-testid="collectivex-main-chart"]').should('contain.text', 'Payload bandwidth');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('labels the activation-data rate footnote with the selected metric', () => {
    cy.get('[data-testid="collectivex-y-axis-select"]').click();
    cy.contains('[role="option"]', 'Activation-data rate').click();
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'Activation-data rate')
      .and('not.contain.text', 'Payload rate is derived');
  });

  it('allows both measured kernel modes to be selected together', () => {
    const withLowLatency = buildDataset({
      shards: [makeRawShard(), makeRawShard({ mode: 'low-latency' }), makeRawShard({ ep: 16 })],
    });
    installRuns([withLowLatency]);
    installRun(withLowLatency);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-mode-toggle"]').should('be.visible');
    cy.get('[data-testid="collectivex-mode-toggle"] button')
      .contains('Normal')
      .should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="collectivex-main-chart"]').should('contain.text', 'deepep-v2');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);

    cy.get('[data-testid="collectivex-mode-toggle"]').contains('Low-latency').click();
    cy.get('[data-testid="collectivex-mode-toggle"] button[aria-pressed="true"]').should(
      'have.length',
      2,
    );
    cy.get('[data-testid="chart-legend"]')
      .should('contain.text', 'normal')
      .and('contain.text', 'low-latency');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 2);

    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP16').click();
    cy.get('[data-testid="collectivex-mode-toggle"]').should('not.exist');

    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP8').click();
    cy.get('[data-testid="collectivex-mode-toggle"] button[aria-pressed="true"]').should(
      'have.length',
      2,
    );
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 2);
  });

  it('selects the available phase when a partial run only measured prefill', () => {
    const prefill = buildDataset({ shards: [makeRawShard({ phase: 'prefill' })] });
    installRuns([prefill]);
    installRun(prefill);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');
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

  it('lists every version-matching run and overlays checked runs', () => {
    installRuns([dataset, comparisonDataset]);
    installRun();
    installRun(comparisonDataset, 'comparisonRun');
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');

    cy.get(`[data-testid="collectivex-run-row-${runId}"]`).should('be.visible');
    cy.get(`[data-testid="collectivex-run-row-${comparisonDataset.run.run_id}"]`).should(
      'be.visible',
    );
    cy.get(`[data-testid="collectivex-run-visible-${runId}"]`).should('be.checked');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.get(`[data-testid="collectivex-run-line-style-${runId}"] line`).should(
      'not.have.attr',
      'stroke-dasharray',
    );
    cy.get(
      `[data-testid="collectivex-run-line-style-${comparisonDataset.run.run_id}"] line`,
    ).should('not.exist');

    cy.get(`[data-testid="collectivex-run-visible-${comparisonDataset.run.run_id}"]`).check();
    cy.wait('@comparisonRun');
    cy.get(
      `[data-testid="collectivex-run-line-style-${comparisonDataset.run.run_id}"] line`,
    ).should('have.attr', 'stroke-dasharray', '9 4');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path')
      .should('have.length', 2)
      .then(($lines) => {
        expect($lines.eq(0)).to.have.attr('stroke-dasharray', 'none');
        expect($lines.eq(1)).to.have.attr('stroke-dasharray', '9 4');
        expect($lines.eq(0)).to.have.attr('stroke', $lines.eq(1).attr('stroke'));
      });
    cy.get('[data-testid="chart-legend"]')
      .should('not.contain.text', `#${runId}`)
      .and('not.contain.text', `#${comparisonDataset.run.run_id}`)
      .find('[data-testid="legend-line-swatch"]')
      .should('have.length', 2)
      .then(($swatches) => {
        expect($swatches.eq(0).find('line')).not.to.have.attr('stroke-dasharray');
        expect($swatches.eq(1).find('line')).to.have.attr('stroke-dasharray', '9 4');
      });

    cy.get(`[data-testid="collectivex-run-visible-${runId}"]`).uncheck();
    cy.get('[data-testid="collectivex-run-conclusion"]').should(
      'contain.text',
      `#${comparisonDataset.run.run_id}`,
    );
    cy.get(`[data-testid="collectivex-run-line-style-${runId}"]`).should('not.exist');
    cy.get(
      `[data-testid="collectivex-run-line-style-${comparisonDataset.run.run_id}"] line`,
    ).should('not.have.attr', 'stroke-dasharray');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path')
      .should('have.length', 1)
      .and('have.attr', 'stroke-dasharray', 'none');
    cy.get('[data-testid="chart-legend"] [data-testid="legend-line-swatch"] line')
      .should('have.length', 1)
      .and('not.have.attr', 'stroke-dasharray');

    // Re-selecting a run assigns it the next active slot instead of restoring a
    // permanent run-specific pattern.
    cy.get(`[data-testid="collectivex-run-visible-${runId}"]`).check();
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path')
      .should('have.length', 2)
      .then(($lines) => {
        expect($lines.eq(0)).to.have.attr('stroke-dasharray', 'none');
        expect($lines.eq(1)).to.have.attr('stroke-dasharray', '9 4');
      });
  });

  it('defaults to the newest measured run when a newer incomplete run has no series', () => {
    installRuns([incompleteDataset, dataset]);
    installRun();
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');

    cy.get(`[data-testid="collectivex-run-row-${incompleteDataset.run.run_id}"]`).should(
      'be.visible',
    );
    cy.get(`[data-testid="collectivex-run-visible-${incompleteDataset.run.run_id}"]`).should(
      'not.be.checked',
    );
    cy.get(`[data-testid="collectivex-run-visible-${runId}"]`).should('be.checked');
    cy.get('[data-testid="collectivex-run-conclusion"]').should('contain.text', `#${runId}`);
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
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
    installRuns();
    installRun();
    openCollectiveX();
  });

  it('deletes a table row after confirm + token prompt and remembers the token', () => {
    let deleted = false;
    cy.intercept('GET', '/api/v1/collectivex/runs?*', (request) => {
      request.reply({
        body: {
          version: 1,
          runs: deleted ? [] : [buildRunSummary(dataset)],
        },
      });
    }).as('runsAfterDelete');
    cy.intercept('DELETE', `/api/v1/collectivex/runs/${runId}`, (request) => {
      expect(request.headers.authorization).to.eq('Bearer test-token');
      deleted = true;
      request.reply({ deleted: true, runId });
    }).as('deleteRun');
    cy.window().then((win) => {
      win.localStorage.removeItem(ADMIN_TOKEN_KEY);
      cy.stub(win, 'confirm').returns(true);
      cy.stub(win, 'prompt').returns('test-token');
    });

    cy.get(`[data-testid="collectivex-delete-run-${runId}"]`).click();
    cy.wait('@deleteRun');
    cy.wait('@runsAfterDelete');
    cy.get(`[data-testid="collectivex-run-row-${runId}"]`).should('not.exist');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(ADMIN_TOKEN_KEY)).to.eq('test-token');
    });
  });

  it('deletes every shown run with one confirmation and one token prompt', () => {
    const deletedRunIds = new Set<string>();
    cy.intercept('GET', '/api/v1/collectivex/runs?*', (request) => {
      request.reply({
        body: {
          version: 1,
          runs: [dataset, comparisonDataset]
            .filter((item) => !deletedRunIds.has(item.run.run_id))
            .map(buildRunSummary),
          discovery_complete: true,
        },
      });
    }).as('runsAfterBulkDelete');
    installRun(comparisonDataset, 'comparisonRunForDelete');
    cy.intercept('DELETE', '/api/v1/collectivex/runs/*', (request) => {
      expect(request.headers.authorization).to.eq('Bearer bulk-test-token');
      deletedRunIds.add(request.url.split('/').at(-1) ?? '');
      request.reply({ deleted: true });
    }).as('deleteShownRun');

    cy.reload();
    cy.wait('@runsAfterBulkDelete');
    cy.wait('@run');
    cy.get(`[data-testid="collectivex-run-visible-${comparisonDataset.run.run_id}"]`).check();
    cy.wait('@comparisonRunForDelete');
    cy.window().then((win) => {
      win.localStorage.removeItem(ADMIN_TOKEN_KEY);
      cy.stub(win, 'confirm').as('bulkDeleteConfirm').returns(true);
      cy.stub(win, 'prompt').as('bulkDeletePrompt').returns('bulk-test-token');
    });

    cy.get('[data-testid="collectivex-delete-shown-runs"]').click();
    cy.wait('@deleteShownRun');
    cy.wait('@deleteShownRun');
    cy.get(`[data-testid="collectivex-run-row-${runId}"]`).should('not.exist');
    cy.get(`[data-testid="collectivex-run-row-${comparisonDataset.run.run_id}"]`).should(
      'not.exist',
    );
    cy.get('@bulkDeleteConfirm').should('have.been.calledOnce');
    cy.get('@bulkDeletePrompt').should('have.been.calledOnce');
    cy.then(() => {
      expect(deletedRunIds).to.deep.eq(new Set([runId, comparisonDataset.run.run_id]));
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

    cy.get(`[data-testid="collectivex-delete-run-${runId}"]`).click();
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

    cy.get(`[data-testid="collectivex-delete-run-${runId}"]`).click();
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
    cy.then(() => expect(deleteRequests).to.eq(0));
  });
});

describe('CollectiveX availability states', () => {
  it('reports a missing run list', () => {
    cy.intercept('GET', '/api/v1/collectivex/runs?*', {
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
    cy.intercept('GET', '/api/v1/collectivex/runs?*', {
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
    installRuns();
    cy.intercept('GET', `/api/v1/collectivex/runs/${runId}*`, {
      body: dataset,
      delay: 500,
    }).as('slowRun');
    cy.visit('/collectivex');
    cy.wait('@runs');
    cy.get('[data-testid="collectivex-selected-runs-loading"]').should('be.visible');
    cy.wait('@slowRun');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
  });

  it('does not query database availability for the isolated page', () => {
    let availabilityRequests = 0;
    cy.intercept('GET', '/api/v1/availability', (request) => {
      availabilityRequests += 1;
      request.reply([]);
    });
    installRuns();
    installRun();
    cy.visit('/collectivex');
    cy.wait('@runs');
    cy.wait('@run');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
    cy.then(() => expect(availabilityRequests).to.eq(0));
  });
});

describe('CollectiveX kv-transfer card', () => {
  it('renders kv cases with bandwidth-bound cells and per-case outcomes', () => {
    installRuns([kvDataset]);
    installRun(kvDataset);
    openCollectiveX();
    cy.get('[data-testid="collectivex-kv-table"]')
      .should('be.visible')
      .and('contain.text', 'KV-cache transfer')
      .and('contain.text', '2 cases')
      .and('contain.text', '1 measured');
    cy.get('[data-testid="collectivex-kv-table-table"]').within(() => {
      // The measured gb200 nixl case: bulk ceiling, paged-64 at batch 1 and
      // at the largest measured batch, paged-16, and the handoff latency.
      cy.contains('td', 'GB200').parent().as('measured');
      cy.get('@measured').should('contain.text', 'nixl').and('contain.text', 'kv-dsv4');
      cy.get('@measured').should('contain.text', '89.41');
      cy.get('@measured').should('contain.text', '7.39');
      cy.get('@measured').should('contain.text', '15.12 (b16)');
      cy.get('@measured').should('contain.text', '2.72');
      cy.get('@measured').should('contain.text', '24.8');
      // The failed mori-io case keeps its outcome and reason, with no cells.
      cy.contains('td', 'MI355X').parent().as('failed');
      cy.get('@failed').should('contain.text', 'mori-io').and('contain.text', 'invalid');
      cy.get('@failed').should('contain.text', 'transfer-verification-failed');
    });
    // KV cases count into the header stats alongside EP cases.
    cy.get('[data-testid="collectivex-display"]').should(
      'contain.text',
      `${kvDataset.run.measured_cases}/${kvDataset.run.requested_cases}`,
    );
    // The runs table distinguishes the run's suites: this run carries both.
    cy.get(`[data-testid="collectivex-run-suite-ep-${kvDataset.run.run_id}"]`).should('be.visible');
    cy.get(`[data-testid="collectivex-run-suite-kv-${kvDataset.run.run_id}"]`).should('be.visible');
  });

  it('plots the kv chart and switches metric, axis, and page size', () => {
    installRuns([kvDataset]);
    installRun(kvDataset);
    openCollectiveX();
    // Default view: aggregate GB/s vs batch at the largest ISL, page 64, pull.
    // The measured fixture case carries paged-64 rows at batch 1 and 16.
    cy.get('[data-testid="collectivex-kv-chart"]').should('be.visible');
    cy.get('[data-testid="collectivex-kv-chart"] circle').should('have.length', 2);
    cy.get('[data-testid="collectivex-kv-chart"]').should(
      'contain.text',
      'Aggregate pull bandwidth at p50 (GB/s)',
    );
    // Metric toggle swaps the y axis to burst latency.
    cy.get('[data-testid="collectivex-kv-metric-toggle"]').contains('button', 'ms').click();
    cy.get('[data-testid="collectivex-kv-chart"]').should(
      'contain.text',
      'Burst completion latency p50 (ms)',
    );
    // ISL on the x axis pins batch 1: one paged-64 row in the fixture.
    cy.get('[data-testid="collectivex-kv-xaxis-toggle"]').contains('button', 'ISL').click();
    cy.get('[data-testid="collectivex-kv-chart"] circle').should('have.length', 1);
    // Page 16 keeps a single batch-1 row.
    cy.get('[data-testid="collectivex-kv-page-toggle"]').contains('button', '16').click();
    cy.get('[data-testid="collectivex-kv-chart"] circle').should('have.length', 1);
    // The kv section renders above the EP explorer chart.
    cy.get('[data-testid="collectivex-kv-table"]').then(($kv) => {
      cy.get('[data-testid="collectivex-main-chart"]').then(($chart) => {
        expect($kv[0].compareDocumentPosition($chart[0]) & 4).to.equal(4);
      });
    });
  });

  it('renders no kv card and no KV suite badge for an EP-only run', () => {
    installRuns();
    installRun();
    openCollectiveX();
    cy.get('[data-testid="collectivex-kv-table"]').should('not.exist');
    cy.get(`[data-testid="collectivex-run-suite-ep-${runId}"]`).should('be.visible');
    cy.get(`[data-testid="collectivex-run-suite-kv-${runId}"]`).should('not.exist');
  });
});
