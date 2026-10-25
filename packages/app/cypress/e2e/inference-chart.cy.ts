import { buildStagedChartLinks } from '../../src/lib/benchmarks/staged-chart-links';
import type { InferenceData } from '@/components/inference/types';
import {
  interceptVrPublicationData,
  VR_FIXTURE_DATE,
  VR_LATEST_FIXTURE_DATE,
  VR_LATEST_FIXTURE_RUN,
} from '../support/vr-publication-fixtures';
import {
  expectNoPageOverflow,
  unlockAgenticGate,
  interceptDerivedAgenticMetrics,
  selectXAxisMode,
} from '../support/e2e';
import {
  interceptOverlayRun,
  OVERLAY_RUN_ID,
  OVERLAY_RUN_URL,
  SINGLE_TURN_DATE,
  b300Rows,
  singleTurnRows,
} from '../support/overlay-fixtures';

function openYAxisHelp(metric: string) {
  cy.get('[data-testid="inference-secondary-controls"] > button').then(($toggle) => {
    if ($toggle.is(':visible') && $toggle.attr('aria-expanded') === 'false') {
      cy.wrap($toggle).click();
    }
  });
  cy.get('[data-testid="yaxis-metric-selector"]').click('right');
  cy.get(`[data-testid="option-help-${metric}"]`).scrollIntoView().click();
}

const measuredRows = (runUrl: string | null) =>
  singleTurnRows(runUrl).map((row, index) => ({
    ...row,
    metrics: {
      ...row.metrics,
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 450 + index * 10,
      p75_power_w: (runUrl ? 550 : 500) + index * 10,
      joules_per_output_token: (runUrl ? 3 : 2) + index,
    },
  }));

const boundaryRows = (runUrl: string | null) =>
  measuredRows(runUrl).map((row, index) => ({
    ...row,
    metrics: {
      ...row.metrics,
      avg_power_w: [900, 200, 700, 650][index] + (runUrl ? 50 : 0),
      joules_per_output_token: [2, 4.5, 4, 5][index] + (runUrl ? 1 : 0),
    },
  }));

function interceptMeasuredComparison(
  official: object[] = measuredRows(null),
  overlay: object[] = measuredRows(OVERLAY_RUN_URL),
) {
  cy.intercept('GET', '/api/v1/availability', { body: official.slice(0, 1) });
  cy.intercept('GET', '/api/v1/benchmarks*', { body: official });
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [] },
  });
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        {
          id: OVERLAY_RUN_ID,
          name: 'measured-comparison',
          branch: 'measured-comparison',
          sha: 'abc000',
          createdAt: `${SINGLE_TURN_DATE}T00:00:00Z`,
          url: OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      benchmarks: overlay,
      evaluations: [],
    },
  }).as('measuredOverlay');
}

function assertMeasuredValues(selector: string, expected: number[]) {
  cy.get<SVGElement & { __data__: { y: number } }>(
    `[data-testid="inference-chart-display"] svg ${selector}`,
  ).should(($points) => {
    expect(Array.from($points, (point) => point.__data__.y).sort((a, b) => a - b)).to.deep.equal(
      expected,
    );
  });
}

function assertVisibleMeasuredValues(selector: string, expected: number[]) {
  cy.get<SVGElement & { __data__: { y: number } }>(
    `[data-testid="inference-chart-display"] svg ${selector}`,
  ).should(($points) => {
    const values = [...$points]
      .filter((point) => getComputedStyle(point).opacity === '1')
      .map((point) => point.__data__.y)
      .sort((a, b) => a - b);
    expect(values).to.deep.equal(expected);
  });
}

