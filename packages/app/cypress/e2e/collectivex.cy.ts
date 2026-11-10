import {
  makeSwapDoc,
  swapMatrix,
  swapMeta,
} from '@semianalysisai/inferencex-db/collectivex/swap-test-fixture';
import {
  buildDatasetFromNeutral,
  buildRunSummary,
} from '@semianalysisai/inferencex-db/collectivex/reader';
import {
  buildDataset,
  makeCollectiveXDataset,
  makeRawShard,
} from '@/components/collectivex/test-fixture';
import type { CollectiveXDataset } from '@/components/collectivex/types';

import { availabilityBody } from '../support/e2e';

const SOURCE_SHA = 'c'.repeat(40);
const dataset = makeCollectiveXDataset();
const runId = dataset.run.run_id;
const incompleteDataset = buildDataset({
  shards: [],
  meta: {
    run_id: '161',
    generated_at: '2026-07-09T12:20:00Z',
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
function installRuns(bodies: CollectiveXDataset[] = [dataset]) {
  cy.intercept('GET', '/api/v1/collectivex/runs?*', {
    body: { version: 1, runs: bodies.map(buildRunSummary), discovery_complete: true },
  }).as('runs');
}

function installRun(body: CollectiveXDataset = dataset, alias = 'run') {
  cy.intercept('GET', `/api/v1/collectivex/runs/${body.run.run_id}*`, { body }).as(alias);
}

function showView(label: string) {
  cy.get('[data-testid="collectivex-view-select"]').click();
  cy.contains('[role="option"]', label).click();
  // Radix Select refocuses its trigger after closing; opening the next menu before that lets the
  // returning focus land outside it and dismiss it.
  cy.get('[data-testid="collectivex-view-select"]').should('have.text', label).and('have.focus');
  // A view's legend labels resize the plot, which re-renders a frame later at its new width and
  // drops any tooltip pinned before that, so wait until the chart matches its container.
  cy.get('[data-testid="collectivex-explorer-chart"] [data-testid="d3-chart-svg"]').should(
    ($svg) => {
      expect(Number($svg.attr('width'))).to.be.closeTo(
        $svg[0].parentElement!.getBoundingClientRect().width,
        1,
      );
    },
  );
}

function suiteTabs() {
  return cy.get('[data-testid="collectivex-suite-filter"] [role="tab"]');
}

function showSuite(label: 'EP' | 'swap_blocks') {
  cy.get('[data-testid="collectivex-suite-filter"]').contains('[role="tab"]', label).click();
  cy.get('[data-testid="collectivex-suite-filter"] [role="tab"][aria-selected="true"]').should(
    'have.text',
    label,
  );
}

function openCollectiveX() {
  cy.visit('/colx');
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
    cy.get('[data-testid="collectivex-run-conclusion"]').should('not.exist');
    cy.get('[data-testid^="collectivex-delete"]').should('not.exist');
    cy.get('[data-testid="collectivex-display"]')
      .should('contain.text', `${dataset.run.measured_cases}/${dataset.run.requested_cases}`)
      .and('contain.text', String(dataset.series.length));
    cy.get('[data-testid="collectivex-source-link"]').should(
      'have.attr',
      'href',
      `https://github.com/SemiAnalysisAI/InferenceX/tree/${SOURCE_SHA}/collectivex`,
    );
    cy.get('[data-testid="collectivex-methodology-link"]')
      .should('contain.text', 'Methodology')
      .and(
        'have.attr',
        'href',
        `https://github.com/SemiAnalysisAI/InferenceX/blob/${SOURCE_SHA}/collectivex/docs/methodology.md`,
      );
    cy.get('[data-testid="collectivex-display"] a[href*="/actions/runs/"]').should('not.exist');
  });

  it('selects the EP16 series through the identity controls', () => {
    showView('Series');
    cy.get('[data-testid="collectivex-ep-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-phase-toggle"]').should('be.visible');
    cy.get('[data-testid="collectivex-precision-toggle"]').should('be.visible');
    cy.get('[data-testid="collectivex-sku-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-backend-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-mode-select"]').should('not.exist');
    cy.get('[data-testid="collectivex-fabric-scope-toggle"]').should('not.exist');
    cy.get('[data-testid="collectivex-routing-select"]').should('not.exist');

    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'Pair period (chained) · decode · p50')
      .and('contain.text', 'deepep-v2');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);

    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP16').click();

    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'MoRI')
      .and('contain.text', 'EP16');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);

    const ncclEp = buildDataset({
      shards: [makeRawShard({ backend: 'nccl-ep', implName: 'nccl-ep' })],
    });
    installRuns([ncclEp]);
    installRun(ncclEp);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');
    showView('Series');
    cy.get('[data-testid="collectivex-main-chart"]').should('contain.text', 'nccl-ep');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
  });

  it('switches the y-axis to per-GPU payload bandwidth', () => {
    cy.get('[data-testid="collectivex-y-axis-select"]').click();
    cy.contains('[role="option"]', 'Payload BW / chip').click();
    cy.get('[data-testid="collectivex-main-chart"]').should('contain.text', 'Payload bandwidth');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);

    cy.get('[data-testid="collectivex-y-axis-select"]').click();
    cy.contains('[role="option"]', 'Activation rate').click();
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'Activation-data rate')
      .and('not.contain.text', 'Payload rate is derived');
  });

  it('defaults to one range band per SKU across libraries while Backend is All', () => {
    cy.get('[data-testid="collectivex-view-select"]').should('have.text', 'Range by SKU');
    cy.get('[data-testid="collectivex-explorer-chart"] [data-testid="collectivex-range-band"]')
      .as('band')
      .should('have.length', 1)
      .and('have.attr', 'd');
    cy.get('@band').should('have.attr', 'fill-opacity', '0.16');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.get('[data-testid="collectivex-range-note"]').should('be.visible');

    cy.get('[data-testid="collectivex-explorer-chart"] .point').first().click({ force: true });
    cy.get('[data-testid="point-details-panel"]')
      .should('contain.text', 'Range across libraries')
      .and('contain.text', 'Median')
      .and('contain.text', '1 library at this point');
    cy.get('@band')
      .should('have.attr', 'data-focused', 'true')
      .and('have.attr', 'fill-opacity', '0.3');
    cy.get('[data-testid="collectivex-explorer-chart"] svg').first().click(5, 5, { force: true });
    cy.get('@band').should('not.have.attr', 'data-focused');
    cy.get('@band').should('have.attr', 'fill-opacity', '0.16');

    // Hovering the band's legend entry isolates it like hovering one of its points.
    cy.get('[data-testid="collectivex-main-chart"] [data-testid="chart-legend"] label')
      .first()
      .trigger('mouseover');
    cy.get('@band')
      .should('have.attr', 'data-focused', 'true')
      .and('have.attr', 'fill-opacity', '0.3');
    cy.get('[data-testid="collectivex-main-chart"] [data-testid="chart-legend"] label')
      .first()
      .trigger('mouseout');
    cy.get('@band').should('not.have.attr', 'data-focused');

    showView('Series');
    cy.get('[data-testid="collectivex-range-band"]').should('not.exist');
    showView('Range by SKU');
    cy.get('[data-testid="collectivex-backend-select"]').click();
    cy.get('[role="option"]').not(':contains("All")').first().click();
    cy.get('[data-testid="collectivex-view-select"]').should('not.exist');
    cy.get('[data-testid="collectivex-range-band"]').should('not.exist');
  });

  it('moves the band focus to a newly pinned SKU and keeps hidden bands across a view visit', () => {
    const twoSkus = buildDataset({
      shards: [
        makeRawShard(),
        makeRawShard({ sku: 'b200-nscale', backend: 'nccl-ep', implName: 'nccl-ep' }),
      ],
    });
    installRuns([twoSkus]);
    installRun(twoSkus);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');
    cy.get(
      '[data-testid="collectivex-explorer-chart"] [data-testid="collectivex-range-band"]',
    ).should('have.length', 2);

    cy.get('[data-testid="collectivex-explorer-chart"] .point').first().click({ force: true });
    cy.get('[data-testid="collectivex-range-band"][data-focused="true"]').should('have.length', 1);
    cy.get('[data-testid="collectivex-range-band"][data-focused="true"]').then(($first) => {
      const firstFill = $first.attr('fill');
      cy.get('[data-testid="collectivex-explorer-chart"] .point').last().click({ force: true });
      cy.get('[data-testid="collectivex-range-band"][data-focused="true"]')
        .should('have.length', 1)
        .and(($next) => expect($next.attr('fill')).not.to.eq(firstFill));
    });
    cy.get('[data-testid="collectivex-explorer-chart"] svg').first().click(5, 5, { force: true });

    cy.get('[data-testid="collectivex-main-chart"]').contains('B200 · EP8').click();
    cy.get('[data-testid="collectivex-range-band"]').should('have.length', 1);
    showView('Series');
    showView('Range by SKU');
    cy.get('[data-testid="collectivex-range-band"]').should('have.length', 1);
  });

  it('draws the best library per token count for each SKU in the Best by SKU view', () => {
    const twoLibraries = buildDataset({
      shards: [makeRawShard(), makeRawShard({ backend: 'nccl-ep', implName: 'nccl-ep' })],
    });
    installRuns([twoLibraries]);
    installRun(twoLibraries);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');
    showView('Best by SKU');
    cy.get('[data-testid="collectivex-range-band"]').should('not.exist');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.get('[data-testid="collectivex-range-note"]').should('contain.text', 'best value');
    cy.get('[data-testid="collectivex-explorer-chart"] .point').first().click({ force: true });
    cy.get('[data-testid="point-details-panel"]')
      .should('contain.text', 'Best ·')
      .and('contain.text', '2 libraries at this point');
    cy.get('[data-testid="collectivex-explorer-chart"] svg').first().click(5, 5, { force: true });
    showView('Range by SKU');
    cy.get('[data-testid="collectivex-range-band"]').should('have.length', 1);
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
    showView('Series');

    cy.get('[data-testid="collectivex-mode-select"]')
      .should('have.attr', 'role', 'combobox')
      .click();
    cy.get('[role="listbox"] [aria-selected="true"]').should('have.length', 2);
    cy.contains('[role="option"]', 'Low-latency').should(($option) => {
      const option = $option[0];
      const bounds = option.getBoundingClientRect();
      const hit = option.ownerDocument.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.bottom - 2,
      );
      expect(option.contains(hit), 'menu stays above the following chart card').to.equal(true);
    });
    cy.get('[data-testid="chart-legend"]')
      .should('contain.text', 'normal')
      .and('contain.text', 'low-latency');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 2);
    cy.contains('[role="option"]', /^Normal$/u).click();
    cy.get('[data-testid="collectivex-mode-select"]').click();
    cy.contains('[role="option"]', 'Low-latency')
      .should('have.attr', 'aria-selected', 'true')
      .and('be.disabled');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.contains('[role="option"]', /^Normal$/u).click();

    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP16').click();
    cy.get('[data-testid="collectivex-mode-select"]').should('not.exist');
    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP8').click();
    cy.get('[data-testid="collectivex-ep-select"]').should('have.focus');
    cy.get('[data-testid="collectivex-mode-select"]').click();
    cy.get('[role="listbox"] [aria-selected="true"]').should('have.length', 2);
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 2);
    cy.get('[data-testid="collectivex-mode-select"]').click();
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

  it('shows only the newest measured run when a newer incomplete run has no series', () => {
    installRuns([incompleteDataset, dataset]);
    installRun();
    installRun(incompleteDataset, 'incompleteRun');
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-display"]')
      .should('contain.text', `${dataset.run.measured_cases}/${dataset.run.requested_cases}`)
      .and('not.contain.text', 'Runs shown');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.get('[data-testid="collectivex-no-runs-selected"]').should('not.exist');
    cy.get('@incompleteRun.all').should('have.length', 0);
  });

  it('offers only EP for a run whose stored kv-transfer cases are no longer shown', () => {
    installRuns([kvDataset]);
    installRun(kvDataset);
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');

    suiteTabs().then(($tabs) => {
      expect([...$tabs].map((tab) => tab.textContent?.trim())).to.deep.equal(['EP']);
    });
    cy.get('[data-testid="collectivex-suite-filter"] [role="tab"][aria-selected="true"]').should(
      'have.text',
      'EP',
    );
    cy.get('[data-testid="collectivex-chart-filters"]').should('be.visible');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.get('[data-testid="collectivex-swap-chart"]').should('not.exist');

    installRuns();
    installRun();
    cy.reload();
    cy.wait('@runs');
    cy.wait('@run');
    suiteTabs().should('have.length', 1).and('have.text', 'EP');
  });

  it('localizes the suite control and the complete chart click path on the Chinese route', () => {
    cy.visit('/zh/colx');
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-suite-filter"]')
      .should('have.attr', 'aria-label', '选择要显示的 CollectiveX 测试套件')
      .and('have.text', 'EP')
      .and('not.contain.text', '全部');
    cy.get('[data-testid="collectivex-display"]').should('contain.text', '测试套件');
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

    cy.viewport(1440, 900);
    cy.visit('/zh/colx');
    cy.wait('@runs');
    cy.wait('@run');
    showView('序列');

    cy.get('[data-testid="collectivex-display"]')
      .should('contain.text', '终态用例')
      .and('not.contain.text', '运行记录')
      .and('not.contain.text', '已显示运行');
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', '成对周期（连续）')
      .and('contain.text', '常规')
      .and('contain.text', '解码')
      .and('contain.text', '延迟（µs）');

    cy.get('[data-testid="collectivex-explorer-chart"] .point').first().click({ force: true });
    cy.get('[data-testid="point-details-panel"]')
      .should('contain.text', '往返')
      .and('contain.text', '常规')
      .and('contain.text', '解码')
      .and('contain.text', '延迟 p50 / p90 / p95 / p99');
  });

  it('keeps the Chinese explorer and suite control reachable at 375px', () => {
    cy.viewport(375, 844);
    cy.visit('/zh/colx');
    cy.wait('@runs');
    cy.wait('@run');

    cy.get('[data-testid="collectivex-main-chart"] svg').should('exist');
    cy.get('[data-testid="collectivex-suite-filter"]').should('be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
    });
  });
});

