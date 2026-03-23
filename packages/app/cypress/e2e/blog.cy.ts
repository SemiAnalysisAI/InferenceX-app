describe('Blog', () => {
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
      cy.visit('/blog/hello-world');
    });

    it('renders the post title', () => {
      cy.get('h2').should('contain.text', 'Hello World');
    });

    it('displays post metadata', () => {
      cy.contains('SemiAnalysis').should('exist');
      cy.contains('min read').should('exist');
    });

    it('renders the article content', () => {
      cy.get('article.prose').should('exist');
      cy.get('article.prose').should('contain.text', 'InferenceX');
    });

    it('renders code blocks with syntax highlighting', () => {
      cy.get('article.prose pre').should('exist');
      cy.get('article.prose code').should('exist');
    });

    it('has a back link to the blog listing', () => {
      cy.get('a[href="/blog"]').should('exist');
    });
  });
});
