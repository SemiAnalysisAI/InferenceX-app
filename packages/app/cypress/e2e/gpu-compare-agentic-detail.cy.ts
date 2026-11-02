import { interceptDerivedAgenticMetrics, unlockAgenticGate } from '../support/e2e';
import { agenticMetrics } from '../support/agentic-fixtures';

const DEFAULT_MODEL_DB_KEY = 'dsv4';
const AGENTIC_DATE = '2026-06-12';

const AGENTIC_HARDWARE = [
  { hardware: 'b200', framework: 'vllm', disagg: false },
  { hardware: 'b200', framework: 'sglang', disagg: false },
  { hardware: 'b300', framework: 'vllm', disagg: false },
];

const agenticAvailability = [
  ...AGENTIC_HARDWARE.map((g) => ({
    model: DEFAULT_MODEL_DB_KEY,
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: g.hardware,
    framework: g.framework,
    spec_method: 'none',
    disagg: g.disagg,
    benchmark_type: 'agentic_traces',
    date: AGENTIC_DATE,
  })),
  ...AGENTIC_HARDWARE.map((g) => ({
    model: DEFAULT_MODEL_DB_KEY,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: g.hardware,
    framework: g.framework,
    spec_method: 'none',
    disagg: g.disagg,
    benchmark_type: 'single_turn',
    date: AGENTIC_DATE,
  })),
];

let benchIdCursor = 800100;
const agenticBenchmarks = AGENTIC_HARDWARE.flatMap((g) =>
  [16, 64, 128].map((conc) => ({
    id: benchIdCursor++,
    hardware: g.hardware,
    framework: g.framework,
    model: DEFAULT_MODEL_DB_KEY,
    precision: 'fp4',
    spec_method: 'none',
    disagg: g.disagg,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: null,
    osl: null,
    conc,
    offload_mode: 'on',
    benchmark_type: 'agentic_traces',
    image: 'vllm/vllm-openai:v0.9.0',
    metrics: {
      ...agenticMetrics(conc),
      kv_offloading: 'dram',
      kv_offload_backend: 'mooncake',
      kv_offload_backend_version: '0.3.11.post1',
      router_name: 'vllm-router',
      router_version: '0.1.14',
      server_gpu_cache_hit_rate: 0.875,
    },
    workers: null,
    date: AGENTIC_DATE,
    run_url: null,
  })),
);

const agenticIds = new Set(agenticBenchmarks.map((b) => b.id));

function expectCompatibleSelection($inputs: JQuery<HTMLElement>) {
  const ids = [...$inputs].map((input) => input.id).sort();
  expect(ids).to.deep.equal(['checkbox-b200_sglang', 'checkbox-b300_vllm']);
}

