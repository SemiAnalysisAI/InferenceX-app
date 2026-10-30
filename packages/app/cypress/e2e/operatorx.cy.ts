import type { OperatorXRawBundle } from '@semianalysisai/inferencex-db/operatorx/bundle';
import { buildComparison, comparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';
import { normalizeBundle } from '@semianalysisai/inferencex-db/operatorx/normalize';

const shape = (m: number) => ({
  type: 'gemm',
  args: { m, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } },
  sources: ['openai/gpt-oss-120b/k_proj'],
});

function run(id: string, runner: string, measured: number[]): OperatorXRawBundle {
  return {
    run: {
      run_id: id,
      run_attempt: 1,
      source_sha: 'a'.repeat(40),
      source_branch: 'main',
      generated_at: '2026-09-26T00:00:00Z',
      conclusion: 'success',
    },
    manifest: {
      include: [
        {
          id: 's1',
          runner: `cluster:${runner}`,
          mode: 'timing',
          backends: ['vllm'],
          cases: [64, 128].map((m) => ({ testlist: 'gemm', shape: shape(m) })),
        },
      ],
    },
    shards: [
      {
        id: 's1',
        attempt: 1,
        docs: [
          {
            run: { cluster: runner },
            rows: measured.map((m) => ({
              testlist: 'gemm',
              op: { ...shape(m), backend: 'vllm' },
              status: 'ok',
              metrics: { latency_us: m / 8 },
            })),
          },
        ],
      },
    ],
  };
}

const gemm = comparisonView(
  buildComparison('gemm', [
    { runner: 'h200-dgxc', dataset: normalizeBundle(run('101', 'h200-dgxc', [64, 128])) },
    { runner: 'b200-nscale', dataset: normalizeBundle(run('102', 'b200-nscale', [64])) },
  ]),
  null,
);
const moe = comparisonView(buildComparison('moe', []), null);

it('shows measured and missing GPU coverage, then switches the URL to MoE', () => {
  cy.intercept('GET', '/api/v1/operatorx/compare?op=gemm*', gemm).as('gemm');
  cy.intercept('GET', '/api/v1/operatorx/compare?op=moe*', moe).as('moe');

  cy.visit('/operatorx');
  cy.wait('@gemm');
  cy.get('[data-testid="operatorx-page"] h1').should('have.text', 'OperatorX (Experimental Beta)');
  cy.get('[data-testid="operatorx-coverage"]')
    .should('contain.text', 'Coverage of 2 cases')
    .and('contain.text', '2/2')
    .and('contain.text', '1/2');
  cy.get('[data-testid="operatorx-viz-metric-vs-size"]').should('contain.text', 'M');

  cy.get('[data-testid="operatorx-page"]').contains('button', 'MoE').click();
  cy.wait('@moe');
  cy.location('search').should('contain', 'op=moe');
  cy.contains('No results yet').should('be.visible');
});

it('defaults to a measured 950PR shape and normalized BF16, while honoring precision and scale changes', () => {
  const ascend = normalizeBundle(run('103', 'ascend950pr-external', [64, 128]));
  const fp8 = normalizeBundle(run('104', 'h200-dgxc', [64, 128]));
  fp8.results = [64, 128, 256].map((m, i) => ({
    ...fp8.results[0],
    index: i,
    args: { ...fp8.results[0].args, m, a: { dtype: 'e4m3' }, b: { dtype: 'e4m3' } },
    precision: 'e4m3 × e4m3 → bf16',
  }));
  const view = comparisonView(
    buildComparison('gemm', [
      { runner: 'h200-dgxc', dataset: fp8 },
      { runner: 'ascend950pr-external', dataset: ascend },
    ]),
    null,
  );
  cy.intercept('GET', '/api/v1/operatorx/compare?op=gemm*', view).as('ascend');
  cy.visit('/operatorx');
  cy.wait('@ascend');
  cy.get('[data-testid="operatorx-viz-metric-vs-size"]').scrollIntoView();
  cy.get('[data-testid="operatorx-viz-metric-vs-size"] [data-testid="chart-legend"]').should(
    'contain.text',
    '950PR',
  );
  cy.get('[data-testid="operatorx-viz-metric-vs-size"] [aria-label="Shape"]').should(
    'contain.text',
    'bf16',
  );
  cy.get('[data-testid="operatorx-viz-roofline"]')
    .scrollIntoView()
    .within(() => {
      cy.contains('[role="tab"]', 'bf16').should('have.attr', 'aria-selected', 'true');
      cy.get('#opx-roofline-normalized').should('have.attr', 'aria-checked', 'true');
      cy.contains('[role="tab"]', 'fp8').click().should('have.attr', 'aria-selected', 'true');
      cy.get('#opx-roofline-normalized').click().should('have.attr', 'aria-checked', 'false');
      cy.contains('[role="tab"]', 'bf16').click().should('have.attr', 'aria-selected', 'true');
      cy.get('#opx-roofline-normalized').should('have.attr', 'aria-checked', 'false');
    });
});

