describe('Compare precision index page', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('leads the /compare index with AgentX results and keeps fixed-sequence tools', () => {
    cy.visit('/compare');
    cy.get('[data-testid="compare-index-precision-link"]').should(
      'have.attr',
      'href',
      '/compare-precision',
    );
    cy.get('[data-testid="compare-index-spec-decode-link"]').should(
      'have.attr',
      'href',
      '/compare-spec-decode',
    );
  });
});

describe('Compare precision index + slug page', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('navigates to the first card slug, renders table + hero PNG + JSON-LD', () => {
    cy.visit('/compare-precision');
    cy.get('a[href^="/compare-precision/"]')
      .first()
      .invoke('attr', 'href')
      .then((href) => {
        const slug = (href as string).replace('/compare-precision/', '');

        cy.visit(href as string);
        cy.location('pathname').should('eq', href);

        cy.get('[data-testid="compare-interpolated-table"]').should('exist');

        const parts = slug.split('-vs-');
        const precA = parts[0].split('-').pop()!;
        const precB = parts[1];
        cy.get('[data-testid="compare-interpolated-table"] tbody').should(($tbody) => {
          const text = $tbody.text().toUpperCase();
          expect(text).to.contain(precA.toUpperCase());
          expect(text).to.contain(precB.toUpperCase());
        });
      });
  });

  it('redirects a reversed precision slug to canonical order', () => {
    cy.visit('/compare-precision');
    cy.get('a[href^="/compare-precision/"]')
      .first()
      .invoke('attr', 'href')
      .then((href) => {
        const slug = (href as string).replace('/compare-precision/', '');
        const vsIdx = slug.indexOf('-vs-');
        const left = slug.slice(0, vsIdx);
        const right = slug.slice(vsIdx + 4);
        const leftParts = left.split('-');
        const precA = leftParts.pop()!;
        const modelGpu = leftParts.join('-');
        const reversedSlug = `${modelGpu}-${right}-vs-${precA}`;
        cy.visit(`/compare-precision/${reversedSlug}`);
        cy.location('pathname').should('eq', href);
      });
  });
});

describe('Compare precision zh index', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('renders Chinese hero and /zh card hrefs', () => {
    cy.visit('/zh/compare-precision');
    cy.contains('h1', /精度对比/u).should('be.visible');
    cy.get('a[href^="/zh/compare-precision/"]').should('have.length.greaterThan', 0);
  });
});
