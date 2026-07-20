describe('Compare index matrix', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('renders one matrix per model section with linked + ghost cells on /compare', () => {
    cy.visit('/compare');
    cy.get('[data-testid="compare-pair-matrix"]').should('have.length.greaterThan', 0);

    // Every model section renders exactly one matrix.
    cy.get('section[id]').then(($sections) => {
      const withMatrix = $sections.filter(
        (_, s) => s.querySelector('[data-testid="compare-pair-matrix"]') !== null,
      );
      cy.get('[data-testid="compare-pair-matrix"]').should('have.length', withMatrix.length);
    });

    // Available pairs are real links under /compare/<model>-<a>-vs-<b>.
    cy.get('a[data-testid="compare-matrix-cell"]')
      .should('have.length.greaterThan', 0)
      .first()
      .should('have.attr', 'href')
      .and('match', /^\/compare\/[a-z0-9-]+-[a-z0-9]+-vs-[a-z0-9]+$/u);

    // Pairs without benchmark data render as non-link ghost cells (the
    // fixtures' availability is sparse, so ghosts always exist).
    cy.get('[data-testid="compare-matrix-empty-cell"]').should('have.length.greaterThan', 0);

    // Anchor text (sr-only) carries the pair name for crawlers.
    cy.get('a[data-testid="compare-matrix-cell"]').first().invoke('text').should('match', /vs/u);
  });

  it('navigates to the pair page when a cell is clicked', () => {
    cy.visit('/compare');
    cy.get('a[data-testid="compare-matrix-cell"]')
      .first()
      .then(($a) => {
        const href = $a.attr('href')!;
        cy.wrap($a).click();
        cy.location('pathname').should('eq', href);
      });
  });

  it('shows the focused pair in the readout line (same path as hover)', () => {
    cy.visit('/compare');
    // React's onMouseEnter is delegated and unreachable via cy.trigger — the
    // keyboard focus handler updates the same readout state, so exercise that.
    cy.get('a[data-testid="compare-matrix-cell"]').first().focus();
    cy.get('a[data-testid="compare-matrix-cell"]')
      .first()
      .invoke('attr', 'title')
      .then((label) => {
        cy.get('[data-testid="compare-matrix-readout"]').first().should('contain.text', label);
      });
  });

  it('renders per-dollar matrices with /compare-per-dollar cell hrefs', () => {
    cy.visit('/compare-per-dollar');
    cy.get('[data-testid="compare-pair-matrix"]').should('have.length.greaterThan', 0);
    cy.get('a[data-testid="compare-matrix-cell"]')
      .first()
      .should('have.attr', 'href')
      .and('match', /^\/compare-per-dollar\//u);
  });
});
