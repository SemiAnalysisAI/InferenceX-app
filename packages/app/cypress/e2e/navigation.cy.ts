import { videoHistoryEntry } from '../../src/components/video-benchmark/history';
import { servingArtifact } from '../support/video-artifacts';
import { expectHwKeyPoints, type ScatterPoint } from '../support/scatter-points';
import { interceptPreviewSnapshots } from '../support/preview-snapshot-fixtures';

const tpuDatum = (points: ScatterPoint[]) =>
  points.find((point) => String(point.datum.hwKey).startsWith('tpuv7'))!.datum;

describe('Chart Section Tabs — E2E', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/infx/inference');
  });

  it('updates the URL path when switching tabs', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').click();
    cy.url().should('include', '/infx/evaluation');

    cy.get('[data-testid="tab-trigger-profit-estimator-per-gigawatt"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-profit-estimator"]').click();
    cy.location('pathname').should('match', /^\/infx\/profit-estimator(?:\/|$)/u);

    cy.get('[data-testid="profit-basis-gw-year"]').click();
    cy.location('pathname').should('match', /^\/infx\/profit-estimator-per-gigawatt(?:\/|$)/u);
    cy.get('[data-testid="tab-trigger-profit-estimator"]').should(
      'have.attr',
      'data-tab-active',
      'true',
    );

    cy.get('[data-testid="tab-trigger-submissions"]').click();
    cy.url().should('include', '/infx/submissions');

    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.url().should('include', '/infx/inference');
  });

  it('opens Historical Trends from the footer link', () => {
    cy.get('[data-testid="tab-trigger-historical"]').should('not.exist');

    cy.get('[data-testid="footer-link-historical"]').scrollIntoView().click();
    cy.url().should('include', '/infx/historical');
    cy.get('[data-testid="historical-trends-display"]').should('exist');
  });

  it('opens the TCO Calculator and Fleet Lifecycle from the footer links', () => {
    cy.get('[data-testid="tab-trigger-calculator"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-fleet"]').should('not.exist');

    cy.get('[data-testid="footer-link-calculator"]').scrollIntoView().click();
    cy.url().should('include', '/infx/calculator');
    cy.get('[data-testid="calculator-controls"]').should('exist');

    cy.get('[data-testid="footer-link-fleet"]').scrollIntoView().click();
    cy.url().should('include', '/infx/fleet');
  });

  it('opens First-Token Limits from the footer link', () => {
    cy.get('[data-testid="tab-trigger-first-token"]').should('not.exist');

    cy.get('[data-testid="footer-link-first-token"]').scrollIntoView().click();
    cy.url().should('include', '/infx/first-token');
    cy.get('[data-testid="first-token-controls"]').should('exist');
  });

  it('opens Prefix Cache Reuse from the footer link', () => {
    cy.get('[data-testid="tab-trigger-cache-reuse"]').should('not.exist');

    cy.get('[data-testid="footer-link-cache-reuse"]').scrollIntoView().click();
    cy.url().should('include', '/infx/cache-reuse');
    cy.get('[data-testid="cache-reuse-controls"]').should('exist');
  });

  it('opens GPU Reliability from the footer link', () => {
    cy.get('[data-testid="tab-trigger-reliability"]').should('not.exist');

    cy.get('[data-testid="footer-link-reliability"]').scrollIntoView().click();
    cy.url().should('include', '/infx/reliability');
    cy.get('[data-testid="reliability-chart-display"]').should('exist');
  });

  it('opens Chip Specs from the footer link', () => {
    cy.get('[data-testid="tab-trigger-gpu-specs"]').should('not.exist');

    cy.get('[data-testid="footer-link-gpu-specs"]').scrollIntoView().click();
    cy.url().should('include', '/infx/gpu-specs');
    cy.get('[data-testid="gpu-specs-content"]').should('exist');
  });

  it('keeps the sliding indicator aligned after the Konami code unlock inserts the Hidden trigger', () => {
    cy.visit('/infx/inference', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('[data-testid="chart-section-tabs"] .tab-indicator').should('exist');
    cy.get('body').type('{upArrow}{upArrow}{downArrow}{downArrow}');
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('body').type('{leftArrow}{rightArrow}{leftArrow}{rightArrow}ba');
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('body').type(
      '{upArrow}{upArrow}{downArrow}{downArrow}{leftArrow}{rightArrow}{leftArrow}{rightArrow}BA',
    );
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
    cy.reload();
    cy.get('[data-testid="tab-trigger-hidden"]').should('be.visible');
    cy.window().then((win) => win.localStorage.removeItem('inferencex-feature-gate-konami-v1'));
  });

  for (const [path, landing] of [
    ['/powerx', '/'],
    ['/zh/powerx', '/zh'],
    ['/powerx/tutorial', '/'],
    ['/zh/powerx/tutorial', '/zh'],
  ] as const) {
    it(`sends a locked visitor from ${path} to the landing page`, () => {
      cy.visit(path, {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
          win.localStorage.setItem('inferencex-feature-gate', '1');
        },
      });
      cy.location('pathname').should('eq', landing);
    });
  }

  it('keeps PowerX open once the feature gate is unlocked', () => {
    cy.visit('/powerx', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('exist');
    cy.location('pathname').should('eq', '/powerx');
  });

  it('permanently redirects the retired PowerX page to the inference dashboard', () => {
    cy.request({ url: '/gpu-metrics?gm_runId=12345', followRedirect: false }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.eq('/infx/inference?gm_runId=12345');
    });
    cy.request({ url: '/zh/gpu-metrics', followRedirect: false }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.eq('/zh/infx/inference');
    });
  });
});

