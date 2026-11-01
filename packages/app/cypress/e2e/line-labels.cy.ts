import { expandLegendAdvanced } from '../support/legend-advanced';

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
      const dots = svg.querySelectorAll('.dot-group');
      const labels = svg.querySelectorAll('g.line-label');
      expect(dots.length, 'scatter dot groups exist').to.be.greaterThan(0);
      expect(labels.length, 'line labels exist').to.be.greaterThan(0);

      const lastDot = dots.item(dots.length - 1)!;
      const firstLabel = labels.item(0)!;
      const relation = lastDot.compareDocumentPosition(firstLabel);
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
    });
    cy.wait(300);

    cy.get('[data-testid="scatter-graph"] [data-testid="d3-chart-svg"]').then(($svg) => {
      const svg = $svg[0];
      const dots = svg.querySelectorAll('.dot-group');
      const labels = svg.querySelectorAll('g.line-label');
      expect(labels.length, 'line labels still exist after zoom').to.be.greaterThan(0);
      const lastDot = dots.item(dots.length - 1)!;
      const firstLabel = labels.item(0)!;
      expect(
        lastDot.compareDocumentPosition(firstLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
        'line label still follows the scatter points after zoom (foreground)',
      ).to.be.greaterThan(0);
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

  it('legacy URL param i_nolabel=1 keeps GPU-count labels off on load', () => {
    cy.visit('/inference?g_model=deepseek-v4-pro&i_nolabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    expandLegendAdvanced();
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'unchecked');
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
    cy.get('[data-testid="scatter-graph"] .dot-group .point-label')
      .filter(':visible')
      .should('have.length.greaterThan', 0);
  });

  it('legacy i_nolabel=1 suppresses GPU counts without suppressing explicit parallelism', () => {
    cy.visit('/inference?g_model=deepseek-v4-pro&i_advlabel=1&i_nolabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    expandLegendAdvanced();
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="scatter-graph"] .dot-group .point-label')
      .filter(':visible')
      .should('have.length.greaterThan', 0);
  });

  it('places the precision between the GPU and engine when multiple precisions are selected', () => {
    cy.visit('/inference?g_model=DeepSeek-R1-0528&i_linelabel=1&i_prec=fp4,fp8', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');

    cy.get('[data-testid="scatter-graph"] svg g.line-label .ll-text')
      .should('have.length.greaterThan', 0)
      .then(($texts) => {
        const labels = $texts.toArray().map((el) => el.textContent ?? '');
        expect(
          labels.some((t) => /\bFP8\b/u.test(t)),
          'an FP8 line label exists',
        ).to.equal(true);
        expect(
          labels.some((t) => /\bFP4\b/u.test(t)),
          'an FP4 line label exists',
        ).to.equal(true);
        for (const label of labels.filter((t) => /\bFP(?:4|8)\b/u.test(t) && /\(.+\)/u.test(t))) {
          expect(label, 'precision precedes the engine suffix').to.match(
            /^.+\sFP(?:4|8)\s\(.+\)$/u,
          );
        }
      });
  });
});
