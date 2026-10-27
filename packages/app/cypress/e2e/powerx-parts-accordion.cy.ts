// PowerX Where view on a phone (390 px, touch-primary pointer): the chip rows are compact
// 56 px cards with one 8 px stacked bar and no in-bar numbers, the drill-down plot sits at
// 260 px under the touch readout with every label inside it, and the parts list folds to
// its three largest parts behind an "All N parts" row that opens the rest in place. A part
// pinned from the open list stays visible after the list is folded again. Desktop keeps the
// full rows and list (powerx-compare.cy.ts).

import { COARSE_POINTER_QUERY } from '../../src/hooks/useMediaQuery';

const MODEL = 'dsv4';
const DATE = '2026-09-01';

const CONFIGS: [number, number, number, number][] = [
  [256, 20, 760, 1],
  [64, 45, 640, 1.4],
  [16, 90, 500, 1.9],
  [4, 180, 380, 2.6],
];

let rowId = 981000;
const phoneRows = (hardware: 'b200' | 'h200', wattsScale: number) =>
  CONFIGS.map(([conc, intvty, watts, joules]) => ({
    id: rowId++,
    hardware,
    framework: 'sglang',
    model: MODEL,
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    decode_tp: 8,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: 8192,
    osl: 1024,
    conc,
    offload_mode: 'off',
    benchmark_type: 'single_turn',
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    metrics: {
      median_intvty: intvty,
      median_itl: 1 / intvty,
      median_e2el: 20,
      median_ttft: 0.5,
      tput_per_gpu: conc * 40,
      output_tput_per_gpu: conc * 4,
      input_tput_per_gpu: conc * 36,
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: watts * wattsScale,
      avg_total_gpu_power_w: watts * wattsScale * 8,
      joules_per_output_token: joules,
      joules_per_input_token: joules / 8,
    },
    workers: null,
    date: DATE,
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/27182818285',
    curve_workflow_run_id: 27182818285,
    curve_date: DATE,
  }));

const phoneAvailability = ['b200', 'h200'].map((hardware) => ({
  model: MODEL,
  isl: 8192,
  osl: 1024,
  precision: 'fp4',
  hardware,
  framework: 'sglang',
  spec_method: 'none',
  disagg: false,
  benchmark_type: 'single_turn',
  date: DATE,
}));

function touchPrimary(win: Window) {
  const native = win.matchMedia.bind(win);
  win.matchMedia = ((query: string) =>
    query === COARSE_POINTER_QUERY
      ? ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        } as unknown as MediaQueryList)
      : native(query)) as typeof win.matchMedia;
}

const DRILLDOWN = '[data-testid="power-chip-compare-drilldown"]';
const ROW = '[data-testid="power-chip-compare-row"]';
const PART = '[data-testid="power-part-row"]';
const TOGGLE = '[data-testid="power-parts-toggle"]';

const within = (inner: DOMRect, outer: DOMRect) =>
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5;

