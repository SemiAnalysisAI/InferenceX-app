import { SUPPLEMENTAL_BENCHMARK_ROWS } from '../../src/lib/supplemental-benchmarks';
import { OVERLAY_RUN_ID, OVERLAY_RUN_URL } from '../support/overlay-fixtures';
import { servingArtifact, videoRun } from '../support/video-artifacts';

const datum = (el: Element) => (el as Element & { __data__: { x: number; y: number } }).__data__;

// Merged from tabs.cy.ts and first-load-navigation.cy.ts
// to reduce per-file Cypress startup overhead (~500ms per file)

describe('Chart Section Tabs — E2E', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
  });

  it('updates the URL path when switching tabs', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').click();
    cy.url().should('include', '/evaluation');

    cy.get('[data-testid="tab-trigger-historical"]').click();
    cy.url().should('include', '/historical');

    cy.get('[data-testid="tab-trigger-profit-estimator-per-gigawatt"]').click();
    cy.url().should('include', '/profit-estimator-per-gigawatt');

    cy.get('[data-testid="tab-trigger-profit-estimator"]').click();
    cy.url().should('include', '/profit-estimator');
    cy.url().should('not.include', '/profit-estimator-per-gigawatt');

    cy.get('[data-testid="tab-trigger-submissions"]').click();
    cy.url().should('include', '/submissions');

    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.url().should('include', '/inference');
  });

  it('opens the TCO Calculator and Fleet Lifecycle from the footer links', () => {
    cy.get('[data-testid="tab-trigger-calculator"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-fleet"]').should('not.exist');

    cy.get('[data-testid="footer-link-calculator"]').scrollIntoView().click();
    cy.url().should('include', '/calculator');
    cy.get('[data-testid="calculator-controls"]').should('exist');

    cy.get('[data-testid="footer-link-fleet"]').scrollIntoView().click();
    cy.url().should('include', '/fleet');
  });

  it('opens GPU Reliability from the footer link', () => {
    cy.get('[data-testid="tab-trigger-reliability"]').should('not.exist');

    cy.get('[data-testid="footer-link-reliability"]').scrollIntoView().click();
    cy.url().should('include', '/reliability');
    cy.get('[data-testid="reliability-chart-display"]').should('exist');
  });

  it('opens Chip Specs from the footer link', () => {
    cy.get('[data-testid="tab-trigger-gpu-specs"]').should('not.exist');

    cy.get('[data-testid="footer-link-gpu-specs"]').scrollIntoView().click();
    cy.url().should('include', '/gpu-specs');
    cy.get('[data-testid="gpu-specs-content"]').should('exist');
  });

  it('shows mobile chart select dropdown on small viewport', () => {
    cy.viewport(375, 812);
    cy.visit('/inference');
    cy.get('[data-testid="mobile-chart-select"]').should('be.visible');
  });

  it('keeps the sliding indicator aligned after the ↑↑↓↓ unlock inserts the Hidden trigger', () => {
    // Start locked: testIsolation is off, so an unlock persisted by an earlier
    // test would make the konami sequence below a no-op (nothing would insert,
    // nothing would shift, and the assertion would pass vacuously).
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-feature-gate');
      },
    });
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('[data-testid="chart-section-tabs"] .tab-indicator').should('exist');
    // Unlock mid-session: inserting the Hidden trigger reflows the
    // justify-evenly tabs WITHOUT resizing the nav box, so the nav's
    // ResizeObserver never fires — only the gateUnlocked remeasure keeps
    // the indicator under the active tab.
    cy.get('body').type('{upArrow}{upArrow}{downArrow}{downArrow}');
    cy.get('[data-testid="tab-trigger-hidden"]').should('be.visible');
    cy.get('[data-testid="chart-section-tabs"] .tab-indicator').should(($indicator) => {
      const active = $indicator
        .closest('[data-testid="chart-section-tabs"]')
        .find('[data-tab-active="true"]')[0];
      expect(active, 'active tab link').to.not.equal(undefined);
      const indicator = $indicator[0];
      const match = /translateX\((?<left>-?[\d.]+)px\)/u.exec(indicator.style.transform);
      expect(match, 'indicator transform').to.not.equal(null);
      expect(Number(match!.groups!.left)).to.be.closeTo(active.offsetLeft, 1);
      expect(indicator.getBoundingClientRect().width).to.be.closeTo(active.offsetWidth, 1);
    });
    // Re-lock so the unlock doesn't leak into later tests (testIsolation off).
    cy.window().then((win) => win.localStorage.removeItem('inferencex-feature-gate'));
  });
});