describe('Inference Chart', () => {
  before(() => {
    cy.intercept('GET', '/api/v1/availability').as('chartAvailability');
    cy.intercept('GET', '/api/v1/benchmarks*').as('chartBenchmarks');
    cy.viewport(1440, 900);
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.wait(['@chartAvailability', '@chartBenchmarks']);
  });

  it('hides the logo watermark when the unofficial-domain notice is shown', () => {
    cy.contains('This deployment is not hosted at').should('be.visible');
    cy.get('[data-testid="inference-chart-display"] pattern[id^="logo-pattern-"]').should(
      'not.exist',
    );
  });

  it('leads the chart heading with the model and workload, without the cost tier', () => {
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', 'Total Tokens per $1 TCO vs.')
      .and('contain.text', 'Interactivity')
      .and('not.contain.text', '(Owning');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .invoke('text')
      .then((heading) => {
        cy.get('[data-testid="model-selector"]')
          .invoke('text')
          .then((model) => {
            expect(heading.trim().startsWith(model.trim())).to.equal(true);
          });
      });

    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="result-context"]')
      .should('contain.text', 'Cost Tier: Owning at Large Hyperscaler Volume')
      .and('contain.text', 'Updated:')
      .and('contain.text', 'SemiAnalysis InferenceX')
      .and('not.contain.text', 'Model:')
      .and('not.contain.text', 'Workload:')
      .and('not.contain.text', 'Precision:')
      .and('not.contain.text', 'Metric:');
  });

  it('plots OpenRouter-priced token revenue for official and unofficial runs', () => {
    cy.intercept('GET', 'https://openrouter.ai/api/v1/models', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 'deepseek/deepseek-v4-pro-0813',
            pricing: {
              prompt: '0.000001122',
              input_cache_read: '0.00000008',
              completion: '0.000003366',
            },
          },
        ],
      },
    }).as('openRouterPricing');
    interceptOverlayRun();
    cy.visit(
      `/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tokenRevenuePerGpuHour&i_revenue=openrouter`,
      {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          unlockAgenticGate(win);
        },
      },
    );
    cy.wait('@unofficialRun');
    cy.wait('@openRouterPricing');

    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Token Revenue per GPU Hour',
    );
    cy.get('[data-testid="token-revenue-price-source"]').should(
      'contain.text',
      'OpenRouter current pricing',
    );
    cy.get('[data-testid="openrouter-price-summary"]')
      .should('contain.text', 'Uncached input $1.122/M tok')
      .and('contain.text', 'Cached input $0.08/M tok')
      .and('contain.text', 'Output $3.366/M tok');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="token-revenue-subtitle-prices"]')
      .should('have.text', 'Uncached $1.122/M tok · Cached $0.08/M tok · Output $3.366/M tok')
      .closest('[data-testid="result-context"]')
      .should('contain.text', 'Cost basis:')
      .and('contain.text', 'Updated:');
    cy.get('[data-testid="openrouter-pricing-link"]').should(
      'have.attr',
      'href',
      'https://openrouter.ai/deepseek/deepseek-v4-pro-0813',
    );
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', 'Token Revenue per GPU Hour at OpenRouter Pricing');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
      'have.length.greaterThan',
      0,
    );
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length.greaterThan',
      0,
    );
    openYAxisHelp('y_tokenRevenuePerGpuHour');
    cy.get('[data-testid="option-help-content-y_tokenRevenuePerGpuHour"]')
      .should('contain.text', 'OpenRouter')
      .and('contain.text', 'Agentic cache hit combines GPU and external cache')
      .and('contain.text', 'A partially measured cache frontier receives no cache discount.')
      .and('contain.text', '$/GPU/hr =')
      .and(($body) => {
        expect($body.text()).not.to.include('—');
      });
  });

  it('plots infrastructure total tokens per dollar for official and unofficial runs', () => {
    interceptOverlayRun();
    cy.visit(
      `/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tokensPerDollarH`,
      {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          unlockAgenticGate(win);
        },
      },
    );
    cy.wait('@unofficialRun');

    cy.get('[data-testid="yaxis-metric-selector"]')
      .should('contain.text', 'Total Tokens per $1 TCO')
      .and('not.contain.text', '(Owning');
    cy.get('[data-testid="inference-chart-configuration"]')
      .find('[data-testid="cost-tier-selector"]')
      .should('not.exist');
    cy.get('[data-testid="token-revenue-price-source"]').should('not.exist');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', 'Total Tokens per $1 TCO')
      .and('not.contain.text', '(Owning');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="result-context-cost-tier"]')
      .should('contain.text', 'Owning at Large Hyperscaler Volume')
      .find('[data-testid="cost-tier-selector"]')
      .should('be.visible');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
      'have.length.greaterThan',
      0,
    );
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length.greaterThan',
      0,
    );
    openYAxisHelp('y_tokensPerDollarH');
    cy.get('[data-testid="option-help-content-y_tokensPerDollarH"]')
      .should('contain.text', 'infrastructure spend')
      .and('contain.text', 'large hyperscaler purchasing volume')
      .and('contain.text', 'all-in cost per chip-hour');
  });

  it('ships OpenRouter-priced token revenue in Chinese', () => {
    cy.viewport(390, 844);
    cy.intercept('GET', 'https://openrouter.ai/api/v1/models', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 'deepseek/deepseek-v4-pro-0813',
            pricing: {
              prompt: '0.000001122',
              input_cache_read: '0.00000008',
              completion: '0.000003366',
            },
          },
        ],
      },
    }).as('openRouterPricingZh');
    interceptOverlayRun();
    cy.visit(
      `/zh/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tokenRevenuePerGpuHour&i_revenue=openrouter`,
      { onBeforeLoad: unlockAgenticGate },
    );
    cy.wait('@unofficialRun');
    cy.wait('@openRouterPricingZh');
    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      '每 GPU 小时 token 收入',
    );
    cy.get('[data-testid="token-revenue-price-source"]').should(
      'contain.text',
      'OpenRouter 当前价格',
    );
    cy.get('[data-testid="openrouter-price-summary"]')
      .should('contain.text', '未缓存输入 $1.122/百万 token')
      .and('contain.text', '缓存输入 $0.08/百万 token')
      .and('contain.text', '输出 $3.366/百万 token');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="token-revenue-subtitle-prices"]')
      .should(
        'have.text',
        '未缓存 $1.122/百万 token · 缓存 $0.08/百万 token · 输出 $3.366/百万 token',
      )
      .closest('[data-testid="result-context"]')
      .should('contain.text', '成本口径:')
      .and('contain.text', '更新时间:');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', '按 OpenRouter 价格计算的每 GPU 小时 token 收入');
    openYAxisHelp('y_tokenRevenuePerGpuHour');
    cy.get('[data-testid="option-help-content-y_tokenRevenuePerGpuHour"]')
      .should(
        'contain.text',
        '已报告 external cache 时，Agentic 缓存命中率由 GPU 与 external cache 相加',
      )
      .and('contain.text', '缓存指标仅覆盖部分 frontier 数据点时，不应用缓存折扣。')
      .and(($body) => {
        expect($body.text()).not.to.include('—');
      });
  });

  it('ships infrastructure total tokens per dollar in Chinese', () => {
    cy.viewport(390, 844);
    interceptOverlayRun();
    cy.visit(
      `/zh/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tokensPerDollarH`,
      { onBeforeLoad: unlockAgenticGate },
    );
    cy.wait('@unofficialRun');

    cy.get('[data-testid="yaxis-metric-selector"]')
      .should('contain.text', '每 1 美元 TCO 对应的总 token 数')
      .and('not.contain.text', '（自有');
    cy.get('[data-testid="inference-chart-configuration"]')
      .find('[data-testid="cost-tier-selector"]')
      .should('not.exist');
    cy.get('[data-testid="token-revenue-price-source"]').should('not.exist');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', '每 1 美元 TCO 对应的总 token 数')
      .and('not.contain.text', '（自有');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="result-context-cost-tier"]')
      .should('contain.text', '自有 · 超大规模云厂商批量采购')
      .find('[data-testid="cost-tier-selector"]')
      .should('be.visible');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length.greaterThan',
      0,
    );
    openYAxisHelp('y_tokensPerDollarH');
    cy.get('[data-testid="option-help-content-y_tokensPerDollarH"]')
      .should('contain.text', '基础设施开支')
      .and('contain.text', '超大规模云厂商大批量采购价')
      .and('contain.text', '每芯片小时全包成本');
  });

  it('surfaces the error instead of an endless skeleton when availability fails', () => {
    cy.intercept('GET', '/api/v1/availability*', { statusCode: 500, body: {} }).as(
      'availabilityFailure',
    );
    cy.visit('/inference');
    cy.wait('@availabilityFailure');
    cy.contains('h2', 'Something went wrong!').should('be.visible');
  });
});

