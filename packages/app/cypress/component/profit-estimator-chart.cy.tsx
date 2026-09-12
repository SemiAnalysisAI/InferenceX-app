import ProfitEstimatorChart from '@/components/calculator/ProfitEstimatorChart';
import type { ProfitEstimatorRow } from '@/components/calculator/profit-estimator';
import type { HardwareConfig } from '@/components/inference/types';

/**
 * The seven bars from a July-2026 DeepSeek V4 Pro estimate on a phone: three
 * NVIDIA stacks within 30% of each other and three AMD stacks within 20%, so
 * neighbouring revenue figures sit at almost the same height. Revenue is
 * $/GW-year; every row keeps the same 60% TCO / 20% license-fee split.
 */
function estimateRow(hwKey: string, revenueBn: number, profitBn?: number): ProfitEstimatorRow {
  const revenue = revenueBn * 1e9;
  // A losing row keeps the TCO stack tall enough to leave `profitBn` below zero.
  const tco = profitBn === undefined ? revenue * 0.06 : revenue - profitBn * 1e9;
  const labCut = profitBn === undefined ? revenue * 0.02 : 0;
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

/**
 * The five bars from a DeepSeek V4.1 Flash estimate on a phone: two SKUs lose
 * money, one by $561.2M and the last one by $4.9B, and "Loss -$561.2M" used
 * to run across both neighbouring bands while "Loss -$4.9B" ran off the plot.
 */
const LOSING_ROWS: ProfitEstimatorRow[] = [
  estimateRow('b200_vllm', 14, 5.14),
  estimateRow('b300_vllm', 11.9, 1.46),
  estimateRow('gb200_vllm', 9.7, 1.01),
  estimateRow('gb300_vllm', 9, -0.5612),
  estimateRow('h200_vllm', 2.9, -4.9),
];

const ASSUMPTIONS = { utilizationPct: 70, labCutPct: 20, basis: 'gw-year' as const };

function colorForRow(row: ProfitEstimatorRow): string {
  return row.hwKey.startsWith('mi') ? '#ed1c24' : '#76b900';
}

function mountChart(widthPx: number, rows: ProfitEstimatorRow[] = ROWS) {
  cy.mount(
    <div style={{ width: widthPx, padding: 16 }}>
      <ProfitEstimatorChart
        rows={rows}
        hardwareConfig={{} as HardwareConfig}
        colorResolver={colorForRow}
        assumptions={ASSUMPTIONS}
      />
    </div>,
  );
  cy.get('[data-testid="profit-estimator-chart"] .revenue-label').should(
    'have.length',
    rows.length,
  );
}

/** Horizontal extent of every bar column, keyed by the column's centre. */
function barColumns(): Cypress.Chainable<{ left: number; right: number }[]> {
  return cy.get('[data-testid="profit-estimator-chart"] rect.bar').then(($rects) => {
    const byLeft = new Map<number, { left: number; right: number }>();
    for (const el of $rects) {
      const r = el.getBoundingClientRect();
      const key = Math.round(r.left);
      if (!byLeft.has(key)) byLeft.set(key, { left: r.left, right: r.right });
    }
    return [...byLeft.values()].sort((a, b) => a.left - b.left);
  });
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

  it('keeps every loss figure inside its own band on a phone', () => {
    cy.viewport(393, 852);
    mountChart(393, LOSING_ROWS);
    cy.get('[data-testid="profit-estimator-chart"] .loss-label').should('have.length', 2);
    cy.screenshot('profit-estimator-chart-phone-loss', { overwrite: true });
    // The wide figure loses the word and its decimal; the narrow one keeps its decimal.
    cy.get('[data-testid="profit-estimator-chart"] .loss-label').then(($labels) => {
      expect([...$labels].map((el) => el.textContent)).to.deep.equal(['-$561M', '-$4.9B']);
    });
    cy.get('[data-testid="profit-estimator-chart"] rect.bar')
      .first()
      .then(($bar) => {
        const plot = (
          $bar[0] as unknown as SVGRectElement
        ).ownerSVGElement!.getBoundingClientRect();
        barColumns().then((columns) => {
          cy.get('[data-testid="profit-estimator-chart"] .loss-label').each(($label) => {
            const box = $label[0].getBoundingClientRect();
            const centre = (box.left + box.right) / 2;
            const own = columns.find((c) => c.left <= centre && centre <= c.right);
            expect(own, `no bar under "${$label.text()}"`).to.not.equal(undefined);
            // The figure may overhang its bar into the gap, but never reach the next bar.
            for (const other of columns) {
              if (other === own) continue;
              const intrudes = box.left < other.right && other.left < box.right;
              expect(intrudes, `"${$label.text()}" reaches into a neighbouring bar`).to.equal(
                false,
              );
            }
            expect(box.left, `"${$label.text()}" runs off the left of the plot`).to.be.at.least(
              plot.left,
            );
            expect(box.right, `"${$label.text()}" runs off the right of the plot`).to.be.at.most(
              plot.right,
            );
            // Sign and compact unit survive whatever the fit dropped.
            expect($label.text()).to.match(/^(?:Loss )?-\$\d+(?:\.\d)?[MB]$/);
          });
        });
      });
  });

  it('keeps the word and the decimal on a desktop-width loss figure', () => {
    cy.viewport(1280, 900);
    mountChart(1100, LOSING_ROWS);
    cy.get('[data-testid="profit-estimator-chart"] .loss-label')
      .first()
      .should('have.text', 'Loss -$561.2M');
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
