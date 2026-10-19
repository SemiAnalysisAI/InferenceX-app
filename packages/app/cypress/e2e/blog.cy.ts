describe('Blog', () => {
  describe('Rubin agentic article port', () => {
    for (const locale of ['', '/zh']) {
      it(`preserves the article, figures, and source boundary on ${locale || '/en'}`, () => {
        const slug = 'vera-rubin-nvl72-agentic-inference';
        cy.visit(`${locale}/blog/${slug}`);
        cy.get('h1').should('have.length', 1).and('contain.text', 'Rubin NVL72');
        cy.get('article.prose').within(() => {
          cy.get(`figure img[src^="/images/${slug}/"]`)
            .should('have.length.greaterThan', 0)
            .each(($image) => {
              cy.wrap($image)
                .scrollIntoView()
                .should(($img) => {
                  expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
                  expect($img.attr('alt')?.length ?? 0).to.be.greaterThan(0);
                });
            });
          cy.contains(locale ? '本站转载原文的公开部分' : 'publicly available portion').should(
            'exist',
          );
          cy.get(`a[href="https://newsletter.semianalysis.com/p/${slug}"]`)
            .last()
            .should('contain.text', locale ? '订阅者专属' : 'subscriber-only');
        });
        cy.get('link[rel="alternate"][hreflang="en"]')
          .should('have.attr', 'href')
          .and('include', `/blog/${slug}`);
        cy.get('link[rel="alternate"][hreflang="zh-CN"]')
          .should('have.attr', 'href')
          .and('include', `/zh/blog/${slug}`);
      });
    }
  });

  describe('Blog listing page', () => {
    beforeEach(() => {
      cy.intercept(
        { method: 'GET', pathname: '/_next/image' },
        { fixture: '1x1.png', headers: { 'content-type': 'image/png' } },
      );
      cy.visit('/blog', { timeout: 20_000 });
    });

    it('serves local card thumbnails through the image optimizer', () => {
      cy.get('[data-testid="blog-post-grid"] img[src^="/_next/image?url=%2Fimages%2F"]')
        .first()
        .invoke('attr', 'src')
        .then((src) => {
          cy.request({ url: String(src), encoding: 'binary' }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.headers['content-type']).to.match(/^image\//u);
          });
        });
    });
  });

  describe('Blog post page', () => {
    before(() => {
      cy.intercept('GET', 'https://substack-post-media.s3.amazonaws.com/**', {
        fixture: '1x1.png',
        headers: { 'content-type': 'image/png' },
      });
      cy.visit('/blog/inferencemax-open-source-inference-benchmarking');
    });

    it('renders the post title as the one and only h1', () => {
      cy.get('h1').should('have.length', 1).and('contain.text', 'InferenceMAX');
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
      cy.get('article.prose').should('contain.text', '$3 per million tokens input');
      cy.get('article.prose').should('contain.text', '$15 per million tokens output');
    });

    it('renders every figure the post references', () => {
      cy.get('article.prose figure img').should('have.length.gte', 20);
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

      cy.get('article.prose figure img').then(($imgs) => {
        const srcs = [...new Set([...$imgs].map((img) => img.getAttribute('src') ?? ''))];
        for (const src of srcs) {
          cy.request({ url: src, encoding: 'binary' }).its('status').should('eq', 200);
        }
      });
    });
  });
});
