import { availabilityBody, interceptBenchmarkPresence, unlockAgenticGate } from '../support/e2e';

const MODEL = 'dsv4';
const DATE = '2026-09-01';

// Three disaggregated configs per GPU, with prefill and decode power, so every GPU role draws.
const CONFIGS: [number, number, number, number, number, number, number, number][] = [
  [16, 90, 200, 500, 800, 400, 2.4, 1.6],
  [64, 60, 400, 600, 820, 450, 1.6, 1],
  [256, 30, 800, 700, 840, 500, 1, 0.6],
];

let rowId = 995000;
const rows = (hardware: 'b200' | 'h200') =>
  CONFIGS.map(([conc, intvty, outputTput, watts, prefillWatts, decodeWatts, jOut, decodeJOut]) => ({
    id: rowId++,
    hardware,
    framework: 'dynamo-sglang',
    model: MODEL,
    precision: 'fp4',
    spec_method: 'none',
    disagg: true,
    is_multinode: true,
    prefill_tp: 4,
    decode_tp: 4,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    isl: 8192,
    osl: 1024,
    conc,
    offload_mode: 'off',
    benchmark_type: 'single_turn',
    image: 'dynamo:test',
    metrics: {
      median_intvty: intvty,
      median_itl: 1 / intvty,
      median_e2el: 20,
      median_ttft: 0.5,
      tput_per_gpu: outputTput * 9,
      output_tput_per_gpu: outputTput,
      input_tput_per_gpu: outputTput * 8,
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: watts,
      avg_total_gpu_power_w: watts * 8,
      prefill_avg_power_w: prefillWatts,
      decode_avg_power_w: decodeWatts,
      joules_per_output_token: jOut,
      joules_per_input_token: jOut / 8,
      // 1k output tokens per 9k total, so Energy per token draws under All GPUs too.
      joules_per_total_token: jOut / 9,
      prefill_joules_per_input_token: (jOut - decodeJOut) / 8,
      decode_joules_per_output_token: decodeJOut,
    },
    workers: null,
    date: DATE,
    run_url: null,
  }));

const benchmarkRows = [...rows('b200'), ...rows('h200')];
const TABS = ['energy', 'power', 'breakdown', 'time'] as const;
const ROLES = ['all', 'prefill', 'decode', 'split'] as const;

function interceptPowerX() {
  cy.intercept('GET', '/api/v1/availability/compact', {
    body: availabilityBody(benchmarkRows),
  }).as('layoutAvailability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: benchmarkRows }).as('layoutBenchmarks');
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [] },
  });
  cy.intercept('GET', '/api/v1/workflow-changelogs*', { body: { dates: [] } });
  cy.intercept('GET', '/api/v1/resident-sequence-lengths*', { body: {} });
  interceptBenchmarkPresence();
}

const pwx = (params: Record<string, string> = {}) =>
  `/pwx?${new URLSearchParams({
    g_model: 'DeepSeek-V4-Pro',
    i_seq: '8k/1k',
    i_prec: 'fp4',
    ...params,
  })}`;

function visit(url: string) {
  cy.visit(url, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      unlockAgenticGate(win);
    },
  });
  cy.wait(['@layoutAvailability', '@layoutBenchmarks']);
}

const tab = (value: (typeof TABS)[number]) => cy.get(`[data-testid="powerx-tab-${value}"]`);
const expectTab = (value: (typeof TABS)[number]) =>
  tab(value).should('have.attr', 'aria-selected', 'true');