describe('CollectiveX availability states', () => {
  it('moves old /collectivex links to /colx with the query intact', () => {
    installRuns([]);
    cy.visit('/zh/collectivex?x=1');
    cy.location().should((location) => {
      expect(location.pathname).to.eq('/zh/colx');
      expect(location.search).to.eq('?x=1');
    });
    cy.get('[data-testid="collectivex-no-runs-selected"]').should('be.visible');
  });

  it('reports a missing run list', () => {
    cy.intercept('GET', '/api/v1/collectivex/runs?*', {
      statusCode: 404,
      body: { error: 'Not found' },
    }).as('missing');
    cy.visit('/colx');
    cy.wait('@missing');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'The CollectiveX dataset failed to load')
      .and('not.contain.text', 'API error: 404');
    cy.get('[data-testid="collectivex-error-version-select"]').should('contain.text', 'V1');
  });

  it('says no results are stored when the run list is empty', () => {
    installRuns([]);
    cy.visit('/colx');
    cy.wait('@runs');
    cy.get('[data-testid="collectivex-no-runs-selected"]')
      .should('be.visible')
      .and('contain.text', 'No CollectiveX results are stored yet');
    cy.get('[data-testid="collectivex-suite-filter"]').should('not.exist');
    cy.get('[data-testid="collectivex-chart-filters"]').should('not.exist');
    cy.get('[data-testid="collectivex-support-matrices"]').should('be.visible');
  });

  it('shows a safe localized error on the Chinese route', () => {
    cy.intercept('GET', '/api/v1/collectivex/runs?*', {
      statusCode: 503,
      body: { error: 'unavailable' },
    }).as('down');
    cy.visit('/colx');
    cy.wait('@down');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'The CollectiveX dataset failed to load')
      .and('not.contain.text', 'API error: 503');

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
    cy.visit('/zh/colx');
    cy.wait('@zhDown');
    cy.wait('@zhDown');
    cy.get('[data-testid="collectivex-error"]')
      .should('contain.text', 'CollectiveX 运行暂不可用')
      .and('contain.text', 'CollectiveX 数据集加载失败')
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

  it('does not query database availability for the isolated page', () => {
    installRuns();
    cy.intercept('GET', `/api/v1/collectivex/runs/${runId}*`, {
      body: dataset,
      delay: 500,
    }).as('slowRun');
    cy.visit('/colx');
    cy.wait('@runs');
    cy.get('[data-testid="collectivex-selected-runs-loading"]').should('be.visible');
    cy.wait('@slowRun');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');

    let availabilityRequests = 0;
    cy.intercept('GET', '/api/v1/availability/compact', (request) => {
      availabilityRequests += 1;
      request.reply(availabilityBody([]));
    });
    installRuns();
    installRun();
    cy.visit('/colx');
    cy.wait('@runs');
    cy.wait('@run');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
    cy.then(() => expect(availabilityRequests).to.eq(0));
  });
});

