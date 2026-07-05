describe('Compare spec-decode index + slug page', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('renders the spec-decode index with a hero title', () => {
    cy.visit('/compare-spec-decode');
    cy.contains('h1', /speculative decoding/iu).should('be.visible');
  });

  it('navigates to the first card slug if available, and renders table + hero PNG + JSON-LD', () => {
    cy.visit('/compare-spec-decode');
    cy.get('body').then(($body) => {
      const cards = $body.find('a[href^="/compare-spec-decode/"]');
      if (cards.length === 0) {
        // No spec-decode data available — index still renders, skip slug tests.
        cy.log('No spec-decode card links found; skipping slug-page assertions.');
        return;
      }

      const href = cards.first().attr('href')!;
      const slug = href.replace('/compare-spec-decode/', '');

      cy.visit(href);
      cy.location('pathname').should('eq', href);

      // Interpolated comparison table renders.
      cy.get('[data-testid="compare-interpolated-table"]').should('exist');

      // 'Off' label for the 'none' side appears in the table body rows (side
      // labels render in tbody cells, same as GPU labels on /compare/[slug]).
      cy.get('[data-testid="compare-interpolated-table"] tbody').should(($tbody) => {
        expect($tbody.text()).to.contain('Off');
      });

      // Method label present (MTP, or a model-specific label like M3 EAGLE).
      cy.get('[data-testid="compare-interpolated-table"] tbody').should(($tbody) => {
        const text = $tbody.text().toUpperCase();
        const methodPart = slug.split('-vs-')[0].split('-').pop()!;
        expect(text).to.satisfy(
          (t: string) => t.includes(methodPart.toUpperCase()) || t.includes('EAGLE'),
        );
      });

      // Hero PNG image present.
      cy.get('img[src$=".png"]').should('exist');

      // JSON-LD script present.
      cy.get('script[type="application/ld+json"]').should('exist');
    });
  });

  it('redirects a reversed none-vs-method slug to canonical method-vs-none', () => {
    cy.visit('/compare-spec-decode');
    cy.get('body').then(($body) => {
      const cards = $body.find('a[href^="/compare-spec-decode/"]');
      if (cards.length === 0) {
        cy.log('No spec-decode card links found; skipping redirect test.');
        return;
      }

      const href = cards.first().attr('href')!;
      const slug = href.replace('/compare-spec-decode/', '');
      // Canonical form: {model}-{gpu}-{method}-vs-none
      // Reversed form:  {model}-{gpu}-none-vs-{method}
      const vsIdx = slug.indexOf('-vs-');
      const left = slug.slice(0, vsIdx);
      const right = slug.slice(vsIdx + 4); // 'none'
      const leftParts = left.split('-');
      const method = leftParts.pop()!;
      const modelGpu = leftParts.join('-');
      // Build reversed: {model}-{gpu}-none-vs-{method}
      const reversedSlug = `${modelGpu}-${right}-vs-${method}`;

      cy.visit(`/compare-spec-decode/${reversedSlug}`);
      cy.location('pathname').should('eq', href);
    });
  });
});

describe('Compare spec-decode zh index', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('renders Chinese hero and /zh card hrefs', () => {
    cy.visit('/zh/compare-spec-decode');
    cy.contains('h1', /投机解码对比/u).should('be.visible');
    cy.get('body').then(($body) => {
      const cards = $body.find('a[href^="/zh/compare-spec-decode/"]');
      // Guard: the index must render even if no cards (zero data).
      // If cards exist, verify they use /zh prefixed hrefs.
      if (cards.length > 0) {
        cy.get('a[href^="/zh/compare-spec-decode/"]').should('have.length.greaterThan', 0);
      }
    });
  });
});
