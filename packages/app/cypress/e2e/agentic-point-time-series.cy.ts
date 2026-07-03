import { unlockAgenticGate } from '../support/e2e';

const timelineRequest = (
  index: number,
  ttftMs: number,
  tpotMs: number,
  overrides: Record<string, unknown> = {},
) => ({
  cid: 'conversation-1',
  ti: index,
  wid: 'worker-1',
  ad: 0,
  phase: 'profiling',
  credit: index * 1_000_000_000,
  start: index * 1_000_000_000,
  ack: null,
  end: (index + 1) * 1_000_000_000,
  ttftMs,
  tpotMs,
  isl: 1024,
  osl: 128,
  cancelled: false,
  ...overrides,
});

describe('Agentic point request metric time series', () => {
  before(() => {
    cy.intercept('GET', '/api/v1/trace-histograms*', { body: {} });
    cy.intercept('GET', '/api/v1/trace-server-metrics*', { body: null });
    cy.intercept('GET', '/api/v1/benchmark-siblings*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request-timeline*', {
      body: {
        version: 3,
        startNs: 0,
        endNs: 7_000_000_000,
        durationS: 7,
        requests: [
          timelineRequest(0, 100, 10),
          timelineRequest(1, 200, 20),
          timelineRequest(2, 400, 25),
          timelineRequest(3, 800, 40),
          timelineRequest(4, 1600, 80),
          timelineRequest(5, 3200, 160, { phase: 'warmup' }),
          timelineRequest(6, 6400, 320, { cancelled: true }),
          timelineRequest(7, 0, 0, {
            cid: 'conversation-1::sa:subagent_001_abcd',
            credit: 1_100_000_000,
            start: 1_100_000_000,
            end: 1_900_000_000,
            ttftMs: null,
            tpotMs: null,
            isl: null,
            osl: null,
          }),
          timelineRequest(8, 0, 0, {
            cid: 'conversation-1::sa:subagent_001_abcd:aux:011',
            credit: 1_200_000_000,
            start: 1_200_000_000,
            end: 1_800_000_000,
            ttftMs: null,
            tpotMs: null,
            isl: null,
            osl: null,
          }),
        ],
      },
    });
    cy.visit('/inference/agentic/206885', { onBeforeLoad: unlockAgenticGate });
  });

  it('renders rolling P90 interactivity and TTFT by default using profiling requests only', () => {
    cy.get('[data-testid="interactivity-over-time-chart"]').within(() => {
      cy.contains('h2', 'Interactivity over time').should('be.visible');
      cy.get('[data-testid="interactivity-percentile-toggle"]')
        .find('[role="tab"][aria-selected="true"]')
        .should('have.text', 'P90');
      // 6 points: profiling slice includes requests 0-4 (profiling) + request 5
      // (phase='warmup' label but start=5s > profiling boundary=0s, so
      // sliceTimelineByPhase keeps it); cancelled r6 and null-metric r7/r8 are dropped.
      cy.get('[data-testid="interactivity-point-count"]').should('have.text', '6 points');
      cy.get('svg circle').should('have.length', 6);
      cy.get('svg').should('contain.text', 'P90 (rolling 50 req)');
      cy.get('svg').should('contain.text', '1 / cumulative P90 TPOT');
      cy.get('svg path[stroke="#ef4444"]').should('have.length', 1);
    });

    cy.get('[data-testid="ttft-over-time-chart"]').within(() => {
      cy.contains('h2', 'TTFT over time').should('be.visible');
      // Same 6-point slice as interactivity (warmup r5 included by time-boundary).
      cy.get('[data-testid="ttft-point-count"]').should('have.text', '6 points');
      cy.get('svg circle').should('have.length', 6);
      cy.get('svg').should('contain.text', 'TTFT (s)');
      cy.get('svg').should('contain.text', 'Cumulative P90 TTFT');
      cy.get('svg path[stroke="#ef4444"]').should('have.length', 1);
    });
  });

  it('switches ISL and OSL cards from distributions to in-flight averages', () => {
    cy.get('[data-testid="isl-metric-chart"]').within(() => {
      cy.get('[data-testid="isl-metric-inflight"]').click();
      cy.contains('h2', 'Average ISL in flight').should('be.visible');
      cy.get('svg').should('contain.text', 'Average ISL in flight (30s avg)');
    });
    cy.get('[data-testid="osl-metric-chart"]').within(() => {
      cy.get('[data-testid="osl-metric-inflight"]').click();
      cy.contains('h2', 'Average OSL in flight').should('be.visible');
      cy.contains('Retrospective: final observed OSL').should('be.visible');
      cy.get('svg').should('contain.text', 'Average OSL in flight (30s avg)');
    });
  });

  it('switches the TTFT chart to E2E request latency over time', () => {
    cy.get('[data-testid="ttft-over-time-chart"]').within(() => {
      cy.get('[data-testid="latency-metric-e2e"]').click();
      cy.contains('h2', 'E2E latency over time').should('be.visible');
      // 8 points: e2e = (end−start)/1e6 > 0 for all non-cancelled requests —
      // includes r0-r5 (profiling slice) + r7, r8 (subagent/aux with null ttft/tpot
      // but valid start/end). Cancelled r6 is excluded.
      cy.get('[data-testid="e2e-point-count"]').should('have.text', '8 points');
      cy.get('svg circle').should('have.length', 8);
      cy.get('svg').should('contain.text', 'E2E latency (s)');
      cy.get('svg').should('contain.text', 'Cumulative P90 E2E latency');

      cy.get('[data-testid="latency-metric-ttft"]').click();
      cy.contains('h2', 'TTFT over time').should('be.visible');
    });
  });

  it('switches each chart independently from P90 to P75', () => {
    cy.get('[data-testid="interactivity-over-time-chart"]').within(() => {
      cy.contains('svg', 'P90 (rolling 50 req)')
        .find('path')
        .first()
        .invoke('attr', 'd')
        .as('p90Path');
      cy.contains('button', 'P75').click();
      cy.get('[data-testid="interactivity-percentile-toggle"]')
        .find('[role="tab"][aria-selected="true"]')
        .should('have.text', 'P75');
      cy.get('svg').should('contain.text', '1 / cumulative P75 TPOT');
      cy.contains('svg', 'P75 (rolling 50 req)')
        .find('path')
        .first()
        .invoke('attr', 'd')
        .then(function (p75Path) {
          expect(p75Path).not.to.equal(this.p90Path);
        });
    });

    cy.get('[data-testid="ttft-over-time-chart"]').within(() => {
      cy.get('[data-testid="ttft-percentile-toggle"]')
        .find('[role="tab"][aria-selected="true"]')
        .should('have.text', 'P90');
      cy.contains('button', 'P75').click();
      cy.get('svg').should('contain.text', 'P75 (rolling 50 req)');
      cy.get('svg').should('contain.text', 'Cumulative P75 TTFT');
    });
  });

  it('switches the request activity card from queue depth to cumulative completions', () => {
    cy.get('[data-testid="request-activity-chart"]').within(() => {
      cy.contains('h2', 'Request queue depth').should('be.visible');
      cy.get('[data-testid="request-activity-completed"]').click();
      cy.contains('h2', 'Cumulative completed requests').should('be.visible');
      cy.get('svg').should('contain.text', 'Completed requests');
      cy.get('svg').should('contain.text', 'Requests');
      cy.get('[data-testid="request-activity-queue"]').click();
      cy.contains('h2', 'Request queue depth').should('be.visible');
    });
  });

  it('shows total idle time on the request timeline (time-boundary phase slice, consistent with the charts)', () => {
    cy.get('[data-testid="detail-view-timeline"]').click();
    cy.location('search').should('contain', 'view=timeline');
    // The Gantt now slices by TIME BOUNDARY (sliceTimelineByPhase), matching the
    // per-point charts, instead of the per-request phase LABEL. The earliest
    // profiling request starts at t=0, so the boundary is 0 and warmup-labelled
    // r5 (start=5s) is counted as profiling here too — exactly as the interactivity
    // /TTFT charts already count it (their 6-point slice includes r5). That fills
    // the former 5–6s gap that label-based filtering left open, so in-flight
    // coverage is now continuous across [0s, 7s]: idle 0ms (0.0%). A 1.00s value
    // here would mean the Gantt had regressed to label-based filtering.
    cy.get('[data-testid="timeline-total-idle-time"]').should('have.text', 'idle 0ms (0.0%)');
    cy.get('[data-timeline-row-kind="aux"]')
      .should('have.css', 'padding-left', '24px')
      .and('contain.text', 'aux 011 · parallel');
  });

  it('restores the request timeline view after browser Back from a dataset route', () => {
    cy.window().then((win) => {
      win.history.pushState({}, '', '/datasets/test-dataset/conversations/conversation-1');
    });
    cy.go('back');
    cy.location('pathname').should('eq', '/inference/agentic/206885');
    cy.location('search').should('contain', 'view=timeline');
    cy.get('[data-testid="detail-view-timeline"]').should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="timeline-total-idle-time"]').should('be.visible');
  });

  it('shows a cumulative average for unique input tokens in flight', () => {
    cy.get('[data-testid="detail-view-point"]').click();
    cy.get('[data-testid="unique-input-inflight-chart"]').within(() => {
      cy.get('svg').should('contain.text', 'Cumulative average');
      cy.get('svg path[stroke="#ef4444"]').should('have.length', 1);
    });
  });
});

