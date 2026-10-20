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

  describe('Hardware results pages', () => {
    const slug = 'vera-rubin-nvl72-vs-gb300-nvl72-agentx-results';

    for (const locale of ['', '/zh']) {
      it(`renders the results hero, note, and article on ${locale || '/en'}`, () => {
        cy.visit(`${locale}/hardware/${slug}`);
        cy.get('h1').should('have.length', 1).and('contain.text', 'Vera Rubin NVL72');
        cy.get('[data-testid="hardware-hero"]').within(() => {
          cy.get('[data-testid="hardware-lede"] strong').should('have.length.greaterThan', 0);
          cy.get('[data-testid="hardware-highlight"]')
            .should('have.length.within', 3, 4)
            .each(($card) => {
              expect($card.children().first().text().trim()).not.to.equal('');
            });
          cy.get('[data-testid="hardware-hero-link"]').first().should('have.class', 'bg-brand');
          cy.get('[data-testid="hardware-hero-link"]').eq(1).should('not.have.class', 'bg-brand');
          cy.get(`a[href="${locale}/hardware"]`).should('be.visible');
        });
        cy.get('[data-testid="hardware-note"]').should('be.visible');
        cy.get('[data-testid="hardware-article"] table').should('have.length.greaterThan', 0);
        cy.get('[data-testid="blog-related"]').should('not.exist');
        cy.get('link[rel="canonical"]').should(
          'have.attr',
          'href',
          `https://inferencex.semianalysis.com${locale}/hardware/${slug}`,
        );
        cy.get('link[rel="alternate"][hreflang="zh-CN"]')
          .should('have.attr', 'href')
          .and('include', `/zh/hardware/${slug}`);
        cy.get('[data-testid="language-toggle"]').should(
          'have.attr',
          'href',
          locale ? `/hardware/${slug}` : `/zh/hardware/${slug}`,
        );
      });
    }

    it('stacks the highlight cards below the lede on phones without horizontal overflow', () => {
      cy.viewport(390, 844);
      cy.visit(`/hardware/${slug}`);
      cy.get('[data-testid="hardware-lede"]').then(($lede) => {
        const ledeBottom = $lede[0].getBoundingClientRect().bottom;
        cy.get('[data-testid="hardware-highlights"]').should(($highlights) => {
          expect($highlights[0].getBoundingClientRect().top).to.be.greaterThan(ledeBottom);
        });
      });
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
      });
      cy.viewport(1280, 720);
    });

    it('lists the pages on /hardware and links each card to its page', () => {
      cy.visit('/hardware');
      cy.get('[data-testid="hardware-card"]').should('have.length.at.least', 2);
      cy.get(`[data-testid="hardware-card"] a[href="/hardware/${slug}"]`).click();
      cy.location('pathname').should('eq', `/hardware/${slug}`);
    });

    it('no longer serves the moved pages under /blog', () => {
      cy.request({ url: `/blog/${slug}`, failOnStatusCode: false })
        .its('status')
        .should('eq', 404);
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
