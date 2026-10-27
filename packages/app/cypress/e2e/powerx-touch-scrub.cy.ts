// PowerX on a phone with a touch-primary pointer: the Where view's drill-down scrubs its
// columns into a readout above the plot, a tap holds the column as the chip's compared
// point, an explicit button moves the slider; the main chart scrubs its points into the
// PowerX readout. Touch is emulated by matching the coarse-pointer media query and by
// dispatching touch PointerEvents; the desktop paths are covered by the existing specs.

const MODEL = 'dsv4';
const DATE = '2026-09-01';
const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';

// Four concurrencies per chip, interactivity falling with load and J per token rising
// with it, so every point sits on the Energy view's frontier; two chips so the rows, the
// slider and the per-chip pin all have something to read.
const CONFIGS: [number, number, number, number][] = [
  [256, 20, 760, 1],
  [64, 45, 640, 1.4],
  [16, 90, 500, 1.9],
  [4, 180, 380, 2.6],
];

let rowId = 980000;
const scrubRows = (hardware: 'b200' | 'h200', wattsScale: number) =>
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
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/27182818284',
    curve_workflow_run_id: 27182818284,
    curve_date: DATE,
  }));

const scrubAvailability = ['b200', 'h200'].map((hardware) => ({
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

function visit(query: string) {
  cy.intercept('GET', '/api/v1/availability', { body: scrubAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', {
    body: [...scrubRows('b200', 1), ...scrubRows('h200', 0.8)],
  }).as('benchmarks');
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [] },
  });
  cy.viewport(390, 844);
  cy.visit(`/powerx?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_prec=fp4${query}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      win.localStorage.setItem('inferencex-feature-gate', '1');
      touchPrimary(win);
    },
  });
  cy.wait(['@availability', '@benchmarks']);
  cy.get('[data-testid="inference-chart-display"]').should('exist');
}

const finger = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  eventConstructor: 'PointerEvent',
  pointerType: 'touch',
  pointerId: 1,
  isPrimary: true,
  clientX: x,
  clientY: y,
  bubbles: true,
  cancelable: true,
  force: true,
  ...extra,
  type,
});

const DRILLDOWN = '[data-testid="power-chip-compare-drilldown"]';

describe('PowerX touch scrub on a phone', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
  });

  it('scrubs the drill-down into a readout, holds on a tap and compares from the button', () => {
    visit('&i_pcompare=breakdown');
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-hit"]`).should('have.length', 4);
    cy.get(`${DRILLDOWN} p`)
      .first()
      .should('contain.text', 'Drag across the chart to read any point; tap to hold it');
    // The readout sits above the plot and reads the compared point; the button under it.
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout"]`)
      .should('have.attr', 'data-source', 'compared')
      .then(($readout) => {
        const plot = $readout.closest(DRILLDOWN)[0].querySelector('[data-testid="d3-chart-svg"]')!;
        expect(
          $readout[0].compareDocumentPosition(plot) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).to.be.greaterThan(0);
        expect($readout[0].getBoundingClientRect().right).to.be.at.most(390);
      });
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout-part"]`).should('have.length', 4);
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-compare-at"]`)
      .should('be.visible')
      .and('contain.text', 'Compare chips at')
      .then(($button) => {
        const box = $button[0].getBoundingClientRect();
        const card = $button.closest(DRILLDOWN)[0].getBoundingClientRect();
        expect(box.height).to.be.at.least(44);
        // Full width of the drill-down card's content.
        expect(box.width).to.be.at.least(card.width - 32);
        expect(box.right).to.be.at.most(390);
      });

    // A finger lands on the first column and sweeps to the last.
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-hit"]`).then(($hits) => {
      const first = $hits[0].getBoundingClientRect();
      const last = $hits[3].getBoundingClientRect();
      const y = first.top + first.height * 0.6;
      cy.window().then((win) => {
        const before = win.scrollY;
        cy.wrap($hits[0]).trigger(
          'pointerdown',
          finger('pointerdown', first.left + first.width / 2, y),
        );
        cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout"]`).should(
          'have.attr',
          'data-source',
          'scrub',
        );
        cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout-point"]`).should(
          'have.text',
          'c256 · 20 tok/s/user',
        );
        cy.get(`${DRILLDOWN} [data-testid="power-breakdown-scrub-rule"]`).should(
          'have.attr',
          'data-index',
          '0',
        );
        cy.wrap($hits[0]).trigger(
          'pointermove',
          finger('pointermove', last.left + last.width / 2, y),
        );
        cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout-point"]`).should(
          'have.text',
          'c4 · 180 tok/s/user',
        );
        cy.get(`${DRILLDOWN} [data-testid="power-breakdown-scrub-rule"]`).should(
          'have.attr',
          'data-index',
          '3',
        );
        cy.get('[data-testid="power-breakdown-cursor-label"]').should('not.exist');
        cy.wrap($hits[0]).trigger('pointerup', finger('pointerup', last.left + last.width / 2, y));
        cy.window().its('scrollY').should('eq', before);
      });
    });
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout"]`).should(
      'have.attr',
      'data-source',
      'scrub',
    );
    cy.get('[data-testid="power-chip-compare-row"][data-pinned="true"]').should('not.exist');

    // A tap on the second column holds it: the chip's compared point, the dashed outline.
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-hit"]`).then(($hits) => {
      const box = $hits[1].getBoundingClientRect();
      const at = [box.left + box.width / 2, box.top + box.height * 0.6] as const;
      cy.wrap($hits[1]).trigger('pointerdown', finger('pointerdown', ...at));
      cy.wrap($hits[1]).trigger('pointerup', finger('pointerup', ...at));
      cy.wrap($hits[1]).trigger('click', { clientX: at[0], clientY: at[1], force: true });
    });
    cy.get('[data-testid="power-chip-compare-row"][data-pinned="true"]').should('have.length', 1);
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout"]`)
      .should('have.attr', 'data-source', 'pinned')
      .and('have.attr', 'data-concurrency', '64');
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-compared"]`).should('exist');
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-scrub-rule"]`).should('not.exist');
    cy.get('[data-testid="power-breakdown-cursor-label"]').should('not.exist');
    // The tap held the column without isolating the layer under the finger; a readout chip
    // isolates its layer, a second tap on it releases it.
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-area"]`).each(($area) => {
      expect($area[0].dataset.emphasis).to.eq('plain');
    });
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout-part"][data-band="server"]`)
      .click()
      .should('have.attr', 'aria-pressed', 'true');
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-area"][data-band="server"]`).should(
      'have.attr',
      'data-emphasis',
      'highlighted',
    );
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-area"][data-band="gpu"]`).should(
      'have.attr',
      'data-emphasis',
      'faded',
    );
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout-part"][data-band="server"]`)
      .click()
      .should('have.attr', 'aria-pressed', 'false');
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-area"][data-band="gpu"]`).should(
      'have.attr',
      'data-emphasis',
      'plain',
    );
    // The readout sits right above the plot: 8 px to the svg, a 16 px top margin inside it.
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout"]`).then(($readout) => {
      const svg = $readout.closest(DRILLDOWN)[0].querySelector('[data-testid="d3-chart-svg"]')!;
      const hit = svg.querySelector('[data-testid="power-breakdown-hit"]')!;
      const gap = hit.getBoundingClientRect().top - $readout[0].getBoundingClientRect().bottom;
      expect(gap).to.be.at.most(26);
      expect(hit.getBoundingClientRect().top - svg.getBoundingClientRect().top).to.eq(16);
    });

    // The explicit action: the slider moves to the held interactivity and every pin goes.
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-compare-at"]`)
      .should('have.text', 'Compare chips at 45 tok/s/user')
      .and('not.be.disabled')
      .click();
    cy.get('[data-testid="power-chip-compare-value"]').should('have.text', '45 tok/s/user');
    cy.get('[data-testid="power-chip-compare-row"][data-pinned="true"]').should('not.exist');
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-compare-at"]`).should('be.disabled');
    cy.get(`${DRILLDOWN} [data-testid="power-breakdown-readout"]`).should(
      'have.attr',
      'data-source',
      'compared',
    );
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(390);
    });
  });

  it('scrubs the main chart into the PowerX readout and keeps the tap for the point sheet', () => {
    visit('');
    cy.get('[data-testid="scatter-graph"] svg[data-testid="d3-chart-svg"]').should('exist');
    cy.get('[data-testid="powerx-readout"]')
      .should('have.attr', 'data-source', 'nearest')
      .find('[data-testid="powerx-readout-source"]')
      .should('have.text', 'Near 80 tok/s/user · drag across the chart to change');
    cy.get('[data-testid="powerx-readout-y"]').should('contain.text', 'J');
    // A finger lands near the c4 point (the rightmost, 180 tok/s/user) and sweeps left.
    cy.get('[data-testid="scatter-graph"] .dot-group[data-hw-key="b200_sglang"]')
      .should('have.length', 4)
      .each(($dot) => {
        expect($dot[0].style.opacity).not.to.eq('0');
      });
    // A finger lands beside the chip's rightmost point (c4) and sweeps to its leftmost
    // (c256), following the frontier; the mark snaps to the point nearest the finger.
    cy.get(
      '[data-testid="scatter-graph"] .dot-group[data-hw-key="b200_sglang"] .visible-shape',
    ).then(($shapes) => {
      const centres = [...$shapes]
        .map((shape) => {
          const box = shape.getBoundingClientRect();
          return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        })
        .toSorted((a, b) => a.x - b.x);
      const right = centres.at(-1)!;
      const left = centres[0];
      expect(right.x - left.x).to.be.greaterThan(80);
      cy.window().then((win) => {
        const before = win.scrollY;
        cy.get('[data-testid="scatter-graph"] svg[data-testid="d3-chart-svg"]').as('plot');
        cy.get('@plot').trigger('pointerdown', finger('pointerdown', right.x + 12, right.y + 6));
        cy.get('[data-testid="powerx-scrub"]').should('have.attr', 'data-conc', '4');
        cy.get('[data-testid="powerx-readout"]').should('have.attr', 'data-source', 'scrub');
        cy.get('[data-testid="powerx-readout-source"]').should(
          'have.text',
          'Point under your finger · tap it for details',
        );
        cy.get('[data-testid="powerx-readout"]').should('contain.text', 'c4 ·');
        cy.get('@plot').trigger('pointermove', finger('pointermove', left.x - 8, left.y + 4));
        cy.get('[data-testid="powerx-scrub"]').should('have.attr', 'data-conc', '256');
        cy.get('[data-testid="powerx-readout"]').should('contain.text', 'c256 ·');
        cy.get('@plot').trigger('pointerup', finger('pointerup', left.x - 8, left.y + 4));
        cy.window().its('scrollY').should('eq', before);
      });
    });
    // The scrub opened no tooltip or sheet.
    cy.get('[data-chart-tooltip][data-sheet="true"]').should('not.exist');
    // A tap on a point still opens the provenance sheet, as before.
    cy.get('[data-testid="scatter-graph"] .dot-group[data-hw-key="b200_sglang"]')
      .first()
      .find('circle')
      .first()
      .click({ force: true });
    cy.get('[data-chart-tooltip][data-sheet="true"]').should('be.visible');
    cy.get('[data-testid="powerx-readout"]').should('have.attr', 'data-source', 'pinned');
  });
});
