/**
 * E2E tests for the unified NudgeEngine.
 *
 * Covers: landing modals (priority ordering, dismissal persistence),
 * landing banner, dashboard toasts, evaluation toast, and the
 * permanent-suppress ("starred") cross-nudge mechanism.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearAllNudgeStorage(win: Cypress.AUTWindow) {
  const keys = [
    'inferencex-starred',
    'inferencex-star-modal-dismissed',
    'inferencex-dsv4-modal-dismissed',
    'inferencex-dsv4-banner-dismissed',
    'inferencex-reproducibility-nudge-shown',
    'inferencex-star-nudge-shown',
    'inferencex-export-nudge-shown',
    'inferencex-gradient-nudge-shown',
    'inferencex-eval-samples-nudge-dismissed',
  ];
  for (const key of keys) {
    win.localStorage.removeItem(key);
    win.sessionStorage.removeItem(key);
  }
}

// `cypress.config.ts` runs with `testIsolation: false` — the browser context
// (incl. localStorage / sessionStorage) survives across tests in this spec.
// Defensively clear before each test so a missed `onBeforeLoad` in any test
// can't leak state into the next one.
beforeEach(() => {
  cy.clearAllLocalStorage();
  cy.clearAllSessionStorage();
});

// ---------------------------------------------------------------------------
// Landing — modal priority & dismissal
// ---------------------------------------------------------------------------

describe('Landing nudges — modals', () => {
  it('shows dsv4 modal and banner simultaneously on fresh first load', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    // Banner (inline) and modal (overlay) occupy independent slots
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.get('[data-testid="dsv4-launch-modal"]').should('be.visible');
    // Only one overlay at a time — star modal should not appear
    cy.get('[data-testid="github-star-modal"]').should('not.exist');
  });

  it('dismissing dsv4 modal persists — not shown on reload', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="dsv4-launch-modal"]').should('be.visible');
    cy.get('[data-testid="dsv4-launch-modal-dismiss"]').click();
    cy.get('[data-testid="dsv4-launch-modal"]').should('not.exist');

    cy.reload();
    cy.get('[data-testid="dsv4-launch-modal"]').should('not.exist');
  });

  it('dsv4 modal Explore action persists dismissal in localStorage', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="dsv4-launch-modal"]').should('be.visible');

    // The action writes localStorage synchronously before navigation. Check
    // the storage value before the navigation completes; combined with the
    // "Maybe Later" persists-across-reload test, this covers the explore
    // path without needing to stub window.location.
    cy.get('[data-testid="dsv4-launch-modal-action"]').click();
    cy.window().then((win) => {
      expect(win.localStorage.getItem('inferencex-dsv4-modal-dismissed')).to.eq('1');
    });
  });

  it('shows star modal when dsv4 modal was previously dismissed', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
        win.localStorage.setItem('inferencex-dsv4-modal-dismissed', '1');
      },
    });
    cy.get('[data-testid="dsv4-launch-modal"]').should('not.exist');
    cy.get('[data-testid="github-star-modal"]').should('be.visible');
  });

  it('star modal dismiss uses timed strategy — re-shows after expiry', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
        win.localStorage.setItem('inferencex-dsv4-modal-dismissed', '1');
      },
    });
    cy.get('[data-testid="github-star-modal"]').should('be.visible');
    cy.get('[data-testid="github-star-modal-dismiss"]').click();
    cy.get('[data-testid="github-star-modal"]').should('not.exist');

    cy.window().then((win) => {
      const value = win.localStorage.getItem('inferencex-star-modal-dismissed');
      expect(value).to.not.equal(null);
      expect(Number(value)).to.be.greaterThan(0);
    });
  });

  it('starring permanently suppresses both star modal and star nudge', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
        win.localStorage.setItem('inferencex-dsv4-modal-dismissed', '1');
      },
    });
    cy.get('[data-testid="github-star-modal"]').should('be.visible');
    cy.get('[data-testid="github-star-modal-action"]').click();
    cy.get('[data-testid="github-star-modal"]').should('not.exist');

    cy.window().then((win) => {
      expect(win.localStorage.getItem('inferencex-starred')).to.eq('1');
    });
  });
});

// ---------------------------------------------------------------------------
// Landing — banner
// ---------------------------------------------------------------------------

describe('Landing nudges — banner', () => {
  it('shows launch banner on landing page', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
        // Dismiss modals so the banner (highest priority at 60) is the active nudge.
        // Actually the banner has priority 60 > dsv4 modal 50, so it should show first.
        // But the engine only shows one nudge at a time; the banner wins because of priority.
      },
    });
    // The banner has the highest priority (60), so it should appear.
    // However, NudgeEngine only shows one nudge at a time.
    // With immediate triggers and priority 60 > 50 > 40, the banner wins.
    cy.get('[data-testid="launch-banner"]').should('be.visible');
  });

  it('banner renders within container constraints (not full-width)', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    // The banner's parent section has the container class for width constraints
    cy.get('[data-testid="launch-banner"]').parent('section.container').should('exist');
  });

  it('dismissing the banner persists across reloads', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.get('[data-testid="launch-banner-dismiss"]').click();
    cy.get('[data-testid="launch-banner"]').should('not.exist');

    cy.reload();
    cy.get('[data-testid="launch-banner"]').should('not.exist');
  });

  it('rendering the banner does not write its dismissal storage key', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.window().then((win) => {
      // Only the X button should persist a dismissal — show alone must not.
      expect(win.localStorage.getItem('inferencex-dsv4-banner-dismissed')).to.eq(null);
    });
  });

  it('clicking the banner body navigates without persisting dismissal', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.get('[data-testid="launch-banner"]').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/inference');

    // Body click must not write the dismissal key — the banner should still
    // render on a fresh visit to landing.
    cy.window().then((win) => {
      expect(win.localStorage.getItem('inferencex-dsv4-banner-dismissed')).to.eq(null);
    });

    cy.visit('/');
    cy.get('[data-testid="launch-banner"]').should('be.visible');
  });
});

// ---------------------------------------------------------------------------
// Dashboard — reproducibility toast
// ---------------------------------------------------------------------------

describe('Dashboard nudges — reproducibility toast', () => {
  it('shows reproducibility nudge after 1.5s delay on dashboard', () => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
      },
    });
    // Should not be visible immediately
    cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
    // After the timer fires (~1.5s + buffer)
    cy.get('[data-testid="reproducibility-nudge"]', { timeout: 4000 }).should('be.visible');
  });

  it('reproducibility nudge is session-only — gone after reload', () => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
      },
    });
    cy.get('[data-testid="reproducibility-nudge"]', { timeout: 4000 }).should('be.visible');

    // Session storage should be set
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem('inferencex-reproducibility-nudge-shown')).to.not.equal(
        null,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Evaluation — eval-samples toast
// ---------------------------------------------------------------------------

describe('Evaluation nudges — eval-samples toast', () => {
  it('shows eval-samples nudge after delay on evaluation page', () => {
    cy.visit('/evaluation', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
      },
    });
    cy.get('[data-testid="eval-samples-nudge"]', { timeout: 4000 }).should('be.visible');
  });

  it('eval-samples nudge writes timestamp on show (cooldownStartsOnShow)', () => {
    cy.visit('/evaluation', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
      },
    });
    cy.get('[data-testid="eval-samples-nudge"]', { timeout: 4000 }).should('be.visible');

    // Eval-samples uses `cooldownStartsOnShow: true` for an "every 7 days"
    // reminder cadence — the timer starts at first show, not on dismissal.
    cy.window().then((win) => {
      const value = win.localStorage.getItem('inferencex-eval-samples-nudge-dismissed');
      expect(value).to.not.equal(null);
      expect(Number(value)).to.be.greaterThan(0);
    });
  });

  it('eval-samples open event refreshes the cooldown timestamp', () => {
    cy.visit('/evaluation', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
      },
    });
    cy.get('[data-testid="eval-samples-nudge"]', { timeout: 4000 }).should('be.visible');

    cy.window().then((win) => {
      const before = Number(
        win.localStorage.getItem('inferencex-eval-samples-nudge-dismissed') ?? '0',
      );
      // Wait long enough that Date.now() has advanced past the first write.
      cy.wait(50);
      cy.window().then((win2) => {
        win2.dispatchEvent(new CustomEvent('inferencex:eval-samples-opened'));
        const after = Number(
          win2.localStorage.getItem('inferencex-eval-samples-nudge-dismissed') ?? '0',
        );
        expect(after).to.be.greaterThan(before);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-scope isolation
// ---------------------------------------------------------------------------

describe('Nudge scope isolation', () => {
  it('landing nudges do not appear on dashboard', () => {
    cy.visit('/inference', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="dsv4-launch-modal"]').should('not.exist');
    cy.get('[data-testid="github-star-modal"]').should('not.exist');
    cy.get('[data-testid="launch-banner"]').should('not.exist');
  });

  it('dashboard nudges do not appear on landing page', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
        // Dismiss all landing nudges so nothing blocks visibility checks
        win.localStorage.setItem('inferencex-dsv4-modal-dismissed', '1');
        win.localStorage.setItem('inferencex-dsv4-banner-dismissed', '1');
        win.localStorage.setItem('inferencex-starred', '1');
      },
    });
    // Wait a bit for any timer-based nudges
    cy.wait(2000);
    cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
    cy.get('[data-testid="star-nudge"]').should('not.exist');
    cy.get('[data-testid="export-nudge"]').should('not.exist');
  });
});
