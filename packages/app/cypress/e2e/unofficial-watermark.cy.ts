import { availabilityBody } from '../support/e2e';
import { expandLegendAdvanced } from '../support/legend-advanced';

describe('Unofficial-run watermark', () => {
  before(() => {
    cy.fixture('api/benchmarks.json').then((benchmarks) => {
      const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26312107787';
      cy.intercept('GET', '/api/unofficial-run*', {
        body: {
          runInfos: [
            {
              id: 26312107787,
              name: 'Unofficial watermark fixture',
              branch: 'test/unofficial-watermark',
              sha: 'abc123',
              createdAt: '2026-06-25T00:00:00Z',
              url: runUrl,
              conclusion: 'success',
              status: 'completed',
              isNonMainBranch: true,
            },
          ],
          benchmarks: benchmarks.map((row: Record<string, unknown>) => ({
            ...row,
            is_multinode: true,
            prefill_tp: 8,
            prefill_ep: 1,
            decode_tp: 8,
            decode_ep: 1,
            metrics: {
              ...(row.metrics as Record<string, unknown> | undefined),
              kv_offloading: 'dram',
              kv_offload_backend: 'hicache',
              kv_p2p_transfer: 'nixl',
              router_name: 'sglang-router',
              router_version: '0.3.2',
              dcp_size: 8,
              pcp_size: 4,
              server_gpu_cache_hit_rate: 0.875,
            },
            run_url: runUrl,
          })),
          evaluations: [],
        },
      });
      cy.intercept('GET', '/api/v1/availability/compact', { body: availabilityBody([]) });
      cy.intercept('GET', '/api/v1/benchmarks*', { body: [] });

      cy.visit(
        '/inference?g_model=DeepSeek-R1-0528&i_seq=1k%2F1k&i_prec=fp4%2Cfp8&unofficialrun=26312107787',
        {
          onBeforeLoad(win) {
            win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          },
        },
      );
    });
  });

  it('shows the full two-line warning on unofficial charts', () => {
    cy.get('[data-testid="inference-chart-display"] svg pattern[id^="unofficial-pattern-"] text')
      .should('have.length.greaterThan', 0)
      .first()
      .find('tspan')
      .should('have.length', 2)
      .then(($lines) => {
        expect([...$lines].map((line) => line.textContent)).to.deep.equal([
          'UNOFFICIAL RESULTS, DO NOT TRUST',
          'May contain hacks, or not fully passing evals',
        ]);
      });

    cy.get('[data-testid="inference-chart-display"] .unofficial-watermark-image')
      .should('have.length.greaterThan', 0)
      .each(($image) => {
        cy.wrap($image).should('have.attr', 'href', '/decorative/pointing-muse.webp');
        cy.wrap($image).parent('svg').find('.unofficial-watermark-image').should('have.length', 1);
      });

    cy.get('[data-testid="scatter-graph"] .unofficial-overlay-pt')
      .first()
      .then(($point) => {
        $point[0].dispatchEvent(new MouseEvent('mouseenter'));
        const tooltip = $point[0].ownerDocument.querySelector<HTMLElement>('[data-chart-tooltip]');
        expect(tooltip).not.to.equal(null);
        expect(tooltip!.style.display).to.equal('block');
        expect(tooltip).to.contain.text('Unofficial run');
        expect(tooltip).to.contain.text('TP8/DCP8/PCP4');
        $point[0].dispatchEvent(new MouseEvent('mouseleave'));
      });
    cy.get('[data-testid="scatter-graph"] .unofficial-overlay-pt .overlay-x')
      .first()
      .click({ force: true });
    for (const [label, value] of [
      ['Offload type', 'DRAM'],
      ['KV offload engine', 'HiCache'],
      ['KV transfer engine', 'NIXL'],
      ['Router', 'SGLang Router 0.3.2'],
      ['Decode context parallelism (DCP)', '8'],
      ['Prefill context parallelism (PCP)', '4'],
      ['Chip cache hit rate', '87.5%'],
    ]) {
      cy.contains('[data-testid="point-details-panel"] [data-slot="stat"]', label).should(
        'contain.text',
        value,
      );
    }
    cy.get('[data-testid="point-details-close"]').click();
    cy.get('[data-testid="point-details-panel"]').should('not.exist');

    expandLegendAdvanced();
    cy.get('#scatter-parallelism-labels').click();
    cy.get('[data-testid="scatter-graph"] .unofficial-overlay-pt')
      .first()
      .find('.overlay-label')
      .should('contain.text', 'TP8/DCP8/PCP4');

    cy.get('[data-testid="scatter-graph"]').first().scrollIntoView();
    cy.screenshot('unofficial-watermark', { capture: 'viewport' });

    cy.get('button[aria-label="Dismiss test/unofficial-watermark"]').click();
    cy.get('[data-testid="inference-chart-display"] .unofficial-watermark-image').should(
      'not.exist',
    );
  });
});
