import { vrPublicationRows } from '../support/vr-publication-fixtures';
import { assertTpuGb300Selected, interceptTpuLaunchData } from '../support/tpu-launch-fixtures';

const minimaxM3RubinRows = vrPublicationRows.map((row) => ({ ...row, model: 'minimaxm3' }));

function interceptMinimaxM3RubinData(rows: typeof minimaxM3RubinRows = minimaxM3RubinRows): void {
  cy.fixture('api/availability.json').then((availability) => {
    cy.intercept('GET', '/api/v1/availability*', {
      body: [
        ...availability.filter((row: { model: string }) => row.model !== 'minimaxm3'),
        ...rows.map(({ metrics: _metrics, ...row }) => row),
      ],
    });
  });
  cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
    if (String(request.query.model).includes('MiniMax-M3')) {
      request.reply({ body: rows });
    }
  });
}

const TARGET = '/inference/kimi-k3';

describe('Muse Spark Open results', () => {
  beforeEach(() => {
    cy.fixture('api/muse-spark-unofficial-run.json').then((body) => {
      cy.intercept('GET', '/api/unofficial-run*', { body }).as('museRun');
    });
  });
  for (const prefix of ['', '/zh']) {
    it(`opens the canonical Muse dashboard from ${prefix || '/'} with the mascot`, () => {
      cy.visit(prefix || '/');
      cy.get('[data-testid="compare-agentx-model-muse-spark-open"]')
        .should('contain.text', prefix ? '查看结果' : 'View results')
        .and('not.contain.text', prefix ? '预览' : 'Preview')
        .find('img')
        .should('have.attr', 'src', '/logos/muse-mascot.webp');
      cy.get('[data-testid="compare-agentx-model-muse-spark-open"]').should(
        'have.attr',
        'href',
        `${prefix}/inference/muse-spark-open`,
      );
      cy.get('[data-testid="compare-agentx-model-muse-spark-open"]').click();
      cy.location('pathname', { timeout: 30000 }).should(
        'eq',
        `${prefix}/inference/muse-spark-open`,
      );
      cy.location('search').should('eq', '');
      cy.get('[data-testid="model-selector"]').should(($selector) => {
        expect(['Muse Spark Open 816B', 'Muse-Spark-Open']).to.include($selector.text().trim());
      });
      cy.get('[data-testid="scenario-selector"]')
        .should('contain.text', prefix ? '智能体' : 'Agentic')
        .and('be.disabled');
      cy.get('[data-slot="unofficial-banner"]').should('not.exist');
      cy.get('@museRun.all').should('have.length', 0);
    });

    it(`still opens an explicitly requested Muse unofficial run under ${prefix || '/'}`, () => {
      cy.visit(`${prefix}/inference/muse-spark-open?unofficialRun=38825822770`);
      cy.wait('@museRun');
      cy.location('search').should('match', /unofficialruns?=38825822770/iu);
      cy.get('[data-testid="model-selector"]')
        .should('contain.text', 'Muse Spark Open 816B')
        .find('img')
        .should('have.attr', 'src', '/logos/muse-mascot.webp');
      cy.get('[data-testid="scatter-graph"] .unofficial-overlay-pt').should(
        'have.length.greaterThan',
        0,
      );
      cy.get('[data-slot="unofficial-banner"]').should('be.visible');
    });
  }
});

interface HistoryWrite {
  kind: 'push' | 'replace';
  pathname: string;
}

const TPU_RESULTS_HREF =
  '/inference/qwen-3-5?g_model=Qwen-3.5-397B-A17B&i_xmode=interactivity&i_seq=agentic-traces&i_prec=fp8';
const TPU_KIMI_RESULTS_HREF = '/inference/kimi-k3';

function assertTpuView() {
  cy.get('[data-testid="model-selector"]').should('contain.text', 'Qwen3.5 397B');
  cy.get('[data-testid="scenario-selector"]')
    .invoke('text')
    .should('match', /Agentic|智能体/u);
  cy.get('[data-testid="precision-multiselect"]')
    .should('contain.text', 'FP8')
    .and('not.contain.text', 'FP4');
  cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'interactivity');
  cy.location('search').should('contain', 'i_prec=fp8');
  cy.location('search').should('not.contain', 'i_spec=');
  assertTpuGb300Selected();
}

