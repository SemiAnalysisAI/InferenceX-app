/**
 * Regression: the landing "Full dashboard" CTA must navigate in exactly one
 * transition — one router commit, one new history entry, no URL revert.
 *
 * One click used to: commit /inference/kimi-k3, get reverted to `/` by a
 * stale router restore (url-state.ts initializing mid-transition and calling
 * the Next-patched history.replaceState), then be pushed again by
 * navigateInApp's 250ms retry — replaying the landing reveal, pausing, and
 * stacking a duplicate history entry (a single Back no longer returned to
 * the landing page).
 *
 * The cold-load simulation below (failed prefetches + a slow click-time RSC
 * response) makes that race deterministic. Motion is re-enabled via CDP on
 * chromium — the launch flags force reduced motion there, which hides the
 * visible half of this regression — while Firefox runs motion-enabled
 * natively.
 */

const TARGET = '/inference/kimi-k3';

interface HistoryWrite {
  kind: 'push' | 'replace';
  pathname: string;
}

describe('landing → full dashboard navigation', () => {
  const isChromium = Cypress.browser.family === 'chromium';

  const setReducedMotion = (value: string) =>
    isChromium
      ? Cypress.automation('remote:debugger:protocol', {
          command: 'Emulation.setEmulatedMedia',
          params: { features: [{ name: 'prefers-reduced-motion', value }] },
        })
      : Promise.resolve();

  before(() => {
    cy.wrap(null).then(() => setReducedMotion('no-preference'));
  });

  after(() => {
    // Other specs in this run expect the config's forced reduced motion.
    cy.wrap(null).then(() => setReducedMotion(''));
  });

  it('commits exactly one navigation and one history entry on a cold dashboard load', () => {
    const writes: HistoryWrite[] = [];

    cy.intercept({ url: /\/inference\/kimi-k3/ }, (req) => {
      if (req.headers['next-router-prefetch']) {
        // A cold visit has no warmed router cache for the target.
        req.reply({ statusCode: 404, body: '' });
        return;
      }
      // The click-time payload takes longer than any timer-based re-push.
      req.on('response', (res) => {
        res.setDelay(800);
      });
    });

    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        // Wrap the native methods before Next patches them, so the router's
        // own commits are observed too.
        const origPush = win.history.pushState.bind(win.history);
        const origReplace = win.history.replaceState.bind(win.history);
        const pathnameOf = (url: unknown) =>
          new URL(String(url ?? win.location.href), win.location.origin).pathname;
        win.history.pushState = function (data, unused, url) {
          writes.push({ kind: 'push', pathname: pathnameOf(url) });
          return origPush(data, unused, url as string);
        };
        win.history.replaceState = function (data, unused, url) {
          writes.push({ kind: 'replace', pathname: pathnameOf(url) });
          return origReplace(data, unused, url as string);
        };
      },
    });

    // The real motion path must be active (reduced motion hides the visible
    // half of this regression).
    cy.window().then((win) => {
      expect(
        win.matchMedia('(prefers-reduced-motion: reduce)').matches,
        'prefers-reduced-motion: reduce',
      ).to.eq(false);
    });

    // Let hydration and the landing reveal settle, as in the manual repro.
    cy.get('[data-testid="compare-agentx-dashboard-link"]').should('be.visible');
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1500);

    cy.window().then((win) => {
      cy.wrap(win.history.length).as('historyLenBefore');
    });

    cy.get('[data-testid="compare-agentx-dashboard-link"]').click();
    cy.location('pathname', { timeout: 15000 }).should('eq', TARGET);

    // Give any stray timer-based re-push time to fire before asserting.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000);

    cy.location('pathname').should('eq', TARGET);
    cy.then(() => {
      const commits = writes.filter((w) => w.kind === 'push' && w.pathname === TARGET);
      expect(commits.length, 'router commits to the dashboard').to.eq(1);

      const firstCommit = writes.findIndex((w) => w.kind === 'push' && w.pathname === TARGET);
      const revertsAfterCommit = writes.slice(firstCommit + 1).filter((w) => w.pathname === '/');
      expect(
        revertsAfterCommit,
        'URL rewrites back to the landing page after the commit',
      ).to.deep.eq([]);
    });
    cy.window().then(function (win) {
      expect(win.history.length, 'exactly one new history entry').to.eq(
        Number(this.historyLenBefore) + 1,
      );
    });

    // A single Back must return to the landing page, and Forward must come
    // straight back to the dashboard.
    cy.go('back');
    cy.location('pathname').should('eq', '/');
    cy.get('[data-testid="compare-agentx-dashboard-link"]').should('be.visible');
    cy.go('forward');
    cy.location('pathname').should('eq', TARGET);
  });
});
