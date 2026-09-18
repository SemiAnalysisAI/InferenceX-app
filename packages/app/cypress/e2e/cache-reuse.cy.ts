/**
 * Prefix Cache Reuse (`/cache-reuse`).
 *
 * Stacked shares of prompt tokens per concurrency for one configuration: HBM
 * hits, host-tier hits, and the rest. The agentic overlay fixtures report
 * gpu 0.8 / external 0.1 / cpu 0.05 with offload on, so every bar must read
 * 80 / 5 / 15 — the host tier is the CPU-offload figure and the router's
 * external figure is not added on top. The fixed-sequence fixtures carry no
 * cache tier at all, which is the page's honest empty state for that scenario.
 */
import { interceptDerivedAgenticMetrics, unlockAgenticGate } from '../support/e2e';
import {
  interceptCalculatorOverlayRun,
  interceptOverlayRun,
  OVERLAY_RUN_BRANCH,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

const BARS = '[data-testid="cache-reuse-chart"] svg .cr-bar';
const SEGMENTS = '[data-testid="cache-reuse-chart"] svg .cr-segment';
const X_TICKS = '[data-testid="cache-reuse-chart"] svg .x-axis .tick text';

const dismissNudges = (win: Cypress.AUTWindow) => {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
};

const firstRowCell = (header: string) =>
  cy.get('[data-testid="cache-reuse-table"] thead th').then(($ths) => {
    const index = $ths.toArray().findIndex((th) => (th.textContent ?? '').includes(header));
    expect(index, `a column headed "${header}"`).to.be.greaterThan(-1);
    return cy.get('[data-testid="cache-reuse-table"] tbody tr').first().find('td').eq(index);
  });

describe('Prefix Cache Reuse', () => {
  describe('official rows', () => {
    before(() => {
      interceptOverlayRun();
      cy.visit('/cache-reuse', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get('[data-testid="cache-reuse-figure"]').should('exist');
    });

    it('stacks HBM, host, and not-reused shares for every measured concurrency', () => {
      cy.get(BARS).should('have.length', REAL_CONFIGS.length);
      for (const tier of ['hbm', 'host', 'unreused']) {
        cy.get(`${SEGMENTS}[data-tier="${tier}"]`).should('have.length', REAL_CONFIGS.length);
      }
      cy.get(X_TICKS).then(($ticks) => {
        expect([...$ticks].map((el) => el.textContent)).to.deep.equal(['1', '2', '4', '8', '48']);
      });
      cy.get('.sidebar-legend')
        .should('contain.text', 'HBM cache')
        .and('contain.text', 'Host cache')
        .and('contain.text', 'Not reused');
    });

    it('takes the host tier from the CPU-offload rate and leaves the external rate out', () => {
      firstRowCell('HBM').should('have.text', '80.0%');
      firstRowCell('Host').should('have.text', '5.0%');
      firstRowCell('Not reused').should('have.text', '15.0%');
    });

    it('labels the configuration control and shows the plotted config', () => {
      cy.get('label[for="cache-reuse-config"]').should('contain.text', 'Configuration');
      cy.get('[data-testid="cache-reuse-config-selector"]').should('contain.text', 'B300');
      cy.get('[data-testid="cache-reuse-figure"] figcaption').should(
        'contain.text',
        `${REAL_CONFIGS.length} of ${REAL_CONFIGS.length} measured rows report cache tiers`,
      );
    });
  });

  describe('share-link seeding', () => {
    it('falls back to a tiered configuration when the requested one is unknown', () => {
      interceptOverlayRun();
      cy.visit('/cache-reuse?c_cfg=nope_sglang', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get(BARS).should('have.length', REAL_CONFIGS.length);
      cy.get('[data-testid="cache-reuse-config-selector"]').should('contain.text', 'B300');
    });
  });

  describe('unofficial-run overlay', () => {
    before(() => {
      interceptOverlayRun();
      cy.visit(`/cache-reuse?unofficialrun=${OVERLAY_RUN_ID}`, { onBeforeLoad: dismissNudges });
      cy.wait('@unofficialRun');
      cy.get(`${BARS}[data-series="run:0"]`).should('have.length', REAL_CONFIGS.length);
    });

    it('draws the run as its own outlined series beside the official bars', () => {
      cy.get(BARS).should('have.length', REAL_CONFIGS.length * 2);
      cy.get(`${BARS}[data-series="run:0"]`)
        .first()
        .should('have.attr', 'stroke')
        .and('include', 'overlay-run-0');
      cy.get(`${BARS}[data-series="official"]`).first().should('have.attr', 'stroke', 'none');
      cy.get('.sidebar-legend').should('contain.text', OVERLAY_RUN_BRANCH);
    });

    it('lists the run under its branch in the table', () => {
      cy.get('[data-testid="cache-reuse-table"] tbody tr').should(
        'have.length',
        REAL_CONFIGS.length * 2,
      );
      cy.get('[data-testid="cache-reuse-table"] tbody').should('contain.text', OVERLAY_RUN_BRANCH);
    });
  });

  describe('fixed sequences', () => {
    it('explains that fixed-sequence rows record no cache tiers', () => {
      interceptCalculatorOverlayRun();
      cy.visit('/cache-reuse?i_seq=1k%2F1k', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get('[data-testid="cache-reuse-no-tiers"]').should('contain.text', 'Fixed-sequence');
      cy.get(BARS).should('not.exist');
    });
  });

  describe('entry from the inference chart', () => {
    it('links the agentic footer to the tab with the chart state attached', () => {
      interceptOverlayRun();
      interceptDerivedAgenticMetrics();
      cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
        onBeforeLoad(win) {
          dismissNudges(win);
          unlockAgenticGate(win);
        },
      });
      cy.wait('@benchmarks');
      cy.get('[data-testid="chart-status-notes"] [data-testid="cache-reuse-link"]')
        .should('have.attr', 'href')
        .and('match', /^\/cache-reuse\?/)
        .and('include', 'i_seq=agentic-traces');
      cy.get('[data-testid="cache-reuse-link"]').click();
      cy.location('pathname').should('eq', '/cache-reuse');
      cy.get(BARS).should('have.length', REAL_CONFIGS.length);
    });

    it('stays off the fixed-sequence chart', () => {
      interceptCalculatorOverlayRun();
      cy.visit('/inference?i_seq=1k%2F1k', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get('[data-testid="chart-status-notes"] [data-testid="cache-reuse-link"]').should(
        'not.exist',
      );
    });
  });

  describe('Chinese page', () => {
    it('renders the intro and Chinese tier labels', () => {
      interceptOverlayRun();
      cy.visit('/zh/cache-reuse', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get('[data-testid="zh-tab-intro"]').should('contain.text', '前缀缓存复用');
      cy.get('label[for="cache-reuse-config"]').should('contain.text', '配置');
      cy.get('.sidebar-legend').should('contain.text', 'HBM 缓存').and('contain.text', '未复用');
      firstRowCell('HBM').should('have.text', '80.0%');
    });
  });
});
