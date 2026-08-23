import { unlockAgenticGate } from '../support/e2e';

const timelineRequest = (
  index: number,
  ttftMs: number,
  tpotMs: number,
  overrides: Record<string, unknown> = {},
) => ({
  cid: 'conversation-1',
  ri: 0,
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

const requestChartPayload = (requests: ReturnType<typeof timelineRequest>[]) => {
  const cids = [...new Set(requests.map((request) => request.cid))];
  const phases = [...new Set(requests.map((request) => request.phase))];
  return {
    version: 602,
    timelineVersion: 6,
    startNs: 0,
    endNs: 7_000_000_000,
    durationS: 7,
    cids,
    phases,
    requests: requests.map((request) => [
      cids.indexOf(request.cid),
      phases.indexOf(request.phase),
      Math.round(request.start / 1_000),
      Math.round(request.end / 1_000),
      request.ttftMs,
      request.tpotMs,
      request.isl,
      request.osl,
      request.cancelled ? 1 : 0,
    ]),
  };
};

const benchmarkSiblings = {
  sku: {
    hardware: 'b300',
    framework: 'vllm',
    model: 'kimik3',
    precision: 'fp4',
    spec_method: 'mtp',
    benchmark_type: 'agentic_traces',
    github_run_id: 31893747354,
    date: '2026-08-15',
    dataset_slug: 'fixture-dataset',
  },
  siblings: [
    {
      id: 206885,
      conc: 8,
      offload_mode: 'off',
      decode_tp: 8,
      decode_ep: 1,
      decode_pp: 1,
      decode_dcp_size: 8,
      decode_pcp_size: 1,
      decode_dp_attention: false,
      decode_num_workers: 0,
      prefill_tp: 8,
      prefill_ep: 1,
      prefill_pp: 1,
      prefill_dcp_size: 8,
      prefill_pcp_size: 1,
      prefill_dp_attention: false,
      prefill_num_workers: 0,
      num_prefill_gpu: 8,
      num_decode_gpu: 8,
      disagg: false,
      is_multinode: false,
      tput_per_gpu: 1.2,
      total_requests: 395,
      is_current: true,
      has_trace: true,
    },
  ],
};

describe('Agentic point request metric time series', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    const requests = [
      timelineRequest(0, 100, 10),
      timelineRequest(1, 200, 20),
      timelineRequest(2, 400, 25),
      timelineRequest(3, 800, 40),
      timelineRequest(4, 1600, 80, { ri: 1 }),
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
    ];
    cy.intercept('GET', '/api/v1/trace-histograms*', { body: {} });
    cy.intercept('GET', '/api/v1/trace-server-metrics*', { body: null });
    cy.intercept('GET', '/api/v1/benchmark-siblings*', { body: benchmarkSiblings });
    cy.intercept('GET', '/api/v1/request-chart-data*', {
      body: requestChartPayload(requests),
    }).as('requestChartData');
    cy.intercept('GET', '/api/v1/request-timeline*', {
      body: {
        version: 6,
        startNs: 0,
        endNs: 7_000_000_000,
        durationS: 7,
        requests,
      },
    });
    cy.visit('/inference/agentic/206885', { onBeforeLoad: unlockAgenticGate });
    // The segmented toggle is present in the server-rendered HTML. Waiting for
    // this client-only query proves hydration has attached its click handlers,
    // avoiding a Firefox race where an early click leaves `?view=` unchanged.
    cy.wait('@requestChartData');
  });

  it('uses the shared topology label for the active agentic point', () => {
    cy.contains('button', 'TP8/DCP8 • c=8').should('be.visible');
  });

  it('opens the stored server log and loads it incrementally', () => {
    const longServerLogPath =
      'agentic/conc_1152/aiperf_artifacts/logs/aiperf/2026-08-20/server.log';
    const firstChunk = `INFO server ready\n${'trace line\n'.repeat(4_000)}`;
    const searchMatchOffset = 70_027;
    const searchJumpOffset = searchMatchOffset - 16 * 1024;
    const routerJumpChunk = `${'context line\n'.repeat(1_260)}${'x'.repeat(
      searchMatchOffset - searchJumpOffset - 'context line\n'.length * 1_260,
    )}router ready for requests\n`;
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/server-log-files' },
      {
        body: [longServerLogPath, 'results/benchmark.log', 'results/router.log'],
      },
    ).as('serverLogFiles');
    cy.intercept({ method: 'GET', pathname: '/api/v1/server-log' }, (request) => {
      const params = new URL(request.url).searchParams;
      const offset = Number(params.get('offset') ?? 0);
      const fileName = params.get('file') ?? longServerLogPath;
      if (fileName === longServerLogPath && offset === 0) {
        request.alias = 'serverLogInitialChunk';
      } else if (fileName === longServerLogPath && offset === 31) {
        request.alias = 'serverLogNextChunk';
      } else if (fileName === 'results/router.log' && offset === searchJumpOffset) {
        request.alias = 'serverLogJumpChunk';
      } else if (fileName === 'results/router.log' && offset === 0) {
        request.alias = 'serverLogRouterStart';
      }
      request.reply({
        body:
          fileName === 'results/router.log'
            ? {
                id: 206885,
                fileName,
                serverLog: offset === searchJumpOffset ? routerJumpChunk : 'INFO router ready\n',
                offset,
                nextOffset: null,
              }
            : offset === 0
              ? {
                  id: 206885,
                  fileName,
                  serverLog: `\u001B[32m${firstChunk}\u001B[0m`,
                  offset: 0,
                  nextOffset: 31,
                }
              : {
                  id: 206885,
                  fileName,
                  serverLog: 'INFO benchmark complete\n',
                  offset,
                  nextOffset: null,
                },
      });
    }).as('serverLogChunk');
    cy.intercept({ method: 'GET', pathname: '/api/v1/server-log-search' }, (request) => {
      expect(new URL(request.url).searchParams.get('q')).to.equal('router ready');
      request.reply({
        body: {
          id: 206885,
          query: 'router ready',
          matches: [
            {
              fileName: 'results/router.log',
              offset: searchMatchOffset,
              before: 'INFO ',
              match: 'router ready',
              after: ' for requests',
            },
          ],
          truncated: false,
        },
      });
    }).as('serverLogSearch');
    cy.intercept(
      {
        method: 'GET',
        pathname: '/api/v1/server-log',
        query: {
          id: '206885',
          file: longServerLogPath,
          download: '1',
        },
      },
      {
        headers: {
          'content-disposition': 'attachment; filename="server.log"',
          'content-type': 'text/plain; charset=utf-8',
        },
        body: firstChunk,
      },
    ).as('serverLogDownload');
    cy.viewport(480, 900);
    cy.get('[data-testid="detail-view-logs"]').click();
    cy.location('search').should('contain', 'view=logs');
    cy.wait('@serverLogFiles');
    cy.wait('@serverLogInitialChunk');

    cy.get('[data-testid="agentic-server-log-viewer"]')
      .should('contain.text', 'Log files')
      .and('contain.text', longServerLogPath)
      .then(($viewer) => {
        cy.get('#agentic-log-file').then(($trigger) => {
          const viewerBounds = $viewer[0].getBoundingClientRect();
          const triggerBounds = $trigger[0].getBoundingClientRect();
          expect(triggerBounds.left).to.be.at.least(viewerBounds.left);
          expect(triggerBounds.right).to.be.at.most(viewerBounds.right);
        });
      });
    cy.get('[data-testid="server-log-content"]')
      .should('contain.text', 'INFO server ready')
      .and('not.contain.text', '\u001B[32m');

    cy.get('[data-testid="server-log-search"]').type('router ready');
    cy.wait('@serverLogSearch');
    cy.get('[data-testid="server-log-search-results"]')
      .should('contain.text', '1 match')
      .and('contain.text', 'results/router.log')
      .and('contain.text', 'character 70,028')
      .and('contain.text', 'INFO router ready for requests');

    cy.get('[data-testid="go-to-server-log-match"]').click();
    cy.wait('@serverLogJumpChunk').then(({ request }) => {
      const params = new URL(request.url).searchParams;
      expect(params.get('file')).to.equal('results/router.log');
      expect(params.get('offset')).to.equal(String(searchJumpOffset));
    });
    cy.get('#agentic-log-file').should('contain.text', 'results/router.log');
    cy.get('[data-testid="server-log-jump-highlight"]')
      .should('be.visible')
      .and('have.text', 'router ready');

    cy.get('#agentic-log-file').click();
    cy.contains('[role="option"]', longServerLogPath).click();
    cy.get('[data-testid="server-log-content"]').should('contain.text', 'INFO server ready');
    cy.get('[data-testid="download-selected-server-log"]')
      .should('have.attr', 'href')
      .and('include', 'download=1');
    cy.get('[data-testid="download-selected-server-log"]').click();
    cy.wait('@serverLogDownload');

    cy.get('[data-testid="server-log-content"]').scrollTo('bottom');
    cy.wait('@serverLogNextChunk');
    cy.get('[data-testid="server-log-content"]')
      .should('contain.text', 'INFO server ready')
      .and('contain.text', 'INFO benchmark complete');
    cy.contains('End of stored log').should('be.visible');

    cy.get('#agentic-log-file').click();
    cy.contains('[role="option"]', 'results/router.log').click();
    cy.wait('@serverLogRouterStart');
    cy.get('[data-testid="server-log-content"]').should('contain.text', 'INFO router ready');

    cy.viewport(1280, 720);
    cy.get('[data-testid="detail-view-point"]').click();
  });

  it('keeps loaded log text visible when a later chunk fails', () => {
    const retainedLog = `INFO retained after failure\n${'trace line\n'.repeat(2_000)}`;
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/server-log-files' },
      { body: ['results/server.log', 'results/benchmark.log'] },
    );
    cy.intercept({ method: 'GET', pathname: '/api/v1/server-log' }, (request) => {
      const params = new URL(request.url).searchParams;
      const fileName = params.get('file');
      const offset = Number(params.get('offset') ?? 0);
      if (fileName !== 'results/benchmark.log') {
        request.reply({
          body: {
            id: 206885,
            fileName,
            serverLog: 'INFO initial file\n',
            offset,
            nextOffset: null,
          },
        });
        return;
      }
      request.alias = 'retainedLogChunk';
      if (offset === 0) {
        request.reply({
          body: {
            id: 206885,
            fileName: 'results/benchmark.log',
            serverLog: retainedLog,
            offset: 0,
            nextOffset: 28,
          },
        });
      } else {
        request.reply({ statusCode: 503, body: { error: 'temporary failure' } });
      }
    });

    cy.contains('button', 'TP8/DCP8 • c=8').should('be.visible');
    cy.get('[data-testid="detail-view-logs"]').click();
    cy.location('search').should('contain', 'view=logs');
    cy.get('#agentic-log-file').click();
    cy.contains('[role="option"]', 'results/benchmark.log').click();
    cy.wait('@retainedLogChunk');
    cy.get('[data-testid="server-log-content"]').should(
      'contain.text',
      'INFO retained after failure',
    );
    cy.get('[data-testid="load-more-server-log"]').click();
    cy.contains('The next chunk could not be loaded', { timeout: 15_000 }).should('be.visible');
    cy.get('[data-testid="server-log-content"]').should(
      'contain.text',
      'INFO retained after failure',
    );
    cy.get('[data-testid="detail-view-point"]').click();
    cy.location('search').should('not.contain', 'view=logs');
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
    cy.get('[data-timeline-row-kind="parent"]')
      .should('have.length', 2)
      .then(($rows) => {
        expect($rows.eq(0)).to.contain.text('conversation-1 · replay 1');
        expect($rows.eq(1)).to.contain.text('conversation-1 · replay 2');
      });
    cy.get('[data-timeline-row-kind="aux"]')
      .should('have.css', 'padding-left', '24px')
      .and('contain.text', 'aux 011 · parallel');
  });

  it('restores the request timeline view after browser Back from a dataset route', () => {
    cy.get('[data-testid="detail-view-timeline"]').click();
    cy.get('[data-testid="timeline-total-idle-time"]').should('be.visible');
    cy.window().then((win) => {
      win.history.pushState({}, '', '/agentx/test-dataset/conversations/conversation-1');
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

  it('renders the log viewer in Simplified Chinese', () => {
    cy.intercept('GET', '/api/v1/trace-server-metrics*', { body: null });
    cy.intercept('GET', '/api/v1/benchmark-siblings*', { body: benchmarkSiblings });
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/server-log-files' },
      {
        body: ['results/server.log'],
      },
    );
    cy.intercept(
      { method: 'GET', pathname: '/api/v1/server-log' },
      {
        body: {
          id: 206885,
          fileName: 'results/server.log',
          serverLog: 'INFO server ready\n',
          offset: 0,
          nextOffset: null,
        },
      },
    );
    cy.visit('/zh/inference/agentic/206885?view=logs', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="detail-view-logs"]')
      .should('have.attr', 'aria-selected', 'true')
      .and('have.text', '日志');
    cy.get('[data-testid="agentic-server-log-viewer"]')
      .should('contain.text', '日志文件')
      .and('contain.text', 'results/server.log')
      .and('contain.text', '搜索所有日志文件')
      .and('contain.text', '已到达日志末尾');
  });

  it('renders the complete Chinese detail, mobile, metadata, and timeline click path', () => {
    cy.viewport(390, 900);
    cy.visit('/zh/inference/agentic/206885', { onBeforeLoad: unlockAgenticGate });

    cy.get('link[rel="alternate"][hreflang="en"]')
      .should('have.attr', 'href')
      .and('include', '/inference/agentic/206885');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .should('have.attr', 'href')
      .and('include', '/zh/inference/agentic/206885');
    cy.contains('本次运行共 1 个数据点').should('be.visible');
    cy.get('[data-testid="sibling-sort-select"]').should('have.attr', 'aria-label', '数据点排序');
    cy.contains('h2', '输入序列长度分布').should('be.visible');
    cy.contains(/个请求 · 范围 .* token · 对数刻度/u).should('be.visible');
    cy.contains('h2', '请求队列深度').should('be.visible');

    cy.get('[data-testid="detail-view-timeline"]').click();
    cy.get('[data-testid="timeline-total-idle-time"]').should('contain.text', '空闲');
    cy.get('[data-testid="request-timeline-svg"]')
      .should('have.attr', 'role', 'img')
      .and('have.attr', 'aria-label', '请求执行时间线');
    cy.contains('Shift+滚轮缩放 · 拖动平移 · 双击重置').should('be.visible');
    cy.get('[data-testid="request-timeline-scroll"]')
      .scrollTo('right')
      .should(($scroller) => {
        expect($scroller[0].scrollLeft).to.be.greaterThan(0);
      });
    cy.get('[data-testid="request-timeline-svg"] g > rect').then(($rects) => {
      const viewport = $rects[0].ownerDocument.documentElement;
      const visibleRect = [...$rects].find((element) => {
        const bounds = element.getBoundingClientRect();
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.left >= 0 &&
          bounds.right <= viewport.clientWidth &&
          bounds.top >= 0 &&
          bounds.bottom <= viewport.clientHeight &&
          element.ownerDocument.elementFromPoint(centerX, centerY) === element
        );
      });
      expect(Boolean(visibleRect), 'visible request timeline bar').to.equal(true);
      cy.wrap(visibleRect!).trigger('mousemove', 'center', { scrollBehavior: false });
    });
    cy.get('[data-testid="request-timeline-tooltip"]')
      .should('contain.text', '总时长')
      .and('contain.text', '排队等待')
      .and('have.css', 'position', 'fixed')
      .then(($tooltip) => {
        const bounds = $tooltip[0].getBoundingClientRect();
        expect(bounds.width).to.be.greaterThan(0);
        expect(bounds.height).to.be.greaterThan(0);
      });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('a[href^="/zh/agentx/fixture-dataset/conversations/conversation-1"]')
      .first()
      .should('have.attr', 'href')
      .and('include', 'turn=0');
    cy.get('a[href^="/zh/agentx/fixture-dataset/conversations/conversation-1"]').first().click();
    cy.location('pathname').should(
      'equal',
      '/zh/agentx/fixture-dataset/conversations/conversation-1',
    );
  });

  it('keeps request-chart, aggregate, and timeline failures distinct and retryable', () => {
    const retryRequests = [timelineRequest(0, 100, 10)];
    let requestChartAttempts = 0;
    let aggregateAttempts = 0;
    let timelineAttempts = 0;

    cy.intercept('GET', '/api/v1/request-chart-data*', (request) => {
      requestChartAttempts += 1;
      request.reply(
        requestChartAttempts <= 2
          ? { statusCode: 500, body: {} }
          : { statusCode: 200, body: requestChartPayload(retryRequests) },
      );
    });
    cy.intercept('GET', '/api/v1/agentic-aggregates*', (request) => {
      aggregateAttempts += 1;
      const values = { mean: 10, p50: 10, p75: 10, p90: 10, p95: 10, p99: 10, n: 1 };
      request.reply(
        aggregateAttempts <= 2
          ? { statusCode: 500, body: {} }
          : {
              statusCode: 200,
              body: {
                206885: {
                  id: 206885,
                  isl: values,
                  osl: values,
                  kvCacheUtil: null,
                  prefixCacheHitRate: null,
                },
              },
            },
      );
    });
    cy.intercept('GET', '/api/v1/request-timeline*', (request) => {
      timelineAttempts += 1;
      request.reply(
        timelineAttempts <= 2
          ? { statusCode: 500, body: {} }
          : {
              statusCode: 200,
              body: {
                version: 6,
                startNs: 0,
                endNs: 1_000_000_000,
                durationS: 1,
                requests: retryRequests,
              },
            },
      );
    });

    cy.visit('/zh/inference/agentic/206885', { onBeforeLoad: unlockAgenticGate });
    cy.get('[data-testid="agentic-request-charts-query-error"]')
      .should('contain.text', '请求图表数据加载失败。')
      .and('contain.text', '重试');
    cy.get('[data-testid="agentic-request-charts-query-error"]').contains('重试').click();
    cy.contains('h2', '输入序列长度分布').should('be.visible');
    cy.then(() => expect(requestChartAttempts).to.equal(3));

    cy.get('[data-testid="detail-view-aggregates"]').click();
    cy.get('[data-testid="agentic-aggregates-query-error"]')
      .should('contain.text', '跨配置聚合数据加载失败。')
      .and('contain.text', '重试');
    cy.get('[data-testid="agentic-aggregates-query-error"]').contains('重试').click();
    cy.contains('h2', '各配置的 ISL 分布').should('be.visible');
    cy.then(() => expect(aggregateAttempts).to.equal(3));

    cy.get('[data-testid="detail-view-timeline"]').click();
    cy.get('[data-testid="agentic-timeline-query-error"]')
      .should('contain.text', '请求时间线加载失败。')
      .and('contain.text', '重试');
    cy.get('[data-testid="agentic-timeline-query-error"]').contains('重试').click();
    cy.get('[data-testid="request-timeline-svg"]').should('be.visible');
    cy.then(() => expect(timelineAttempts).to.equal(3));
  });
});

