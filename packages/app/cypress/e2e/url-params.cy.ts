import { CANVAS_POINT_SURFACE_CLASS } from '@/lib/d3-chart/layers/canvas-points';

import { selectXAxisMode } from '../support/e2e';
import { expandLegendAdvanced } from '../support/legend-advanced';
import { type ScatterPoint, triggerAtPoint, visiblePoints } from '../support/scatter-points';

const withFixtureModel = (path: string) => {
  const url = new URL(path, 'http://localhost');
  if (url.pathname === '/infx/inference' && !url.searchParams.has('g_model')) {
    url.searchParams.set('g_model', 'DeepSeek-V4-Pro');
  }
  return `${url.pathname}${url.search}${url.hash}`;
};

const inPlot = (points: ScatterPoint[]) =>
  visiblePoints(points).filter((point) => {
    const svg = point.hitArea.closest('svg')!;
    const plot = svg.parentElement!.querySelector<HTMLCanvasElement>(
      `.${CANVAS_POINT_SURFACE_CLASS}`,
    )!;
    return (
      point.x >= 0 && point.x <= plot.clientWidth && point.y >= 0 && point.y <= plot.clientHeight
    );
  });

const visitWithDismissedModal = (path: string) => {
  cy.visit(withFixtureModel(path), {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
};

const visitWithErrorSpy = (path: string) => {
  cy.visit(withFixtureModel(path), {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      cy.stub(win.console, 'error').as('consoleError');
    },
  });
};

const assertNoHydrationMismatch = () => {
  cy.get('[data-testid="scenario-selector"]').should('be.visible');
  cy.get('@consoleError').then((spy) => {
    const calls = (spy as unknown as { args: unknown[][] }).args;
    const hydration = calls.filter((args) =>
      args.some((a) => typeof a === 'string' && /hydrat(?:ion|ed) (?:mismatch|failed)/iu.test(a)),
    );
    expect(hydration, JSON.stringify(hydration)).to.have.length(0);
  });
};

describe('URL Parameter Persistence', () => {
  describe('Inference legend', () => {
    it('i_legend=0 hides the sidebar legend on load and the reopen button restores it', () => {
      visitWithDismissedModal('/infx/inference?i_legend=0');
      cy.get('[data-testid="legend-open-button"]').first().should('be.visible');
      cy.get('.sidebar-legend').should('not.exist');

      cy.get('[data-testid="legend-open-button"]').first().click();
      cy.get('.sidebar-legend').first().should('be.visible');
      cy.get('[data-testid="legend-open-button"]').should('not.exist');
    });

    it('preserves a legend subset when chart metrics change', () => {
      visitWithDismissedModal('/infx/inference');

      cy.get('[data-testid="chart-legend"] input[type="checkbox"]:checked').should(
        'have.length.greaterThan',
        1,
      );
      cy.get('[data-testid="chart-legend"] [role="button"][aria-label^="Hide "]')
        .first()
        .closest('li')
        .find('input[type="checkbox"]')
        .invoke('attr', 'id')
        .then((hiddenInputId) => {
          expect(hiddenInputId).to.be.a('string');
          expect(hiddenInputId).to.have.length.greaterThan(0);
          const selector = `#${CSS.escape(hiddenInputId!)}`;

          cy.get(selector).parent().find('[role="button"][aria-label^="Hide "]').click();
          cy.get(selector).should('not.be.checked');

          cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
          cy.contains('[data-select-option]', 'All-in Provisioned Joules per Total Token').click({
            force: true,
          });
          cy.get(selector).should('not.be.checked');

          selectXAxisMode('ttft');
          cy.get(selector).should('not.be.checked');
        });
    });

    it('refreshes the automatic Best per SKU selection when the metric changes', () => {
      visitWithDismissedModal('/infx/inference');

      cy.get('[data-testid="scatter-quick-filters"]').click();
      cy.get('[data-testid="quick-filter-best-per-sku"]').should(
        'have.attr',
        'data-state',
        'checked',
      );
      cy.contains('button', 'Done').click();
      cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');

      cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked')
        .then(($inputs) => [...$inputs].map((input) => input.id).toSorted())
        .then((before) => {
          cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
          cy.contains('[data-select-option]', /^Cost per Million Total Tokens$/u).click({
            force: true,
          });

          cy.get('[data-testid="scatter-quick-filters"]').click();
          cy.get('[data-testid="quick-filter-best-per-sku"]').should(
            'have.attr',
            'data-state',
            'checked',
          );
          cy.contains('button', 'Done').click();
          cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');
          selectXAxisMode('ttft');
          cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked').then(
            ($inputs) => {
              const after = [...$inputs].map((input) => input.id).toSorted();
              expect(after, 'metric-specific Best per SKU winners').not.to.deep.equal(before);
            },
          );
        });
    });
  });

  describe('Provider remount state', () => {
    it('preserves filters across a standalone dashboard route', () => {
      visitWithDismissedModal('/infx/inference');
      cy.get('[data-testid="model-selector"]').click();
      cy.contains('[role="option"]', 'Qwen3.5 397B').click();
      cy.get('[data-testid="model-selector"]').should('contain.text', 'Qwen3.5 397B');
      cy.get('[data-testid="tab-trigger-submissions"]').click();
      cy.url().should('include', '/infx/submissions');
      cy.get('[data-testid="tab-trigger-inference"]').click();

      cy.get('[data-testid="model-selector"]').should('contain.text', 'Qwen3.5 397B');
    });

    it('preserves the newest pending model across a retained-provider tab switch', () => {
      visitWithDismissedModal('/infx/inference');
      cy.get('[data-testid="model-selector"]').click();
      cy.contains('[role="option"]', 'MiniMax M3 428B').click();
      cy.get('[data-testid="model-selector"]').should('contain.text', 'MiniMax M3 428B');
      cy.wait(200);

      cy.get('[data-testid="model-selector"]').click();
      cy.contains('[role="option"]', 'Qwen3.5 397B').click();
      cy.get('[data-testid="tab-trigger-evaluation"]').click();
      cy.location('pathname').should('eq', '/infx/evaluation');
      cy.get('[data-testid="tab-trigger-inference"]').click();
      cy.location('pathname').should('eq', '/infx/inference');
      cy.get('[data-testid="model-selector"]').should('contain.text', 'Qwen3.5 397B');
    });
  });

  describe('Inference Y-axis metric', () => {
    it('i_metric URL param pre-selects the metric and updates SVG axis label', () => {
      visitWithDismissedModal('/infx/inference?i_metric=y_costh');

      cy.get('[data-testid="yaxis-metric-selector"]').should(
        'contain.text',
        'Cost per Million Total Tokens',
      );
      cy.get('[data-testid="cost-tier-selector"]').should(
        'contain.text',
        'Owning at large hyperscaler volume',
      );

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('have.text', 'Cost per Million Total Tokens ($)');
    });

    it('changing Y-axis metric via dropdown updates SVG axis label', () => {
      visitWithDismissedModal('/infx/inference');

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('contain.text', 'Total Tokens per $1 TCO');

      cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
      cy.contains('[data-select-option]', /^Cost per Million Total Tokens$/u).click({
        force: true,
      });

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('have.text', 'Cost per Million Total Tokens ($)');
    });

    it('keeps tooltip rulers aligned after a zoomed metric switch', () => {
      visitWithDismissedModal('/infx/inference?i_metric=y_tpPerGpu');
      expandLegendAdvanced();
      cy.get('#scatter-log-scale').first().click();

      cy.get('[data-testid="scatter-graph"] [data-testid="d3-chart-svg"]')
        .first()
        .then(($svg) => {
          const svg = $svg[0] as unknown as SVGSVGElement & { __zoom?: { k: number } };
          const bounds = svg.getBoundingClientRect();
          for (let i = 0; i < 2; i += 1) {
            svg.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: -240,
                clientX: bounds.x + bounds.width / 2,
                clientY: bounds.y + bounds.height / 2,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
          expect(svg.__zoom?.k, 'active zoom scale').to.be.greaterThan(1);
        });

      cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
      cy.contains('[data-select-option]', 'Input Token Throughput per Chip').click({ force: true });
      cy.get('[data-testid="yaxis-metric-selector"]').should(
        'contain.text',
        'Input Token Throughput per Chip',
      );

      cy.scatterPoints()
        .should((points) => expect(inPlot(points)).to.not.be.empty)
        .then((points) => {
          const point = inPlot(points)[0];
          triggerAtPoint(point, 'mousemove');
          cy.get('[data-testid="scatter-graph"] .vertical-ruler')
            .first()
            .invoke('attr', 'x1')
            .then((x) => expect(Number(x)).to.be.closeTo(point.x, 1));
          cy.get('[data-testid="scatter-graph"] .horizontal-ruler')
            .first()
            .invoke('attr', 'y1')
            .then((y) => expect(Number(y)).to.be.closeTo(point.y, 1));
        });
    });
  });

  describe('Reliability date range', () => {
    it('r_range=last-7-days pre-selects date range', () => {
      visitWithDismissedModal('/infx/reliability?r_range=last-7-days');
      cy.url().should('include', '/infx/reliability');
      cy.get('[data-testid="reliability-date-range"]').should('contain.text', 'Last 7 days');
    });
  });

  describe('Hydration on shared-link entry', () => {
    it('/compare/[slug] with ?i_seq=1k/1k seeds the sequence without a hydration error', () => {
      visitWithErrorSpy('/compare/deepseek-r1-h100-vs-h200?i_seq=1k/1k');
      cy.get('[data-testid="scenario-selector"]').should('contain.text', '1K / 1K');
      assertNoHydrationMismatch();
    });

    it('/compare/[slug] with invalid ?i_seq=junk falls back to the seeded default', () => {
      visitWithErrorSpy('/compare/deepseek-r1-h100-vs-h200?i_seq=junk');
      cy.get('[data-testid="scenario-selector"]')
        .invoke('text')
        .should('not.contain', 'junk')
        .and('match', /[18]K . [18]K/u);
      assertNoHydrationMismatch();
    });

    it('/infx/inference?g_model=gpt-oss-120b seeds the model without a hydration error', () => {
      visitWithErrorSpy('/infx/inference?g_model=gpt-oss-120b');
      cy.get('[data-testid="model-selector"]').should('contain.text', 'gpt-oss 120B');
      assertNoHydrationMismatch();
    });

    it('/infx/inference with invalid ?g_model=junk falls back to the default', () => {
      visitWithErrorSpy('/infx/inference?g_model=junk');
      cy.get('[data-testid="model-selector"]').invoke('text').should('not.contain', 'junk');
      assertNoHydrationMismatch();
    });

    it('/infx/inference with invalid ?i_prec=junk falls back to the default', () => {
      visitWithErrorSpy('/infx/inference?g_model=DeepSeek-R1-0528&i_prec=junk');
      cy.get('[data-testid="precision-multiselect"]').invoke('text').should('not.contain', 'junk');
      assertNoHydrationMismatch();
    });
  });

  describe('High contrast mode', () => {
    it('r_hc=1 applies to reliability chart', () => {
      visitWithDismissedModal('/infx/reliability?r_hc=1');
      cy.get('[data-testid="reliability-chart-display"]').should('exist');
      cy.get('#reliability-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('e_hc=1 applies to evaluation chart', () => {
      visitWithDismissedModal('/infx/evaluation?e_hc=1');
      cy.get('[data-testid="evaluation-chart-display"]').should('exist');
      cy.get('[data-testid="evaluation-view-toggle"]').contains('Chart').click();
      cy.get('#eval-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('historical trends tab shares the inference high-contrast default (off)', () => {
      visitWithDismissedModal('/infx/historical');
      cy.get('[data-testid="historical-trends-display"]').should('exist');
      cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=1 enables historical trends high contrast', () => {
      visitWithDismissedModal('/infx/historical?i_hc=1');
      cy.get('[data-testid="historical-trends-display"]').should('exist');
      cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });
  });

  describe('Default toggle states (share-link correctness)', () => {
    it('an /infx/inference link with neither toggle param renders high contrast AND parallelism labels off', () => {
      visitWithDismissedModal('/infx/inference');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      expandLegendAdvanced();
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
      cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=1&i_advlabel=1 enables both high contrast and parallelism labels on load', () => {
      visitWithDismissedModal('/infx/inference?i_hc=1&i_advlabel=1');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      expandLegendAdvanced();
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
      cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    });
  });
});