describe('CollectiveX source repository links', () => {
  it('links the recorded source repository', () => {
    const sourced = buildDataset({
      meta: {
        run_id: '166',
        generated_at: '2026-08-11T12:20:00Z',
        source_sha: SOURCE_SHA,
        source_repository: 'ExampleOrg/ExampleBench',
      },
    });
    installRuns([sourced]);
    installRun(sourced);
    openCollectiveX();

    cy.get('[data-testid="collectivex-source-link"]').should(
      'have.attr',
      'href',
      `https://github.com/ExampleOrg/ExampleBench/tree/${SOURCE_SHA}/collectivex`,
    );
    cy.get('[data-testid="collectivex-methodology-link"]').should(
      'have.attr',
      'href',
      `https://github.com/ExampleOrg/ExampleBench/blob/${SOURCE_SHA}/collectivex/docs/methodology.md`,
    );
  });
});

function shouldShowSwapBlocksAsCode() {
  for (const scope of ['collectivex-description', 'collectivex-swap-section']) {
    cy.get(`[data-testid="${scope}"] code`).as('code').should('have.text', 'swap_blocks');
    cy.get('@code')
      .should('have.css', 'font-family')
      .and('match', /monospace/u);
    cy.get('@code')
      .should('have.css', 'background-color')
      .and('not.be.oneOf', ['transparent', 'rgba(0, 0, 0, 0)']);
  }
  cy.get('[data-testid="collectivex-swap-section"] h2').should('have.text', 'vLLM swap_blocks');
}

