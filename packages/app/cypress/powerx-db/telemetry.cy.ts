const POINT = '/api/v1/gpu-metrics-point?id=206885';
const RUN = '34716669498';
const telemetry = '[data-testid="power-telemetry-view"]';
const statsCard = `${telemetry} > [data-slot="card"]:last-child`;

function visit(url: string, delayTelemetry = false) {
  cy.visit(url, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-feature-gate', '1');
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      if (delayTelemetry) {
        const nativeFetch = win.fetch.bind(win);
        win.fetch = async (...args) => {
          const response = await nativeFetch(...args);
          if (String(args[0]).includes('gpu-metrics-point')) {
            await new Promise((resolve) => {
              win.setTimeout(resolve, 700);
            });
          }
          return response;
        };
      }
    },
  });
}

function captureViewport(selector: string, name: string, fromBottom = false) {
  // Wait for Radix exit animations before scrolling or capturing the page.
  cy.get('[data-slot="select-content"]').should('not.exist');
  cy.get(selector).then(($target) => {
    cy.window().then((win) => {
      const rect = $target[0].getBoundingClientRect();
      win.scrollTo({
        top: win.scrollY + (fromBottom ? rect.bottom - 600 : rect.top - 112),
        left: 0,
        behavior: 'instant',
      });
    });
  });
  cy.screenshot(name, { capture: 'viewport' });
}

