import { expectNoPageOverflow } from '../support/e2e';
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

function openChartControls() {
  cy.get('[data-testid="inference-secondary-controls"] > button').then(($button) => {
    if ($button.is(':visible') && $button.attr('aria-expanded') !== 'true')
      cy.wrap($button).click();
  });
}

describe('TPU publication preview', () => {
  beforeEach(interceptTpuPreview);

  it('recalculates overlay prices, preserves chips/DP, and hides the control after all TPU data is hidden', () => {
    cy.visit(`/inference?${query}&g_tco=external`);
    cy.wait('@tpuPreview');
    openChartControls();
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
    openChartControls();
    cy.get('[data-testid="tco-basis-internal"]')
      .first()
      .should('have.attr', 'aria-pressed', 'true');
    cy.contains('TCO 口径').should('be.visible');
    cy.get('[data-testid="tco-basis-external"]').first().click();
    cy.get(overlayPoints).should(($points) => {
      const dp8 = [...$points]
        .map((node) => (node as unknown as { __data__: InferenceData }).__data__)
        .find((row) => row.dp === 8)!;
      expect(dp8.y).to.be.closeTo((3674.8418266267754 * 3600) / 1.21, 0.001);
    });
  });
  for (const width of [375, 768, 1440]) {
    it(`keeps TCO inside Chart with aligned, unclipped controls at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.visit(`/inference?${query}`);
      cy.wait('@tpuPreview');
      openChartControls();
      cy.contains('legend', 'Benchmark Config').should('be.visible');
      cy.contains('legend', 'Chart Config').should('be.visible');
      cy.get('[data-testid="x-axis-mode-selector"]').should(($axis) => {
        expect($axis[0].getBoundingClientRect().width).to.be.at.most(176);
      });
      cy.get('[data-testid="inference-chart-configuration"]').within(() => {
        cy.get('[data-testid="tco-basis-toggle"]')
          .should('be.visible')
          .should(($toggle) => {
            const bounds = $toggle[0].getBoundingClientRect();
            expect(bounds.width).to.be.at.most(192);
            expect(bounds.left).to.be.at.least(0);
            expect(bounds.right).to.be.at.most(width);
            for (const button of $toggle[0].querySelectorAll('button')) {
              expect(button.scrollWidth).to.be.at.most(button.clientWidth);
            }
          });
      });
      cy.get('[data-testid="chart-figure"] [data-testid="tco-basis-toggle"]').should('not.exist');
      if (width >= 1280) {
        cy.get('[data-testid="yaxis-metric-selector"]').then(($axis) => {
          cy.get('[data-testid="tco-basis-toggle"]').should(($toggle) => {
            expect(
              Math.abs(
                $axis[0].getBoundingClientRect().top - $toggle[0].getBoundingClientRect().top,
              ),
            ).to.be.lessThan(3);
          });
        });
      }
      expectNoPageOverflow();
      cy.get('[data-testid="inference-chart-configuration"]').scrollIntoView({
        offset: { top: -100, left: 0 },
      });
      cy.screenshot(`tco-chart-${width}`, { capture: 'viewport' });
    });
  }
});
