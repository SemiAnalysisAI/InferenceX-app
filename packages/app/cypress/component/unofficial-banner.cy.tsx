import { UnofficialRunBanner, UnofficialRunContext } from '@/components/unofficial-run-provider';
import { createMockUnofficialRunContext } from '../support/mock-data';

describe('Standalone unofficial-run banner', () => {
  for (const width of [390, 1440, 1920]) {
    it(`aligns with compare and model page content at ${width}px`, () => {
      cy.viewport(width, 900);
      const run = {
        id: 33541529678,
        name: 'Run Sweep',
        branch: `experiment/${'long-branch-name-'.repeat(8)}`,
        sha: 'abc123',
        createdAt: '2026-09-01T00:00:00Z',
        url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33541529678',
        conclusion: 'cancelled',
        status: 'completed',
        isNonMainBranch: true,
      };
      const context = createMockUnofficialRunContext({ unofficialRunInfos: [run] });
      cy.mount(
        <UnofficialRunContext.Provider value={context}>
          {/* Standalone providers precede the page's centered content container. */}
          <UnofficialRunBanner />
          <main>
            <div className="container mx-auto px-4 lg:px-8">
              <div data-testid="standalone-page-content">Page content</div>
            </div>
          </main>
        </UnofficialRunContext.Provider>,
      );

      cy.get('[data-testid="standalone-page-content"]').then(($content) => {
        const contentBounds = $content[0].getBoundingClientRect();
        cy.get('[data-slot="unofficial-banner"]').should(($banner) => {
          const banner = $banner[0];
          const bounds = banner.getBoundingClientRect();
          expect(bounds.left, 'left page gutter').to.be.closeTo(contentBounds.left, 1);
          expect(bounds.right, 'right page gutter').to.be.closeTo(contentBounds.right, 1);
          expect(bounds.bottom, 'spacing before page content').to.be.lessThan(contentBounds.top);
          expect(banner.scrollWidth, 'long branch stays inside banner').to.be.at.most(
            banner.clientWidth,
          );
        });
      });
      cy.get(`[aria-label="View workflow run for ${run.branch}"]`).should(
        'have.attr',
        'href',
        run.url,
      );
      cy.get(`[aria-label="Dismiss ${run.branch}"]`).click();
      cy.get('@dismissRun').should('have.been.calledOnceWith', String(run.id));
    });
  }

  it('adds no banner or spacing when no runs are loaded', () => {
    cy.mount(
      <UnofficialRunContext.Provider value={createMockUnofficialRunContext()}>
        <div data-testid="banner-slot">
          <UnofficialRunBanner />
        </div>
      </UnofficialRunContext.Provider>,
    );
    cy.get('[data-testid="banner-slot"]').should('be.empty');
  });
});
