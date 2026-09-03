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
const kvComparisonDataset = buildDataset({
  shards: [makeRawShard()],
  kv: [{}],
  meta: { run_id: '164', generated_at: '2026-08-09T12:20:00Z', source_sha: 'a'.repeat(40) },
});
const kvWireCeilingDataset = buildDataset({
  shards: [makeRawShard()],
  kv: [
    {
      rows: [
        { kind: 'paged', page_tokens: 64, batch: 1, isl: 4096, gbps_p50: 5.1 },
        { kind: 'paged', page_tokens: 64, batch: 1, isl: 32768, gbps_p50: 7.39 },
        { kind: 'bulk', page_tokens: null, batch: 1, isl: 4096, gbps_p50: 52.3 },
        { kind: 'bulk', page_tokens: null, batch: 1, isl: 32768, gbps_p50: 89.41 },
      ],
    },
  ],
  meta: { run_id: '165', generated_at: '2026-08-10T12:20:00Z', source_sha: 'b'.repeat(40) },
});
const kvOnlyDataset = buildDataset({
  shards: [],
  kv: [{}],
  meta: { run_id: '163', generated_at: '2026-08-08T12:20:00Z', source_sha: 'f'.repeat(40) },
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

  it('selects normal and low-latency kernel modes by default', () => {
    const withLowLatency = buildDataset({
      shards: [makeRawShard(), makeRawShard({ mode: 'low-latency' }), makeRawShard({ ep: 16 })],
    });
    installRuns([withLowLatency]);
    installRun(withLowLatency);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-mode-toggle"]').should('be.visible');
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

  it('normalizes runner-pool suffixes in SKU controls and chart labels', () => {
    const withRunnerPoolSkus = buildDataset({
      shards: [
        makeRawShard({ sku: 'b200-nscale' }),
        makeRawShard({ sku: 'h100-dgxc', mode: 'low-latency' }),
      ],
    });
    installRuns([withRunnerPoolSkus]);
    installRun(withRunnerPoolSkus);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="chart-legend"]')
      .should('contain.text', 'B200')
      .and('contain.text', 'H100')
      .and('not.contain.text', 'B200-NSCALE')
      .and('not.contain.text', 'H100-DGXC');
    cy.get(`[data-testid="collectivex-run-row-${withRunnerPoolSkus.run.run_id}"]`)
      .should('contain.text', 'B200')
      .and('contain.text', 'H100')
      .and('not.contain.text', 'B200-NSCALE')
      .and('not.contain.text', 'H100-DGXC');
    cy.get('[data-testid="collectivex-sku-select"]').click();
    cy.get('[role="option"]').then(($options) => {
      const labels = [...$options].map((option) => option.textContent?.trim());
      expect(labels).to.include.members(['B200', 'H100']);
      expect(labels).not.to.include.members(['B200-NSCALE', 'H100-DGXC']);
    });
    cy.contains('[role="option"]', 'B200').click();
    cy.get('[data-testid="chart-legend"]')
      .should('contain.text', 'B200')
      .and('not.contain.text', 'H100');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
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

  it('filters the run table by EP and KV suite without hiding mixed-suite runs', () => {
    installRuns([kvOnlyDataset, kvDataset, dataset]);
    installRun(kvOnlyDataset, 'kvOnlyRun');
    cy.reload();
    cy.wait('@runs');
    cy.wait('@kvOnlyRun');

    cy.get('[data-testid="collectivex-suite-filter"] [role="tab"][aria-selected="true"]').should(
      'contain.text',
      'All',
    );
    cy.get(`[data-testid="collectivex-run-row-${kvOnlyDataset.run.run_id}"]`).should('be.visible');
    cy.get(`[data-testid="collectivex-run-row-${kvDataset.run.run_id}"]`).should('be.visible');
    cy.get(`[data-testid="collectivex-run-row-${dataset.run.run_id}"]`).should('be.visible');

    cy.get('[data-testid="collectivex-suite-filter"]').contains('[role="tab"]', 'EP').click();
    cy.get(`[data-testid="collectivex-run-row-${kvOnlyDataset.run.run_id}"]`).should('not.exist');
    cy.get(`[data-testid="collectivex-run-row-${kvDataset.run.run_id}"]`).should('be.visible');
    cy.get(`[data-testid="collectivex-run-row-${dataset.run.run_id}"]`).should('be.visible');

    cy.get('[data-testid="collectivex-suite-filter"]').contains('[role="tab"]', 'KV').click();
    cy.get(`[data-testid="collectivex-run-row-${kvOnlyDataset.run.run_id}"]`).should('be.visible');
    cy.get(`[data-testid="collectivex-run-row-${kvDataset.run.run_id}"]`).should('be.visible');
    cy.get(`[data-testid="collectivex-run-row-${dataset.run.run_id}"]`).should('not.exist');
  });

  it('renders the curated known-support matrix at the bottom of the page', () => {
    cy.get('[data-testid="collectivex-support-matrices"]')
      .should('contain.text', 'Known kernel support')
      .and('contain.text', 'Works')
      .and('contain.text', 'Known not to work')
      .and('contain.text', 'Not applicable')
      .and('contain.text', 'MI355X')
      .and('contain.text', 'GB300');
    // Reference material renders last, below the explorer chart.
    cy.get('[data-testid="collectivex-main-chart"]').then(($chart) => {
      cy.get('[data-testid="collectivex-support-matrices"]').then(($matrix) => {
        expect($matrix[0].compareDocumentPosition($chart[0]) & 2, 'chart precedes matrix').to.eq(2);
      });
    });
    cy.get('[data-testid="collectivex-support-matrix-normal"]').should(
      'contain.text',
      'Throughput kernels',
    );
    cy.get('[data-testid="collectivex-support-matrix-low-latency"]').should(
      'contain.text',
      'Low-latency kernels',
    );
    // A working degree is a green chip with no excuse.
    cy.get(
      '[data-testid="collectivex-known-cell"][data-mode="normal"][data-sku="b200"][data-library="deepep-v2"] [data-testid="collectivex-known-ep"][data-degree="16"]',
    ).should('have.attr', 'data-status', 'works');
    // A known wall is red and says why, in the tooltip and the notes list.
    cy.get(
      '[data-testid="collectivex-known-cell"][data-mode="normal"][data-sku="mi355x"][data-library="mori"] [data-testid="collectivex-known-ep"][data-degree="16"]',
    )
      .should('have.attr', 'data-status', 'broken')
      .and('have.attr', 'title')
      .and('include', 'ROCm/mori#610');
    cy.get('[data-testid="collectivex-known-notes-normal"]').should(
      'contain.text',
      'ROCm/mori#610',
    );
    // A vendor-mismatched pairing collapses to one muted dash.
    cy.get(
      '[data-testid="collectivex-known-cell"][data-mode="normal"][data-sku="h100"][data-library="mori"] [data-testid="collectivex-known-na"]',
    ).should('exist');
    cy.get('[data-testid="collectivex-inventory"]').should('not.exist');
  });

  it('keeps the known-support matrix visible with no runs selected', () => {
    cy.get(`[data-testid="collectivex-run-visible-${dataset.run.run_id}"]`).uncheck();
    cy.get('[data-testid="collectivex-main-chart"]').should('not.exist');
    cy.get('[data-testid="collectivex-support-matrices"]').should('be.visible');
  });

  it('localizes the suite filter on the Chinese route', () => {
    cy.visit('/zh/collectivex');
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-suite-filter"]')
      .should('have.attr', 'aria-label', '按测试套件筛选 CollectiveX 运行')
      .and('contain.text', '全部')
      .and('contain.text', 'EP')
      .and('contain.text', 'KV');
    cy.get('[data-testid="collectivex-support-matrices"]')
      .should('contain.text', '已知 Kernel 支持情况')
      .and('contain.text', '下表展示完整的 SKU × 集合通信库支持情况')
      .and('contain.text', '吞吐量 Kernel')
      .and('contain.text', '低延迟 Kernel')
      .and('contain.text', '可用')
      .and('contain.text', '已知不可用')
      .and('contain.text', '不适用');
    cy.get(
      '[data-testid="collectivex-known-cell"][data-mode="normal"][data-sku="mi355x"][data-library="mori"] [data-testid="collectivex-known-ep"][data-degree="16"]',
    )
      .invoke('attr', 'aria-label')
      .should('match', /（注 \d+）/u)
      .and('not.include', '(note ');
  });

  it('localizes the complete chart and run-table click path on the Chinese route', () => {
    cy.viewport(1440, 900);
    cy.visit('/zh/collectivex');
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-run-conclusion"]')
      .should('contain.text', `#${runId}`)
      .and('contain.text', '成功');
    cy.get('[data-testid="collectivex-runs"]')
      .should('contain.text', '运行记录')
      .and('contain.text', '终态数据点');
    cy.get('[data-testid="collectivex-display"]').should('contain.text', '终态用例');
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', '往返（实测）')
      .and('contain.text', '常规')
      .and('contain.text', '解码')
      .and('contain.text', '延迟（µs）');

    cy.get('[data-testid="collectivex-explorer-chart"] .point').first().click({ force: true });
    cy.get('[data-chart-tooltip]:visible')
      .should('contain.text', '点击其他区域关闭')
      .and('contain.text', '往返')
      .and('contain.text', '常规')
      .and('contain.text', '解码')
      .and('contain.text', '延迟 p50 / p90 / p95 / p99');
  });

  it('keeps a selected cancelled run localized instead of showing it as pending', () => {
    const cancelled = buildDataset({
      shards: [makeRawShard()],
      meta: { run_id: '179', generated_at: '2026-08-29T12:20:00Z', conclusion: 'cancelled' },
    });
    installRuns([cancelled]);
    installRun(cancelled, 'cancelledRun');
    cy.visit('/zh/collectivex');
    cy.wait('@runs');
    cy.wait('@cancelledRun');

    cy.get('[data-testid="collectivex-run-conclusion"]')
      .should('contain.text', '已取消')
      .and('not.contain.text', '待处理')
      .and('not.contain.text', 'cancelled');
  });

  it('keeps the Chinese explorer and runs table reachable at 375px', () => {
    cy.viewport(375, 844);
    cy.visit('/zh/collectivex');
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-main-chart"] svg').should('exist');
    cy.get('[data-testid="collectivex-runs-table"]').scrollTo('right').should('be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
    });
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
      .and('contain.text', 'The CollectiveX dataset failed to load.')
      .and('not.contain.text', 'API error: 404');
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
      .and('contain.text', 'The CollectiveX dataset failed to load.')
      .and('not.contain.text', 'API error: 503');
  });

  it('shows a safe localized error on the Chinese route', () => {
    let failRequests = true;
    cy.intercept('GET', '/api/v1/collectivex/runs?*', (request) => {
      request.reply(
        failRequests
          ? { statusCode: 503, body: { error: 'collectivex-internal-storage-detail' } }
          : {
              body: {
                version: 1,
                runs: [buildRunSummary(dataset)],
                discovery_complete: true,
              },
            },
      );
    }).as('zhDown');
    installRun();
    cy.visit('/zh/collectivex');
    cy.wait('@zhDown');
    cy.wait('@zhDown');
    cy.get('[data-testid="collectivex-error"]')
      .should('contain.text', 'CollectiveX 运行暂不可用')
      .and('contain.text', 'CollectiveX 数据集加载失败。')
      .and('not.contain.text', 'collectivex-internal-storage-detail');
    cy.contains('button', '重试')
      .then(() => {
        failRequests = false;
      })
      .click();
    cy.wait('@zhDown');
    cy.wait('@run');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
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
      'Aggregate pull bandwidth at p50 (GB/s, log)',
    );
    cy.get('[data-testid="collectivex-kv-chart"] .line-path').should(
      'have.attr',
      'stroke-width',
      '1.75',
    );
    // Axis-scale switches live in the same Advanced legend drawer as the
    // /inference chart controls and start enabled for the existing log-log view.
    cy.get('[data-testid="collectivex-kv-chart"] [data-testid="legend-advanced-toggle"]').click();
    cy.get('[data-testid="collectivex-kv-x-log-scale"]')
      .should('have.attr', 'aria-checked', 'true')
      .click()
      .should('have.attr', 'aria-checked', 'false');
    cy.get('[data-testid="collectivex-kv-chart"] .x-axis-label').should(
      'have.text',
      'Requests per burst',
    );
    cy.get('[data-testid="collectivex-kv-y-log-scale"]')
      .should('have.attr', 'aria-checked', 'true')
      .click()
      .should('have.attr', 'aria-checked', 'false');
    cy.get('[data-testid="collectivex-kv-chart"] .y-axis-label').should(
      'have.text',
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

  it('plots the envelope axes and keeps multi-run lines aligned with the legend', () => {
    installRuns([kvComparisonDataset, kvDataset]);
    installRun(kvComparisonDataset);
    installRun(kvDataset, 'comparisonKvRun');
    openCollectiveX();

    cy.get(`[data-testid="collectivex-run-visible-${kvDataset.run.run_id}"]`).check();
    cy.wait('@comparisonKvRun');
    cy.get('[data-testid="collectivex-kv-xaxis-toggle"]').contains('button', 'Envelope').click();

    cy.get('[data-testid="collectivex-kv-metric-toggle"]').should('not.exist');
    cy.get('[data-testid="collectivex-kv-frontier-chart"]')
      .should('contain.text', 'Sequence length (ISL tokens, log)')
      .and('contain.text', 'Aggregate pull bandwidth at p50 (GB/s, log)');
    cy.get(
      '[data-testid="collectivex-kv-frontier-chart"] [data-testid="legend-advanced-toggle"]',
    ).click();
    cy.get('[data-testid="collectivex-kv-x-log-scale"]').click();
    cy.get('[data-testid="collectivex-kv-y-log-scale"]').click();
    cy.get('[data-testid="collectivex-kv-frontier-chart"] .x-axis-label').should(
      'have.text',
      'Sequence length (ISL tokens)',
    );
    cy.get('[data-testid="collectivex-kv-frontier-chart"] .y-axis-label').should(
      'have.text',
      'Aggregate pull bandwidth at p50 (GB/s)',
    );
    cy.get('[data-testid="collectivex-kv-frontier-chart"] .line-path')
      .should('have.length', 2)
      .then(($lines) => {
        expect([...$lines].map((line) => line.getAttribute('stroke-width'))).to.deep.equal([
          '2',
          '2',
        ]);
        expect([...$lines].map((line) => line.getAttribute('stroke-dasharray'))).to.have.members([
          'none',
          '9 4',
        ]);
      });
  });

  it('toggles the Envelope bulk wire-ceiling lines from Advanced controls', () => {
    installRuns([kvWireCeilingDataset]);
    installRun(kvWireCeilingDataset);
    openCollectiveX();

    cy.get('[data-testid="collectivex-kv-xaxis-toggle"]').contains('button', 'Envelope').click();
    cy.get('[data-testid="collectivex-kv-frontier-chart"] .line-path').should('have.length', 2);
    cy.get(
      '[data-testid="collectivex-kv-frontier-chart"] .line-path[stroke-dasharray="1 4"]',
    ).should('have.length', 1);

    cy.get(
      '[data-testid="collectivex-kv-frontier-chart"] [data-testid="legend-advanced-toggle"]',
    ).click();
    cy.get('[data-testid="collectivex-kv-bulk-wire-ceiling"]')
      .should('have.attr', 'aria-checked', 'true')
      .click()
      .should('have.attr', 'aria-checked', 'false');
    cy.get('[data-testid="collectivex-kv-frontier-chart"] .line-path').should('have.length', 1);
    cy.get(
      '[data-testid="collectivex-kv-frontier-chart"] .line-path[stroke-dasharray="1 4"]',
    ).should('not.exist');
    cy.get('[data-testid="collectivex-kv-frontier-chart"]')
      .should('contain.text', 'hover a point for its batch, latency, and status')
      .and('not.contain.text', 'dotted line above each backend');

    cy.get('[data-testid="collectivex-kv-bulk-wire-ceiling"]').click();
    cy.get(
      '[data-testid="collectivex-kv-frontier-chart"] .line-path[stroke-dasharray="1 4"]',
    ).should('have.length', 1);
  });

  it('plots the overlap-gain view with its dotted ideal line', () => {
    installRuns([kvDataset]);
    installRun(kvDataset);
    openCollectiveX();

    cy.get('[data-testid="collectivex-kv-xaxis-toggle"]')
      .contains('button', 'Overlap gain')
      .click();
    cy.get('[data-testid="collectivex-kv-metric-toggle"]').should('not.exist');
    cy.get('[data-testid="collectivex-kv-overlap-chart"]')
      .should('contain.text', 'Requests per burst (log)')
      .and('contain.text', 'Aggregate bandwidth relative to batch 1 (log)');
    // The measured series plus the dotted y = batch ideal reference.
    cy.get('[data-testid="collectivex-kv-overlap-chart"] .line-path').then(($lines) => {
      expect([...$lines].map((line) => line.getAttribute('stroke-dasharray'))).to.include('2 4');
    });
  });

  it('localizes the envelope control and chart copy on the Chinese page', () => {
    installRuns([kvDataset]);
    installRun(kvDataset);
    cy.visit('/zh/collectivex');
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-kv-xaxis-toggle"]').contains('button', '带宽包络').click();
    cy.get('[data-testid="collectivex-kv-frontier-chart"]')
      .should('contain.text', '序列长度（ISL token，对数）')
      .and('contain.text', 'p50 聚合 pull 带宽（GB/s，对数）')
      .and('contain.text', '越高越优');
    cy.get(
      '[data-testid="collectivex-kv-frontier-chart"] [data-testid="legend-advanced-toggle"]',
    ).click();
    cy.get('[data-testid="collectivex-kv-frontier-chart"] [data-testid="chart-legend"]')
      .should('contain.text', 'X 轴对数缩放')
      .and('contain.text', 'Y 轴对数缩放')
      .and('contain.text', 'Bulk 连续传输基线');
    cy.get('[data-testid="collectivex-kv-table"]')
      .closest('[data-slot="card"]')
      .should('contain.text', '分页行按随机块表')
      .and('contain.text', '个用例 · 已测')
      .and('contain.text', '批大小');
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
