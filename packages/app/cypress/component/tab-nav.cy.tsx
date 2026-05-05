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
