import { CANVAS_POINT_LAYER_SELECTOR } from '@/lib/d3-chart/layers/canvas-point-registry';

import { expandLegendAdvanced } from '../support/legend-advanced';
import { POINT_LABELS } from '../support/scatter-points';

describe('Line Labels Toggle', () => {
  before(() => {
    cy.visit('/inference?g_model=DeepSeek-V4-Pro', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
    // Line and GPU-count switches remain in the Advanced drawer.
    expandLegendAdvanced();
  });

  it('line labels stay in the foreground after zooming', () => {
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);

    cy.get('#scatter-line-labels').then(($el) => {
      if ($el.attr('data-state') !== 'checked') cy.wrap($el).click();
    });
    cy.get('[data-testid="scatter-graph"] svg g.line-label .ll-bg').should(
      'have.length.greaterThan',
      0,
    );
    cy.get('[data-testid="scatter-graph"] svg g.line-label .ll-text').should(
      'have.length.greaterThan',
      0,
    );

    cy.get('#scatter-line-labels').then(($el) => {
      if ($el.attr('data-state') !== 'checked') cy.wrap($el).click();
    });
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);

    cy.get('[data-testid="scatter-graph"] [data-testid="d3-chart-svg"]').then(($svg) => {
      const svg = $svg[0];
      const points = svg.querySelector(CANVAS_POINT_LAYER_SELECTOR);
      const firstLabel = svg.querySelector('g.line-label');
      expect(points, 'scatter point layer exists').to.not.equal(null);
      expect(firstLabel, 'line labels exist').to.not.equal(null);

      const relation = points!.compareDocumentPosition(firstLabel!);
      expect(
        relation & Node.DOCUMENT_POSITION_FOLLOWING,
        'line label follows the scatter points in DOM order (foreground)',
      ).to.be.greaterThan(0);
    });

    cy.get('#scatter-line-labels').then(($el) => {
      if ($el.attr('data-state') !== 'checked') cy.wrap($el).click();
    });
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);

    cy.get('[data-testid="scatter-graph"] [data-testid="d3-chart-svg"]').then(($svg) => {
      const svg = $svg[0];
      const transformsBeforeZoom = [...svg.querySelectorAll('g.line-label')].map((label) =>
        label.getAttribute('transform'),
      );
      const r = svg.getBoundingClientRect();
      for (let i = 0; i < 3; i++) {
        svg.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -240,
            clientX: r.x + r.width / 2,
            clientY: r.y + 150,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      }

      // Zoom renders on the next animation frame, so retry until the labels have moved.
      cy.wrap($svg).should(($zoomed) => {
        const zoomedSvg = $zoomed[0];
        const points = zoomedSvg.querySelector(CANVAS_POINT_LAYER_SELECTOR)!;
        const labels = zoomedSvg.querySelectorAll('g.line-label');
        expect(labels.length, 'line labels still exist after zoom').to.be.greaterThan(0);
        expect(
          [...labels].map((label) => label.getAttribute('transform')),
          'line labels re-render for the zoomed scales',
        ).not.to.deep.equal(transformsBeforeZoom);
        const firstLabel = labels.item(0)!;
        expect(
          points.compareDocumentPosition(firstLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
          'line label still follows the scatter points after zoom (foreground)',
        ).to.be.greaterThan(0);
      });
    });
  });

  it('Line Labels can be enabled alongside Gradient Labels', () => {
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');

    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length', 0);

    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);

    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-gradient-labels').click();
  });

  it('URL param i_linelabel=0 disables line labels on load', () => {
    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_linelabel=0', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    expandLegendAdvanced();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');

    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length', 0);

    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_linelabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    expandLegendAdvanced();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);
  });

  it('URL param i_advlabel=1 renders parallelism without enabling GPU-count labels', () => {
    cy.visit('/inference?g_model=deepseek-v4-pro&i_advlabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    expandLegendAdvanced();
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get(`[data-testid="scatter-graph"] ${POINT_LABELS}`)
      .filter(':visible')
      .should('have.length.greaterThan', 0);
  });
});
