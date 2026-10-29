import { unlockAgenticGate } from '../support/e2e';

const MODEL = 'dsv4';
const DATE = '2026-09-01';
const OVERLAY_RUN_ID = '31415926535';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;

const CONFIGS: [number, number, number, number, number, number, number, number][] = [
  [16, 90, 200, 500, 800, 400, 2.4, 1.6],
  [64, 60, 400, 600, 820, 450, 1.6, 1],
  [256, 30, 800, 700, 840, 500, 1, 0.6],
];
const TOKEN_RATIO = 8;

let rowId = 990000;
const rows = (runUrl: string | null, hardware: 'b200' | 'h200') =>
  CONFIGS.map(([conc, intvty, outputTput, watts, prefillWatts, decodeWatts, jOut, decodeJOut]) => ({
    id: runUrl ? 0 : rowId++,
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
      joules_per_input_token: jOut / TOKEN_RATIO,
      prefill_joules_per_input_token: (jOut - decodeJOut) / TOKEN_RATIO,
      decode_joules_per_output_token: decodeJOut,
    },
    workers: null,
    date: DATE,
    run_url: runUrl,
  }));

const agenticRows = [
  ['b200', 'dynamo-vllm', 8, 2, 1, 16, 760],
  ['h200', 'vllm', 16, 1, 2, 32, 168],
  ['gb200', 'trt', 8, 1, 1, 8, 450],
  ['b300', 'vllm', 8, 1, 1, 8, 0],
].map(([hardware, framework, tp, pp, replicas, chips, watts], index) => ({
  ...rows(null, 'b200')[0],
  id: 990100 + index,
  model: 'kimik3',
  hardware,
  framework,
  benchmark_type: 'agentic_traces',
  disagg: false,
  is_multinode: hardware !== 'gb200',
  isl: null,
  osl: null,
  prefill_tp: tp,
  decode_tp: tp,
  prefill_num_workers: replicas,
  decode_num_workers: replicas,
  num_prefill_gpu: chips,
  num_decode_gpu: chips,
  metrics: {
    power_valid: watts ? 1 : 0,
    power_metric_schema_version: 2,
    avg_power_w: watts,
    avg_total_gpu_power_w: Number(watts) * Number(chips),
    prefill_pp: pp,
    decode_pp: pp,
    p90_itl: 0.02 + index * 0.01,
    median_itl: 0.01 + index * 0.01,
    median_intvty: 100 / (index + 1),
    tput_per_gpu: 200 + index * 100,
    output_tput_per_gpu: 100 + index * 50,
    joules_per_output_token: 2 + index,
  },
}));