describe('First-load navigation', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-starred');
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.removeItem('inferencex-huawei-ascend-950pr-ubenchx-banner-dismissed');
        win.localStorage.setItem('inferencex-landing-banner-variant', 'ubenchx');
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
    cy.location('pathname').should('eq', '/infx/inference/deepseek-v41-flash');
    cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek V4.1 Flash');
  });

  it('navigates to comparisons from the footer with one click', () => {
    cy.get('[data-testid="footer-link-compare"]').click();
    cy.location('pathname').should('eq', '/compare');
  });

  it('navigates to AgentX from the header with one click', () => {
    cy.get('[data-testid="nav-link-agentx"]').should('have.attr', 'href', '/infx/agentx');
    cy.get('[data-testid="nav-link-agentx"]').click();
    cy.location('pathname').should('eq', '/infx/agentx');
  });

  it('leads the landing page with the AgentX hero and its two CTAs', () => {
    cy.get('[data-testid="compare-agentx-revenue-calculator-link"]').click();
    cy.location('pathname').should('eq', '/infx/profit-estimator-per-gigawatt');
  });

  it('navigates to submissions from the landing CTA', () => {
    cy.get('[data-testid="landing-submissions-link"]').click();
    cy.location('pathname').should('eq', '/infx/submissions');
  });
});

describe('Huawei UBenchX launch banner', { testIsolation: true }, () => {
  it('opens Huawei core-memory profiles from /zh landing page', () => {
    cy.visit('/zh', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-rubin-minimax-m3-banner-dismissed', '1');
        win.localStorage.setItem('inferencex-tpuv7-qwen-3-5-agentx-banner-dismissed', '1');
        win.localStorage.removeItem('inferencex-huawei-ascend-950pr-ubenchx-banner-dismissed');
        win.localStorage.setItem('inferencex-landing-banner-variant', 'ubenchx');
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="launch-banner"]:visible')
      .should('have.attr', 'href', '/zh/ubenchx/core-memory-profiles')
      .and('contain.text', 'Huawei Ascend 950PR 微基准测试')
      .and('contain.text', '周期级核心访存微基准测试（Beta）')
      .click();
    cy.location('pathname').should('eq', '/zh/ubenchx/core-memory-profiles');
    cy.get('[data-testid="ascend-core-profiles"]').should('be.visible');
  });
});

