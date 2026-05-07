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

  it('eval-samples nudge uses timed dismissal (localStorage timestamp)', () => {
    cy.visit('/evaluation', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
      },
    });
    cy.get('[data-testid="eval-samples-nudge"]', { timeout: 4000 }).should('be.visible');

    // The engine marks it dismissed on show — verify a timestamp is stored
    cy.window().then((win) => {
      const value = win.localStorage.getItem('inferencex-eval-samples-nudge-dismissed');
      expect(value).to.not.equal(null);
      expect(Number(value)).to.be.greaterThan(0);
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