describe('First-load navigation', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-starred');
        // Snoozed, not cleared: the star modal is the eligible landing nudge
        // on first load, and its corner card would sit over the footer links
        // these specs click.
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.removeItem('inferencex-tpuv7-banner-dismissed');
      },
    });

    cy.get('body').should('not.have.attr', 'data-scroll-locked');
  });

  it('navigates to articles from the footer', () => {
    cy.get('[data-testid="footer-link-articles"]').scrollIntoView().click();
    cy.location('pathname').should('eq', '/blog');
  });

  it('navigates to overview from the top-level header link', () => {
    cy.get('[data-testid="nav-link-overview"]').click();
    cy.location('pathname').should('eq', '/overview');
  });

  it('navigates to dashboard from the header with one click', () => {
    cy.get('[data-testid="nav-link-dashboard"]').click();
    cy.location('pathname').should('eq', '/inference');
  });

  it('navigates to comparisons from the header with one click', () => {
    cy.get('[data-testid="nav-link-compare"]').click();
    cy.location('pathname').should('eq', '/compare');
  });

  it('navigates to AgentX from the header with one click', () => {
    cy.get('[data-testid="nav-link-agentx"]')
      .should('have.attr', 'href', '/agentx')
      .find('[data-nav-badge="agentx"]')
      .should('be.visible')
      .and('have.text', 'NEW');
    cy.get('[data-testid="nav-link-agentx"]').click();
    cy.location('pathname').should('eq', '/agentx');
  });

  it('leads the landing page with the AgentX hero and its two CTAs', () => {
    cy.get('[data-testid="compare-agentx-primary"]').within(() => {
      // The hero owns /compare's h1; on the landing page it is a section heading.
      cy.get('h2').should('have.text', 'Compare Realistic Agentic Inference Perf');
      cy.get('h1').should('not.exist');
      cy.get('[data-testid="compare-agentx-revenue-calculator-link"]')
        .should('contain.text', 'Token Revenue Calculator')
        .and('have.attr', 'href', '/profit-estimator-per-gigawatt');
      cy.get('[data-testid="compare-agentx-dashboard-link"]')
        .should('have.text', 'Dashboard')
        .and('have.attr', 'href', '/inference/kimi-k3');
      cy.get('[data-testid="compare-agentx-methodology-link"]').should('not.exist');
      cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 6);
      // Editorial order, not alphabetical — see FEATURED_AGENTX_MODEL_SLUGS.
      cy.get('[data-testid^="compare-agentx-model-"]').then(($rows) => {
        const slugs = [...$rows].map((row) =>
          (row.dataset.testid ?? '').replace('compare-agentx-model-', ''),
        );
        expect(slugs).to.deep.equal([
          'kimi-k3',
          'deepseek-v4',
          'glm-5-3',
          'minimax-m3',
          'qwen-3-5',
          'qwen-3-8-flash-next',
        ]);
      });
      // Every featured ledger row carries the NEW pill.
      cy.get('[data-testid^="compare-agentx-model-"] [data-new-badge="agentx-ledger"]')
        .should('have.length', 6)
        .each(($badge) => expect($badge.text()).to.equal('NEW'));
    });
    cy.get('[data-testid="compare-agentx-revenue-calculator-link"]').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt');
  });

  it('navigates to submissions from the landing CTA', () => {
    cy.get('[data-testid="landing-submissions-link"]').click();
    cy.location('pathname').should('eq', '/submissions');
  });
});