const pointMeta = {
  id: 206885,
  hardware: 'gb200',
  framework: 'dynamo-vllm',
  model: 'deepseek-r1-0528',
  precision: 'fp8',
  spec_method: 'none',
  disagg: true,
  conc: 128,
  offload_mode: 'off',
  isl: null,
  osl: null,
  benchmark_type: 'agentic_traces',
  date: '2026-06-23',
  run_url: null,
  server_gpu_cache_hit_rate: 0.5,
  server_cpu_cache_hit_rate: null,
};

const sourceSeries = (source: Record<string, unknown>, prompt: number, generation: number) => ({
  source,
  kvCacheUsage: [
    { t: 0, value: 0.25 },
    { t: 1, value: 0.5 },
  ],
  prefixCacheHitRate: [{ t: 0, value: 0.5 }],
  queueDepth: [{ t: 0, running: 2, waiting: 1, total: 3 }],
  promptTokensBySource: { miss: [{ t: 0, value: prompt }] },
  promptTps: [{ t: 0, value: prompt }],
  generationTps: [{ t: 0, value: generation }],
  prefixCacheHitsTps: [{ t: 0, value: prompt / 2 }],
  hostKvCacheUsage: [],
  kvCacheUsageByEngine: [],
});

describe('Agentic point orchestrator metric sources', () => {
  beforeEach(() => {
    const prefill = sourceSeries(
      {
        id: 'dynamo|prefill|10.30.1.56:7500|prefill-a|0|0',
        adapter: 'dynamo',
        role: 'prefill',
        endpointUrl: '10.30.1.56:7500',
        nativeRole: 'prefill',
        workerId: 'prefill-a',
        dpRank: '0',
        engine: '0',
      },
      100,
      1,
    );
    const decode = sourceSeries(
      {
        id: 'dynamo|decode|10.30.1.206:7516|decode-a|0|0',
        adapter: 'dynamo',
        role: 'decode',
        endpointUrl: '10.30.1.206:7516',
        nativeRole: 'backend',
        workerId: 'decode-a',
        dpRank: '0',
        engine: '0',
      },
      300,
      400,
    );
    cy.intercept('GET', '/api/v1/trace-histograms*', { body: {} });
    cy.intercept('GET', '/api/v1/benchmark-siblings*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request-timeline*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/trace-server-metrics*', {
      body: {
        meta: pointMeta,
        startNs: 0,
        endNs: 2_000_000_000,
        durationS: 2,
        timeslicesCount: 2,
        kvCacheUsage: prefill.kvCacheUsage,
        prefixCacheHitRate: prefill.prefixCacheHitRate,
        queueDepth: prefill.queueDepth,
        promptTokensBySource: prefill.promptTokensBySource,
        prefillTps: prefill.promptTps,
        decodeTps: decode.generationTps,
        prefixCacheHitsTps: prefill.prefixCacheHitsTps,
        hostKvCacheUsage: [],
        kvCacheUsageByEngine: [],
        metricSources: [prefill, decode],
      },
    });
    cy.visit('/inference/agentic/206885', { onBeforeLoad: unlockAgenticGate });
  });

  it('switches every server chart to an orchestrator-normalized worker', () => {
    cy.get('[data-testid="metric-source-toolbar"]')
      .should('have.css', 'position', 'sticky')
      .and('have.css', 'top', '64px');
    cy.get('[data-testid="metric-source-select"]').should('contain.text', 'All endpoints').click();
    cy.contains('[role="option"]', 'Decode · decode-a').click();

    cy.get('[data-testid="metric-source-select"]').should('contain.text', 'Decode · decode-a');
    cy.contains('h2', 'Throughput · Decode · decode-a').should('be.visible');
    cy.contains('svg', 'Decode (avg n=50)').should('be.visible');

    cy.get('[data-testid="metric-source-select"]').click();
    cy.contains('[role="option"]', 'Prefill · prefill-a').click();
    cy.contains('h2', 'Throughput · Prefill · prefill-a').should('be.visible');
  });

  it('toggles input and decode independently while keeping one visible', () => {
    cy.get('[data-testid="throughput-series-input"]')
      .should('have.attr', 'aria-pressed', 'true')
      .and('not.be.disabled');
    cy.get('[data-testid="throughput-series-decode"]')
      .should('have.attr', 'aria-pressed', 'true')
      .and('not.be.disabled');
    cy.contains('svg', 'Input (avg n=50)').should('be.visible');
    cy.contains('svg', 'Decode (avg n=50)').should('be.visible');
    cy.contains('svg', 'Total running avg (60s burn-in)').should('be.visible');

    cy.get('[data-testid="throughput-series-input"]').click();
    cy.get('[data-testid="throughput-series-input"]').should('have.attr', 'aria-pressed', 'false');
    cy.get('[data-testid="throughput-series-decode"]').should('be.disabled');
    cy.contains('svg', 'Input (avg n=50)').should('not.exist');
    cy.contains('svg', 'Total running avg (60s burn-in)').should('not.exist');

    cy.get('[data-testid="throughput-series-input"]').click();
    cy.get('[data-testid="throughput-series-decode"]').click();
    cy.get('[data-testid="throughput-series-input"]').should('be.disabled');
    cy.get('[data-testid="throughput-series-decode"]').should('have.attr', 'aria-pressed', 'false');
  });
});