describe('GPU comparison agentic point detail', () => {
  it('exposes the per-point charts as a normal browser link', () => {
    cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as(
      'agenticAvailability',
    );
    cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticBenchmarks }).as('agenticBenchmarks');
    cy.intercept('GET', '/api/v1/trace-availability*', (request) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',') ?? [];
      if (ids.length < 20) request.alias = 'gpuTraceAvailability';
      const result = Object.fromEntries(
        ids.filter((id) => agenticIds.has(Number(id))).map((id) => [id, true]),
      );
      request.reply({ body: result });
    });
    cy.intercept('GET', '/api/v1/log-availability*', (request) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',') ?? [];
      request.reply({
        body: Object.fromEntries(
          ids.filter((id) => agenticIds.has(Number(id))).map((id) => [id, true]),
        ),
      });
    }).as('gpuLogAvailability');
    interceptDerivedAgenticMetrics();

    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });

    cy.get('[data-testid="gpu-multiselect"] [role="combobox"]').click({ force: true });
    cy.get('[role="option"]').first().click();
    cy.contains('Comparison Date Range').should('be.visible');
    cy.contains('button', 'Select date range')
      .should('not.have.class', 'animate-pulse')
      .and('not.have.class', 'border-red-500');
    cy.contains('button', 'Select date range').click();
    cy.get('body').then(($body) => {
      if ($body.text().includes('View anyway')) {
        cy.contains('button', 'View anyway').click();
      } else {
        cy.contains('button', 'Max Range').click();
        cy.contains('button', 'Apply').click();
      }
    });

    cy.get('[data-testid="gpu-graph"]').first().should('be.visible');
    cy.wait('@gpuTraceAvailability');
    cy.wait('@gpuLogAvailability');
    cy.wait(100);
    cy.get('[data-testid="gpu-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0)
      .first()
      .then(($point) => {
        const point = $point[0] as unknown as SVGElement & {
          __data__: { benchmark_type?: string; id?: number };
        };
        expect(point.__data__.benchmark_type).to.equal('agentic_traces');
        expect(point.__data__.id).to.be.a('number');
        cy.wrap($point).find('.visible-shape').click({ force: true });
      });

    cy.get('[data-chart-tooltip]:visible').should('have.length', 1);
    cy.get('[data-chart-tooltip]:visible')
      .should('contain', 'Offload Type: DRAM')
      .and('contain', 'KV Offload Engine: Mooncake 0.3.11.post1')
      .and('contain', 'Router: vLLM Router 0.1.14')
      .and('contain', 'Chip Cache Hit Rate: 87.5%')
      .and('not.contain', 'Offload Mode');
    cy.get('[data-chart-tooltip]:visible [data-action="view-charts"]')
      .should('be.visible')
      .then(($link) => {
        expect($link).to.match('a');
        expect($link).not.to.have.attr('target');
        const href = $link.attr('href') ?? '';
        expect(href).to.match(/^\/inference\/agentic\/\d+\?/u);
        const params = new URLSearchParams(href.slice(href.indexOf('?')));
        expect(params.get('i_seq')).to.equal('agentic-traces');
        expect(params.get('i_gpus')).to.be.a('string').and.not.equal('');
      });
    cy.get('[data-chart-tooltip]:visible [data-action="view-logs"]')
      .should('be.visible')
      .then(($link) => {
        expect($link).to.match('a');
        const href = $link.attr('href') ?? '';
        expect(href).to.match(/^\/inference\/agentic\/\d+\?/u);
        const params = new URLSearchParams(href.slice(href.indexOf('?')));
        expect(params.get('view')).to.equal('logs');
        expect(params.get('i_seq')).to.equal('agentic-traces');
        expect(params.get('i_gpus')).to.be.a('string').and.not.equal('');
      });
    cy.location('pathname').should('eq', '/inference');
  });

  const CONFLICTING_GPU_URL =
    '/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4&i_gpus=b200_sglang,b200_vllm&i_dates=2026-06-12&i_dstart=2026-06-12&i_dend=2026-06-12';

  it('restores a soloed compatible selection without requesting engine consent', () => {
    cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability });
    cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticBenchmarks });
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
      },
    });
    const checked = '[data-testid="chart-legend"] ul input[type="checkbox"]:checked';
    cy.get(checked).should(expectCompatibleSelection);
    cy.get('[data-testid="chart-legend"] label[for="checkbox-b200_sglang"]').click();
    cy.get(checked).should('have.length', 1).and('have.attr', 'id', 'checkbox-b200_sglang');
    cy.get('[data-testid="chart-legend"] label[for="checkbox-b200_sglang"]').click();
    cy.get('[data-testid="engine-comparison-confirmation"]').should('not.exist');
    cy.get(checked).should(expectCompatibleSelection);
  });

  it('defaults to the scored winner and requires consent before showing both engines', () => {
    cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability });
    cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticBenchmarks });
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
      },
    });
    const checked = '[data-testid="chart-legend"] ul input[type="checkbox"]:checked';
    cy.get(checked).should(($inputs) => {
      const ids = [...$inputs].map((input) => input.id).join(',');
      expect(ids).to.contain('b200_sglang');
      expect(ids).not.to.contain('b200_vllm');
    });
    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filter-best-per-sku"]')
      .should('have.attr', 'data-state', 'checked')
      .click();
    cy.get('[data-testid="engine-comparison-confirmation"]').should('be.visible');
    cy.get('[data-testid="engine-comparison-confirmation"]').contains('button', 'Cancel').click();
    cy.get('[data-testid="quick-filter-best-per-sku"]')
      .should('have.attr', 'data-state', 'checked')
      .click();
    cy.get('[data-testid="engine-comparison-confirmation"]')
      .contains('button', 'I agree, show both')
      .click();
    cy.get('[data-testid="quick-filter-best-per-sku"]').should(
      'have.attr',
      'data-state',
      'unchecked',
    );
    cy.contains('button', 'Done').click();
    cy.get(checked).should(($inputs) => {
      const ids = [...$inputs].map((input) => input.id).join(',');
      expect(ids).to.contain('b200_sglang');
      expect(ids).to.contain('b200_vllm');
    });
    cy.reload();
    cy.get(checked).should(($inputs) => {
      const ids = [...$inputs].map((input) => input.id).join(',');
      expect(ids.includes('b200_sglang') && ids.includes('b200_vllm')).to.equal(false);
    });
    cy.get('[data-testid="chart-legend"] input[id^="checkbox-b200_"]:not(:checked)')
      .first()
      .invoke('attr', 'id')
      .then((id) => cy.get(`[data-testid="chart-legend"] label[for="${id}"]`).click());
    cy.get('[data-testid="engine-comparison-confirmation"]')
      .contains('button', 'I agree, show both')
      .click();
    cy.get(checked).should(($inputs) => {
      const ids = [...$inputs].map((input) => input.id).join(',');
      expect(ids).to.contain('b200_sglang');
      expect(ids).to.contain('b200_vllm');
      expect(ids).to.contain('b300_vllm');
    });
  });

  it('surfaces automatic resolution of conflicting GPU URL state', () => {
    cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as(
      'agenticAvailability',
    );
    cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticBenchmarks }).as('agenticBenchmarks');
    interceptDerivedAgenticMetrics();

    cy.visit(CONFLICTING_GPU_URL, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('inferencex-filter-hint-nudge-dismissed', 'true');
        win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
      },
    });

    cy.get('[data-testid="engine-comparison-conflict-toast"]')
      .should('be.visible')
      .and('contain.text', 'Kept vLLM and removed SGLang configs');
    cy.get('[data-testid="gpu-multiselect"] [data-slot="select-trigger"]')
      .should('contain.text', 'vLLM')
      .and('not.contain.text', 'SGLang');
    cy.contains('button', 'Jun 12, 2026').should('be.visible');
    cy.contains('button', 'Review comparison warning').click();
    cy.get('[data-testid="engine-comparison-confirmation"]')
      .contains('button', 'I agree, show both')
      .click();
    cy.get('[data-testid="gpu-multiselect"] [data-slot="select-trigger"]')
      .should('contain.text', 'vLLM')
      .and('contain.text', 'SGLang');
  });

  it('lets vLLM and SGLang share the graph when the feature gate is unlocked', () => {
    cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as(
      'agenticAvailability',
    );
    cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticBenchmarks }).as('agenticBenchmarks');
    interceptDerivedAgenticMetrics();

    cy.visit(CONFLICTING_GPU_URL, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });

    cy.get('[data-testid="gpu-multiselect"] [data-slot="select-trigger"]')
      .should('contain.text', 'vLLM')
      .and('contain.text', 'SGLang');
    cy.contains('button', 'Jun 12, 2026').should('be.visible');
    cy.get('[data-testid="engine-comparison-conflict-toast"]').should('not.exist');
  });
});
