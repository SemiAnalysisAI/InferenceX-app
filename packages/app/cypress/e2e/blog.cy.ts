const BLOG_SITE_URL = 'https://inferencex.semianalysis.com';
const BLOG_POST_COUNT = 19;

const BLOG_JOURNEY_MATRIX = [
  { basePath: '/blog', detailPrefix: '/blog/', alternateLocale: 'zh-CN', width: 1440 },
  { basePath: '/blog', detailPrefix: '/blog/', alternateLocale: 'zh-CN', width: 375 },
  { basePath: '/zh/blog', detailPrefix: '/zh/blog/', alternateLocale: 'en', width: 1440 },
  { basePath: '/zh/blog', detailPrefix: '/zh/blog/', alternateLocale: 'en', width: 390 },
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
          `${BLOG_SITE_URL}${alternatePath}`,
        );
        cy.go('back');
        cy.location('pathname').should('eq', basePath);
        cy.get(`[data-testid="blog-post-card"][data-blog-slug="${slug}"]`).should('exist');
      }
    });
}

describe('Blog', () => {
  describe('complete localized listing-to-article journeys', () => {
    for (const scenario of BLOG_JOURNEY_MATRIX) {
      it(`opens every ${scenario.basePath} article from the listing at ${scenario.width}px`, () => {
        exerciseEveryBlogJourney(scenario);
      });
    }
  });

  describe('Blog listing page', () => {
    before(() => {
      cy.visit('/blog');
    });

    it('renders the blog page with heading', () => {
      cy.get('h2').should('contain.text', 'Articles');
    });

    it('displays at least one blog post card', () => {
      cy.get('article').should('have.length.gte', 1);
    });

    it('post cards have titles and excerpts', () => {
      cy.get('article')
        .first()
        .within(() => {
          cy.get('h2').should('exist').and('not.be.empty');
          cy.get('p').should('exist');
        });
    });

    it('post cards link to individual posts', () => {
      cy.get('a[href^="/blog/"]').should('have.length.gte', 1);
    });
  });

  describe('Blog post page', () => {
    before(() => {
      cy.intercept('GET', 'https://substack-post-media.s3.amazonaws.com/**', {
        statusCode: 204,
      });
      cy.visit('/blog/inferencemax-open-source-inference-benchmarking');
    });

    it('renders the post title as the one and only h1', () => {
      // The title is the page's single <h1> (primary-keyword top heading);
      // MDX body sections map to <h2>, so there must be exactly one h1.
      cy.get('h1').should('have.length', 1).and('contain.text', 'InferenceMAX');
    });

    it('displays post metadata', () => {
      cy.contains('SemiAnalysis').should('exist');
      cy.contains('min read').should('exist');
    });

    it('renders the article content', () => {
      cy.get('article.prose').should('exist');
      cy.get('article.prose').should('contain.text', 'InferenceMAX');
    });

    it('has a back link to the blog listing', () => {
      cy.get('a[href="/blog"]').should('exist');
    });
  });

  describe('Inline code styling', () => {
    before(() => {
      cy.visit('/blog/b200-glm5-nvfp4-vs-h200-fp8-3-6x-perf-per-dollar');
    });

    it('does not render generated backticks around inline code', () => {
      cy.contains('article.prose code', 'zai-org/GLM-5-FP8')
        .first()
        .should(($code) => {
          expect($code.text()).to.equal('zai-org/GLM-5-FP8');
          expect(getComputedStyle($code[0], '::before').content).to.equal('none');
          expect(getComputedStyle($code[0], '::after').content).to.equal('none');
        });
    });
  });

  describe('Math rendering', () => {
    before(() => {
      cy.visit('/blog/kimi-k3-the-manos-the-mythos-the');
    });

    it('renders $$ blocks through KaTeX', () => {
      cy.get('article.prose .katex').should('have.length.gte', 1);
      cy.get('article.prose .katex').first().should('be.visible');
    });

    it('leaves single-dollar prices as literal text, not math', () => {
      // `singleDollarTextMath: false` — otherwise "$3 ... $15" would be swallowed
      // into an inline formula and the prices would disappear from the prose.
      cy.get('article.prose').should('contain.text', '$3 per million tokens input');
      cy.get('article.prose').should('contain.text', '$15 per million tokens output');
    });

    it('renders every figure the post references', () => {
      cy.get('article.prose figure img').should('have.length.gte', 20);
      // Only the first figure is eager; the rest are `loading="lazy"` and stay at
      // naturalWidth 0 until scrolled to, so decode is only asserted on that one.
      cy.get('article.prose figure img')
        .first()
        .should(($img) => {
          expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
        });
      cy.get('article.prose figure img').each(($img) => {
        expect($img[0].getAttribute('alt') ?? '').to.have.length.greaterThan(0);
        expect($img[0].getAttribute('src') ?? '').to.match(
          /^\/images\/kimi-k3-the-manos-the-mythos-the\//u,
        );
      });
    });

    it('serves every figure image the post references', () => {
      // Complements the eager-only decode check above: the srcs exist on the server
      // even though lazy images have not fetched them yet.
      cy.get('article.prose figure img').then(($imgs) => {
        const srcs = [...new Set([...$imgs].map((img) => img.getAttribute('src') ?? ''))];
        for (const src of srcs) {
          cy.request({ url: src, encoding: 'binary' }).its('status').should('eq', 200);
        }
      });
    });
  });
});
