/**
 * Regression: the landing "Dashboard" CTA must navigate in exactly one
 * transition — one router commit, one new history entry, no URL revert.
 *
 * One click used to: commit /inference/kimi-k3, get reverted to `/` by a
 * stale router restore (url-state.ts initializing mid-transition and calling
 * the Next-patched history.replaceState), then be pushed again by
 * navigateInApp's 250ms retry — replaying the landing reveal, pausing, and
 * stacking a duplicate history entry (a single Back no longer returned to
 * the landing page).
 *
 * The cold-load simulation below (failed prefetches + a slow click-time RSC
 * response) makes that race deterministic. Motion is re-enabled via CDP on
 * chromium — the launch flags force reduced motion there, which hides the
 * visible half of this regression — while Firefox runs motion-enabled
 * natively.
 */

import { vrPublicationRows } from '../support/vr-publication-fixtures';
import { interceptTpuLaunchData } from '../support/tpu-launch-fixtures';

// The landing Rubin card links to MiniMax M3; reuse the synthetic Rubin curve under its DB key.
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
    // Normalized conc=32 bmk artifact 12019076285 from run 38825822770.
    // This is a measured B200 row, not a synthetic performance sample.
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
        // Without published availability, the selector falls back to the model ID.
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
  '/inference/qwen-3-5?g_model=Qwen-3.5-397B-A17B&i_seq=agentic-traces&i_prec=fp8&i_xmode=interactivity&i_best=0';

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
  cy.location('search').should('contain', 'i_best=0');
  cy.get('[data-testid="scatter-quick-filters"]').click();
  cy.get('[data-testid="quick-filter-best-per-sku"]').should('have.attr', 'aria-checked', 'false');
  cy.get('body').type('{esc}');
  cy.location('search').should('not.contain', 'i_spec=');
}

