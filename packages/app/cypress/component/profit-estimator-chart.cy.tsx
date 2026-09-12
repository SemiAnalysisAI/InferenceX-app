import ProfitEstimatorChart from '@/components/calculator/ProfitEstimatorChart';
import type { ProfitEstimatorRow } from '@/components/calculator/profit-estimator';
import type { HardwareConfig } from '@/components/inference/types';

/**
 * The seven bars from a July-2026 DeepSeek V4 Pro estimate on a phone: three
 * NVIDIA stacks within 30% of each other and three AMD stacks within 20%, so
 * neighbouring revenue figures sit at almost the same height. Revenue is
 * $/GW-year; every row keeps the same 60% TCO / 20% license-fee split.
 */
function estimateRow(hwKey: string, revenueBn: number): ProfitEstimatorRow {
  const revenue = revenueBn * 1e9;
  const tco = revenue * 0.06;
  const labCut = revenue * 0.02;
  return {
    hwKey,
    resultKey: hwKey,
    precision: 'fp4',
    gpuHours: 1_000_000,
    revenuePerGpuHour: revenue / 1_000_000,
    revenue,
    tco,
    grossMargin: revenue - tco,
    labCut,
    profit: revenue - tco - labCut,
  };
}

const ROWS: ProfitEstimatorRow[] = [
  estimateRow('b300_vllm', 137.1),
  estimateRow('b300_sglang', 110.3),
  estimateRow('b200_vllm', 108.7),
  estimateRow('mi355x_sglang', 38.5),
  estimateRow('mi355x_mori-sglang', 33.7),
  estimateRow('mi355x_atom', 32.7),
  estimateRow('mi355x_vllm', 21.7),
];

const ASSUMPTIONS = { utilizationPct: 70, labCutPct: 20, basis: 'gw-year' as const };

function colorForRow(row: ProfitEstimatorRow): string {
  return row.hwKey.startsWith('mi') ? '#ed1c24' : '#76b900';
}

function mountChart(widthPx: number) {
  cy.mount(
    <div style={{ width: widthPx, padding: 16 }}>
      <ProfitEstimatorChart
        rows={ROWS}
        hardwareConfig={{} as HardwareConfig}
        colorResolver={colorForRow}
        assumptions={ASSUMPTIONS}
      />
    </div>,
  );
  cy.get('[data-testid="profit-estimator-chart"] .revenue-label').should(
    'have.length',
    ROWS.length,
  );
}

/** Left-to-right boxes of every revenue figure and margin line above the bars. */
function labelBoxes(): Cypress.Chainable<DOMRect[]> {
  return cy
    .get('[data-testid="profit-estimator-chart"] .revenue-label tspan')
    .then(($tspans) =>
      [...$tspans]
        .filter((el) => (el.textContent ?? '') !== '')
        .map((el) => el.getBoundingClientRect()),
    );
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

describe('ProfitEstimatorChart revenue labels', () => {
  it('never lets neighbouring revenue figures overlap on a phone', () => {
    // iPhone 15/16 CSS viewport; the card padding leaves the chart ~361px.
    cy.viewport(393, 852);
    mountChart(393);
    cy.screenshot('profit-estimator-chart-phone', { overwrite: true });
    labelBoxes().then((boxes) => {
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(overlaps(boxes[i], boxes[j]), `label ${i} and label ${j} overlap`).to.equal(false);
        }
      }
    });
    // Every figure keeps its compact unit even once the decimal has to go.
    cy.get('[data-testid="profit-estimator-chart"] .revenue-amount').each(($el) => {
      expect($el.text()).to.match(/^\$\d+(?:\.\d)?B$/);
    });
  });

  it('keeps full precision on a desktop-width chart', () => {
    cy.viewport(1280, 900);
    mountChart(1100);
    cy.screenshot('profit-estimator-chart-desktop', { overwrite: true });
    cy.get('[data-testid="profit-estimator-chart"] .revenue-amount')
      .first()
      .should('have.text', '$137.1B');
    cy.get('[data-testid="profit-estimator-chart"] .revenue-amount')
      .first()
      .parent()
      .should('have.attr', 'font-size', '12px');
    labelBoxes().then((boxes) => {
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(overlaps(boxes[i], boxes[j]), `label ${i} and label ${j} overlap`).to.equal(false);
        }
      }
    });
  });
});
