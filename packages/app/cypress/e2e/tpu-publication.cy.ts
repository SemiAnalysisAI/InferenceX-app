import preview from '../fixtures/tpu-preview.json';
import type { InferenceData } from '../../src/components/inference/types';

const query =
  'unofficialrun=30864013158&g_model=Qwen-3.5-397B-A17B&i_seq=8k%2F1k&i_prec=fp8&i_metric=y_tokensPerDollarH&i_advlabel=1';
const overlayPoints = '[data-testid="inference-chart-display"] svg .unofficial-overlay-pt';

function interceptTpuPreview() {
  const gpuRows = preview.benchmarks.map((row) => ({ ...row, hardware: 'b200', run_url: null }));
  cy.intercept('GET', '/api/v1/availability', {
    body: [
      {
        model: 'qwen3.5',
        isl: 8192,
        osl: 1024,
        precision: 'fp8',
        hardware: 'b200',
        framework: 'vllm',
        spec_method: 'none',
        disagg: false,
        benchmark_type: 'single_turn',
        date: '2026-08-03',
      },
    ],
  });
  cy.intercept('GET', '/api/v1/benchmarks*', { body: gpuRows });
  cy.intercept('GET', '/api/unofficial-run*', { body: preview }).as('tpuPreview');
}

describe('TPU publication preview', () => {
  beforeEach(interceptTpuPreview);

  it('recalculates overlay prices, preserves chips/DP, and hides the control after all TPU data is hidden', () => {
    cy.visit(`/inference?${query}`);
    cy.wait('@tpuPreview');
    cy.get(overlayPoints).should('have.length', 6);
    cy.get('[data-testid="tco-basis-toggle"]').should('have.length', 1).and('be.visible');
    cy.get('[data-testid="tco-basis-external"]')
      .first()
      .should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="tco-basis-internal"]').first().click();
    cy.get(overlayPoints).should(($points) => {
      const dp8 = [...$points]
        .map((node) => (node as unknown as { __data__: InferenceData }).__data__)
        .find((row) => row.dp === 8)!;
      expect(dp8.physicalChips).to.equal(4);
      expect(dp8.decode_tp).to.equal(1);
      expect(dp8.y).to.be.closeTo((3674.8418266267754 * 3600) / 1.03, 0.001);
    });
    cy.get('#scatter-hide-non-optimal').click();
    cy.contains('TP1/DP8').should('exist');
    cy.get('[aria-label="Dismiss tpuv7_updates"]').click();
    cy.get(overlayPoints).should('not.exist');
    // Mainline now supplies official TPU results independently of the overlay.
    cy.get('[data-testid="tco-basis-toggle"]').should('have.length', 1);
    cy.get('[aria-label="Hide TPU7x (vLLM)"]').click();
    cy.get('[data-testid="tco-basis-toggle"]').should('not.exist');
  });

  it('restores the pricing basis on a Chinese share URL', () => {
    cy.visit(`/zh/inference?${query}&g_tco=internal`);
    cy.wait('@tpuPreview');
    cy.get('[data-testid="tco-basis-internal"]')
      .first()
      .should('have.attr', 'aria-pressed', 'true');
    cy.contains('TPU TCO 假设').should('be.visible');
    cy.get('[data-testid="tco-basis-external"]').first().click();
    cy.get(overlayPoints).should(($points) => {
      const dp8 = [...$points]
        .map((node) => (node as unknown as { __data__: InferenceData }).__data__)
        .find((row) => row.dp === 8)!;
      expect(dp8.y).to.be.closeTo((3674.8418266267754 * 3600) / 1.21, 0.001);
    });
  });
});