describe('landing model curation', () => {
  for (const prefix of ['', '/zh']) {
    it(`shows the curated ledger on ${prefix || '/'} without changing compare coverage`, () => {
      cy.visit(prefix || '/');
      cy.get('[data-testid="compare-agentx-primary"]').within(() => {
        cy.get('[data-testid^="compare-agentx-model-"]').should(($links) => {
          expect([...$links].map((link) => link.getAttribute('href'))).to.deep.eq(
            ['kimi-k3', 'muse-spark-open', 'deepseek-v41-flash', 'glm-5-3', 'minimax-m3'].map(
              (slug) => `${prefix}/inference/${slug}`,
            ),
          );
        });
        cy.get('[data-testid="compare-agentx-model-muse-spark-open"]')
          .should('contain.text', 'Muse Spark Open 816B')
          .and('contain.text', prefix ? '查看结果' : 'View results')
          .and('not.contain.text', prefix ? '结果待发布' : 'Results pending')
          .find('img')
          .should('have.attr', 'src', '/logos/muse-mascot.webp');
        cy.get('[data-testid="compare-agentx-model-deepseek-v4"]').should('not.exist');
        cy.get('[data-testid="compare-agentx-model-qwen-3-8-flash-next"]').should('not.exist');
        // Qwen 3.5 is reached through the TPU card, and the hardware cards sit above the ledger.
        cy.get('[data-testid="compare-agentx-model-qwen-3-5"]').should('not.exist');
        cy.get('[data-testid="landing-tpu-results-link"]')
          .should('match', ':first-child')
          .parent()
          .next('nav')
          .find('[data-testid^="compare-agentx-model-"]')
          .first()
          .should('have.attr', 'data-testid', 'compare-agentx-model-kimi-k3');
        cy.get('[data-testid="landing-tpu-results-link"]')
          .should('contain.text', prefix ? 'TPU 结果' : 'TPU Results')
          .and('contain.text', 'Qwen3.5 · AgentX')
          .and('have.attr', 'href', `${prefix}${TPU_RESULTS_HREF}`);
        cy.get('[data-new-badge="landing-tpu"]')
          .should('contain.text', prefix ? '新' : 'NEW')
          .and('have.class', 'new-badge-flash');
        cy.get('[data-testid="landing-tpu-google-logo"] path').should('have.length', 4);
        cy.get('[data-testid="landing-tpu-results-link"]')
          .next()
          .should('have.attr', 'data-testid', 'landing-rubin-results-link')
          .and('have.attr', 'href', `${prefix}/inference/minimax-m3`)
          .and('contain.text', 'MiniMax M3');
        cy.get('[data-testid="landing-rubin-results-link"]')
          .next()
          .should('have.attr', 'data-testid', 'landing-jalapeno-results-link')
          .and(
            'have.attr',
            'href',
            `${prefix}/inference/deepseek-r1?i_seq=8k%2F1k&i_prec=fp4&i_xmode=e2e`,
          )
          .and('contain.text', 'OpenAI Jalapeño')
          .and('contain.text', 'DeepSeek R1');
        cy.get('[data-testid="landing-rubin-nvidia-logo"] path').should(
          'have.attr',
          'fill',
          '#76B900',
        );
        cy.get('[data-testid="landing-jalapeno-openai-logo"] path').should(
          'have.attr',
          'fill',
          'currentColor',
        );
      });

      cy.visit(`${prefix}/compare`);
      cy.get('[data-testid="compare-agentx-primary"]').within(() => {
        cy.get('[data-testid="landing-tpu-results-link"]').should('not.exist');
        cy.get('[data-testid="landing-rubin-results-link"]').should('not.exist');
        cy.get('[data-testid="landing-jalapeno-results-link"]').should('not.exist');
        cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 8);
        for (const slug of ['deepseek-v4', 'qwen-3-8-flash-next', 'qwen-3-5']) {
          cy.get(`[data-testid="compare-agentx-model-${slug}"]`).should(
            'have.attr',
            'href',
            `${prefix}/inference/${slug}`,
          );
        }
      });
    });

    it(`opens the Qwen3.5 AgentX TPU view from ${prefix || '/'} and retains it on reload`, () => {
      interceptTpuLaunchData();
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-tpu-results-link"]').click();
      cy.location('pathname').should('eq', `${prefix}/inference/qwen-3-5`);
      assertTpuView();
      cy.reload();
      assertTpuView();
      cy.go('back');
      cy.location('pathname').should('eq', prefix || '/');
    });

    it(`opens Rubin AgentX results from ${prefix || '/'}`, () => {
      interceptMinimaxM3RubinData();
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-rubin-results-link"]').click();
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
      cy.location('pathname').should('eq', prefix || '/');
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

    it(`does not carry TPU precision through Back into Rubin on ${prefix || '/'}`, () => {
      // Include FP8 as well as Rubin's FP4: FP4-only fixtures mask stale FP8
      // because the availability validator falls back to the only precision.
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
      cy.visit(prefix || '/');
      cy.get('[data-testid="landing-tpu-results-link"]').click();
      assertTpuView();
      cy.go('back');
      cy.location('pathname').should('eq', prefix || '/');
      cy.get('[data-testid="landing-rubin-results-link"]').click();
      cy.get('[data-testid="precision-multiselect"]')
        .should('contain.text', 'FP4')
        .and('contain.text', 'FP8');
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Vera Rubin NVL72');
      cy.reload();
      cy.get('[data-testid="chart-legend"]').should('contain.text', 'Vera Rubin NVL72');
      cy.go('back');
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
    // Other specs in this run expect the config's forced reduced motion.
    cy.wrap(null).then(() => setReducedMotion(''));
  });

  it('commits exactly one navigation and one history entry on a cold dashboard load', () => {
    const writes: HistoryWrite[] = [];

    cy.intercept({ url: /\/inference\/kimi-k3/ }, (req) => {
      if (req.headers['next-router-prefetch']) {
        // A cold visit has no warmed router cache for the target.
        req.reply({ statusCode: 404, body: '' });
        return;
      }
      // The click-time payload takes longer than any timer-based re-push.
      req.on('response', (res) => {
        res.setDelay(800);
      });
    });

    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        // Wrap the native methods before Next patches them, so the router's
        // own commits are observed too.
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

    // The real motion path must be active (reduced motion hides the visible
    // half of this regression).
    cy.window().then((win) => {
      expect(
        win.matchMedia('(prefers-reduced-motion: reduce)').matches,
        'prefers-reduced-motion: reduce',
      ).to.eq(false);
    });

    // Let hydration and the landing reveal settle, as in the manual repro.
    cy.get('[data-testid="compare-agentx-dashboard-link"]').should('be.visible');
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1500);

    cy.window().then((win) => {
      cy.wrap(win.history.length).as('historyLenBefore');
    });

    cy.get('[data-testid="compare-agentx-dashboard-link"]').click();
    cy.location('pathname', { timeout: 15000 }).should('eq', TARGET);

    // Give any stray timer-based re-push time to fire before asserting.
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

    // A single Back must return to the landing page, and Forward must come
    // straight back to the dashboard.
    cy.go('back');
    cy.location('pathname').should('eq', '/');
    cy.get('[data-testid="compare-agentx-dashboard-link"]').should('be.visible');
    cy.go('forward');
    cy.location('pathname').should('eq', TARGET);
  });
});