function assertKimiTpuView() {
  cy.get('[data-testid="model-selector"]').should('contain.text', 'Kimi K3');
  cy.get('[data-testid="scenario-selector"]')
    .invoke('text')
    .should('match', /Agentic|智能体/u);
  cy.location('search').should('eq', '');
}

describe('landing model curation', () => {
  for (const prefix of ['', '/zh']) {
    it(`shows the curated ledger on ${prefix || '/'} without changing compare coverage`, () => {
      cy.visit(prefix || '/');
      cy.get('[data-testid="compare-agentx-primary"]').within(() => {
        cy.get('[data-testid^="compare-agentx-model-"]').should(($links) => {
          expect([...$links].map((link) => link.getAttribute('href'))).to.deep.eq(
            ['muse-spark-open', 'deepseek-v41-flash'].map((slug) => `${prefix}/inference/${slug}`),
          );
        });
        cy.get('[data-testid="compare-agentx-model-muse-spark-open"]')
          .should('contain.text', 'Muse Spark Open 816B')
          .and('contain.text', prefix ? '查看结果' : 'View results')
          .and('not.contain.text', prefix ? '结果待发布' : 'Results pending')
          .find('img')
          .should('have.attr', 'src', '/logos/muse-mascot.webp');
        cy.get('[data-testid="compare-agentx-model-kimi-k3"]').should('not.exist');
        cy.get('[data-testid="compare-agentx-model-glm-5-3"]').should('not.exist');
        cy.get('[data-testid="compare-agentx-model-deepseek-v4"]').should('not.exist');
        cy.get('[data-testid="compare-agentx-model-qwen-3-8-flash-next"]').should('not.exist');
        cy.get('[data-testid="compare-agentx-model-qwen-3-5"]').should('not.exist');
        cy.get('[data-testid="compare-agentx-model-minimax-m3"]').should('not.exist');
        cy.get('[data-testid="landing-huawei-results-link"]')
          .should('match', ':first-child')
          .and('have.attr', 'href', `${prefix}/operatorx`)
          .next()
          .should('have.attr', 'data-testid', 'landing-tpu-kimi-k3-results-link')
          .parent()
          .next('nav')
          .find('[data-testid^="compare-agentx-model-"]')
          .first()
          .should('have.attr', 'data-testid', 'compare-agentx-model-muse-spark-open');
        cy.get('[data-testid="landing-minimax-m31-flash-results-link"]')
          .should('contain.text', 'MiniMax M3.1 Flash')
          .and('contain.text', 'AgentX')
          .and('have.attr', 'href', `${prefix}/inference/minimax-m31-flash`);
        cy.get('[data-new-badge="landing-minimax-m31-flash"]')
          .should('contain.text', prefix ? '新' : 'NEW')
          .and('have.class', 'new-badge-flash');
        cy.get('[data-testid="landing-minimax-m31-flash-minimax-logo"]').should(
          'have.attr',
          'src',
          '/logos/minimax-color.svg',
        );
        cy.get('[data-testid="landing-tpu-kimi-k3-results-link"]')
          .should('have.attr', 'href', `${prefix}${TPU_KIMI_RESULTS_HREF}`)
          .and('contain.text', prefix ? 'TPU Kimi K3 提交结果' : 'TPU Kimi K3 Submission')
          .and('contain.text', prefix ? '2.8 万亿参数 AgentX' : '2.8 Trillion parameters AgentX');
        cy.get('[data-testid="landing-tpu-kimi-k3-google-logo"] path').should('have.length', 4);
        cy.get('[data-new-badge="landing-tpu-kimi-k3"]')
          .should('contain.text', prefix ? '新' : 'NEW')
          .and('have.class', 'new-badge-flash');
        cy.get('[data-testid="landing-tpu-kimi-k3-results-link"]')
          .next()
          .should('have.attr', 'data-testid', 'landing-rubin-glm-5-3-results-link')
          .and('have.attr', 'href', `${prefix}/inference/glm-5-3`)
          .and(
            'contain.text',
            prefix ? 'Vera Rubin NVL72 GLM 5.3 提交结果' : 'Vera Rubin NVL72 GLM 5.3 Submission',
          )
          .and('contain.text', prefix ? '7440 亿参数 AgentX' : '744 Billion parameters AgentX');
        cy.get('[data-testid="landing-rubin-glm-5-3-nvidia-logo"] path').should(
          'have.attr',
          'fill',
          '#76B900',
        );
        cy.get('[data-testid="landing-rubin-results-link"]').should('not.exist');
        cy.get('[data-testid="landing-rubin-glm-5-3-results-link"]')
          .next()
          .should('have.attr', 'data-testid', 'landing-jalapeno-results-link')
          .and(
            'have.attr',
            'href',
            `${prefix}/inference/deepseek-r1?i_seq=8k%2F1k&i_prec=fp4&i_xmode=e2e`,
          )
          .and('contain.text', 'OpenAI Jalapeño')
          .and('contain.text', 'DeepSeek R1');
        cy.get('[data-testid="landing-jalapeno-openai-logo"] path').should(
          'have.attr',
          'fill',
          'currentColor',
        );
        cy.get('[data-testid="landing-jalapeno-results-link"]')
          .next()
          .should('have.attr', 'data-testid', 'landing-minimax-m31-flash-results-link');
        cy.get('[data-testid="landing-minimax-m31-flash-results-link"]')
          .parent()
          .next('nav')
          .find('[data-testid^="compare-agentx-model-"]')
          .first()
          .should('have.attr', 'data-testid', 'compare-agentx-model-muse-spark-open');
      });

      cy.visit(`${prefix}/compare`);
      cy.get('[data-testid="compare-agentx-primary"]').within(() => {
        cy.get('[data-testid="landing-minimax-m31-flash-results-link"]').should('not.exist');
        cy.get('[data-testid="landing-tpu-kimi-k3-results-link"]').should('not.exist');
        cy.get('[data-testid="landing-rubin-glm-5-3-results-link"]').should('not.exist');
        cy.get('[data-testid="landing-rubin-results-link"]').should('not.exist');
        cy.get('[data-testid="landing-jalapeno-results-link"]').should('not.exist');
        cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 8);
        for (const slug of ['deepseek-v4', 'qwen-3-8-flash-next', 'qwen-3-5', 'minimax-m3']) {
          cy.get(`[data-testid="compare-agentx-model-${slug}"]`).should(
            'have.attr',
            'href',
            `${prefix}/inference/${slug}`,
          );
        }
      });
    });

    it(`opens MiniMax M3.1 Flash AgentX results from ${prefix || '/'} and retains them on reload`, () => {
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-minimax-m31-flash-results-link"]').click();
      cy.location('pathname').should('eq', `${prefix}/inference/minimax-m31-flash`);
      cy.get('[data-testid="model-selector"]')
        .invoke('text')
        .should('match', /MiniMax[- ]M3\.1[- ]Flash/u);
      cy.get('[data-testid="scenario-selector"]')
        .invoke('text')
        .should('match', /Agentic|智能体/u);
      cy.reload();
      cy.location('pathname').should('eq', `${prefix}/inference/minimax-m31-flash`);
      cy.get('[data-testid="model-selector"]')
        .invoke('text')
        .should('match', /MiniMax[- ]M3\.1[- ]Flash/u);
    });

    it(`keeps the Qwen3.5 AgentX TPU deep link working on ${prefix || '/'}`, () => {
      interceptTpuLaunchData();
      cy.visit(`${prefix}${TPU_RESULTS_HREF}`);
      cy.location('pathname').should('eq', `${prefix}/inference/qwen-3-5`);
      assertTpuView();
      cy.reload();
      assertTpuView();
    });

    it(`opens Kimi K3 AgentX TPU results from ${prefix || '/'} and retains them on reload`, () => {
      interceptTpuLaunchData('Kimi-K3');
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-tpu-kimi-k3-results-link"]').click();
      cy.location('pathname').should('eq', `${prefix}/inference/kimi-k3`);
      assertKimiTpuView();
      cy.reload();
      assertKimiTpuView();
      cy.go('back');
      cy.location('pathname').should('eq', prefix || '/');
    });

    it(`opens GLM 5.3 Rubin AgentX results from ${prefix || '/'}`, () => {
      const rows = vrPublicationRows.map((row) => ({ ...row, model: 'glm5.2' }));
      cy.intercept('GET', '/api/v1/availability*', {
        body: rows.map(({ metrics: _metrics, ...row }) => row),
      });
      cy.intercept('GET', '/api/v1/benchmarks*', { body: rows });
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-rubin-glm-5-3-results-link"]').click();
      cy.location('pathname').should('eq', `${prefix}/inference/glm-5-3`);
      cy.get('[data-testid="model-selector"]').should('contain.text', 'GLM5.3');
      cy.get('[data-testid="scenario-selector"]').should(
        'contain.text',
        prefix ? '智能体' : 'Agentic',
      );
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Vera Rubin NVL72');
      cy.reload();
      cy.location('pathname').should('eq', `${prefix}/inference/glm-5-3`);
      cy.get('[data-testid="model-selector"]').should('contain.text', 'GLM5.3');
      cy.go('back');
      cy.location('pathname').should('eq', prefix || '/');
    });

    it(`opens MiniMax M3 Rubin AgentX results from ${prefix}/compare`, () => {
      interceptMinimaxM3RubinData();
      cy.visit(`${prefix}/compare`);
      cy.get('[data-testid="compare-agentx-model-minimax-m3"]').click();
      cy.location('pathname').should('eq', `${prefix}/inference/minimax-m3`);
      cy.location('search').should('not.contain', 'i_spec=');
      cy.get('[data-testid^="remove-filter-spec-"]').should('not.exist');
      cy.get('[data-testid="scenario-selector"]').should(
        'contain.text',
        prefix ? '智能体' : 'Agentic',
      );
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Vera Rubin NVL72');
      cy.reload();
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Vera Rubin NVL72');
      cy.location('search').should('not.contain', 'i_spec=');
      cy.get('[data-testid^="remove-filter-spec-"]').should('not.exist');
      cy.go('back');
      cy.location('pathname').should('eq', `${prefix}/compare`);
    });

    it(`opens Jalapeño R1 results from ${prefix || '/'}`, () => {
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-jalapeno-results-link"]').click();
      cy.location('pathname').should('eq', `${prefix}/inference/deepseek-r1`);
      cy.get('[data-testid="scenario-selector"]').should('contain.text', '8K / 1K');
      cy.get('[data-testid="precision-multiselect"]').should('contain.text', 'FP4');
      cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'e2e');
      cy.location('search').should('not.contain', 'i_spec=');
      cy.get('[data-testid^="remove-filter-spec-"]').should('not.exist');
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Jalapeño');
      cy.reload();
      cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'e2e');
      cy.location('search').should('not.contain', 'i_spec=');
      cy.get('[data-testid^="remove-filter-spec-"]').should('not.exist');
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Jalapeño');
    });

    it(`does not carry TPU precision through Back into Rubin on ${prefix}/compare`, () => {
      const rubinRows = [
        ...minimaxM3RubinRows,
        ...minimaxM3RubinRows
          .filter((row) => row.hardware === 'vr200')
          .map((row) => ({
            ...row,
            id: row.id + 1000,
            hardware: 'h200',
            precision: 'fp8',
          })),
      ];
      interceptMinimaxM3RubinData(rubinRows);
      interceptTpuLaunchData();
      cy.visit(`${prefix}/compare`);
      cy.visit(`${prefix}${TPU_RESULTS_HREF}`);
      assertTpuView();
      cy.go('back');
      cy.location('pathname').should('eq', `${prefix}/compare`);
      cy.get('[data-testid="compare-agentx-model-minimax-m3"]').click();
      cy.get('[data-testid="precision-multiselect"]')
        .should('contain.text', 'FP4')
        .and('contain.text', 'FP8');
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Vera Rubin NVL72');
      cy.reload();
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Vera Rubin NVL72');
      cy.go('back');
      cy.location('pathname').should('eq', `${prefix}/compare`);
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-jalapeno-results-link"]').click();
      cy.get('[data-testid="precision-multiselect"]').should('contain.text', 'FP4');
      cy.get('[data-testid^="remove-filter-spec-"]').should('not.exist');
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Jalapeño');
    });
  }
});