describe('PowerX layout', () => {
  beforeEach(() => {
    cy.viewport(1360, 900);
    interceptPowerX();
  });

  it('keeps the active tab in the address bar, so a reload or copied address reopens it', () => {
    visit(pwx());
    expectTab('energy');
    for (const value of ['power', 'breakdown', 'time', 'energy'] as const) {
      tab(value).click();
      expectTab(value);
      // The live address bar follows the tab without a history entry.
      cy.location('search').should((search) => {
        const params = new URLSearchParams(search);
        if (value === 'breakdown') expect(params.get('i_pcompare')).to.eq('breakdown');
        if (value === 'time') expect(params.get('i_metric')).to.eq('y_measuredPowerTimeline');
        if (value === 'power') expect(params.get('i_metric')).to.match(/Power|Watts/u);
      });
      cy.reload();
      expectTab(value);
    }
  });

  it('opens old Where and power-timeline links on the matching tab', () => {
    visit(pwx({ i_metric: 'y_measuredAvgPower', i_pcompare: 'breakdown' }));
    expectTab('breakdown');
    visit(pwx({ i_metric: 'y_measuredPowerTimeline' }));
    expectTab('time');
    visit(pwx({ i_metric: 'y_measuredAvgPower', i_pcompare: 'roles' }));
    expectTab('breakdown');
  });

  it('reads Compare at from i_at on Breakdown, defaults to 80 and writes a preset back', () => {
    visit(pwx());
    // Compare at only moves the Breakdown bars, so the other tabs leave it out of Chart Config.
    cy.get('[data-testid="powerx-chart-config"]').should('exist');
    cy.get('[data-testid="powerx-compare-at"]').should('not.exist');
    tab('breakdown').click();
    cy.get('[data-testid="powerx-compare-at"]').should('contain.text', '80');
    cy.location('search').should('not.contain', 'i_at=');
    visit(pwx({ i_pcompare: 'breakdown', i_at: '30' }));
    cy.get('[data-testid="powerx-compare-at"]').should('contain.text', '30').click();
    cy.get('[data-testid="powerx-compare-at-preset-50"]').click();
    cy.get('[data-testid="powerx-compare-at"]').should('contain.text', '50');
    cy.location('search').should('contain', 'i_at=50');
    cy.reload();
    cy.get('[data-testid="powerx-compare-at"]').should('contain.text', '50');
  });

  it('keeps the PowerX controls in the shared Chart Config on phones', () => {
    cy.viewport(390, 844);
    visit(pwx());
    cy.get('[data-testid="powerx-tabs"]').should('be.visible');
    cy.get('[data-testid="model-selector"]').should('be.visible');
    cy.get('[data-testid="powerx-role"]').should('not.be.visible');
    cy.get('[data-testid="inference-secondary-controls"]').find('button').first().click();
    cy.get('[data-testid="powerx-role"]').should('be.visible');
  });

  for (const [width, height] of [
    [1360, 900],
    [390, 844],
  ] as const) {
    it(`keeps the chart top in place across GPU roles on every tab at ${width}px`, () => {
      cy.viewport(width, height);
      const tops: Record<string, string[]> = {};
      for (const role of ROLES) {
        visit(pwx({ i_role: role }));
        for (const value of TABS) {
          tab(value).click();
          expectTab(value);
          cy.get('[data-testid="chart-figure"]', { timeout: 20000 })
            .should('be.visible')
            .then(($figure) => {
              const top = $figure[0].getBoundingClientRect().top + window.scrollY;
              (tops[value] ??= []).push(`${role}:${Math.round(top)}`);
            });
          // Energy and Power keep the shared chart legend beside the plot.
          if (value === 'power' || (value === 'energy' && role !== 'split')) {
            cy.get('[data-slot="chart-legend-frame"] [data-testid="scatter-quick-filters"]', {
              timeout: 20000,
            }).should('be.visible');
          }
          // The column beside the plot scrolls on y only: anything wider than it adds a
          // stray horizontal scrollbar under the legend.
          cy.document().then((doc) => {
            for (const frame of doc.querySelectorAll('[data-slot="chart-legend-frame"]')) {
              expect(
                frame.scrollWidth,
                `${role}/${value} beside-plot column ${frame.scrollWidth}/${frame.clientWidth}`,
              ).to.be.at.most(frame.clientWidth);
            }
            expect(doc.documentElement.scrollWidth, `${role}/${value} page width`).to.be.at.most(
              width,
            );
          });
        }
      }
      cy.then(() => {
        for (const [value, entries] of Object.entries(tops)) {
          const distinct = new Set(entries.map((entry) => entry.split(':')[1]));
          expect(distinct.size, `${value}: ${entries.join(', ')}`).to.eq(1);
        }
      });
    });
  }
});