for (const prefix of ['', '/zh']) {
  it(`shows median and best bars beside head to head at ${prefix || '/'}`, () => {
    const datasets = ['ascend950pr-external', 'h200-dgxc'].map((runner, gpu) => {
      const dataset = normalizeBundle(run(`summary-${gpu}`, runner, [64, 128]));
      dataset.results = dataset.results.map((row, i) => ({
        ...row,
        args: {
          m: 1024 * (i + 1),
          n: 1024,
          k: 1024,
          a: { dtype: 'bf16' },
          b: { dtype: 'bf16' },
          out: 'bf16',
        },
        latencyUs: gpu === 0 ? 10 : 5,
      }));
      return { runner, dataset };
    });
    const view = comparisonView(buildComparison('gemm', datasets), null);
    cy.intercept('GET', '/api/v1/operatorx/compare?op=gemm*', view).as('summary');
    cy.visit(`${prefix}/operatorx`);
    cy.wait('@summary');
    cy.get('[data-testid^="operatorx-viz-"]')
      .last()
      .should('have.attr', 'data-testid', 'operatorx-viz-metric-vs-size');
    cy.get('[data-testid="operatorx-viz-throughput-summary"]')
      .scrollIntoView()
      .should(($summary) => {
        const next = $summary.next()[0];
        expect(next?.dataset.testid).to.equal('operatorx-viz-pairwise-scatter');
        expect($summary[0].getBoundingClientRect().top).to.be.closeTo(
          next.getBoundingClientRect().top,
          1,
        );
        expect($summary[0].getBoundingClientRect().right).to.be.lessThan(
          next.getBoundingClientRect().left,
        );
      });
    cy.get('[data-testid="operatorx-roofline-summary"]')
      .scrollIntoView()
      .within(() => {
        cy.get('.summary-row').should('have.length', 2);
        cy.get('.summary-row')
          .first()
          .should(($row) => {
            const d = (
              $row[0] as unknown as {
                __data__: { hardware: string; n: number; median: number; best: number };
              }
            ).__data__;
            expect(d.hardware).to.equal('ascend950pr');
            expect(d.n).to.equal(2);
            expect(d.median).to.be.closeTo(322.1225472 / 378, 1e-12);
            expect(d.best).to.be.closeTo(429.4967296 / 378, 1e-12);
          });
        cy.get('.summary-median').should('have.length', 2);
        cy.get('.summary-best').should('have.length', 2);
      });
    cy.get('[data-testid="operatorx-viz-throughput-summary"]').screenshot(
      `roofline-summary-${prefix ? 'zh' : 'en'}-normalized`,
    );
    cy.get('#opx-summary-normalized').click();
    cy.get('[data-testid="operatorx-roofline-summary"] .summary-row')
      .first()
      .should(($row) => {
        const d = (
          $row[0] as unknown as { __data__: { hardware: string; median: number; best: number } }
        ).__data__;
        expect(d.hardware).to.equal('h200');
        expect(d.median).to.be.closeTo(644.2450944, 1e-9);
        expect(d.best).to.be.closeTo(858.9934592, 1e-9);
      });
    cy.get('[data-testid="operatorx-viz-throughput-summary"]').screenshot(
      `roofline-summary-${prefix ? 'zh' : 'en'}-absolute`,
    );
    cy.viewport(390, 844);
    cy.get('[data-testid="operatorx-roofline-summary"]')
      .scrollIntoView()
      .should('be.visible')
      .screenshot(`roofline-summary-${prefix ? 'zh' : 'en'}-mobile`);
  });

  it(`keeps 950PR FP8 points visible when normalized at ${prefix || '/'}`, () => {
    const dataset = normalizeBundle(run('950pr-fp8', 'ascend950pr-external', [64, 128]));
    dataset.results = dataset.results.map((row, i) => ({
      ...row,
      args: {
        m: 1024 * (i + 1),
        n: 1024,
        k: 1024,
        a: { dtype: 'e4m3' },
        b: { dtype: 'e4m3' },
        out: 'bf16',
      },
    }));
    const view = comparisonView(
      buildComparison('gemm', [{ runner: 'ascend950pr-external', dataset }]),
      null,
    );
    cy.intercept('GET', '/api/v1/operatorx/compare?op=gemm*', view).as('fp8');
    cy.visit(`${prefix}/operatorx`);
    cy.wait('@fp8');
    cy.get('[data-testid="operatorx-viz-roofline"]')
      .scrollIntoView()
      .within(() => {
        cy.contains('[role="tab"]', 'fp8').should('have.attr', 'aria-selected', 'true');
        cy.get('#opx-roofline-normalized').should('have.attr', 'aria-checked', 'true');
        cy.get<SVGCircleElement & { __data__: { y: number } }>('circle.point')
          .should('have.length', 2)
          .each(($point) => {
            const point = $point[0] as unknown as { __data__: { y: number } };
            expect(point.__data__.y).to.be.closeTo(268.435456 / 756, 1e-12);
          });
        cy.get('#opx-roofline-normalized').click();
        cy.get<SVGCircleElement & { __data__: { y: number } }>('circle.point')
          .should('have.length', 2)
          .each(($point) => {
            const point = $point[0] as unknown as { __data__: { y: number } };
            expect(point.__data__.y).to.be.closeTo(268.435456, 1e-9);
          });
      });
  });
}

