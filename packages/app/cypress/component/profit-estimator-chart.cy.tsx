import ProfitEstimatorChart from '@/components/calculator/ProfitEstimatorChart';
import type { ProfitEstimatorRow } from '@/components/calculator/profit-estimator';
import type { HardwareConfig } from '@/components/inference/types';

function estimateRow(hwKey: string, revenueBn: number, profitBn?: number): ProfitEstimatorRow {
  const revenue = revenueBn * 1e9;
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
    <div data-testid="profit-chart-container" style={{ width: widthPx, padding: 16 }}>
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

function barRows(): Cypress.Chainable<{ top: number; bottom: number }[]> {
  return cy.get('[data-testid="profit-estimator-chart"] rect.bar').then(($rects) => {
    const byTop = new Map<number, { top: number; bottom: number }>();
    for (const el of $rects) {
      const r = el.getBoundingClientRect();
      const key = Math.round(r.top);
      if (!byTop.has(key)) byTop.set(key, { top: r.top, bottom: r.bottom });
    }
    return [...byTop.values()].sort((a, b) => a.top - b.top);
  });
}

function labelBoxes(): Cypress.Chainable<DOMRect[]> {
  return cy
    .get('[data-testid="profit-estimator-chart"] .revenue-label')
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
  it('preserves the rendered SVG at the exact scrolling threshold', () => {
    cy.viewport(1280, 900);
    mountChart(700);
    cy.get('[data-testid="d3-chart-svg"]').then(($svg) => {
      const svg = $svg[0];
      const width = svg.getBoundingClientRect().width;
      cy.get('[data-testid="profit-chart-container"]').invoke('css', 'width', `${width + 32}px`);
      cy.get('[data-chart-scroll][tabindex]').should('not.exist');
      cy.get('[data-testid="d3-chart-svg"]').should(($current) => {
        expect($current[0], 'same SVG at the threshold').to.equal(svg);
        expect($current[0].getBoundingClientRect().width).to.equal(width);
        expect($current.find('.revenue-label')).to.have.length(ROWS.length);
      });
      cy.get('[data-chart-scroll]').should('not.have.attr', 'tabindex');
      cy.get('[data-testid="profit-chart-container"]').invoke('css', 'width', `${width + 31}px`);
      cy.get('[data-chart-scroll]').should('have.attr', 'tabindex', '0');
      cy.get('[data-testid="d3-chart-svg"]').should(($current) => {
        expect($current[0], 'same SVG below the threshold').to.equal(svg);
        expect($current.find('.revenue-label')).to.have.length(ROWS.length);
      });
    });
  });

  it('lays one row per chip across the phone card without a scroll window', () => {
    cy.viewport(393, 852);
    mountChart(393);
    cy.get('[data-chart-scroll][tabindex]').should('not.exist');
    cy.contains('Scroll horizontally').should('not.exist');
    cy.get('[data-testid="profit-chart-container"]').then(($container) => {
      const container = $container[0].getBoundingClientRect();
      cy.get('[data-testid="d3-chart-svg"]').then(($svg) => {
        expect($svg[0].getBoundingClientRect().right).to.be.at.most(container.right);
      });
    });
    barRows().then((rows) => {
      expect(rows).to.have.length(ROWS.length);
      for (let i = 1; i < rows.length; i += 1) {
        expect(rows[i].top, `row ${i} overlaps row ${i - 1}`).to.be.at.least(rows[i - 1].bottom);
      }
    });
    cy.get('[data-testid="profit-estimator-chart"] .y-axis .tick').then(($ticks) => {
      const top = [...$ticks].sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
      )[0];
      expect(top.querySelector('tspan')?.textContent).to.equal('B300');
    });
  });

  it('never lets neighbouring revenue figures overlap on a phone', () => {
    cy.viewport(393, 852);
    mountChart(393);
    labelBoxes().then((boxes) => {
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(overlaps(boxes[i], boxes[j]), `label ${i} and label ${j} overlap`).to.equal(false);
        }
      }
    });
    cy.get('[data-testid="profit-estimator-chart"] .revenue-amount').each(($el) => {
      expect($el.text()).to.match(/^\$\d+(?:\.\d)?B$/);
    });
  });

  it('keeps every loss figure inside its own row on a phone', () => {
    cy.viewport(393, 852);
    mountChart(393, LOSING_ROWS);
    cy.get('[data-testid="profit-estimator-chart"] .loss-label').should('have.length', 2);
    cy.get('[data-testid="profit-estimator-chart"] .loss-label').then(($labels) => {
      expect([...$labels].map((el) => el.textContent)).to.deep.equal(['-$561M', '-$4.9B']);
    });
    cy.get('[data-testid="d3-chart-svg"]').then(($svg) => {
      const plot = $svg[0].getBoundingClientRect();
      barRows().then((rows) => {
        cy.get('[data-testid="profit-estimator-chart"] .loss-label').each(($label) => {
          const box = $label[0].getBoundingClientRect();
          const centre = (box.top + box.bottom) / 2;
          const own = rows.find((row) => row.top - 8 <= centre && centre <= row.bottom + 8);
          expect(own, `no row beside "${$label.text()}"`).to.not.equal(undefined);
          for (const other of rows) {
            if (other === own) continue;
            const intrudes = box.top < other.bottom && other.top < box.bottom;
            expect(intrudes, `"${$label.text()}" reaches into a neighbouring row`).to.equal(false);
          }
          expect(box.right, `"${$label.text()}" runs off the right of the chart`).to.be.at.most(
            plot.right,
          );
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
