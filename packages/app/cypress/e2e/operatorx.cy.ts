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
  cy.get('#operatorx-hardware').should('contain.text', '950PR');
  cy.get('[data-testid="operatorx-viz-metric-vs-size"] [aria-label="Shape"]').should(
    'contain.text',
    'bf16',
  );
  cy.get('[data-testid="operatorx-viz-roofline"]').within(() => {
    cy.contains('[role="tab"]', 'bf16').should('have.attr', 'aria-selected', 'true');
    cy.get('#opx-roofline-normalized').should('have.attr', 'aria-checked', 'true');
    cy.contains('[role="tab"]', 'fp8').click().should('have.attr', 'aria-selected', 'true');
    cy.get('#opx-roofline-normalized').click().should('have.attr', 'aria-checked', 'false');
    cy.contains('[role="tab"]', 'bf16').click().should('have.attr', 'aria-selected', 'true');
    cy.get('#opx-roofline-normalized').should('have.attr', 'aria-checked', 'false');
  });
});