describe('TPUv7 launch banner', { testIsolation: true }, () => {
  for (const locale of ['', '/zh']) {
    it(`opens the TPUv7 FP8 results from ${locale || '/'} landing page`, () => {
      cy.visit(locale || '/', {
        onBeforeLoad(win) {
          win.localStorage.removeItem('inferencex-tpuv7-banner-dismissed');
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        },
      });
      cy.get('[data-testid="launch-banner"]')
        .should(
          'have.attr',
          'href',
          `${locale}/inference?g_model=Qwen-3.5-397B-A17B&i_seq=8k/1k&i_prec=fp8`,
        )
        .click();
      cy.location('pathname').should('eq', `${locale}/inference`);
      cy.get('[data-testid="inference-chart-display"]').should('be.visible');
      cy.get('.dot-group[data-hw-key^="tpuv7"]').should('have.length.at.least', 1);
      // Verify the rendered values, then reload the share URL in each locale.
      cy.location('href').then((href) => {
        const url = new URL(href);
        url.searchParams.set('g_model', 'Qwen-3.5-397B-A17B');
        url.searchParams.set('i_seq', '8k/1k');
        url.searchParams.set('i_prec', 'fp8');
        url.searchParams.set('i_metric', 'y_costh');
        cy.visit(url.toString());
      });
      const dots = '.dot-group[data-hw-key^="tpuv7"]';

      // Internal owner cost is the default basis; External is the opt-in.
      cy.get('[data-testid="tco-basis-internal"]').should('have.attr', 'aria-pressed', 'true');
      cy.get(dots)
        .first()
        .then(($point) => {
          const internal = { ...datum($point[0]) };
          cy.get('[data-testid="tco-basis-external"]').click();
          cy.get(dots)
            .first()
            .should(($external) => {
              expect(datum($external[0]).y).to.be.closeTo((internal.y * 1.21) / 1.03, 1e-8);
              expect(datum($external[0]).x).to.equal(internal.x);
            });
          cy.get('[data-testid="share-button"]').first().click();
          cy.get('[data-testid="share-url-input"]')
            .invoke('val')
            .should('include', 'g_tco=external')
            .then((url) => cy.visit(String(url)));
          cy.get('[data-testid="tco-basis-external"]').should('have.attr', 'aria-pressed', 'true');
          cy.get(dots)
            .first()
            .should(($external) => {
              expect(datum($external[0]).y).to.be.closeTo((internal.y * 1.21) / 1.03, 1e-8);
            });
          cy.get('[data-testid="tco-basis-toggle"]').scrollIntoView();
          cy.screenshot(`tco-basis-${locale ? 'zh' : 'en'}-desktop`, { capture: 'viewport' });
          cy.viewport(390, 844);
          cy.get('[data-testid="inference-secondary-controls"] > button').click();
          cy.get('[data-testid="tco-basis-toggle"]').scrollIntoView().should('be.visible');
          cy.screenshot(`tco-basis-${locale ? 'zh' : 'en'}-mobile`, { capture: 'viewport' });
          cy.get('[data-testid="tco-basis-internal"]').click();
          cy.get(dots)
            .first()
            .should(($restored) => {
              expect(datum($restored[0]).y).to.be.closeTo(internal.y, 1e-8);
            });
        });
    });
  }
  it('reprices a TPU unofficial overlay without changing throughput', () => {
    cy.intercept('GET', '/api/unofficial-run*', {
      body: {
        runInfos: [
          {
            id: OVERLAY_RUN_ID,
            name: 'TPU test',
            branch: 'tpu-test',
            sha: 'abc000',
            createdAt: '2026-08-26T00:00:00Z',
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        benchmarks: SUPPLEMENTAL_BENCHMARK_ROWS.filter((row) => row.hardware === 'tpuv7').map(
          (row) => ({ ...row, run_url: OVERLAY_RUN_URL }),
        ),
        evaluations: [],
      },
    }).as('tpuOverlay');
    cy.visit(
      `/inference?g_model=Qwen-3.5-397B-A17B&i_seq=8k/1k&i_prec=fp8&i_metric=y_costh&unofficialrun=${OVERLAY_RUN_ID}`,
      {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        },
      },
    );
    cy.wait('@tpuOverlay');
    const points = '.unofficial-overlay-pt';
    cy.get(points)
      .first()
      .then(($point) => {
        const internal = { ...datum($point[0]) };
        cy.get('[data-testid="tco-basis-external"]').click();
        cy.get(points)
          .first()
          .should(($external) => {
            expect(datum($external[0]).y).to.be.closeTo((internal.y * 1.21) / 1.03, 1e-8);
            expect(datum($external[0]).x).to.equal(internal.x);
          });
        cy.get('[data-testid="tco-basis-internal"]').click();
        cy.get(points)
          .first()
          .should(($restored) => {
            expect(datum($restored[0]).y).to.be.closeTo(internal.y, 1e-8);
          });
      });
  });
  it('hides the TCO basis selector outside Qwen3.5 8K/1K', () => {
    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_metric=y_costh', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('be.visible');
    cy.get('[data-testid="yaxis-metric-selector"]').should('exist');
    cy.get('[data-testid="tco-basis-toggle"]').should('not.exist');
  });
});

describe('H3 video artifact viewer', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/video-runs?page=*', { runs: [], nextPage: null });
  });
  it('shares a comparison built by opening two CI runs through the page', () => {
    for (const saved of [
      servingArtifact(123, 40, 'NVIDIA H200'),
      servingArtifact(456, 41, 'NVIDIA B200'),
    ]) {
      cy.intercept('GET', `/api/video-runs?run=${saved.runId}`, {
        run: videoRun(Number(saved.runId), 'success'),
        artifacts: [saved.artifact],
      });
      cy.intercept(
        'GET',
        `/api/video-runs?run=${saved.runId}&artifact=${saved.artifact.id}&format=media`,
        saved,
      );
    }
    cy.intercept('GET', 'https://media.test/**', { statusCode: 204 });
    cy.visit('/video?view=tradeoff&run=123&artifact=40');
    cy.get('[data-testid="video-tradeoff"] tbody tr').should('have.length', 3);
    cy.contains('summary', 'Run details and artifact selection').click();
    cy.get('[data-testid="video-ci-runs"] form input').type('456');
    cy.get('[data-testid="video-ci-runs"] form').submit();
    cy.get('[data-testid="video-tradeoff"] tbody tr').should('have.length', 6);
    cy.location().should((location) => {
      const params = new URLSearchParams(location.search);
      expect(params.get('run')).to.equal('456');
      expect(params.get('compare')).to.equal('123.40,456.41');
    });
    cy.reload();
    cy.get('[data-testid="video-tradeoff"] tbody tr').should('have.length', 6);
    cy.get('[data-testid="video-tradeoff"]')
      .should('contain', 'NVIDIA H200')
      .and('contain', 'NVIDIA B200');
  });
  it('restores a cross-hardware comparison on reload and retains good results when one artifact fails', () => {
    const h200 = servingArtifact(123, 40, 'NVIDIA H200');
    const b200 = servingArtifact(456, 41, 'NVIDIA B200');
    for (const saved of [h200, b200]) {
      cy.intercept('GET', `/api/video-runs?run=${saved.runId}`, {
        run: videoRun(Number(saved.runId), 'success'),
        artifacts: [saved.artifact],
      });
      cy.intercept(
        'GET',
        `/api/video-runs?run=${saved.runId}&artifact=${saved.artifact.id}&format=media`,
        saved,
      );
    }
    cy.intercept('GET', '/api/video-runs?run=789&artifact=42&format=media', {
      statusCode: 503,
      body: { error: 'Synthetic unavailable artifact' },
    });
    cy.intercept('GET', 'https://media.test/**', { statusCode: 204 });
    cy.visit('/video?view=tradeoff&run=123&artifact=40&source=123&compare=123.40,456.41,789.42');
    cy.get('[data-testid="video-tradeoff"] tbody tr').should('have.length', 6);
    cy.get('[data-testid="tradeoff-detail"]').should('contain', 'NVIDIA H200');
    cy.get('[data-testid="video-tradeoff"]')
      .should('contain', 'NVIDIA H200')
      .and('contain', 'NVIDIA B200');
    cy.get('[role="alert"]').should('contain', 'Some comparison results could not be loaded');
    cy.reload();
    cy.get('[data-testid="video-tradeoff"] tbody tr').should('have.length', 6);
    cy.get('[data-testid="tradeoff-detail"]').should('contain', 'NVIDIA H200');
    cy.contains(
      '[data-testid="video-tradeoff"] tbody button',
      /NVIDIA B200.*Client concurrency 4/,
    ).click();
    cy.contains('button', 'Open videos and full result').click();
    cy.get('[data-testid="serving-selected-metrics"]').should('contain', 'C4');
    cy.location('search').should('include', 'run=456').and('include', 'compare=');
    cy.get('[data-testid="serving-media"] video')
      .should('have.attr', 'src')
      .and('include', '/gpu/c4/');
  });
  it('uses the shared unlock for navigation and keeps an empty viewer free of sample results', () => {
    cy.viewport(1440, 1000);
    cy.visit('/video', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-feature-gate');
      },
    });
    cy.get('[data-testid="video-ci-runs"]').should('contain', 'No H3 runs in this page');
    cy.get('video[data-role]').should('not.exist');
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('body').type('{upArrow}{upArrow}{downArrow}{downArrow}');
    cy.get('[data-testid="tab-trigger-hidden"]').click();
    cy.contains('a', 'Video').should('have.attr', 'href', '/video');
    cy.get('head meta[name="robots"]').should('have.attr', 'content', 'noindex, nofollow');
  });
  it('shows a recoverable load error and the Chinese empty state', () => {
    cy.visit('/video');
    cy.contains('summary', 'Local artifact tools').click();
    cy.get('[data-testid="video-benchmark"]').contains('summary', 'Manifest URL').click();
    cy.get('input[aria-label="Manifest URL"]').type('https://example.com/wrong.json');
    cy.contains('button', 'Load manifest').click();
    cy.get('[role="alert"]').should('contain', 'Could not load this bundle');
    cy.get('video[data-role]').should('not.exist');
    cy.visit('/zh/video');
    cy.get('[data-testid="video-ci-runs"]').should('contain', '本页 GitHub 历史中没有 H3 运行');
    cy.get('head meta[name="robots"]').should('have.attr', 'content', 'noindex, nofollow');
  });
});