describe('Agentic request timeline virtualization', () => {
  const requests = Array.from({ length: 2_000 }, (_, index) =>
    timelineRequest(index, 10, 10, {
      cid: `conversation-${String(index).padStart(4, '0')}`,
      credit: index * 1_000_000_000,
      start: index * 1_000_000_000,
      end: (index + 1) * 1_000_000_000,
    }),
  );

  beforeEach(() => {
    cy.intercept('GET', '/api/v1/trace-server-metrics*', { body: null });
    cy.intercept('GET', '/api/v1/benchmark-siblings*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request-chart-data*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request-timeline*', {
      body: {
        version: 5,
        startNs: 0,
        endNs: 2_000_000_000_000,
        durationS: 2_000,
        requests,
      },
    });
    cy.visit('/inference/agentic/206885?view=timeline', { onBeforeLoad: unlockAgenticGate });
  });

  it('keeps row labels and SVG request bars bounded to the viewport', () => {
    cy.get('[data-testid="request-timeline-scroll"]').should('be.visible');
    cy.get('[data-timeline-row-kind]').should(($rows) => {
      expect($rows.length).to.be.lessThan(40);
    });
    cy.get('[data-testid="request-timeline-svg"] rect').should(($bars) => {
      expect($bars.length).to.be.lessThan(100);
    });

    cy.get('[data-testid="request-timeline-scroll"]').scrollTo('bottom');
    cy.get('[data-timeline-row-kind]').should('contain.text', 'conversation-1999');
    cy.get('[data-timeline-row-kind]').should(($rows) => {
      expect($rows.length).to.be.lessThan(40);
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
  offload_mode: 'on',
  kv_offloading: 'dram',
  kv_offload_backend: 'lmcache',
  kv_offload_backend_version: '0.5.1',
  kv_p2p_transfer: 'mooncake',
  router_name: 'vllm-router',
  router_version: '0.1.14',
  isl: null,
  osl: null,
  benchmark_type: 'agentic_traces',
  date: '2026-06-23',
  run_url: null,
  server_gpu_cache_hit_rate: 0.5,
  server_cpu_cache_hit_rate: 0.42,
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
        id: 'dynamo|prefill|prefill-a.internal.test:7500|prefill-a|0|0',
        adapter: 'dynamo',
        role: 'prefill',
        endpointUrl: 'prefill-a.internal.test:7500',
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
        id: 'dynamo|decode|decode-a.internal.test:7516|decode-a|0|0',
        adapter: 'dynamo',
        role: 'decode',
        endpointUrl: 'decode-a.internal.test:7516',
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
    cy.intercept('GET', '/api/v1/request-chart-data*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request-timeline*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/trace-server-metric-source*', (request) => {
      const source = new URL(request.url).searchParams.get('source');
      request.reply({ body: source === decode.source.id ? decode : prefill });
    });
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
        metricSources: [{ source: prefill.source }, { source: decode.source }],
      },
    });
    cy.visit('/inference/agentic/206885', { onBeforeLoad: unlockAgenticGate });
  });

  it('switches every server chart to an orchestrator-normalized worker', () => {
    cy.get('[data-testid="point-summary"]')
      .should('contain.text', 'Offload Type')
      .and('contain.text', 'DRAM')
      .and('contain.text', 'KV Offload Engine')
      .and('contain.text', 'LMCache 0.5.1')
      .and('contain.text', 'KV Transfer Engine')
      .and('contain.text', 'Mooncake')
      .and('contain.text', 'Router')
      .and('contain.text', 'vLLM Router 0.1.14')
      .and('contain.text', 'Chip cache hit')
      .and('contain.text', 'CPU cache hit');

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

const engineSeries = (engineLabel: string, value: number) => ({
  engineLabel,
  points: [
    { t: 0, value },
    { t: 1, value: value + 0.05 },
  ],
});

describe('Agentic point per-engine KV overlay', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/trace-histograms*', { body: {} });
    cy.intercept('GET', '/api/v1/benchmark-siblings*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request-chart-data*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request-timeline*', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/trace-server-metrics*', {
      body: {
        meta: pointMeta,
        startNs: 0,
        endNs: 2_000_000_000,
        durationS: 2,
        timeslicesCount: 2,
        kvCacheUsage: [
          { t: 0, value: 0.3 },
          { t: 1, value: 0.35 },
        ],
        prefixCacheHitRate: [],
        queueDepth: [],
        promptTokensBySource: {},
        prefillTps: [],
        decodeTps: [],
        prefixCacheHitsTps: [],
        hostKvCacheUsage: [],
        // Bare DP ranks plus a role-qualified engine, as the ETL emits for a
        // disaggregated run where the decode worker reports no rank label.
        kvCacheUsageByEngine: [
          engineSeries('0', 0.2),
          engineSeries('1', 0.4),
          engineSeries('decode', 0.6),
        ],
        metricSources: [],
      },
    });
    cy.visit('/inference/agentic/206885', { onBeforeLoad: unlockAgenticGate });
  });

  it('draws one legend entry per engine and leaves named engines unprefixed', () => {
    cy.contains('svg', 'KV cache (%)')
      .first()
      .within(() => {
        cy.contains('text', 'DP 0').should('be.visible');
        cy.contains('text', 'DP 1').should('be.visible');
        // Already self-describing — must NOT come out as "DP decode".
        cy.contains('text', 'decode').should('be.visible');
        cy.contains('text', 'DP decode').should('not.exist');
        cy.contains('text', 'Avg').should('be.visible');
        // One line per engine plus the average, and no duplicate chips.
        cy.get('path[fill="none"]').should('have.length', 4);
      });
  });
});