function refocus() {
  cy.window().then((win) => {
    Object.defineProperty(win.document, 'visibilityState', { configurable: true, value: 'hidden' });
    win.dispatchEvent(new win.Event('visibilitychange'));
    Object.defineProperty(win.document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    win.dispatchEvent(new win.Event('visibilitychange'));
  });
}

describe('PowerX artifact → PostgreSQL → real API → browser', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message === 'ResizeObserver loop completed with undelivered notifications.')
        return false;
    });
  });
  afterEach(() => {
    cy.task('setTelemetryAvailable', true);
  });

  it('loads NVIDIA point telemetry and the stored full-record digest without GitHub', () => {
    cy.viewport(1280, 900);
    // Delay the real fetch result; Cypress response intercepts race dev StrictMode aborts.
    visit('/inference/agentic/206885?view=power', true);
    cy.get('[data-testid="power-telemetry-loading"]').should('be.visible');
    cy.get(telemetry).should('contain.text', 'collector-before-repair');
    cy.request(POINT).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.headers['cache-control']).to.eq('no-store');
      const series = response.body.series[0];
      expect(series.sampleCount).to.eq(16); // 17 CSV rows, one duplicate flush.
      expect(
        series.stats.find(
          (row: { gpuIndex: number; metric: string }) =>
            row.gpuIndex === 0 && row.metric === 'power_w',
        ).mean,
      ).to.eq(135);
    });
    cy.get(telemetry).should('contain.text', 'collector-before-repair');
    cy.get('[data-testid="power-telemetry-sample-count"]').should('have.text', '16');
    cy.get(`${telemetry} table tbody tr`).first().find('td').eq(4).should('have.text', '135.0');
    cy.get('[data-testid="gpu-metrics-chart-svg"] path.line-path').should('have.length', 2);
    captureViewport('[data-testid="power-telemetry-chart"]', 'point-nvidia-desktop-chart');
    captureViewport(statsCard, 'point-nvidia-desktop-stats');
  });

  it('keeps AMD missing samples and metric units correct in Chinese on mobile', () => {
    cy.viewport(390, 844);
    visit('/zh/inference/agentic/206886?view=power');
    cy.get(telemetry).should('contain.text', 'amd-smi');
    cy.get('[data-testid="power-telemetry-metric-select"]').click();
    cy.get('[data-slot="select-item"]').contains('GFX 电压 (mV)').click();
    cy.get(`${telemetry} table`).should('contain.text', '平均值 (mV)');
    cy.get(`${telemetry} table tbody tr`).first().find('td').eq(1).should('have.text', '6');
    cy.get(`${telemetry} table tbody tr`).first().find('td').eq(4).should('have.text', '850.0');
    captureViewport(
      '[data-testid="power-telemetry-metric-select"]',
      'point-amd-mobile-zh-controls',
    );
    captureViewport('[data-testid="power-telemetry-chart"]', 'point-amd-mobile-zh-chart');
    captureViewport(
      '[data-testid="power-telemetry-chart"]',
      'point-amd-mobile-zh-chart-bottom',
      true,
    );
    captureViewport(statsCard, 'point-amd-mobile-zh-stats');
  });

  it('switches multinode series without merging host-local GPU zero', () => {
    cy.viewport(1280, 900);
    visit('/inference/agentic/206887?view=power');
    cy.get(telemetry).should('contain.text', 'srt-slurm.dcgm-power');
    cy.get(`${telemetry} table tbody tr`).first().find('td').eq(4).should('have.text', '535.0');
    cy.get('#power-telemetry-series-select').click();
    cy.get('[data-slot="select-item"]').contains('host-b').click();
    cy.get(`${telemetry} table tbody tr`).first().find('td').eq(4).should('have.text', '635.0');
    cy.get('[data-testid="power-telemetry-sample-count"]').should('have.text', '16');
    cy.get('[data-testid="power-telemetry-metric-select"]').click();
    cy.get('[data-slot="select-item"]').should('have.length', 1).and('contain.text', 'Power Draw');
    cy.get('body').type('{esc}');
    captureViewport('[data-testid="power-telemetry-chart"]', 'point-multinode-series-chart');
    captureViewport(statsCard, 'point-multinode-series-stats');
  });

  for (const [prefix, width] of [
    ['', 1280],
    ['/zh', 390],
  ] as const) {
    it(`renders database Timeline with GitHub unavailable at ${prefix || 'en'} ${width}px`, () => {
      cy.viewport(width, 900);
      cy.request({ url: '/api/gpu-metrics?runId=999999', failOnStatusCode: false }).then(
        (response) => {
          expect(response.status).to.eq(500);
          expect(response.body.error).to.eq('GitHub token not configured');
        },
      );
      cy.intercept('POST', `/api/gpu-metrics?runId=${RUN}*`).as('timeline');
      visit(
        `${prefix}/inference?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_prec=fp4&i_metric=y_measuredPowerTimeline`,
      );
      cy.wait('@timeline').then(({ request, response }) => {
        expect(request.body.sources).to.have.length(3);
        expect(response!.statusCode).to.eq(200);
        expect(response!.body.source).to.eq('database');
        expect(response!.body.series).to.have.length(3);
      });
      cy.get(
        '[data-testid="power-timeline-chart-svg"] path.power-trace[data-segment="full"]',
      ).should('have.length', 3);
      cy.get('[data-testid="power-timeline-missing"]').should('not.exist');
      captureViewport(
        '[data-testid="power-timeline"]',
        `timeline-db-${prefix ? 'zh-mobile' : 'en-desktop'}`,
      );
      captureViewport(
        '[data-testid="power-timeline-chart-svg"]',
        `timeline-db-${prefix ? 'zh-mobile' : 'en-desktop'}-chart-bottom`,
        true,
      );
    });
  }

  it('distinguishes a real database read error from missing data and retries successfully', () => {
    cy.task('setTelemetryAvailable', false);
    cy.request({
      url: `/api/v1/views/gpu-metrics?runId=${RUN}`,
      failOnStatusCode: false,
    }).then(({ status, body, headers }) => {
      expect(status).to.eq(503);
      expect(body.error).to.eq('Source data unavailable');
      expect(headers['cache-control']).to.eq('private, no-store');
    });
    visit('/zh/inference/agentic/206885?view=power');
    cy.get('[data-testid="power-telemetry-query-error"]').should('be.visible');
    cy.get('[data-testid="power-telemetry-missing"]').should('not.exist');
    cy.task('setTelemetryAvailable', true);
    cy.get('[data-testid="power-telemetry-query-error"]').contains('button', '重试').click();
    cy.get(telemetry).should('contain.text', 'collector-before-repair');
    cy.get('[data-testid="power-telemetry-query-error"]').should('not.exist');
  });

  it('shows a genuine missing point as missing', () => {
    visit('/inference/agentic/999999?view=power');
    cy.get('[data-testid="power-telemetry-missing"]').should('contain.text', '#999999');
    cy.get('[data-testid="power-telemetry-query-error"]').should('not.exist');
  });

  it('returns retained full-record digests through the public view while filtering chart GPUs', () => {
    cy.request('/api/v1/gpu-metrics-point?id=206888').then(({ body }) => {
      const digest = body.series[0].stats
        .filter((row: { metric: string }) => row.metric === 'power_w')
        .sort((a: { mean: number }, b: { mean: number }) => b.mean - a.mean);
      cy.request(
        '/api/v1/views/gpu-metrics?runId=34175132645&metric=power&gpus=0&sort=mean&direction=desc',
      ).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.headers['cache-control']).to.eq('private, no-store');
        expect(response.body.stats).to.deep.eq(digest);
        expect(response.body.stats).to.have.length(8);
        const gpu0 = response.body.stats.find((row: { gpuIndex: number }) => row.gpuIndex === 0);
        expect(gpu0.count).to.eq(3);
        expect(gpu0.mean).to.be.closeTo(351.4033333333333, 0.0001);
        expect(response.body.rows).to.have.length(3);
        expect(response.body.rows.every((row: { index: number }) => row.index === 0)).to.eq(true);
        expect(Object.keys(response.body.chart)).to.deep.eq(['0']);
      });
    });
  });

  it('recovers a missing point link through unchanged-input ingest and browser refocus', () => {
    cy.task('retainedTelemetry', false);
    cy.task('unlinkRetainedPoint');
    visit('/inference/agentic/206889?view=power');
    cy.get('[data-testid="power-telemetry-missing"]').should('be.visible');
    cy.request({ url: '/api/v1/gpu-metrics-point?id=206889', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
    cy.task('retainedTelemetry', false).should('include', { samplesInserted: 0 });
    refocus();
    cy.get(telemetry).should('contain.text', 'retained-before-repair');
    cy.get(`${telemetry} table tbody tr`).should('have.length', 8);
    cy.request('/api/v1/gpu-metrics-point?id=206889').then(({ body }) => {
      expect(body.series[0].sampleCount).to.eq(24);
      expect(body.series[0].benchmarkResultIds).to.deep.eq([206888, 206889]);
    });
  });

  it('refreshes corrected sidecars and timestamps on focus and reopening the tab', () => {
    visit('/inference/agentic/206885?view=power');
    cy.get(telemetry).should('contain.text', 'collector-before-repair');
    cy.request(POINT).its('body.series.0.startedAt').should('eq', '2026-09-01T20:00:00.000Z');
    cy.task('repairTelemetry');
    refocus();
    cy.get(telemetry).should('contain.text', 'collector-after-repair');
    cy.request(POINT).then((response) => {
      expect(response.body.series[0].startedAt).to.eq('2026-09-01T18:00:00.000Z');
      expect(response.body.series[0].sampleCount).to.eq(16);
    });
    cy.get('[data-testid="detail-view-point"]').click();
    cy.get('[data-testid="detail-view-power"]').click();
    cy.get(telemetry).should('contain.text', 'collector-after-repair');
    cy.get(`${telemetry} table tbody tr`).first().find('td').eq(4).should('have.text', '135.0');
    captureViewport(telemetry, 'point-after-reingest');
  });

  for (const [prefix, width] of [
    ['', 1280],
    ['/zh', 390],
  ] as const) {
    it(`repairs retained B200 telemetry through cache, shared points and ${prefix || 'en'} browser`, () => {
      cy.task('retainedTelemetry', false);
      cy.viewport(width, 900);
      for (const id of [206888, 206889]) {
        cy.request(`/api/v1/gpu-metrics-point?id=${id}`).then(({ body }) => {
          expect(body.series[0].startedAt).to.eq('2026-09-08T07:20:19.279Z');
          expect(body.series[0].sampleCount).to.eq(24);
          expect(body.series[0].gpuCount).to.eq(8);
          expect(body.series[0].benchmarkResultIds).to.deep.eq([206888, 206889]);
          expect(body.series[0].data[0].power).to.be.closeTo(380.42, 0.0001);
        });
      }
      visit(`${prefix}/inference/agentic/206888?view=power`);
      cy.get(telemetry).should('contain.text', 'retained-before-repair');
      cy.get('[data-testid="power-telemetry-sample-count"]').should('have.text', '24');
      cy.get(`${telemetry} table tbody tr`).should('have.length', 8);
      cy.get(`${telemetry} table tbody tr`).first().find('td').eq(4).should('have.text', '351.4');
      cy.task('retainedTelemetry', true).its('samplesInserted').should('eq', 24);
      refocus();
      cy.get(telemetry).should('contain.text', 'retained-after-repair');
      cy.window().then((win) => {
        const expected = new win.Date('2026-09-08T05:20:19.279Z').toLocaleTimeString(
          prefix ? 'zh-CN' : undefined,
        );
        cy.get(telemetry).should('contain.text', expected);
      });
      for (const id of [206888, 206889]) {
        cy.request(`/api/v1/gpu-metrics-point?id=${id}`).then(({ body }) => {
          expect(body.series[0].startedAt).to.eq('2026-09-08T05:20:19.279Z');
          expect(body.series[0].sampleCount).to.eq(24);
          expect(JSON.stringify(body.series[0].sidecars)).to.contain('GPU-fixture-corrected-0');
        });
      }
      cy.task('retainedTelemetry', true).should('include', {
        samplesInserted: 0,
        seriesSkipped: 1,
      });
      cy.get('[data-testid="detail-view-point"]').click();
      cy.get('[data-testid="detail-view-power"]').click();
      cy.get(telemetry).should('contain.text', 'retained-after-repair');
      cy.get(`${telemetry} table tbody tr`).first().find('td').eq(4).should('have.text', '351.4');
      captureViewport(telemetry, `retained-repair-${prefix ? 'zh-mobile' : 'en-desktop'}`);
      captureViewport(statsCard, `retained-stats-${prefix ? 'zh-mobile' : 'en-desktop'}`);
    });
  }
});
