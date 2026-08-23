const CONTENT_SITE_URL = 'https://inferencex.semianalysis.com';
const BLOG_POST_COUNT = 19;
const GLOSSARY_ENTRY_COUNT = 54;

const BLOG_JOURNEY_MATRIX = [
  { basePath: '/blog', detailPrefix: '/blog/', alternateLocale: 'zh-CN', width: 1440 },
  { basePath: '/blog', detailPrefix: '/blog/', alternateLocale: 'zh-CN', width: 375 },
  { basePath: '/zh/blog', detailPrefix: '/zh/blog/', alternateLocale: 'en', width: 1440 },
  { basePath: '/zh/blog', detailPrefix: '/zh/blog/', alternateLocale: 'en', width: 390 },
] as const;

const GLOSSARY_JOURNEY_MATRIX = [
  { basePath: '/glossary', detailPrefix: '/glossary/', alternateLocale: 'zh-CN', width: 1440 },
  { basePath: '/glossary', detailPrefix: '/glossary/', alternateLocale: 'zh-CN', width: 375 },
  {
    basePath: '/zh/glossary',
    detailPrefix: '/zh/glossary/',
    alternateLocale: 'en',
    width: 1440,
  },
  {
    basePath: '/zh/glossary',
    detailPrefix: '/zh/glossary/',
    alternateLocale: 'en',
    width: 390,
  },
] as const;

function exerciseEveryBlogJourney({
  basePath,
  detailPrefix,
  alternateLocale,
  width,
}: (typeof BLOG_JOURNEY_MATRIX)[number]) {
  cy.viewport(width, 900);
  cy.visit(basePath);
  cy.get('[data-testid="blog-post-card"]')
    .should('have.length', BLOG_POST_COUNT)
    .then(($cards) => {
      const hrefs = [...$cards].map((card) => card.getAttribute('href'));
      expect(hrefs.every((href): href is string => Boolean(href))).to.equal(true);
      expect(new Set(hrefs).size).to.equal(BLOG_POST_COUNT);
      expect(hrefs.every((href) => href?.startsWith(detailPrefix))).to.equal(true);

      for (const href of hrefs as string[]) {
        const slug = href.slice(detailPrefix.length);
        const alternatePath = alternateLocale === 'zh-CN' ? `/zh${href}` : href.replace('/zh', '');
        cy.get(`[data-testid="blog-post-card"][data-blog-slug="${slug}"]`).click();
        cy.location('pathname').should('eq', href);
        cy.get('[data-testid="blog-post-page"]')
          .should('be.visible')
          .and('have.attr', 'data-blog-slug', slug);
        cy.get(`link[rel="alternate"][hreflang="${alternateLocale}"]`).should(
          'have.attr',
          'href',
          `${CONTENT_SITE_URL}${alternatePath}`,
        );
        cy.go('back');
        cy.location('pathname').should('eq', basePath);
        cy.get(`[data-testid="blog-post-card"][data-blog-slug="${slug}"]`).should('exist');
      }
    });
}

function exerciseEveryGlossaryJourney({
  basePath,
  detailPrefix,
  alternateLocale,
  width,
}: (typeof GLOSSARY_JOURNEY_MATRIX)[number]) {
  cy.viewport(width, 900);
  cy.visit(basePath);
  cy.get('[data-testid="glossary-entry-link"]')
    .should('have.length', GLOSSARY_ENTRY_COUNT)
    .then(($links) => {
      const hrefs = [...$links].map((link) => link.getAttribute('href'));
      expect(hrefs.every((href): href is string => Boolean(href))).to.equal(true);
      expect(new Set(hrefs).size).to.equal(GLOSSARY_ENTRY_COUNT);
      expect(hrefs.every((href) => href?.startsWith(detailPrefix))).to.equal(true);

      for (const href of hrefs as string[]) {
        const slug = href.slice(detailPrefix.length);
        const alternatePath = alternateLocale === 'zh-CN' ? `/zh${href}` : href.replace('/zh', '');
        cy.get(`[data-testid="glossary-entry-link"][data-glossary-slug="${slug}"]`).click();
        cy.location('pathname').should('eq', href);
        cy.get('[data-testid="glossary-detail-page"]')
          .should('be.visible')
          .and('have.attr', 'data-glossary-slug', slug);
        cy.get(`link[rel="alternate"][hreflang="${alternateLocale}"]`).should(
          'have.attr',
          'href',
          `${CONTENT_SITE_URL}${alternatePath}`,
        );
        cy.go('back');
        cy.location('pathname').should('eq', basePath);
        cy.get(`[data-testid="glossary-entry-link"][data-glossary-slug="${slug}"]`).should('exist');
      }
    });
}

describe('complete localized content journeys', () => {
  describe('Blog listing to article', () => {
    for (const scenario of BLOG_JOURNEY_MATRIX) {
      it(`opens every ${scenario.basePath} article from the listing at ${scenario.width}px`, () => {
        exerciseEveryBlogJourney(scenario);
      });
    }
  });

  describe('Glossary index to term', () => {
    for (const scenario of GLOSSARY_JOURNEY_MATRIX) {
      it(`opens every ${scenario.basePath} term from the index at ${scenario.width}px`, () => {
        exerciseEveryGlossaryJourney(scenario);
      });
    }
  });
});
