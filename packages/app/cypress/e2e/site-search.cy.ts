// Header site search: lazy loading, live-page indexing, progressive crawl,
// keyboard navigation and the /zh tree. Crawled pages are stubbed so the
// spec does not depend on every route rendering in fixtures mode.

const LLMS_TXT = `# InferenceX by SemiAnalysis

## Chip Pages

- [NVIDIA B200](https://inferencex.semianalysis.com/chips/b200): specs, pricing and benchmarks
- [AMD Instinct MI355X](https://inferencex.semianalysis.com/chips/mi355x): specs, pricing and benchmarks
`;

function stubPage(title: string, main: string): string {
  return `<!doctype html><html><head><title>${title} | InferenceX</title></head><body><main>${main}</main></body></html>`;
}

function stubSite() {
  // The crawler requests pages with exactly `Accept: text/html`; browser
  // navigations send a longer Accept list and are not matched. Specific stubs
  // registered below take precedence over this catch-all.
  cy.intercept(
    { method: 'GET', headers: { accept: 'text/html' } },
    {
      body: stubPage('Other page', '<p>Unrelated content.</p>'),
      headers: { 'content-type': 'text/html' },
    },
  );
  cy.intercept('GET', '/llms.txt', {
    body: LLMS_TXT,
    headers: { 'content-type': 'text/plain' },
  }).as('llms');
  cy.intercept('GET', '/chips/b200', {
    body: stubPage('NVIDIA B200', '<h2 id="power">Power</h2><p>The B200 draws 1000 W at TDP.</p>'),
    headers: { 'content-type': 'text/html' },
  }).as('b200');
  cy.intercept('GET', '/chips/mi355x', {
    body: stubPage('AMD Instinct MI355X', '<h2 id="memory">Memory</h2><p>288 GB of HBM3E.</p>'),
    headers: { 'content-type': 'text/html' },
  });
}

describe('Site search', () => {
  beforeEach(() => {
    stubSite();
  });

  it('does not load the search chunk or fetch pages until opened', () => {
    cy.visit('/about');
    cy.get('[data-testid="site-search-toggle"]').should(
      'have.attr',
      'aria-label',
      'Search InferenceX',
    );
    cy.get('[data-testid="site-search-dialog"]').should('not.exist');
    cy.get('@llms.all').should('have.length', 0);
  });

  it('indexes the current page immediately and crawled pages as they load', () => {
    cy.visit('/about');
    cy.get('[data-testid="site-search-toggle"]').click();
    cy.get('[data-testid="site-search-input"]').should('be.focused').type('watts');
    cy.wait('@b200');
    // "watts" reaches the "1000 W" power section through the power concept group.
    cy.get('[data-testid="site-search-result"]')
      .first()
      .should('have.attr', 'href', '/chips/b200#power')
      .and('contain.text', 'NVIDIA B200')
      .and('contain.text', 'Power');
  });

  it('opens with Ctrl+K, navigates results with the keyboard and closes on selection', () => {
    cy.visit('/about');
    cy.get('body').type('{ctrl}k');
    cy.get('[data-testid="site-search-input"]').type('mi355x memory');
    cy.get('[data-testid="site-search-result"]')
      .first()
      .should('have.attr', 'href', '/chips/mi355x#memory');
    cy.get('[data-testid="site-search-input"]').type('{enter}');
    cy.location('pathname').should('eq', '/chips/mi355x');
    cy.get('[data-testid="site-search-dialog"]').should('not.exist');
  });

  it('serves Chinese UI and crawls /zh siblings on Chinese pages', () => {
    cy.intercept('GET', '/zh/chips/b200', {
      body: stubPage('NVIDIA B200', '<h2 id="power">功耗</h2><p>B200 的功耗为 1000 W。</p>'),
      headers: { 'content-type': 'text/html' },
    }).as('zhB200');
    cy.visit('/zh/about');
    cy.get('[data-testid="site-search-toggle"]')
      .should('have.attr', 'aria-label', '搜索 InferenceX')
      .click();
    cy.get('[data-testid="site-search-input"]').should(
      'have.attr',
      'placeholder',
      '搜索 GPU、模型、指标、文章…',
    );
    cy.get('[data-testid="site-search-input"]').type('能耗');
    cy.wait('@zhB200');
    cy.get('[data-testid="site-search-result"]')
      .first()
      .should('have.attr', 'href', '/zh/chips/b200#power');
  });
});