describe('PowerX parts accordion and compact chip rows on a phone', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
    cy.intercept('GET', '/api/v1/availability', { body: phoneAvailability }).as('availability');
    cy.intercept('GET', '/api/v1/benchmarks*', {
      body: [...phoneRows('b200', 1), ...phoneRows('h200', 0.8)],
    }).as('benchmarks');
    cy.intercept('GET', '/api/v1/workflow-info*', {
      body: { runs: [], changelogs: [], configs: [] },
    });
    cy.viewport(390, 844);
    cy.visit('/powerx?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_prec=fp4&i_pcompare=breakdown', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('inferencex-feature-gate', '1');
        touchPrimary(win);
      },
    });
    cy.wait(['@availability', '@benchmarks']);
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('shows compact chip cards, a 260 px plot and a folded parts list that keeps a pinned part', () => {
    // Two chips in registry order, each a 56 px card: name and total on the first line, the
    // point and the GPU share on the second, one 8 px bar with no numbers inside it.
    cy.get(ROW)
      .should('have.length', 2)
      .each(($row) => {
        expect($row.attr('data-layout')).to.eq('compact');
        const box = $row[0].getBoundingClientRect();
        expect(box.height).to.be.at.least(56);
        expect(box.height).to.be.at.most(72);
        expect(box.right).to.be.at.most(390);
        expect($row.find('[data-testid="power-chip-compare-point"]').text()).to.match(
          /^c\d+ · \d+ tok\/s\/user$/u,
        );
        expect($row.text()).to.match(/\d W/u);
        expect($row.text()).to.match(/GPU \d+%/u);
        const segments = $row.find('[data-testid="power-chip-compare-segment"]');
        expect(segments.length).to.be.greaterThan(1);
        segments.each((_, segment) => {
          expect(segment.textContent).to.eq('');
        });
        const bar = segments[0].parentElement!.parentElement!;
        expect(bar.getBoundingClientRect().height).to.eq(8);
        expect(bar.getBoundingClientRect().width).to.be.greaterThan(200);
      });
    cy.get(`${ROW}[aria-expanded="true"]`).should('have.length', 1);

    // Expanding the other chip opens its drill-down under its card.
    cy.get(`${ROW}[aria-expanded="false"]`)
      .should('have.length', 1)
      .then(($row) => {
        const name = $row.find('.truncate').text();
        cy.wrap($row).click();
        cy.wrap($row).should('have.attr', 'aria-expanded', 'true');
        cy.get(`${DRILLDOWN} h3`).should('contain.text', name);
        cy.get(DRILLDOWN).then(($drilldown) => {
          expect($row[0].closest('li')!.contains($drilldown[0])).to.eq(true);
        });
      });

    // The plot under the readout is 260 px high and every label it draws stays inside it.
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout"]`).should('exist');
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-hit"]`).should('have.length', 4);
    cy.get(`${DRILLDOWN} svg[data-testid="d3-chart-svg"]`).then(($svg) => {
      const box = $svg[0].getBoundingClientRect();
      expect(Math.round(box.height)).to.eq(260);
      expect(box.right).to.be.at.most(390);
      const texts = [...$svg[0].querySelectorAll('text')];
      expect(texts.length).to.be.greaterThan(4);
      for (const text of texts) {
        if (text.getBoundingClientRect().width === 0) continue;
        expect(within(text.getBoundingClientRect(), box), text.textContent ?? '').to.eq(true);
      }
    });

    // The parts list folds to its three largest parts and an "All N parts" row.
    cy.get('[data-testid="power-parts-list"]').should('have.attr', 'data-folded', 'true');
    cy.get(PART)
      .should('have.length', 3)
      .each(($part) => {
        const box = $part[0].getBoundingClientRect();
        expect(box.height).to.be.at.least(56);
        expect(box.right).to.be.at.most(390);
        expect($part.find('[data-testid="power-part-sparkline"]')).to.have.length(1);
        expect($part.find('[data-testid="power-part-watts"]').text()).to.match(/^[\d,]+ W$/u);
        expect($part.find('[data-testid="power-part-share"]').text()).to.match(/^\d+%$/u);
      });
    cy.get(PART).first().should('have.attr', 'data-category', 'gpu');
    cy.get(TOGGLE)
      .should('have.attr', 'aria-expanded', 'false')
      .then(($toggle) => {
        expect($toggle[0].getBoundingClientRect().height).to.be.at.least(44);
        expect($toggle.text()).to.match(/^All \d+ parts · across load$/u);
        const count = Number(/\d+/u.exec($toggle.text())![0]);
        expect(count).to.be.greaterThan(3);
        const controls = $toggle.attr('aria-controls')!;
        cy.get(`[data-testid="power-parts-rest"]`).should('have.attr', 'id', controls);
        cy.get(`${TOGGLE}`).click();
        cy.get(TOGGLE).should('have.attr', 'aria-expanded', 'true');
        cy.get(PART).should('have.length', count);
      });

    // Pin the smallest part, which lives in the folded remainder; fold the list again.
    cy.get(PART)
      .last()
      .then(($part) => {
        const category = $part.attr('data-category')!;
        const band = $part.attr('data-band')!;
        cy.wrap($part).click();
        cy.get(`${PART}[data-category="${category}"]`).should('have.attr', 'aria-pressed', 'true');
        // Open, the list keeps its order: the pinned row stays where the tap found it.
        cy.get(PART).last().should('have.attr', 'data-category', category);
        cy.get(`${DRILLDOWN} [data-testid="power-breakdown-area"][data-band="${band}"]`).should(
          'have.attr',
          'data-emphasis',
          'highlighted',
        );
        cy.get(TOGGLE).click();
        cy.get(TOGGLE).should('have.attr', 'aria-expanded', 'false');
        cy.get(PART).should('have.length', 4);
        cy.get(`${PART}[data-category="${category}"]`).should('have.attr', 'aria-pressed', 'true');
        cy.get(`[data-testid="power-parts-rest"] ${PART}`).should('not.exist');
      });

    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(390);
    });
  });
});
