import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import type { VideoHistoryObservation } from '@/components/video-benchmark/history';
import {
  assertResultsFit,
  readOnlyVideoRequests,
  resultHistory,
  RESULT_GROUPS,
} from '../support/video-results';

function mount({
  pathname = '/video',
  search = '',
  edit,
}: {
  pathname?: string;
  search?: string;
  edit?: (observation: VideoHistoryObservation) => void;
} = {}) {
  readOnlyVideoRequests();
  resultHistory(edit).then((page) => {
    cy.intercept('GET', '/api/video-runs?format=history&page=1', page).as('history');
  });
  cy.window().then((win) =>
    win.history.replaceState(null, '', `${win.location.pathname}${search}`),
  );
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <VideoDashboard />
    </PathnameContext.Provider>,
  );
  cy.wait('@history');
  cy.get('[data-testid="video-results"]').should('be.visible');
}

const costRow = (hardware: string, basis = 'participating') =>
  cy.get(`[data-testid="results-cost-table"] [data-hardware="${hardware}"][data-basis="${basis}"]`);

describe('VideoGenX results', () => {
  it('keeps the nine groups in order and admits only the common 20-clip C1 workload', () => {
    mount();
    cy.get('[data-testid="video-results"] section[id]').should(($sections) => {
      expect([...$sections].map((section) => section.id)).to.deep.equal(RESULT_GROUPS);
    });
    costRow('b200').should('contain', '0.15');
    costRow('b200', 'allocated').should('contain', '0.3');
    costRow('h200').should('contain', '0.204');
    // The older H100 fixture is outside this four-hardware comparison; the
    // four-sample native H200 smoke stays out of every comparison metric.
    cy.get('[data-testid="results-cost-table"] [data-hardware="h100"]').should('not.exist');
    cy.get('[data-testid="results-cost-table"] [data-hardware]').should('have.length', 4);
    // One GPU-count observation still has a measured P90 marker; P95 is absent
    // from the retained projection and must not become an illustrative band.
    cy.get('[data-testid="results-latency-series"] [data-percentile="p90"]').should(
      'have.length',
      2,
    );
    cy.get('[data-testid="results-latency-series"] [data-percentile="p95"]').should('not.exist');
    cy.get('#quality [data-testid="results-empty"]').should('exist');
    cy.get('#startup [data-testid="results-empty"]').should('exist');
  });

  it('applies the same sample floor to every hardware and never prices unknown allocation', () => {
    mount({
      edit: (observation) => {
        if (observation.hardware.includes('B200')) {
          observation.samples = 9;
          observation.valid = 9;
        }
        if (observation.hardware.includes('H200')) observation.allocated = null;
      },
    });
    costRow('b200').should('not.exist');
    costRow('h200').should('contain', '0.204');
    costRow('h200', 'allocated').should('contain', '—');
    cy.get('#latency [data-hardware="b200"] rect, #latency [data-hardware="b200"] circle').should(
      'not.exist',
    );
    cy.get('#throughput [data-hardware="b200"] rect').should('not.exist');
  });

  it('hides hardware in all metrics and handles an empty selection without stale values', () => {
    mount();
    cy.get('[data-testid="results-hardware-b200"]').uncheck();
    costRow('b200').should('not.exist');
    cy.get('#latency [data-hardware="b200"]').should('not.exist');
    cy.get('#energy [data-hardware="b200"]').should('not.exist');
    cy.location('search').should('contain', 'r_hidden=b200');
    for (const hardware of ['gb200', 'mi355x', 'h200'])
      cy.get(`[data-testid="results-hardware-${hardware}"]`).uncheck();
    cy.get('[data-testid="results-cost-table"] [data-hardware]').should('not.exist');
    cy.get('#latency circle').should('not.exist');
    cy.get('[data-testid="results-hardware-b200"]').check();
    costRow('b200').should('contain', '0.15');
  });

  it('changes the GPU filter without fabricating unmeasured deployments', () => {
    mount({ search: '?r_gpus=2' });
    cy.get('[data-testid="results-cost-table"] [data-hardware]').should('not.exist');
    cy.contains('[data-testid="results-gpus"] button', '4').click();
    cy.location('search').should('contain', 'r_gpus=4');
    costRow('b200').should('exist');
    costRow('h200').should('exist');
  });

  it('uses explicit scenario prices, clears them for a different workload and hides power traces', () => {
    // Synthetic additive evidence exercises controls absent from retained public
    // projections. It is never written to the committed history fixture.
    mount({
      edit: (observation) => {
        // Turn the out-of-roster H100 row into an explicitly synthetic second
        // workload so the test changes clip duration without replacing the
        // retained B200/H200 cohort used for the scenario assertions below.
        if (observation.hardware.includes('H100')) {
          const workload = JSON.parse(observation.workloadKey!);
          workload.plan.generation.duration_seconds = 10;
          workload.plan.generation.frame_count = 240;
          observation.workloadKey = JSON.stringify(workload);
          observation.workload = observation.workload.replace('8 s', '10 s');
          observation.durationSeconds = 10;
          observation.frameCount = 240;
          observation.hardware = 'NVIDIA GB200';
        }
        observation.results = {
          workloadHash: 'a'.repeat(64),
          manifestHash: observation.id.split(':')[0],
          verified: true,
          engine: 'test-engine',
          mode: 't2v',
          attempted: 20,
          notStarted: 0,
          latencies: null,
          powerValid: true,
          powerSeries: [
            { seconds: 0, watts: 100 },
            { seconds: 1, watts: 120 },
          ],
          peakPowerW: 120,
          gpuMemoryMiB: null,
          warmupSeconds: null,
          failures: null,
        };
      },
    });
    cy.get('[data-testid="results-profit"] [data-testid="results-empty"]').should('exist');
    cy.get('[data-testid="results-price-t2v"]').type('0.05');
    cy.location('search').should('contain', 'r_price_t2v=0.05');
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '2.88');
    cy.get('[data-testid="results-utilization"]').then(($input) => {
      const input = $input[0] as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '0');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '-1.73');
    cy.location('search').should('contain', 'r_utilization=0');
    cy.get('[data-testid="results-trace-select"]').select('H200');
    cy.get('[data-testid="results-power-trace"] [data-hardware="h200"]').should('exist');
    cy.get('[data-testid="results-hardware-h200"]').uncheck();
    cy.get('[data-testid="results-power-trace"] [data-hardware="h200"]').should('not.exist');
    cy.get('[data-testid="results-power-trace"] [data-hardware="b200"]').should('exist');
    cy.get('[data-testid="results-trace-select"]').should('not.contain', 'H200');
    cy.get('[data-testid="results-price-i2v"]').type('0.09');
    cy.get('[data-testid="results-price-r2v"]').type('0.12');
    cy.get('[data-testid="results-workload"]').click();
    cy.contains('[role="option"]', '10 s').click();
    costRow('gb200').should('exist');
    for (const mode of ['t2v', 'i2v', 'r2v'])
      cy.get(`[data-testid="results-price-${mode}"]`).should('have.value', '');
    cy.get('[data-testid="results-profit"] [data-testid="results-empty"]').should('exist');
    cy.location('search').should('not.contain', 'r_price_');
  });

  for (const [pathname, width] of [
    ['/video', 1440],
    ['/video', 390],
    ['/zh/video', 320],
  ] as const) {
    it(`keeps ${pathname} and its workload menu readable at ${width} px`, () => {
      cy.viewport(width, 844);
      mount({ pathname });
      cy.get('[data-testid="video-results"] h1').should('contain', 'VideoGenX');
      cy.get('#validity h2').should('contain', pathname.startsWith('/zh') ? '有效性' : 'Validity');
      cy.get('#energy [data-testid="results-empty"]').should('exist');
      assertResultsFit();
      cy.get('[data-testid="results-workload"]').click();
      cy.get('[role="listbox"]')
        .should('be.visible')
        .should(($menu) => {
          const rect = $menu[0].getBoundingClientRect();
          expect(rect.left).to.be.at.least(0);
          expect(rect.right).to.be.at.most(width);
          expect(rect.height).to.be.greaterThan(0);
          expect($menu[0].scrollWidth).to.be.at.most($menu[0].clientWidth + 1);
        });
      cy.get('[role="option"]')
        .last()
        .should(($option) => {
          expect($option[0].scrollWidth).to.be.at.most($option[0].clientWidth + 1);
          expect($option.text()).to.contain('MiniMax');
        });
      cy.get('[role="option"]').last().click();
      cy.location('search').should('contain', 'r_workload=');
      cy.get('[data-testid="results-workload"]').focus().trigger('keydown', { key: 'ArrowDown' });
      cy.get('[role="listbox"]').should('be.visible');
      cy.focused().trigger('keydown', { key: 'Escape' });
      cy.get('[role="listbox"]').should('not.exist');
      cy.get('[data-testid="results-workload"]').should('have.focus');
      cy.get('[data-testid="results-workload"]').trigger('keydown', { key: 'ArrowDown' });
      cy.get('[role="listbox"]').should('be.visible');
      cy.get('[role="option"]').first().click();
      cy.location('search').should('not.contain', 'r_workload=');
      assertResultsFit();
      cy.get('[data-testid="results-workload"]').click();
      cy.get('[role="listbox"]').should('be.visible');
      cy.screenshot(`video-workload-menu-${width}-${pathname.startsWith('/zh') ? 'zh' : 'en'}`, {
        capture: 'viewport',
        overwrite: true,
      });
    });
  }
});