describe('OperatorX launch banner A/B arm', { testIsolation: true }, () => {
  for (const locale of ['', '/zh']) {
    it(`opens OperatorX from ${locale || '/'} landing page`, () => {
      cy.visit(locale || '/', {
        onBeforeLoad(win) {
          win.localStorage.removeItem('inferencex-huawei-ascend-950pr-ubenchx-banner-dismissed');
          win.localStorage.setItem('inferencex-landing-banner-variant', 'operatorx');
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        },
      });
      cy.get('[data-testid="launch-banner"]:visible')
        .should('have.length', 1)
        .and('have.attr', 'href', `${locale}/opx`)
        .and(
          'contain.text',
          locale ? 'Huawei Ascend 950PR 微基准测试' : 'Huawei Ascend 950PR microbenchmarks',
        )
        .and(
          'contain.text',
          locale
            ? '950PR GEMM FLOPs 与最大 FLOPS 利用率'
            : '950PR GEMM FLOPs and max FLOPS utilization',
        )
        .click();
      cy.location('pathname').should('eq', `${locale}/opx`);
      cy.get('[data-testid="operatorx-page"]').should('be.visible');
    });
  }

  it('assigns a sticky arm on first visit and shows only that arm', () => {
    cy.clearAllLocalStorage();
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('html')
      .invoke('attr', 'data-landing-banner-variant')
      .then((variant) => {
        expect(variant).to.be.oneOf(['ubenchx', 'operatorx']);
        cy.window()
          .its('localStorage')
          .invoke('getItem', 'inferencex-landing-banner-variant')
          .should('eq', variant);
        cy.get('[data-testid="launch-banner"]:visible')
          .should('have.length', 1)
          .and(
            'have.attr',
            'href',
            variant === 'operatorx' ? '/opx' : '/ubenchx/core-memory-profiles',
          );
        cy.reload();
        cy.get('html').should('have.attr', 'data-landing-banner-variant', variant);
      });
  });

  it('shares dismissal across arms', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-huawei-ascend-950pr-ubenchx-banner-dismissed', '1');
        win.localStorage.setItem('inferencex-landing-banner-variant', 'operatorx');
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="intro-section"]').should('be.visible');
    cy.get('[data-testid="launch-banner"]').should('not.exist');
  });
});

