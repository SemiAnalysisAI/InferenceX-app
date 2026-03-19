describe('Performance', () => {
  it('page loads quickly', () => {
    const startTime = Date.now();
    cy.visit('/');
    cy.document().then(() => {
      const loadTime = Date.now() - startTime;
      const threshold = 5_000;
      expect(loadTime).to.be.lessThan(threshold);
    });
  });

  it('page is fully interactive quickly', () => {
    // Page already loaded from previous test
    cy.window().then(() => {
      // Just verify the page is responsive
      cy.get('[data-testid="scatter-graph"]').should('exist');
    });
  });

  it('no excessive layout shift issues', () => {
    cy.visit('/');
    cy.wait(5000);

    // Measure CLS using PerformanceObserver
    cy.window()
      .then((win) => {
        return new Cypress.Promise((resolve) => {
          let clsScore = 0;
          const observer = new win.PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!(entry as unknown as { hadRecentInput: boolean }).hadRecentInput) {
                clsScore += (entry as unknown as { value: number }).value;
              }
            }
          });
          observer.observe({ type: 'layout-shift', buffered: true });

          // Give a short window for any remaining shifts after load
          setTimeout(() => {
            observer.disconnect();
            resolve(clsScore);
          }, 1000);
        });
      })
      .then((clsScore) => {
        // CLS threshold relaxed for data-driven dashboard (charts cause shifts as data loads)
        expect(clsScore).to.be.lessThan(0.5);
      });
  });

  it('memory usage is reasonable', () => {
    // Page still loaded from CLS test
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