describe('Inference Chart — Simplified Chinese mobile path', () => {
  beforeEach(() => {
    cy.viewport(375, 900);
    cy.visit('/zh/inference?g_model=DeepSeek-R1-0528', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('be.visible');
  });

  it('keeps chart controls reachable and localizes the complete table click path', () => {
    cy.contains('h2', '推理性能').should('be.visible');
    cy.get('[data-testid="inference-secondary-controls"] > button').click();
    cy.get('label[for="x-axis-mode-select"]').should('have.text', 'X 轴指标');
    cy.get('[data-testid="x-axis-mode-selector"]').click();
    cy.get('[data-testid="x-axis-mode-e2e"]').should('have.text', '端到端延迟').click();
    cy.get('[data-testid="x-axis-mode-selector"]')
      .should('contain.text', '端到端延迟')
      .and('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', '端到端延迟');
    cy.get('[data-testid="share-button"]')
      .should('be.visible')
      .and('have.attr', 'title', '分享当前视图');
    cy.get('[data-testid="inference-view-toggle-0"]').should('be.visible').contains('表格').click();
    cy.get('[data-testid="inference-results-table"]')
      .should('contain.text', '芯片')
      .and('contain.text', '精度')
      .and('contain.text', '精度');
    cy.get('[data-testid="data-table-preset-all"]').click();
    cy.get('[data-testid="inference-results-table"]').should('contain.text', '并发数');
    cy.get('[data-testid="export-button"]')
      .should('be.visible')
      .and('have.attr', 'aria-label', '下载图表');
    expectNoPageOverflow();
  });

  it('localizes architecture and changelog overlays without changing technical model data', () => {
    cy.viewport(1440, 900);
    cy.get('[data-testid="model-architecture-link"]')
      .should('have.attr', 'aria-label')
      .and('match', /^了解 .*DeepSeek.*模型架构$/u);
    cy.get('[data-testid="model-architecture-link"]')
      .should('have.attr', 'href')
      .and('match', /^\/zh\/model\//u);
    cy.contains('button', '变更日志').should('be.visible').click();
    cy.contains('说明').should('be.visible');
  });
});

describe('AgentX replaces a complete curve while preserving an unofficial comparison', () => {
  it('shows only the six new disagg points and keeps the overlay independently dismissible', () => {
    const runId = '34413290524';
    const runUrl = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`;
    const date = '2026-09-11';
    const current = b300Rows(runUrl, 'gb300', [
      [1, 130, 2600, 25],
      [20, 100, 5000, 30],
      [30, 80, 7500, 40],
      [60, 60, 10000, 50],
      [227, 30, 15000, 80],
      [260, 20, 18000, 100],
    ]).map((row, i) => ({
      ...row,
      id: 441595 + i,
      model: 'glm5.2',
      framework: 'dynamo-trt',
      disagg: true,
      spec_method: 'mtp',
      prefill_tp: 4,
      num_prefill_gpu: 4,
      date,
      workflow_run_id: 2437,
      run_started_at: `${date}T17:00:36Z`,
    }));
    const old = {
      ...current[0],
      id: 440948,
      disagg: false,
      prefill_tp: 8,
      num_prefill_gpu: 8,
      offload_mode: 'off',
      date: '2026-09-01',
      workflow_run_id: 2396,
      run_started_at: '2026-09-01T21:32:27Z',
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33219706372/attempts/2',
    };
    cy.intercept('GET', '/api/v1/availability', { body: current.slice(0, 1) });
    cy.intercept('GET', '/api/v1/benchmarks*', { body: [old, ...current] });
    cy.intercept('GET', '/api/v1/workflow-info*', {
      body: { runs: [], changelogs: [], configs: [] },
    });
    cy.intercept('GET', '/api/unofficial-run*', {
      body: {
        runInfos: [
          {
            id: runId,
            name: 'disagg-replacement',
            branch: 'disagg-replacement',
            sha: 'abc000',
            createdAt: `${date}T17:00:36Z`,
            url: runUrl,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        benchmarks: current.map((row) => ({ ...row, id: 0 })),
        evaluations: [],
      },
    }).as('replacementOverlay');
    interceptDerivedAgenticMetrics();
    cy.viewport(1440, 900);
    cy.visit(
      `/inference?g_model=GLM-5.2&unofficialrun=${runId}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tpPerGpu`,
      {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          unlockAgenticGate(win);
        },
      },
    );
    cy.wait('@replacementOverlay');
    selectXAxisMode('interactivity');
    cy.get('#scatter-hide-non-optimal').then(($toggle) => {
      if ($toggle.attr('data-state') === 'checked') cy.wrap($toggle).click();
    });
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should('have.length', 6);
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      6,
    );
    cy.get('[aria-label="Dismiss disagg-replacement"]').click();
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'not.exist',
    );
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should('have.length', 6);
  });
});

it('hydrates a direct PowerX metric link', () => {
  cy.intercept('GET', '/api/v1/availability').as('powerLinkAvailability');
  cy.intercept('GET', '/api/v1/benchmarks*').as('powerLinkBenchmarks');
  cy.viewport(1440, 900);
  cy.visit('/inference/qwen-3-5?i_seq=8k%2F1k&i_prec=fp8&i_metric=y_measuredPowerPercentTdp', {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      unlockAgenticGate(win);
      cy.spy(win.console, 'error').as('powerLinkConsoleErrors');
    },
  });
  cy.wait(['@powerLinkAvailability', '@powerLinkBenchmarks']);
  cy.get('[data-testid="yaxis-metric-selector"]').should('contain', 'Measured Power');
  cy.get('[data-testid="measured-power-display"]').should('contain', 'TDP');
  cy.get('[data-testid="measured-power-statistic-average"]').should(
    'have.attr',
    'aria-pressed',
    'true',
  );
  cy.get('@powerLinkConsoleErrors').should('not.be.calledWithMatch', /hydrat/i);
});

it('replots measured settings for official and unofficial data and preserves overlay dismissal', () => {
  interceptMeasuredComparison();
  cy.viewport(1440, 900);
  cy.visit(
    `/inference?g_model=DeepSeek-V4-Pro&unofficialrun=${OVERLAY_RUN_ID}&i_seq=1k%2F1k&i_prec=fp4&i_metric=y_measuredAvgPower`,
    { onBeforeLoad: unlockAgenticGate },
  );
  cy.wait('@measuredOverlay');
  cy.get('#scatter-hide-non-optimal').then(($toggle) => {
    if ($toggle.attr('data-state') === 'checked') cy.wrap($toggle).click();
  });
  cy.get('[data-testid="measured-power-statistic-p75"]').click();
  cy.get('[data-testid="chart-figure"] h2').should('contain', 'Measured P75 Fleet Power per Chip');
  assertMeasuredValues('.dot-group', [500, 510, 520, 530]);
  assertMeasuredValues('.unofficial-overlay-pt', [550, 560, 570, 580]);
  cy.get('[data-testid="yaxis-metric-selector"]').click('right');
  cy.contains('[data-slot="select-item"]', /^Measured Energy$/u)
    .scrollIntoView()
    .click();
  cy.get('[data-testid="chart-figure"] h2').should('contain', 'Measured Joules per Output Token');
  assertMeasuredValues('.dot-group', [2, 3, 4, 5]);
  assertMeasuredValues('.unofficial-overlay-pt', [3, 4, 5, 6]);
  cy.get('[aria-label="Dismiss measured-comparison"]').click();
  cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should('not.exist');
  assertMeasuredValues('.dot-group', [2, 3, 4, 5]);
});

it('says when chosen chip configs report no measured power, and plots them on other metrics', () => {
  interceptMeasuredComparison(singleTurnRows(null), []);
  cy.viewport(1440, 900);
  cy.visit(
    '/inference?g_model=DeepSeek-V4-Pro&i_seq=1k%2F1k&i_prec=fp4&i_metric=y_measuredAvgPower&i_gpus=b300_sglang',
    { onBeforeLoad: unlockAgenticGate },
  );
  cy.get('[data-testid="gpu-multiselect"]').should('contain', 'B300 (SGLang)');
  cy.get('[data-testid="scatter-empty-state"]')
    .should('have.attr', 'data-reason', 'selection')
    .and('contain', 'No measured GPU power is reported for this selection.');
  cy.get('[data-testid="yaxis-metric-selector"]').click('right');
  cy.contains('[data-slot="select-item"]', /^Token Throughput per Chip/u)
    .scrollIntoView()
    .click();
  cy.get('[data-testid="scatter-empty-state"]').should('not.exist');
  cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
    'have.length.at.least',
    1,
  );
});

it('uses Optimal Only to filter power boundary dots without replacing official or overlay curves', () => {
  interceptMeasuredComparison(boundaryRows(null), boundaryRows(OVERLAY_RUN_URL));
  cy.viewport(1440, 900);
  cy.visit(
    `/inference?g_model=DeepSeek-V4-Pro&unofficialrun=${OVERLAY_RUN_ID}&i_seq=1k%2F1k&i_prec=fp4&i_metric=y_measuredAvgPower`,
    { onBeforeLoad: unlockAgenticGate },
  );
  cy.wait('@measuredOverlay');
  selectXAxisMode('interactivity');
  cy.get('#scatter-hide-non-optimal').then(($toggle) => {
    if ($toggle.attr('data-state') === 'unchecked') cy.wrap($toggle).click();
  });
  cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
  assertVisibleMeasuredValues('.dot-group', [650, 700, 900]);
  assertVisibleMeasuredValues('.unofficial-overlay-pt', [700, 750, 950]);

  const curves = '[data-testid="inference-chart-display"] .roofline-path, .overlay-roofline-path';
  cy.get(curves)
    .should('have.length', 2)
    .and(($curves) => {
      for (const curve of $curves) {
        expect(curve.dataset.curveKind).to.equal('power-envelope');
        expect(curve.getAttribute('d')).to.be.a('string');
        expect(curve.getAttribute('d')).not.to.equal('');
      }
    })
    .then(($curves) => {
      const geometry = Array.from($curves, (curve) => curve.getAttribute('d'));
      for (const optimalOnly of [false, true]) {
        cy.get('#scatter-hide-non-optimal').click();
        assertVisibleMeasuredValues(
          '.dot-group',
          optimalOnly ? [650, 700, 900] : [200, 650, 700, 900],
        );
        assertVisibleMeasuredValues(
          '.unofficial-overlay-pt',
          optimalOnly ? [700, 750, 950] : [250, 700, 750, 950],
        );
        cy.get(curves).should(($current) => {
          expect(Array.from($current, (curve) => curve.getAttribute('d'))).to.deep.equal(geometry);
          for (const curve of $current) {
            expect(curve.dataset.curveKind).to.equal('power-envelope');
          }
        });
      }
    });

  cy.get('[data-testid="yaxis-metric-selector"]').click('right');
  cy.contains('[data-slot="select-item"]', /^Measured Energy$/u)
    .scrollIntoView()
    .click();
  cy.get('[data-testid="chart-figure"] h2').should('contain', 'Measured Joules per Output Token');
  cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
  assertVisibleMeasuredValues('.dot-group', [2, 4, 5]);
  assertVisibleMeasuredValues('.unofficial-overlay-pt', [3, 5, 6]);
  cy.get(curves)
    .should('have.length', 2)
    .and(($curves) => {
      for (const curve of $curves) expect(curve.dataset.curveKind).to.equal('pareto');
    });
  cy.get('#scatter-hide-non-optimal').click();
  assertVisibleMeasuredValues('.dot-group', [2, 4, 4.5, 5]);
  assertVisibleMeasuredValues('.unofficial-overlay-pt', [3, 5, 5.5, 6]);
});

describe('VR publication data compatibility', () => {
  for (const locale of ['', '/zh']) {
    it(`renders September TRTLLM data and cache metrics under ${locale || '/en'}`, () => {
      interceptVrPublicationData();
      cy.visit(`${locale}/inference/deepseek-v4?i_metric=y_tpPerGpu`);
      cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
        const points = [...$dots].map(
          (node) =>
            (
              node as unknown as {
                __data__: {
                  id: number;
                  actualDate: string;
                  hwKey: string;
                  server_gpu_cache_hit_rate: number;
                  theoretical_cache_hit_rate: number;
                };
              }
            ).__data__,
        );
        const vr = points.filter((point) => point.hwKey.startsWith('vr200_'));
        expect(new Set(vr.map((point) => Number(point.id))).size).to.equal(4);
        for (const point of vr) {
          expect(point.actualDate).to.equal(VR_FIXTURE_DATE);
          expect(point.server_gpu_cache_hit_rate).to.equal(0.95);
          expect(point.theoretical_cache_hit_rate).to.equal(0.97);
        }
        expect(points.some((point) => point.hwKey.startsWith('gb300_'))).to.equal(true);
      });
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Vera Rubin NVL72');
      cy.get('[data-testid="vera-rubin-official-preview-notice"]')
        .should('contain.text', 'Vera Rubin NVL72')
        .and('not.contain.text', 'July');
    });
  }
});

function assertVrDate(expectedDate: string) {
  cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(($dots) => {
    const points = [...$dots].map(
      (node) =>
        (
          node as unknown as {
            __data__: {
              id: number;
              hwKey: string;
              actualDate: string;
              server_gpu_cache_hit_rate: number;
              physicalChips: number;
            };
          }
        ).__data__,
    );
    const vr = points.filter((point) => point.hwKey.startsWith('vr200_'));
    const latest = expectedDate === VR_LATEST_FIXTURE_DATE;
    expect(new Set(vr.map((point) => Number(point.id))).size).to.equal(4);
    for (const point of vr) {
      expect(point.actualDate).to.equal(expectedDate);
      expect(point.server_gpu_cache_hit_rate).to.equal(latest ? 0.9 : 0.95);
      expect(point.physicalChips).to.equal(latest ? 16 : 32);
      expect(Number(point.id)).to.be.within(latest ? 980200 : 980000, latest ? 980203 : 980003);
    }
    const gb = points.filter((point) => point.hwKey.startsWith('gb300_'));
    expect(gb.length).to.be.greaterThan(0);
    expect(gb.every((point) => point.actualDate === VR_LATEST_FIXTURE_DATE)).to.equal(true);
  });
}

describe('VR default date preference', () => {
  for (const locale of ['', '/zh']) {
    it(`defaults only VR to September 9 under ${locale || '/en'}`, () => {
      interceptVrPublicationData(true);
      cy.intercept({
        pathname: '/api/v1/benchmarks',
        query: { date: VR_FIXTURE_DATE, exact: 'true' },
      }).as('preferredSnapshot');
      cy.visit(`${locale}/inference/deepseek-v4?i_metric=y_tpPerGpu`);
      cy.wait('@preferredSnapshot');
      assertVrDate(VR_FIXTURE_DATE);
    });

    for (const query of [
      `g_rundate=${VR_LATEST_FIXTURE_DATE}`,
      `g_runid=${VR_LATEST_FIXTURE_RUN}`,
    ]) {
      it(`honors explicit ${query} under ${locale || '/en'}`, () => {
        interceptVrPublicationData(true);
        cy.visit(`${locale}/inference/deepseek-v4?i_metric=y_tpPerGpu&${query}`);
        assertVrDate(VR_LATEST_FIXTURE_DATE);
      });
    }
  }

  it('honors a manual selection of the latest date after opening the default', () => {
    interceptVrPublicationData(true);
    cy.visit('/inference/deepseek-v4?i_metric=y_tpPerGpu');
    assertVrDate(VR_FIXTURE_DATE);
    cy.contains('button', 'Run Date:').click();
    cy.get('[role="dialog"]').contains('button', 'Apply').click();
    assertVrDate(VR_LATEST_FIXTURE_DATE);
  });

  it('keeps the latest official snapshot beside an unofficial comparison', () => {
    interceptOverlayRun();
    interceptVrPublicationData(true);
    cy.visit(`/inference/deepseek-v4?i_metric=y_tpPerGpu&unofficialrun=${OVERLAY_RUN_ID}`);
    cy.wait('@unofficialRun');
    assertVrDate(VR_LATEST_FIXTURE_DATE);
  });

  it('falls back to the current curve when September 9 has not been imported', () => {
    interceptVrPublicationData(true);
    cy.intercept(
      { pathname: '/api/v1/benchmarks', query: { date: VR_FIXTURE_DATE, exact: 'true' } },
      { body: [] },
    );
    cy.visit('/inference/deepseek-v4?i_metric=y_tpPerGpu');
    assertVrDate(VR_LATEST_FIXTURE_DATE);
  });
});

const withTp4 = (rows: ReturnType<typeof boundaryRows>) => [
  ...rows,
  ...rows.map((row) => ({
    ...row,
    id: row.id + 10000,
    prefill_tp: 4,
    decode_tp: 4,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
  })),
];

const assertVisibleLoads = (expected: number[]) => {
  for (const selector of ['.dot-group', '.unofficial-overlay-pt']) {
    cy.get<SVGElement & { __data__: InferenceData }>(
      `[data-testid="inference-chart-display"] svg ${selector}`,
    ).should(($points) => {
      expect($points).to.have.length(expected.length);
      expect(
        [...$points].map((element) => element.__data__.conc).sort((a, b) => a - b),
      ).to.deep.equal(expected);
      for (const element of $points) expect(getComputedStyle(element).opacity).to.equal('1');
    });
  }
};

describe('Date comparison with unofficial runs', () => {
  it('keeps ?unofficialrun= overlays on the date comparison', () => {
    interceptMeasuredComparison();
    cy.viewport(1440, 900);
    cy.visit(
      `/inference?g_model=DeepSeek-V4-Pro&unofficialrun=${OVERLAY_RUN_ID}&i_seq=1k%2F1k&i_prec=fp4&i_metric=y_measuredAvgPower&i_gpus=b300_sglang&i_dstart=${SINGLE_TURN_DATE}&i_dend=${SINGLE_TURN_DATE}&i_optimal=0`,
      { onBeforeLoad: unlockAgenticGate },
    );
    cy.wait('@measuredOverlay');
    cy.get('[data-testid="gpu-graph"]').should('exist');
    cy.get('[data-testid="scatter-graph"]').should('not.exist');
    assertMeasuredValues('.dot-group', [450, 460, 470, 480]);
    assertMeasuredValues('.unofficial-overlay-pt', [450, 460, 470, 480]);
    cy.get('[aria-label="Dismiss measured-comparison"]').click();
    cy.get('[data-testid="gpu-graph"] .unofficial-overlay-pt').should('not.exist');
    assertMeasuredValues('.dot-group', [450, 460, 470, 480]);
  });
});

describe('Exact topology quick filter', () => {
  it('applies the exact-topology filter to official and ?unofficialrun= overlay loads', () => {
    const officialRun = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/800001';
    const officialBase = boundaryRows(null).map((row) => ({ ...row, run_url: officialRun }));
    const overlayBase = boundaryRows(OVERLAY_RUN_URL);
    interceptMeasuredComparison(withTp4(officialBase), withTp4(overlayBase));
    cy.viewport(1440, 900);
    cy.visit(
      `/inference?g_model=DeepSeek-V4-Pro&unofficialrun=${OVERLAY_RUN_ID}&i_seq=1k%2F1k&i_prec=fp4&i_metric=y_measuredAvgPower&i_optimal=0&i_best=0`,
      { onBeforeLoad: unlockAgenticGate },
    );
    cy.wait('@measuredOverlay');
    assertVisibleLoads([1, 1, 2, 2, 8, 8, 48, 48]);
    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.contains('[data-testid="quick-filter-topology-options"] button', /GPU=?4.*TP=?4/u).click();
    cy.get('body').type('{esc}');
    cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');
    assertVisibleLoads([1, 2, 8, 48]);
  });
});

describe('Staged Pareto deep links', () => {
  it('renders only the requested run line when that run is also selected as the latest run', () => {
    const runId = '9100001';
    const runUrl = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`;
    const stagedRows = b300Rows(runUrl).map((row, index) => ({
      ...row,
      id: 980000 + index,
      workflow_run_id: 42,
    }));
    const otherRows = b300Rows(null, 'b200');
    cy.intercept('GET', '/api/v1/availability*', { body: [stagedRows[0], otherRows[0]] });
    cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
      if (request.query['exactRun'] === 'true' && request.query['runId'] === runId) {
        request.alias = 'stagedSnapshot';
        request.reply({ body: stagedRows });
      } else {
        request.reply({ body: [...otherRows, ...stagedRows] });
      }
    });
    cy.intercept('GET', '/api/v1/workflow-info*', {
      body: {
        runs: [
          {
            github_run_id: Number(runId),
            run_attempt: 1,
            name: 'Staged sweep',
            conclusion: 'success',
            html_url: runUrl,
            created_at: `${stagedRows[0]!.date}T12:00:00Z`,
            date: stagedRows[0]!.date,
          },
        ],
        changelogs: [],
        configs: [],
        runConfigs: [],
      },
    });
    cy.intercept('GET', '/api/v1/trace-availability*', { body: {} });
    cy.intercept('GET', '/api/v1/log-availability*', { body: {} });
    const [link] = buildStagedChartLinks('http://localhost:3000', runId, [stagedRows[0]!]);
    const url = new URL(link!.url);
    cy.visit(`${url.pathname}${url.search}`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.wait('@stagedSnapshot');
    cy.get('[data-testid="gpu-graph"]')
      .first()
      .find('svg .dot-group')
      .should(($points) => {
        expect($points.length).to.be.greaterThan(0);
        for (const element of $points) {
          const point = (
            element as unknown as { __data__: { date: string; hwKey: string; run_url: string } }
          ).__data__;
          expect(point.date).to.equal(`${stagedRows[0]!.date}~r${runId}`);
          expect(point.hwKey).to.equal('b300_sglang');
          expect(point.run_url).to.equal(runUrl);
        }
      });
    cy.get('[data-testid="gpu-graph"]').first().find('.roofline-path').should('have.length', 1);
  });
});

function expectGpuSelection(gpus: string[], checked: boolean) {
  for (const gpu of gpus) {
    cy.get(`[data-testid="chart-legend"] input[id^="checkbox-${gpu}_"]`)
      .should('have.length.at.least', 1)
      .each(($input) => cy.wrap($input).should(checked ? 'be.checked' : 'not.be.checked'));
  }
}

describe('Qwen3.5 chart defaults', () => {
  const olderGpus = ['mi300x', 'mi325x', 'h100', 'h200'];
  const newerGpus = ['mi355x', 'b200'];
  const baseRow = singleTurnRows(null)[0];
  const rows = ['qwen3.5', 'dsr1'].flatMap((model, modelIndex) =>
    [...olderGpus, ...newerGpus].flatMap((hardware, gpuIndex) =>
      [16, 32, 64].map((conc, pointIndex) => ({
        ...baseRow,
        id: 900_000 + modelIndex * 100 + gpuIndex * 10 + pointIndex,
        model,
        hardware,
        framework: 'sglang',
        precision: 'fp8',
        isl: 8192,
        osl: 1024,
        conc,
        spec_method: 'none',
        disagg: false,
        is_multinode: false,
        benchmark_type: 'single_turn',
        offload_mode: 'off',
        metrics: {
          ...baseRow.metrics,
          median_e2el: 10 + pointIndex * 10,
          median_intvty: 100 / (pointIndex + 1),
          tput_per_gpu: 100 * (pointIndex + 1),
          output_tput_per_gpu: 100 * (pointIndex + 1),
        },
      })),
    ),
  );

  beforeEach(() => {
    cy.intercept('GET', '/api/v1/availability*', {
      body: rows.map(({ metrics: _metrics, ...row }) => row),
    });
    cy.intercept('GET', '/api/v1/benchmarks*', { body: rows });
    cy.intercept('GET', '/api/v1/trace-availability*', { body: {} });
    cy.intercept('GET', '/api/v1/workflow-info*', {
      body: { runs: [], changelogs: [], configs: [], runConfigs: [] },
    });
    cy.viewport(1440, 1000);
  });

  it('uses E2EL and newer GPUs, while preserving explicit hardware and axis in shared links', () => {
    cy.visit('/inference/qwen-3-5?i_prec=fp8', { onBeforeLoad: unlockAgenticGate });
    cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'e2e');
    expectGpuSelection(olderGpus, false);
    expectGpuSelection(newerGpus, true);

    cy.get('[data-testid="chart-legend"] label[for^="checkbox-h200_"]').first().click();
    expectGpuSelection(['h200'], true);
    selectXAxisMode('interactivity');
    cy.get('[data-testid="share-button"]').first().click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .should('include', 'i_xmode=interactivity')
      .and('include', 'i_active=')
      .then((value) => {
        const shared = new URL(String(value));
        cy.visit(shared.pathname + shared.search, { onBeforeLoad: unlockAgenticGate });
      });
    cy.get('[data-testid="x-axis-mode-selector"]').should(
      'have.attr',
      'data-value',
      'interactivity',
    );
    expectGpuSelection(['h200'], true);
    expectGpuSelection(['mi300x', 'mi325x', 'h100'], false);
  });

  it('keeps the other model defaults and resets hardware when switching to Qwen', () => {
    cy.visit('/inference?g_model=DeepSeek-R1-0528&i_prec=fp8', {
      onBeforeLoad: unlockAgenticGate,
    });
    cy.get('[data-testid="x-axis-mode-selector"]').should(
      'have.attr',
      'data-value',
      'interactivity',
    );
    expectGpuSelection([...olderGpus, ...newerGpus], true);
    cy.get('[data-testid="model-selector"]').click();
    cy.contains('[data-slot="select-item"]', 'Qwen3.5 397B').click();
    cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'e2e');
    expectGpuSelection(olderGpus, false);
    expectGpuSelection(newerGpus, true);
  });

  for (const axisSource of ['URL', 'manual']) {
    it(`switches to E2EL when entering Qwen after a ${axisSource} axis selection`, () => {
      const axisParam = axisSource === 'URL' ? '&i_xmode=ttft' : '';
      cy.visit(`/inference?g_model=DeepSeek-R1-0528&i_prec=fp8${axisParam}`, {
        onBeforeLoad: unlockAgenticGate,
      });
      if (axisSource === 'manual') selectXAxisMode('ttft');
      cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'ttft');
      cy.scrollTo('top');
      cy.get('[data-testid="model-selector"]').click().should('have.attr', 'aria-expanded', 'true');
      cy.contains('[data-slot="select-item"]', 'Qwen3.5 397B').click();
      cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'e2e');
      expectGpuSelection(olderGpus, false);
      expectGpuSelection(newerGpus, true);
    });
  }

  for (const { chart, path, expectedAxis } of [
    { chart: 'Qwen inference', path: '/inference/qwen-3-5', expectedAxis: 'e2e' },
    { chart: 'another model', path: '/inference?g_model=DeepSeek-R1-0528', expectedAxis: 'ttft' },
    { chart: 'Qwen comparison', path: '/compare/qwen-3-5-b200-vs-h200', expectedAxis: 'ttft' },
  ]) {
    it(`applies the correct axis when adding and removing precisions on ${chart}`, () => {
      const precisionRows = rows.flatMap((row) => [
        row,
        { ...row, id: row.id + 1000, precision: 'fp4' },
      ]);
      cy.intercept('GET', '/api/v1/availability*', {
        body: precisionRows.map(({ metrics: _metrics, ...row }) => row),
      });
      cy.intercept('GET', '/api/v1/benchmarks*', { body: precisionRows });
      cy.visit(`${path}${path.includes('?') ? '&' : '?'}i_prec=fp8&i_xmode=ttft`, {
        onBeforeLoad: unlockAgenticGate,
      });
      cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'ttft');
      cy.scrollTo('top');
      cy.get('[data-testid="precision-multiselect"]').should('not.be.disabled').click('right');
      cy.contains('[role="option"]', 'FP4').click();
      cy.get('body').type('{esc}');
      cy.get('[data-testid="precision-multiselect"]')
        .should('contain.text', 'FP4')
        .and('contain.text', 'FP8');
      cy.get('[data-testid="x-axis-mode-selector"]').should(
        'have.attr',
        'data-value',
        expectedAxis,
      );

      selectXAxisMode('ttft');
      cy.scrollTo('top');
      cy.get('[data-testid="precision-multiselect"]').click('right');
      cy.contains('[role="option"]', 'FP8').click();
      cy.get('body').type('{esc}');
      cy.get('[data-testid="precision-multiselect"]')
        .should('contain.text', 'FP4')
        .and('not.contain.text', 'FP8');
      cy.get('[data-testid="x-axis-mode-selector"]').should(
        'have.attr',
        'data-value',
        expectedAxis,
      );
    });
  }

  it('does not count the default E2EL axis as a changed control on mobile', () => {
    cy.viewport(375, 900);
    cy.visit('/inference/qwen-3-5?i_prec=fp8', { onBeforeLoad: unlockAgenticGate });
    cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'e2e');
    cy.contains('button', 'More chart controls').should('not.contain.text', 'changed');
    expectGpuSelection(olderGpus, false);
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(375);
    });
  });

  it('uses the comparison view default for the mobile changed-control indicator', () => {
    cy.viewport(375, 900);
    cy.visit('/compare/qwen-3-5-b200-vs-h200?i_prec=fp8', {
      onBeforeLoad: unlockAgenticGate,
    });
    cy.get('[data-testid="x-axis-mode-selector"]').should(
      'have.attr',
      'data-value',
      'interactivity',
    );
    cy.contains('button', 'More chart controls').should('not.contain.text', 'changed');
  });
});