describe('AgentX All in Measured chart and table', () => {
  for (const [locale, width] of [
    ['en', 1280],
    ['zh', 390],
  ] as const) {
    it(`retains B200/H200 multinode rows and export at ${locale} ${width}px`, () => {
      cy.viewport(width, 900);
      cy.intercept('GET', '/api/v1/availability', { body: agenticRows }).as('agenticAvailability');
      cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticRows }).as('agenticBenchmarks');
      cy.intercept('GET', '/api/v1/workflow-info*', {
        body: { runs: [], changelogs: [], configs: [] },
      });
      cy.intercept('GET', '/api/v1/trace-availability*', { body: {} });
      cy.intercept('GET', '/api/v1/log-availability*', { body: {} });
      cy.intercept('GET', '/api/v1/resident-sequence-lengths*', { body: {} });
      const overlayBody = {
        runInfos: [
          {
            id: OVERLAY_RUN_ID,
            name: 'agentic-power',
            branch: 'agentic-power',
            sha: 'abc000',
            createdAt: `${DATE}T00:00:00Z`,
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        benchmarks: [agenticRows[1], agenticRows[2]].map((row) => ({
          ...row,
          id: 0,
          run_url: OVERLAY_RUN_URL,
        })),
        evaluations: [],
      };
      cy.intercept('GET', '/api/unofficial-run*', { body: overlayBody }).as('agenticOverlay');
      let csvBlob: Blob | undefined;
      // Whether the stripped share params come back depends on hydration timing, so
      // later loads rebuild the URL instead of reading cy.location() or cy.reload().
      const chartUrl = (overrides: Record<string, string> = {}) =>
        `${locale === 'zh' ? '/zh' : ''}/powerx?${new URLSearchParams({
          g_model: 'Kimi-K3',
          i_seq: 'agentic-traces',
          i_prec: 'fp4',
          i_pctl: 'p90',
          i_metric: 'y_utilityModeledWatts',
          i_optimal: '0',
          i_best: '0',
          unofficialrun: OVERLAY_RUN_ID,
          ...overrides,
        })}`;
      cy.visit(chartUrl(), {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          unlockAgenticGate(win);
          win.URL.createObjectURL = (object) => {
            if (object instanceof win.Blob) csvBlob = object;
            return 'blob:agentic-power';
          };
          win.HTMLAnchorElement.prototype.click = () => {};
        },
      });
      cy.wait(['@agenticAvailability', '@agenticBenchmarks', '@agenticOverlay']);
      cy.get('[data-testid="chart-figure"]').first().find('.dot-group').should('have.length', 2);
      cy.get('[data-testid="chart-figure"]')
        .first()
        .find('.unofficial-overlay-pt')
        .should('have.length', 1);
      cy.get('header').invoke('css', 'visibility', 'hidden');
      cy.get('[data-testid="chart-figure"]')
        .first()
        .scrollIntoView()
        .screenshot(`agentic-all-in-${locale}-chart`, { overwrite: true });
      cy.get('[data-testid="inference-table-view-btn"]').first().click();
      cy.get('[data-testid="chart-figure"]')
        .first()
        .find('tbody tr')
        .should('have.length', 5)
        .then(($rows) => {
          expect($rows.text()).to.contain('B200').and.contain('H200');
          expect($rows.text()).to.contain('GB200').and.not.to.contain('B300');
          const missing = [...$rows].filter((row) => row.textContent!.includes('GB200'));
          expect(missing).to.have.length(2);
          for (const row of missing) {
            expect(row.textContent).to.contain('450').and.contain('—');
            expect(row.textContent).to.contain(
              locale === 'en' ? 'Unsupported topology' : '不支持此拓扑',
            );
          }
        });
      cy.get('[data-testid="chart-figure"]')
        .first()
        .screenshot(`agentic-all-in-${locale}-table`, { overwrite: true });
      if (locale === 'zh') {
        cy.get('[data-testid="inference-results-table"]')
          .first()
          .contains('th', '整体估算状态')
          .then(($status) => {
            const scroll = $status[0].closest('table')!.parentElement!;
            const pinnedWidth =
              $status[0].parentElement!.firstElementChild!.getBoundingClientRect().width;
            cy.wrap(scroll).scrollTo($status[0].offsetLeft - pinnedWidth, 0);
            cy.wrap($status).should(($cell) => {
              expect($cell[0].getBoundingClientRect().right).to.be.at.most(
                scroll.getBoundingClientRect().right + 1,
              );
            });
          });
        cy.get('[data-testid="chart-figure"]')
          .first()
          .screenshot('agentic-all-in-zh-table-status', { overwrite: true });
      }
      cy.get('header').invoke('css', 'visibility', '');
      cy.get('[data-testid="export-button"]').first().click();
      cy.get('[data-testid="export-csv-button"]').click();
      cy.then(() => csvBlob!.text()).then((csv) => {
        const [header, ...data] = csv.split('\n').filter((line) => !line.startsWith('#'));
        const columns = header.split(',');
        const values = data.map((line) => line.split(','));
        expect(values.map((row) => row[columns.indexOf('Hardware')]).sort()).to.deep.equal([
          'b200',
          'gb200',
          'gb200',
          'h200',
          'h200',
        ]);
        expect(
          values.map((row) => Number(row[columns.indexOf('Physical Chips')])).sort((a, b) => a - b),
        ).to.deep.equal([8, 8, 16, 32, 32]);
        const missing = values.filter((row) => row[columns.indexOf('Hardware')] === 'gb200');
        for (const row of missing) {
          expect(row[10]).to.equal('');
          expect(row[columns.indexOf('Measured GPU Power (W/chip)')]).to.equal('450');
          expect(row[columns.indexOf('All-in Estimate Status')]).to.equal('Unsupported topology');
        }
      });
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(width));
      cy.intercept('GET', '/api/v1/benchmarks*', { body: [agenticRows[2]] }).as('missingOnly');
      cy.intercept('GET', '/api/unofficial-run*', {
        body: {
          ...overlayBody,
          benchmarks: [{ ...agenticRows[2], id: 0, run_url: OVERLAY_RUN_URL }],
        },
      }).as('missingOverlay');
      cy.visit(chartUrl());
      cy.wait(['@missingOnly', '@missingOverlay']);
      cy.get('[data-testid="inference-table-view-btn"]').first().click();
      cy.get('[data-testid="chart-figure"]')
        .first()
        .find('tbody tr')
        .should('have.length', 2)
        .and('contain.text', 'GB200');
      cy.visit(chartUrl({ i_best: '1', i_xmode: 'e2e' }));
      cy.get('[data-testid="inference-table-view-btn"]').first().click();
      cy.get('[data-testid="chart-figure"]').first().find('tbody tr').should('have.length', 2);
    });
  }
});
