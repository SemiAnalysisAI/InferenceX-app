import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { TabNav } from '@/components/tab-nav';
import {
  UnofficialRunBanner,
  UnofficialRunContext,
  type UnofficialRunContextType,
} from '@/components/unofficial-run-provider';
import { createMockUnofficialRunContext } from '../support/mock-data';
import { createMockRouter } from '../support/mock-router';

/**
 * Mount TabNav with the provided URL search string written into the window
 * via history.replaceState. The component reads `window.location.search` in a
 * useEffect, so the URL must be set before mount.
 */
function mountTabNav(opts: {
  pathname?: string;
  search?: string;
  runs?: UnofficialRunContextType['unofficialRunInfos'];
}) {
  const { pathname = '/inference', search = '' } = opts;
  cy.window().then((win) => {
    win.history.replaceState(null, '', `${pathname}${search}`);
  });
  const router = createMockRouter();
  const ctxValue = createMockUnofficialRunContext({ unofficialRunInfos: opts.runs ?? [] });

  cy.mount(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={pathname}>
        <UnofficialRunContext.Provider value={ctxValue}>
          <div className="container mx-auto px-4 lg:px-8">
            <TabNav footer={<UnofficialRunBanner attached />} />
          </div>
        </UnofficialRunContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}

const bannerRun = {
  id: 33541529678,
  name: 'Run Sweep',
  branch: 'dsv4-fp4-b300-dynamo-trt-recipes',
  sha: 'abc123',
  createdAt: '2026-09-01T00:00:00Z',
  url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33541529678',
  conclusion: 'cancelled',
  status: 'completed',
  isNonMainBranch: true,
};

describe('TabNav — attached unofficial-run banner', () => {
  for (const width of [320, 390, 768, 1440]) {
    it(`keeps long branches and all actions inside the navigation at ${width}px`, () => {
      cy.viewport(width, 900);
      const longBranch = `experiment/${'very-long-branch-name-'.repeat(8)}`;
      mountTabNav({
        pathname: width === 768 ? '/zh/inference' : '/inference',
        runs: [bannerRun, { ...bannerRun, id: 2, branch: longBranch }],
      });

      cy.get('[data-slot="unofficial-banner"]').should('have.length', 1).and('be.visible');
      cy.get('[data-slot="dashboard-navigation"]').should(($navigation) => {
        const navigation = $navigation[0];
        const bounds = navigation.getBoundingClientRect();
        const banner = navigation.querySelector<HTMLElement>('[data-slot="unofficial-banner"]')!;
        const bannerBounds = banner.getBoundingClientRect();
        const controls = navigation.querySelector<HTMLElement>(
          width < 1024 ? '#chart-select' : '[data-testid="chart-section-tabs"]',
        )!;
        expect(bannerBounds.top, 'banner follows the navigation controls').to.be.at.least(
          controls.getBoundingClientRect().bottom,
        );
        expect(bannerBounds.bottom, 'banner joins the bottom edge of the card').to.be.closeTo(
          bounds.bottom - 1,
          1,
        );
        expect(navigation.scrollWidth, 'navigation does not overflow').to.be.at.most(
          navigation.clientWidth,
        );
        for (const action of banner.querySelectorAll('a, button')) {
          const actionBounds = action.getBoundingClientRect();
          expect(actionBounds.left, 'action stays inside banner').to.be.at.least(bannerBounds.left);
          expect(actionBounds.right, 'action stays inside banner').to.be.at.most(
            bannerBounds.right,
          );
          if (width < 640) expect(actionBounds.height, 'phone touch target').to.be.at.least(44);
        }
        const label = [...banner.querySelectorAll('span')].find(
          (span) => span.textContent?.trim() === 'NON-OFFICIAL',
        )!;
        expect(label.getBoundingClientRect().height, 'warning label stays on one line').to.equal(
          parseFloat(getComputedStyle(label).lineHeight),
        );
      });
      cy.get(`[aria-label="View workflow run for ${bannerRun.branch}"]`).should(
        'have.attr',
        'href',
        bannerRun.url,
      );
      cy.get(`[aria-label="Dismiss ${bannerRun.branch}"]`).click();
      cy.get('@dismissRun').should('have.been.calledOnceWith', String(bannerRun.id));
      cy.get('@clearUnofficialRun').should('not.have.been.called');
      cy.get('[aria-label="Dismiss all unofficial runs"]').click();
      cy.get('@clearUnofficialRun').should('have.been.calledOnce');
    });
  }

  it('does not leave an empty status strip when there are no unofficial runs', () => {
    mountTabNav({});
    cy.get('[data-slot="unofficial-banner"]').should('not.exist');
    cy.get('[data-slot="dashboard-navigation"]').should('be.visible');
  });
});

describe('TabNav — unofficialrun URL preservation (issue #319)', () => {
  afterEach(() => {
    // Reset URL between specs so leftover query strings don't leak.
    cy.window().then((win) => win.history.replaceState(null, '', '/'));
  });

  it('renders bare hrefs when the URL has no unofficialrun param', () => {
    mountTabNav({});
    cy.get('[data-testid="tab-trigger-overview"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-evaluation"]').should('have.attr', 'href', '/evaluation');
    cy.get('[data-testid="tab-trigger-historical"]').should('have.attr', 'href', '/historical');
    cy.get('[data-testid="tab-trigger-profit-estimator"]').should(
      'have.attr',
      'href',
      '/profit-estimator',
    );
    // TCO Calculator and Fleet Lifecycle live in the footer, not the tab bar.
    cy.get('[data-testid="tab-trigger-calculator"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-fleet"]').should('not.exist');
  });

  it('appends unofficialruns to every tab href when the URL has the param', () => {
    mountTabNav({ search: '?unofficialruns=12345' });
    cy.get('[data-testid="tab-trigger-overview"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-evaluation"]').should(
      'have.attr',
      'href',
      '/evaluation?unofficialruns=12345',
    );
    cy.get('[data-testid="tab-trigger-inference"]').should(
      'have.attr',
      'href',
      '/inference?unofficialruns=12345',
    );
    cy.get('[data-testid="tab-trigger-submissions"]').should(
      'have.attr',
      'href',
      '/submissions?unofficialruns=12345',
    );
    cy.get('[data-testid="tab-trigger-historical"]').should(
      'have.attr',
      'href',
      '/historical?unofficialruns=12345',
    );
  });

  it('preserves a comma-separated list of run ids verbatim', () => {
    mountTabNav({ search: '?unofficialruns=111,222,333' });
    cy.get('[data-testid="tab-trigger-evaluation"]').should(
      'have.attr',
      'href',
      '/evaluation?unofficialruns=111,222,333',
    );
  });

  it('accepts the singular alias `unofficialrun` and forwards it under `unofficialruns`', () => {
    mountTabNav({ search: '?unofficialrun=999' });
    cy.get('[data-testid="tab-trigger-evaluation"]').should(
      'have.attr',
      'href',
      '/evaluation?unofficialruns=999',
    );
  });
});

describe('TabNav — Hidden popover for gated tabs', () => {
  afterEach(() => {
    cy.window().then((win) => {
      win.history.replaceState(null, '', '/');
      win.localStorage.removeItem('inferencex-feature-gate');
    });
  });

  it('omits the Hidden trigger and gated links when the feature gate is locked', () => {
    cy.window().then((win) => win.localStorage.removeItem('inferencex-feature-gate'));
    mountTabNav({});
    cy.get('[data-testid="tab-trigger-inference"]').should('exist');
    cy.get('[data-testid="tab-trigger-submissions"]').should('exist');
    cy.get('[data-testid="tab-trigger-gpu-specs"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-feedback"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-ai-chart"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-collectivex"]').should('not.exist');
  });

  it('still names the current gated page in the locked mobile selector', () => {
    cy.viewport(390, 844);
    cy.window().then((win) => win.localStorage.removeItem('inferencex-feature-gate'));
    mountTabNav({ pathname: '/zh/ai-chart' });
    cy.get('[data-testid="mobile-chart-select"]')
      .should('be.visible')
      .and('contain.text', 'AI 图表');
  });

  it('renders the Hidden trigger when unlocked; popover reveals gated links', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate', '1'));
    mountTabNav({});
    cy.get('[data-testid="tab-trigger-hidden"]').should('be.visible').and('contain.text', 'Hidden');
    // Gated links are inside the closed popover, so they're not yet in the DOM.
    cy.get('[data-testid="tab-trigger-ai-chart"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-collectivex"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-submissions"]').should('have.attr', 'href', '/submissions');
    cy.get('[data-testid="tab-trigger-hidden"]').click();
    cy.get('[data-testid="tab-hidden-popover"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-collectivex"]').should('have.attr', 'href', '/collectivex');
    cy.get('[data-testid="tab-trigger-ai-chart"]').should('have.attr', 'href', '/ai-chart');
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('have.attr', 'href', '/gpu-metrics');
    cy.get('[data-testid="tab-hidden-popover"]')
      .find('[data-testid="tab-trigger-submissions"]')
      .should('not.exist');
    cy.get('[data-testid="tab-trigger-feedback"]').should('have.attr', 'href', '/feedback');
  });

  it('forwards the unofficialruns param onto every gated link in the popover', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate', '1'));
    mountTabNav({ search: '?unofficialruns=42' });
    cy.get('[data-testid="tab-trigger-hidden"]').click();
    cy.get('[data-testid="tab-trigger-feedback"]').should(
      'have.attr',
      'href',
      '/feedback?unofficialruns=42',
    );
    cy.get('[data-testid="tab-trigger-collectivex"]').should(
      'have.attr',
      'href',
      '/collectivex?unofficialruns=42',
    );
  });

  it('highlights the Hidden trigger when the current path is one of the gated tabs', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate', '1'));
    mountTabNav({ pathname: '/feedback' });
    cy.get('[data-testid="tab-trigger-hidden"]').should('have.class', 'border-secondary');
  });

  it('highlights the Hidden trigger on /collectivex, which is now gated', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate', '1'));
    mountTabNav({ pathname: '/collectivex' });
    cy.get('[data-testid="tab-trigger-hidden"]').should('have.class', 'border-secondary');
  });

  it('does NOT highlight the Hidden trigger on a non-gated path', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate', '1'));
    mountTabNav({ pathname: '/inference' });
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.have.class', 'border-secondary');
  });
});