describe('TPUv7 results', { testIsolation: true }, () => {
  beforeEach(() => {
    interceptPreviewSnapshots({ overFixtures: true });
  });

  for (const locale of ['', '/zh']) {
    it(`preserves TPUv7 FP8 cost basis in ${locale || '/'} share URLs`, () => {
      cy.visit(`${locale}/infx/inference?g_model=Qwen-3.5-397B-A17B&i_seq=8k/1k&i_prec=fp8`);
      cy.location('pathname').should('eq', `${locale}/infx/inference`);
      cy.get('[data-testid="inference-chart-display"]').should('be.visible');
      expectHwKeyPoints('tpuv7', true);
      cy.location('href').then((href) => {
        const url = new URL(href);
        url.searchParams.set('g_model', 'Qwen-3.5-397B-A17B');
        url.searchParams.set('i_seq', '8k/1k');
        url.searchParams.set('i_prec', 'fp8');
        url.searchParams.set('i_metric', 'y_costh');
        cy.visit(url.toString());
      });
      cy.get('[data-testid="tco-basis-internal"]').should('have.attr', 'aria-pressed', 'true');
      expectHwKeyPoints('tpuv7', true);
      cy.scatterPoints().then((initial) => {
        const internal = { ...tpuDatum(initial) };
        cy.get('[data-testid="tco-basis-external"]').click();
        cy.scatterPoints().should((points) => {
          expect(tpuDatum(points).y).to.be.closeTo((internal.y * 1.21) / 1.03, 1e-8);
          expect(tpuDatum(points).x).to.equal(internal.x);
        });
        cy.get('[data-testid="share-button"]').first().click();
        cy.get('[data-testid="share-url-input"]')
          .invoke('val')
          .should('include', 'g_tco=external')
          .then((url) => cy.visit(String(url)));
        cy.get('[data-testid="tco-basis-external"]').should('have.attr', 'aria-pressed', 'true');
        cy.scatterPoints().should((points) => {
          expect(tpuDatum(points).y).to.be.closeTo((internal.y * 1.21) / 1.03, 1e-8);
        });
        cy.viewport(390, 844);
        cy.get('[data-testid="inference-secondary-controls"] > button').click();
        cy.get('[data-testid="tco-basis-toggle"]').scrollIntoView().should('be.visible');
        cy.get('[data-testid="tco-basis-internal"]').click();
        cy.scatterPoints().should((points) => {
          expect(tpuDatum(points).y).to.be.closeTo(internal.y, 1e-8);
        });
      });
    });
  }
  it('hides the TCO basis selector outside Qwen3.5 8K/1K', () => {
    cy.visit('/infx/inference?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_metric=y_costh', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('be.visible');
    cy.get('[data-testid="yaxis-metric-selector"]').should('exist');
    cy.get('[data-testid="tco-basis-toggle"]').should('not.exist');
  });
});

describe('H3 video performance history', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/video-runs?format=history&page=*', {
      schemaVersion: 1,
      entries: [],
      nextPage: null,
    }).as('historyList');
  });
  it('restores published history filters on reload and browser navigation', () => {
    const entry = videoHistoryEntry(servingArtifact(), '2026-09-09T00:00:00Z');
    cy.intercept('GET', '/api/video-runs?format=history&page=1*', {
      schemaVersion: 1,
      entries: [
        entry,
        videoHistoryEntry(servingArtifact(124, 41, 'NVIDIA B200'), '2026-09-09T00:00:00Z'),
      ],
      nextPage: null,
    }).as('history');
    cy.visit('/zh/video?history-hardware=NVIDIA%20H200');
    cy.wait('@history');
    cy.contains('summary', '性能历史').parent('details').should('have.attr', 'open');
    cy.get('[data-testid="results-history"] summary').should('contain', '性能历史');
    cy.get('[data-testid="video-history-observation"]')
      .should('have.length', 3)
      .each(($observation) => {
        expect($observation).to.contain('NVIDIA H200').and.not.contain('NVIDIA B200');
      });
    cy.get('head meta[name="robots"]').should('have.attr', 'content', 'noindex, nofollow');
    cy.get('[aria-label="客户端并发数"]').click();
    cy.contains('[role="option"]', 'C2').click();
    cy.get('[data-testid="video-history-observation"]')
      .should('have.length', 1)
      .and('contain', 'C2');
    cy.reload();
    cy.get('[data-testid="video-history-observation"]')
      .should('have.length', 1)
      .and('contain', 'C2')
      .and('contain', '240 / —');
    cy.location('search').should((search) => {
      const params = new URLSearchParams(search);
      expect(params.get('history-concurrency')).to.equal('2');
      expect(params.get('history-hardware')).to.equal('NVIDIA H200');
    });
    cy.window().then((win) => {
      const next = new URL(win.location.href);
      next.searchParams.set('history-concurrency', '4');
      win.history.pushState(null, '', next);
    });
    cy.reload();
    cy.get('[data-testid="video-history-observation"]')
      .should('have.length', 1)
      .and('contain', 'C4');
    cy.go('back');
    cy.get('[data-testid="video-history-observation"]')
      .should('have.length', 1)
      .and('contain', 'C2');
    cy.go('forward');
    cy.get('[data-testid="video-history-observation"]')
      .should('have.length', 1)
      .and('contain', 'C4');
  });
  it('keeps the hidden Video tab behind the shared unlock and noindex', () => {
    cy.viewport(1440, 1000);
    cy.visit('/video', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
      },
    });
    // The dashboard loads published history in the same hydration pass that attaches the unlock
    // key listener, so wait for that request before typing.
    cy.wait('@historyList');
    cy.get('video[data-role]').should('not.exist');
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('body').type(
      '{upArrow}{upArrow}{downArrow}{downArrow}{leftArrow}{rightArrow}{leftArrow}{rightArrow}BA',
    );
    cy.get('[data-testid="tab-trigger-hidden"]').click();
    cy.contains('a', 'Video').should('have.attr', 'href', '/video');
    cy.get('head meta[name="robots"]').should('have.attr', 'content', 'noindex, nofollow');
  });
});

describe('pre-split dashboard URLs', () => {
  for (const [from, to] of [
    ['/inference/deepseek-r1?i_seq=8k%2F1k', '/infx/inference/deepseek-r1?i_seq=8k%2F1k'],
    ['/agentx/methodology', '/infx/agentx/methodology'],
    ['/agentic-workload-explorer/methodology', '/infx/agentic-workload-explorer/methodology'],
  ]) {
    it(`sends ${from} to ${to} in one 308`, () => {
      cy.request({ url: from, followRedirect: false }).then((response) => {
        expect(response.status).to.eq(308);
        const location = new URL(response.headers.location as string, 'http://x');
        expect(`${location.pathname}${location.search}`).to.eq(to);
      });
    });
  }
});
