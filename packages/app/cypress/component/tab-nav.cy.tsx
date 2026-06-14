import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { TabNav } from '@/components/tab-nav';
import { UnofficialRunContext } from '@/components/unofficial-run-provider';
import { createMockUnofficialRunContext } from '../support/mock-data';

function createMockRouter() {
  return {
    push: cy.stub(),
    replace: cy.stub(),
    refresh: cy.stub(),
    back: cy.stub(),
    forward: cy.stub(),
    prefetch: cy.stub().resolves(),
  };
}

/**
 * Mount TabNav with the provided URL search string written into the window
 * via history.replaceState. The component reads `window.location.search` in a
 * useEffect, so the URL must be set before mount.
 */
function mountTabNav(opts: { pathname?: string; search?: string }) {
  const { pathname = '/inference', search = '' } = opts;
  cy.window().then((win) => {
    win.history.replaceState(null, '', `${pathname}${search}`);
  });
  const router = createMockRouter();
  const ctxValue = createMockUnofficialRunContext();

  cy.mount(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={pathname}>
        <UnofficialRunContext.Provider value={ctxValue}>
          <TabNav />
        </UnofficialRunContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}

describe('TabNav — unofficialrun URL preservation (issue #319)', () => {
  afterEach(() => {
    // Reset URL between specs so leftover query strings don't leak.
    cy.window().then((win) => win.history.replaceState(null, '', '/'));
  });

  it('renders bare hrefs when the URL has no unofficialrun param', () => {
    mountTabNav({});
    cy.get('[data-testid="tab-trigger-evaluation"]').should('have.attr', 'href', '/evaluation');
    cy.get('[data-testid="tab-trigger-historical"]').should('have.attr', 'href', '/historical');
    cy.get('[data-testid="tab-trigger-calculator"]').should('have.attr', 'href', '/calculator');
  });

  it('appends unofficialruns to every tab href when the URL has the param', () => {
    mountTabNav({ search: '?unofficialruns=12345' });
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
    cy.get('[data-testid="tab-trigger-gpu-specs"]').should('exist');
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-feedback"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-ai-chart"]').should('not.exist');
  });

  it('renders the Hidden trigger when unlocked; popover reveals all 4 gated links', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate', '1'));
    mountTabNav({});
    cy.get('[data-testid="tab-trigger-hidden"]').should('be.visible').and('contain.text', 'Hidden');
    // Gated links are inside the closed popover, so they're not yet in the DOM.
    cy.get('[data-testid="tab-trigger-ai-chart"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-hidden"]').click();
    cy.get('[data-testid="tab-hidden-popover"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-ai-chart"]').should('have.attr', 'href', '/ai-chart');
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('have.attr', 'href', '/gpu-metrics');
    cy.get('[data-testid="tab-trigger-submissions"]').should('have.attr', 'href', '/submissions');
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
  });

  it('highlights the Hidden trigger when the current path is one of the gated tabs', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate', '1'));
    mountTabNav({ pathname: '/feedback' });
    cy.get('[data-testid="tab-trigger-hidden"]').should('have.class', 'border-secondary');
  });

  it('does NOT highlight the Hidden trigger on a non-gated path', () => {
    cy.window().then((win) => win.localStorage.setItem('inferencex-feature-gate', '1'));
    mountTabNav({ pathname: '/inference' });
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.have.class', 'border-secondary');
  });
});
