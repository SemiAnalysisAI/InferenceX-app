import { availabilityBody } from '../support/e2e';
import {
  availability,
  b300Rows,
  interceptCalculatorOverlayRun,
  interceptOverlayRun,
  OVERLAY_RUN_BRANCH,
  OVERLAY_RUN_ID,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';

const historicalRows = () =>
  b300Rows(null).map((row) => ({
    ...row,
    prefill_ep: 1,
    decode_ep: 1,
    prefill_dp_attention: false,
    decode_dp_attention: false,
    prefill_num_workers: 1,
    decode_num_workers: 1,
  }));

const BARS = '[data-testid="cache-reuse-chart"] svg .cr-bar';
const SEGMENTS = '[data-testid="cache-reuse-chart"] svg .cr-segment';
const X_TICKS = '[data-testid="cache-reuse-chart"] svg .x-axis .tick text';

const boxOf = (el: Element) => el.getBoundingClientRect();

const dismissNudges = (win: Cypress.AUTWindow) => {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.localStorage.setItem('inferencex-reproducibility-nudge-dismissed', '1');
};

const firstRowCell = (header: string) =>
  cy.get('[data-testid="cache-reuse-table"] thead th').then(($ths) => {
    const index = $ths.toArray().findIndex((th) => (th.textContent ?? '').includes(header));
    expect(index, `a column headed "${header}"`).to.be.greaterThan(-1);
    return cy.get('[data-testid="cache-reuse-table"] tbody tr').first().find('td').eq(index);
  });

const labelsInsideSegments = () =>
  cy.get(SEGMENTS).then(($segments) => {
    const segments = [...$segments].map(boxOf);
    cy.get('[data-testid="cache-reuse-chart"] svg .cr-value').each(($label) => {
      const label = boxOf($label[0]);
      const inside = segments.some(
        (s) =>
          label.left >= s.left - 0.5 &&
          label.right <= s.right + 0.5 &&
          label.top >= s.top - 0.5 &&
          label.bottom <= s.bottom + 0.5,
      );
      expect(inside, `"${$label.text()}" sits inside a segment`).to.equal(true);
    });
  });

describe('Prefix Cache Reuse', () => {
  describe('official rows', () => {
    before(() => {
      interceptOverlayRun();
      cy.visit('/infx/cache-reuse', { onBeforeLoad: dismissNudges });
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

      cy.get('label[for="cache-reuse-config"]').should('contain.text', 'Configuration');
      cy.get('[data-testid="cache-reuse-config-selector"]').should('contain.text', 'B300');
      cy.get('[data-testid="cache-reuse-config-selector"]')
        .invoke('text')
        .then((config) => {
          cy.get('[data-testid="cache-reuse-figure"] figcaption').should(
            'contain.text',
            config.trim(),
          );
          cy.get('[data-testid="cache-reuse-figure"] [data-testid="result-context"]').should(
            'contain.text',
            'SemiAnalysis InferenceX',
          );
        });
    });
  });

  describe('share-link seeding', () => {
    it('falls back to a tiered configuration when the requested one is unknown', () => {
      interceptOverlayRun();
      cy.visit('/infx/cache-reuse?c_cfg=nope_sglang', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get(BARS).should('have.length', REAL_CONFIGS.length);
      cy.get('[data-testid="cache-reuse-config-selector"]').should('contain.text', 'B300');
    });
  });

  describe('serving recipes', () => {
    for (const width of [393, 1280]) {
      it(`switches recipes without mixing bars at ${width}px`, () => {
        cy.viewport(width, 900);
        interceptOverlayRun();
        const rows = b300Rows(null).map((row) => ({
          ...row,
          prefill_ep: 1,
          decode_ep: 1,
          prefill_dp_attention: false,
          decode_dp_attention: false,
          prefill_num_workers: 1,
          decode_num_workers: 1,
        }));
        const other = rows.slice(0, 2).map((row) => ({
          ...row,
          id: row.id + 100,
          decode_tp: 16,
          num_decode_gpu: 16,
          metrics: {
            ...row.metrics,
            server_gpu_cache_hit_rate: 0.6,
            prefill_pp: 2,
            decode_dcp_size: 8,
            prefill_pcp_size: 4,
          },
        }));
        cy.intercept('GET', '/api/v1/benchmarks*', { body: [...rows, ...other] }).as('recipes');
        const recipe = 'agg|sn|p1x8/1/-|d1x16/1/-|g8+16|spec-none|offload-on||parallel-2/1/1/8/4/1';
        cy.visit(`/infx/cache-reuse?c_recipe=${encodeURIComponent(recipe)}`, {
          onBeforeLoad: dismissNudges,
        });
        cy.wait('@recipes');
        cy.get(BARS).should('have.length', 2);
        firstRowCell('HBM').should('have.text', '60.0%');
        firstRowCell('Recipe').should('contain.text', 'TP16PP2/DCP8/PCP4');
        cy.get('[data-testid="cache-reuse-controls"]').screenshot(
          `parallel-recipe-controls-${width}`,
        );
        cy.get('[data-testid="cache-reuse-recipe-selector"]').should('contain.text', 'TP16');
        cy.get('[data-testid="cache-reuse-figure"] figcaption').should(
          'not.contain.text',
          'measured rows',
        );
        cy.get('#cache-reuse-recipe').click();
        cy.contains('[role="option"]', 'TP8').click();
        cy.get(BARS).should('have.length', REAL_CONFIGS.length);
        firstRowCell('HBM').should('have.text', '80.0%');
        firstRowCell('Recipe').should('contain.text', 'TP8');
      });
    }
  });

  describe('historical recipe links', () => {
    const recipe = 'agg|sn|p1x8/1/-|d1x8/1/-|g8+8|spec-none|offload-on|';

    it('loads the source run even when it is absent from the date picker', () => {
      interceptOverlayRun();
      cy.intercept('GET', '/api/v1/benchmarks*', (req) => {
        const params = new URL(req.url).searchParams;
        const exact =
          params.get('runId') === '111' &&
          params.get('exactRun') === 'true' &&
          !params.has('view') &&
          !params.has('date');
        req.reply({
          body: historicalRows().map((row) => ({
            ...row,
            metrics: { ...row.metrics, server_gpu_cache_hit_rate: exact ? 0.6 : 0.8 },
          })),
        });
      }).as('sourceRun');
      cy.visit(
        `/infx/cache-reuse?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4&g_rundate=2026-09-17&g_runid=111&c_recipe=${encodeURIComponent(recipe)}`,
        { onBeforeLoad: dismissNudges },
      );
      cy.wait('@sourceRun');
      firstRowCell('HBM').should('have.text', '60.0%');
      cy.location('search').should('include', 'g_runid=111');
    });

    it('drops the run pin when the model changes', () => {
      interceptOverlayRun();
      cy.intercept('GET', '/api/v1/availability/compact', {
        body: availabilityBody([...availability, { ...availability[0], model: 'kimik3' }]),
      });
      cy.intercept('GET', '/api/v1/benchmarks*', (req) => {
        const pinned = new URL(req.url).searchParams.has('runId');
        req.reply({
          body: historicalRows().map((row) => ({
            ...row,
            metrics: { ...row.metrics, server_gpu_cache_hit_rate: pinned ? 0.6 : 0.8 },
          })),
        });
      });
      cy.visit(
        '/infx/cache-reuse?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4&g_rundate=2026-09-17&g_runid=111',
        { onBeforeLoad: dismissNudges },
      );
      firstRowCell('HBM').should('have.text', '60.0%');
      cy.get('#cache-reuse-model').click();
      cy.contains('[role="option"]', 'Kimi K3').click();
      cy.get('#cache-reuse-model').should('contain.text', 'Kimi K3');
      firstRowCell('HBM').should('have.text', '80.0%');
    });

    it('does not substitute another chip when the linked configuration is missing', () => {
      interceptOverlayRun();
      cy.intercept('GET', '/api/v1/benchmarks*', { body: historicalRows() }).as('otherChip');
      cy.visit(`/infx/cache-reuse?c_cfg=missing_sglang&c_recipe=${encodeURIComponent(recipe)}`, {
        onBeforeLoad: dismissNudges,
      });
      cy.wait('@otherChip');
      cy.get('[data-testid="cache-reuse-no-tiers"]').should(
        'contain.text',
        'The linked recipe is unavailable',
      );
      cy.get(BARS).should('not.exist');
    });

    for (const [width, locale] of [
      [1280, 'en'],
      [393, 'zh'],
    ] as const) {
      it(`explains a missing recipe and allows an explicit replacement at ${width}px`, () => {
        cy.viewport(width, 900);
        interceptOverlayRun();
        cy.intercept('GET', '/api/v1/benchmarks*', { body: historicalRows() }).as('singleRecipe');
        cy.visit(`${locale === 'zh' ? '/zh' : ''}/infx/cache-reuse?c_recipe=missing`, {
          onBeforeLoad: dismissNudges,
        });
        cy.wait('@singleRecipe');
        cy.get('[data-testid="cache-reuse-no-tiers"]').should(
          'contain.text',
          locale === 'zh' ? '当前快照中没有链接指定的配置方案' : 'The linked recipe is unavailable',
        );
        cy.get(BARS).should('not.exist');
        cy.get('[data-testid="cache-reuse-figure"]').screenshot(`missing-recipe-${width}`);
        cy.get('#cache-reuse-recipe').click();
        cy.contains('[role="option"]', 'TP8').click();
        cy.get(BARS).should('have.length', REAL_CONFIGS.length);
        firstRowCell('HBM').should('have.text', '80.0%');
      });
    }
  });

  describe('unofficial-run overlay', () => {
    before(() => {
      interceptOverlayRun();
      cy.visit(`/infx/cache-reuse?unofficialrun=${OVERLAY_RUN_ID}`, {
        onBeforeLoad: dismissNudges,
      });
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
      cy.visit('/infx/cache-reuse?i_seq=1k%2F1k', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get('[data-testid="cache-reuse-no-tiers"]').should('contain.text', 'Fixed-sequence');
      cy.get(BARS).should('not.exist');
    });
  });

  describe('layout', () => {
    it('draws phone-width bars as rows, lowest concurrency first, labels inside', () => {
      cy.viewport(393, 852);
      interceptOverlayRun();
      cy.visit('/infx/cache-reuse', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get(BARS).should('have.length', REAL_CONFIGS.length);
      cy.get(BARS).each(($bar) => {
        const box = boxOf($bar[0]);
        expect(box.width, 'row bar is wider than tall').to.be.greaterThan(box.height);
      });
      cy.get(`${BARS}[data-conc="1"]`).then(($first) => {
        cy.get(`${BARS}[data-conc="48"]`).then(($last) => {
          expect(boxOf($first[0]).top).to.be.lessThan(boxOf($last[0]).top);
        });
      });
      labelsInsideSegments();
    });

    it('keeps desktop columns and their labels inside each segment', () => {
      cy.viewport(1280, 900);
      interceptOverlayRun();
      cy.visit('/infx/cache-reuse', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      cy.get(BARS)
        .first()
        .then(($bar) => {
          const box = boxOf($bar[0]);
          expect(box.height, 'column bar is taller than wide').to.be.greaterThan(box.width);
        });
      labelsInsideSegments();
    });
  });

  describe('Chinese page', () => {
    it('renders Chinese tier labels', () => {
      interceptOverlayRun();
      cy.visit('/zh/infx/cache-reuse', { onBeforeLoad: dismissNudges });
      cy.wait('@benchmarks');
      firstRowCell('HBM').should('have.text', '80.0%');
    });
  });
});