describe('landing → full dashboard navigation', () => {
  const isChromium = Cypress.browser.family === 'chromium';

  const setReducedMotion = (value: string) =>
    isChromium
      ? Cypress.automation('remote:debugger:protocol', {
          command: 'Emulation.setEmulatedMedia',
          params: { features: [{ name: 'prefers-reduced-motion', value }] },
        })
      : Promise.resolve();

  before(() => {
    cy.wrap(null).then(() => setReducedMotion('no-preference'));
  });

  after(() => {
    cy.wrap(null).then(() => setReducedMotion(''));
  });

  it('commits exactly one navigation and one history entry on a cold dashboard load', () => {
    const writes: HistoryWrite[] = [];

    cy.intercept({ url: /\/inference\/kimi-k3/ }, (req) => {
      if (req.headers['next-router-prefetch']) {
        req.reply({ statusCode: 404, body: '' });
        return;
      }
      req.on('response', (res) => {
        res.setDelay(800);
      });
    });

    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        const origPush = win.history.pushState.bind(win.history);
        const origReplace = win.history.replaceState.bind(win.history);
        const pathnameOf = (url: unknown) =>
          new URL(String(url ?? win.location.href), win.location.origin).pathname;
        win.history.pushState = function (data, unused, url) {
          writes.push({ kind: 'push', pathname: pathnameOf(url) });
          return origPush(data, unused, url as string);
        };
        win.history.replaceState = function (data, unused, url) {
          writes.push({ kind: 'replace', pathname: pathnameOf(url) });
          return origReplace(data, unused, url as string);
        };
      },
    });

    cy.window().then((win) => {
      expect(
        win.matchMedia('(prefers-reduced-motion: reduce)').matches,
        'prefers-reduced-motion: reduce',
      ).to.eq(false);
    });

    cy.get('[data-testid="compare-agentx-dashboard-link"]').should('be.visible');
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1500);

    cy.window().then((win) => {
      cy.wrap(win.history.length).as('historyLenBefore');
    });

    cy.get('[data-testid="compare-agentx-dashboard-link"]').click();
    cy.location('pathname', { timeout: 15000 }).should('eq', TARGET);

    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000);

    cy.location('pathname').should('eq', TARGET);
    cy.then(() => {
      const commits = writes.filter((w) => w.kind === 'push' && w.pathname === TARGET);
      expect(commits.length, 'router commits to the dashboard').to.eq(1);

      const firstCommit = writes.findIndex((w) => w.kind === 'push' && w.pathname === TARGET);
      const revertsAfterCommit = writes.slice(firstCommit + 1).filter((w) => w.pathname === '/');
      expect(
        revertsAfterCommit,
        'URL rewrites back to the landing page after the commit',
      ).to.deep.eq([]);
    });
    cy.window().then(function (win) {
      expect(win.history.length, 'exactly one new history entry').to.eq(
        Number(this.historyLenBefore) + 1,
      );
    });

    cy.go('back');
    cy.location('pathname').should('eq', '/');
    cy.get('[data-testid="compare-agentx-dashboard-link"]').should('be.visible');
    cy.go('forward');
    cy.location('pathname').should('eq', TARGET);
  });
});

describe('Huawei OperatorX landing navigation', () => {
  for (const prefix of ['', '/zh']) {
    it(`links Huawei results to the localized OperatorX page from ${prefix || '/'}`, () => {
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-huawei-results-link"]')
        .should('have.attr', 'href', `${prefix}/operatorx`)
        .and('contain.text', prefix ? '华为 Ascend 950PR' : 'Huawei Ascend 950PR')
        .and('contain.text', 'OperatorX');
      cy.get('[data-testid="landing-huawei-huawei-logo"] path').should(
        'have.attr',
        'fill',
        '#FF0000',
      );
      cy.get('[data-testid="landing-huawei-results-link"]').click();
      cy.location('pathname').should('eq', `${prefix}/operatorx`);
      cy.get('[data-testid="operatorx-page"]').should('contain.text', 'OperatorX');
      cy.get('[data-testid="tab-trigger-operatorx"]')
        .should('be.visible')
        .and('have.attr', 'href', `${prefix}/operatorx`);
      cy.get('[data-testid="tab-hidden-popover"]').should('not.exist');
    });
  }
});