for (const prefix of ['', '/zh']) {
  it(`plots head-to-head measurements across vendor backends at ${prefix || '/'}`, () => {
    const ascend = normalizeBundle(run('105', 'ascend950pr-external', [64, 128]));
    ascend.results = ascend.results.map((r) => ({ ...r, backend: 'torch_npu_linear' }));
    const nvidia = normalizeBundle(run('106', 'h200-dgxc', [64, 128]));
    const view = comparisonView(
      buildComparison('gemm', [
        { runner: 'ascend950pr-external', dataset: ascend },
        { runner: 'h200-dgxc', dataset: nvidia },
      ]),
      null,
    );
    cy.intercept('GET', '/api/v1/operatorx/compare?op=gemm*', view).as('crossBackend');
    cy.visit(`${prefix}/operatorx`);
    cy.wait('@crossBackend');
    cy.get('[data-testid="operatorx-viz-pairwise-scatter"]')
      .scrollIntoView()
      .within(() => {
        cy.contains('No case was measured on both.').should('not.exist');
        cy.contains('of 2').should('be.visible');
        cy.get('svg').should('exist');
      });
  });
}

describe('OperatorX progressive rendering', { testIsolation: true }, () => {
  for (const prefix of ['', '/zh']) {
    it(`mounts lower charts near the viewport and preserves their controls at ${prefix || '/'}`, () => {
      cy.intercept('GET', '/api/v1/operatorx/compare?op=gemm*', gemm).as('comparison');
      cy.visit(`${prefix}/operatorx`);
      cy.wait('@comparison');
      cy.get('[data-testid^="operatorx-viz-"]')
        .first()
        .should('have.attr', 'aria-busy', 'false')
        .find('svg')
        .should('exist');
      const lower = '[data-testid="operatorx-viz-pairwise-scatter"]';
      cy.get(lower).should('have.attr', 'aria-busy', 'true').find('svg').should('not.exist');
      cy.get('[data-testid="operatorx-viz-metric-vs-size"]').scrollIntoView();
      cy.get('[data-testid="operatorx-viz-metric-vs-size"] svg').should('exist');
      cy.get(lower).scrollIntoView();
      cy.get(lower).should('have.attr', 'aria-busy', 'false').find('svg').should('exist');
      cy.get('[data-testid="operatorx-viz-throughput-summary"]').scrollIntoView();
      cy.get('#opx-summary-normalized').click().should('have.attr', 'aria-checked', 'false');
      cy.scrollTo('top');
      cy.get('[data-testid="operatorx-viz-throughput-summary"]').scrollIntoView();
      cy.get('#opx-summary-normalized').should('have.attr', 'aria-checked', 'false');
    });

    for (const intent of ['focus', 'hover']) {
      it(`does not fetch OperatorX on Huawei ${intent} or navigation from ${prefix || '/'}`, () => {
        cy.intercept('GET', '/api/v1/operatorx/**', gemm).as('operatorxIntent');
        cy.visit(prefix || '/');
        const link = '[data-testid="landing-huawei-results-link"]';
        cy.get(link)
          .should('have.attr', 'href', `${prefix}/ubenchx/core-memory-profiles`)
          .and('not.have.attr', 'data-prefetch-ready');
        cy.get('@operatorxIntent.all').should('have.length', 0);
        if (intent === 'focus') cy.get(link).focus();
        else cy.get(link).trigger('mouseover');
        cy.location('pathname').should('eq', prefix || '/');
        cy.get(link).trigger('mouseover').focus().click();
        cy.location('pathname').should('eq', `${prefix}/ubenchx/core-memory-profiles`);
        cy.get('[data-testid="ascend-core-profiles"] h2').should('have.text', 'Huawei 950PR');
        cy.get('[data-testid="sm-l2-heatmap"]').should('exist');
        cy.get('@operatorxIntent.all').should('have.length', 0);
      });
    }
  }

  it('renders every chart when viewport observation is unavailable', () => {
    cy.intercept('GET', '/api/v1/operatorx/compare?op=gemm*', gemm).as('comparison');
    cy.visit('/operatorx', {
      onBeforeLoad(win) {
        Object.defineProperty(win, 'IntersectionObserver', { value: undefined });
      },
    });
    cy.wait('@comparison');
    cy.get('[data-testid="operatorx-viz-pairwise-scatter"]')
      .should('have.attr', 'aria-busy', 'false')
      .find('svg')
      .should('exist');
  });
});