describe('CollectiveX swap_blocks', () => {
  beforeEach(() => {
    const swap = buildDatasetFromNeutral(swapMatrix, [makeSwapDoc()], swapMeta);
    installRuns([swap]);
    installRun(swap);
  });
  it('shows a swap-only run, byte units and linear bandwidth, then switches latency and direction', () => {
    openCollectiveX();
    suiteTabs().then(($tabs) => {
      expect([...$tabs].map((tab) => tab.textContent?.trim())).to.deep.equal(['swap_blocks']);
    });
    cy.get('[data-testid="collectivex-suite-filter"] [role="tab"][aria-selected="true"]')
      .should('have.text', 'swap_blocks')
      .and('have.css', 'font-family')
      .and('match', /monospace/u);
    shouldShowSwapBlocksAsCode();
    cy.get('[data-testid="collectivex-empty-state"]').should('not.exist');
    cy.get('[data-testid="collectivex-chart-filters"]').should('not.exist');
    cy.get('[data-testid="collectivex-methodology-link"]')
      .should('have.attr', 'href')
      .and('match', /\/collectivex\/docs\/swap-blocks\.md$/u);
    cy.get('[data-testid="collectivex-swap-chart"]')
      .as('swapChart')
      .should('contain.text', '1 GiB')
      .and('contain.text', 'GB/s');
    cy.get('@swapChart')
      .find('.y-axis .tick text')
      .then((labels) => {
        // Linear below the axis break; the distant roofline sits alone above it at its true value.
        const all = [...labels].map((label) => Number(label.textContent));
        const values = all.slice(0, -1);
        expect(all.at(-1)).to.eq(64);
        expect(values[0]).to.eq(0);
        expect(values.length).to.be.greaterThan(3);
        const step = values[1] - values[0];
        values.slice(1).forEach((value, i) => expect(value - values[i]).to.eq(step));
        expect(values.at(-1)).to.be.lessThan(64);
      });
    cy.get('@swapChart')
      .find('[data-testid="swap-roofline-label"]')
      .should('have.length', 1)
      .and('have.text', 'PCIe 5.0 x16 · 64 GB/s');
    cy.get('@swapChart').find('[data-testid="swap-axis-break"]').should('have.length', 1);
    // Best by SKU is the default: one line per SKU at its best block count, no band.
    cy.get('@swapChart').find('[data-testid="swap-range-band"]').should('not.exist');
    cy.get('@swapChart').find('.point').should('have.length', 2).last().click({ force: true });
    cy.get('body').should('contain.text', 'Best · 1 block · p50 (GB/s)');
    // Range by SKU: one band per SKU, its median point carries the range tooltip.
    cy.get('[data-testid="swap-view"]').contains('Range by SKU').click();
    cy.get('@swapChart').find('[data-testid="swap-range-band"]').should('have.length', 1);
    cy.get('@swapChart').find('.point').should('have.length', 2).last().click({ force: true });
    cy.get('body').should('contain.text', 'Median · p50 (GB/s)').and('contain.text', '1 block');
    cy.get('[data-testid="swap-view"]').contains('Series').click();
    cy.get('@swapChart').find('[data-testid="swap-range-band"]').should('not.exist');
    cy.get('@swapChart').find('.point').should('have.length', 2).last().click({ force: true });
    cy.get('body')
      .should('contain.text', '32.768p50 (GB/s)')
      .and('contain.text', 'Copied payload: 1 GiB');
    // Hiding the only series clears the plot instead of drawing axes on a fallback domain.
    cy.get('[data-testid="collectivex-swap-section"]').contains('H200 · 1 block').click();
    cy.get('@swapChart').find('.y-axis').should('not.exist');
    cy.get('[data-testid="collectivex-swap-reset-filter"]').click();
    cy.get('@swapChart').find('.y-axis').should('exist');
    cy.get('[data-testid="swap-metric"]').contains('Latency').click();
    cy.get('@swapChart').should('contain.text', 'µs, log');
    cy.get('[data-testid="swap-direction"]').contains('GPU → GPU').click();
    cy.get('[data-testid="swap-layout"]').contains('Random').click();
    cy.get('[data-testid="swap-percentile"]').contains('p99').click();
    cy.get('@swapChart').find('.point').should('have.length', 1).click({ force: true });
    cy.get('body')
      .should('contain.text', '8.000p99 (µs)')
      .and('contain.text', 'Copied payload: 4 KiB');
    cy.get('[data-testid="swap-metric"]').contains('Bandwidth').click();
    cy.get('@swapChart').should('contain.text', 'GB/s').and('not.contain.text', 'µs, log');
  });
  it('renders the translated controls and tooltip on the Chinese route', () => {
    cy.visit('/zh/colx');
    cy.wait('@runs');
    cy.wait('@run');
    showSuite('swap_blocks');
    shouldShowSwapBlocksAsCode();
    cy.get('[data-testid="collectivex-description"]').should(
      'contain.text',
      '的延迟与有效载荷带宽',
    );
    cy.get('[data-testid="swap-metric"]').contains('延迟').click();
    cy.get('[data-testid="collectivex-swap-chart"]').should('contain.text', '块大小（字节，对数）');
    cy.get('[data-testid="swap-view"]').should('contain.text', '按 SKU 显示最佳');
    cy.get('[data-testid="collectivex-swap-chart"] .point').last().click({ force: true });
    cy.get('body').should('contain.text', '最佳 · 1 个块');
    cy.get('[data-testid="swap-view"]').contains('按 SKU 显示范围').click();
    cy.get('[data-testid="collectivex-swap-chart"] .point').last().click({ force: true });
    cy.get('body').should('contain.text', '中位数').and('contain.text', '各块数量的范围');
    cy.get('[data-testid="swap-view"]').contains('序列').click();
    cy.get('[data-testid="collectivex-swap-chart"] .point').last().click({ force: true });
    cy.get('body')
      .should('contain.text', '复制的有效载荷: 1 GiB')
      .and('contain.text', '正确性校验通过');
  });
});
