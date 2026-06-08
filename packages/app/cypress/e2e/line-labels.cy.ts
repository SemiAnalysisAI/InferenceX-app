describe('Line Labels Toggle', () => {
  before(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    // Wait for chart to load
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
  });

  it('Line Labels toggle exists in the legend', () => {
    cy.get('#scatter-line-labels').should('exist');
    cy.get('label[for="scatter-line-labels"]').should('contain.text', 'Line Labels');
  });

  it('Line Labels toggle is off by default', () => {
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');
  });

  it('toggling Line Labels on renders label elements on the chart', () => {
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    // Line label groups should appear in the SVG
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);
  });

  it('line labels have colored background rects and text', () => {
    // Each line label group should contain a background rect and text
    cy.get('[data-testid="scatter-graph"] svg g.line-label .ll-bg').should(
      'have.length.greaterThan',
      0,
    );
    cy.get('[data-testid="scatter-graph"] svg g.line-label .ll-text').should(
      'have.length.greaterThan',
      0,
    );
  });

  it('line labels render in the foreground, after the scatter points', () => {
    // Labels were toggled on in the test above and remain on here.
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);

    cy.get('[data-testid="scatter-graph"] svg').then(($svg) => {
      const svg = $svg[0];
      const dots = svg.querySelectorAll('.dot-group');
      const labels = svg.querySelectorAll('g.line-label');
      expect(dots.length, 'scatter dot groups exist').to.be.greaterThan(0);
      expect(labels.length, 'line labels exist').to.be.greaterThan(0);

      // Every label must paint after every dot group. Comparing the *last* dot
      // group against the *first* label is sufficient: if the earliest label
      // follows the latest dot in document order, all labels are in front.
      const lastDot = dots.item(dots.length - 1)!;
      const firstLabel = labels.item(0)!;
      const relation = lastDot.compareDocumentPosition(firstLabel);
      expect(
        relation & Node.DOCUMENT_POSITION_FOLLOWING,
        'line label follows the scatter points in DOM order (foreground)',
      ).to.be.greaterThan(0);
    });
  });

  it('toggling Line Labels off removes label elements', () => {
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');

    // Line label groups should no longer exist
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length', 0);
  });

  it('Line Labels can be enabled alongside Gradient Labels', () => {
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    // Both should be checked
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    // Line labels should still render
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);

    // Reset
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-gradient-labels').click();
  });

  it('URL param i_linelabel=1 enables line labels on load', () => {
    cy.visit('/inference?i_linelabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    // Labels should be rendered
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);
  });

  it('appends the precision to each line label when multiple precisions are selected', () => {
    cy.visit('/inference?i_linelabel=1&i_prec=fp4,fp8', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');

    // With both FP4 and FP8 shown, each curve is its own line and the label
    // must carry the precision so the two curves of the same hardware are
    // distinguishable (e.g. "B200 (vLLM) FP8" vs "B200 (vLLM) FP4").
    cy.get('[data-testid="scatter-graph"] svg g.line-label .ll-text')
      .should('have.length.greaterThan', 0)
      .then(($texts) => {
        const labels = $texts.toArray().map((el) => el.textContent ?? '');
        // At least one label for each selected precision.
        expect(
          labels.some((t) => /\bFP8\b/u.test(t)),
          'an FP8 line label exists',
        ).to.equal(true);
        expect(
          labels.some((t) => /\bFP4\b/u.test(t)),
          'an FP4 line label exists',
        ).to.equal(true);
      });
  });
});