const operatorPoints = () =>
  cy
    .get('[data-testid="operatorx-viz-roofline"] circle.point')
    .filter(
      (_, element) =>
        (element as unknown as { __data__: { hw: string } }).__data__.hw === 'ascend950pr',
    );

const bandwidthPoints = () =>
  cy
    .get('#ubenchx-mbu circle.point')
    .filter(
      (_, element) =>
        (element as unknown as { __data__: { gpuKey: string } }).__data__.gpuKey === 'Huawei 950PR',
    );

it('uses shared Huawei colors in OperatorX and ubenchX across a live theme switch', () => {
  const ascend = normalizeBundle(run('201', 'ascend950pr-external', [64, 128]));
  const nvidia = normalizeBundle(run('202', 'h200-dgxc', [64, 128]));
  for (const dataset of [ascend, nvidia]) {
    for (const row of dataset.results) {
      const m = Number(row.args.m);
      row.args = { ...row.args, n: 4096, k: 4096 };
      row.shape = `${m} × 4096 × 4096`;
      row.latencyUs = 100;
      row.tflops = (2 * m * 4096 * 4096) / (100 * 1e6);
    }
  }
  const view = comparisonView(
    buildComparison('gemm', [
      { runner: 'ascend950pr-external', dataset: ascend },
      { runner: 'h200-dgxc', dataset: nvidia },
    ]),
    null,
  );
  cy.intercept('GET', '/api/v1/operatorx/compare?op=gemm*', view).as('colorComparison');
  const visitOptions = {
    onBeforeLoad(win: Cypress.AUTWindow) {
      win.localStorage.setItem('theme', 'light');
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  };
  cy.visit('/operatorx', visitOptions);
  cy.wait('@colorComparison');
  cy.get('[data-testid="operatorx-viz-roofline"]').scrollIntoView();
  operatorPoints().first().should('have.css', 'fill', 'rgb(148, 106, 0)');
  cy.contains('[data-testid="operatorx-coverage"] li', '950PR')
    .find('.rounded-full')
    .first()
    .should('have.css', 'background-color', 'rgb(148, 106, 0)');
  cy.get('[data-testid="operatorx-viz-roofline"]').screenshot('huawei-operatorx-light');
  cy.get('[data-testid="theme-toggle"]').click();
  cy.get('html').should('have.class', 'dark');
  operatorPoints().first().should('have.css', 'fill', 'rgb(235, 192, 74)');
  cy.contains('[data-testid="operatorx-coverage"] li', '950PR')
    .find('.rounded-full')
    .first()
    .should('have.css', 'background-color', 'rgb(235, 192, 74)');
  cy.get('[data-testid="operatorx-viz-roofline"]').screenshot('huawei-operatorx-dark');

  cy.visit('/ubenchx/mem-bw', visitOptions);
  bandwidthPoints().first().should('have.css', 'fill', 'rgb(148, 106, 0)');
  cy.get('[data-testid="theme-toggle"]').click();
  bandwidthPoints().first().should('have.css', 'fill', 'rgb(235, 192, 74)');
  bandwidthPoints().eq(20).trigger('mouseenter', { force: true });
  cy.get('[data-chart-tooltip="ubenchx-mbu"]')
    .should('contain', 'Huawei 950PR')
    .find('span')
    .first()
    .should('have.css', 'background-color', 'rgb(235, 192, 74)');
  cy.get('#ubenchx-mbu').screenshot('huawei-ubenchx-dark');
});
