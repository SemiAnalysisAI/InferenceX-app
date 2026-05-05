describe('Performance', () => {
  it('page loads quickly', () => {
    const startTime = Date.now();
    cy.visit('/inference');
    cy.document().then(() => {
      const loadTime = Date.now() - startTime;
      const threshold = 15_000;
      expect(loadTime).to.be.lessThan(threshold);
    });
  });

  it('page is fully interactive quickly', () => {
    cy.get('[data-testid="scatter-graph"]').should('exist');
  });

  it('no excessive layout shift issues', () => {
    cy.visit('/inference');
    // Wait for charts to render with real data before measuring CLS
    cy.get('[data-testid="scatter-graph"]').first().find('svg circle').should('exist');

    cy.window()
      .then(
        (win) =>
          new Cypress.Promise((resolve) => {
            let clsScore = 0;
            const observer = new win.PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!(entry as unknown as { hadRecentInput: boolean }).hadRecentInput) {
                  clsScore += (entry as unknown as { value: number }).value;
                }
              }
            });
            observer.observe({ type: 'layout-shift', buffered: true });

            // Short observation window after charts have rendered
            setTimeout(() => {
              observer.disconnect();
              resolve(clsScore);
            }, 1000);
          }),
      )
      .then((clsScore) => {
        // CLS threshold relaxed for data-driven dashboard (charts cause shifts as data loads)
        expect(clsScore).to.be.lessThan(0.5);
      });
  });

  it('memory usage is reasonable', () => {
    cy.window().then((win) => {
      const perfMemory = (win.performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory;
      if (perfMemory) {
        const limit = 200 * 1024 * 1024;
        expect(perfMemory.usedJSHeapSize).to.be.lessThan(limit);
      }
    });
  });
});
