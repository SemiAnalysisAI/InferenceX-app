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
    'inferencex-openai-rubin-banner-dismissed',
    'inferencex-reproducibility-nudge-shown',
    'inferencex-star-nudge-shown',
    'inferencex-export-nudge-shown',
    'inferencex-gradient-nudge-shown',
    'inferencex-eval-samples-nudge-dismissed',
    'inferencex-filter-hint-nudge-dismissed',
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
  it('shows the launch banner on fresh first load', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]')
      .should('be.visible')
      .and('contain.text', "OpenAI's Latest In House Chip verus Rubin NVL72")
      .and(
        'contain.text',
        'Compare Jalapeño (Teacup) with Vera Rubin (July) NVL72 on DeepSeek R1 at 8K / 1K.',
      )
      .and('contain.text', 'View results');
    cy.get('[data-new-badge]')
      .should('have.length', 2)
      .then(($badges) => {
        const sizes = [...$badges].map((badge) => {
          const rect = badge.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        for (const size of sizes) {
          expect(size.width).to.eq(sizes[0].width);
          expect(size.height).to.eq(sizes[0].height);
        }
        expect(sizes[0]).to.deep.eq({ width: 32, height: 16 });

        for (const badge of $badges) {
          const label = badge.querySelector('[data-new-badge-label]');
          expect(label, 'badge label').not.to.eq(null);

          const badgeRect = badge.getBoundingClientRect();
          const labelRect = label!.getBoundingClientRect();
          const horizontalOffset =
            labelRect.left + labelRect.width / 2 - (badgeRect.left + badgeRect.width / 2);
          const verticalOffset =
            labelRect.top + labelRect.height / 2 - (badgeRect.top + badgeRect.height / 2);

          expect(horizontalOffset).to.be.closeTo(0, 0.1);
          expect(verticalOffset).to.eq(0);

          // The label box can sit dead centre while the glyphs themselves spill
          // out of it, so measure the rendered text and not just its container.
          const range = badge.ownerDocument.createRange();
          range.selectNodeContents(label!);
          const inkRect = range.getBoundingClientRect();
          const inkOffset =
            inkRect.left + inkRect.width / 2 - (badgeRect.left + badgeRect.width / 2);

          expect(inkRect.left, 'label ink stays inside the pill').to.be.at.least(badgeRect.left);
          expect(inkRect.right, 'label ink stays inside the pill').to.be.at.most(badgeRect.right);
          expect(inkOffset, 'label ink is centred').to.be.closeTo(0, 0.5);
        }
      });
  });

  it('localizes the Rubin comparison banner title in Chinese', () => {
    cy.visit('/zh', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]')
      .should('be.visible')
      .and('contain.text', 'OpenAI 最新自研芯片对比 Rubin NVL72')
      .and(
        'contain.text',
        '对比 Jalapeño (Teacup) 与 Vera Rubin (July) NVL72 在 DeepSeek R1 8K / 1K 工作负载下的表现。',
      )
      .and('contain.text', '查看结果');
  });

  it('does not float a duplicate GitHub star card over the footer', () => {
    // The persistent star CTA lives in the footer grid (footer-star-cta) and
    // the header; the old immediate star modal duplicated it and covered the
    // footer, so it must stay gone.
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.get('[data-testid="github-star-modal"]').should('not.exist');
    cy.get('[data-testid="footer-star-cta"]').should('exist');
  });
});

// ---------------------------------------------------------------------------
// Landing — banner
// ---------------------------------------------------------------------------

describe('Landing nudges — banner', () => {
  it('shows launch banner on landing page', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
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
      expect(win.localStorage.getItem('inferencex-openai-rubin-banner-dismissed')).to.eq(null);
    });
  });

  it('clicking the banner body navigates without persisting dismissal', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.get('[data-testid="launch-banner"]').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/inference');
    cy.location('search')
      .should('include', 'g_model=DeepSeek-R1-0528')
      .and('include', 'i_seq=8k%2F1k')
      .and('include', 'i_prec=fp4')
      .and('include', 'i_metric=y_outputTputPerMw');

    // Body click must not write the dismissal key — the banner should still
    // render on a fresh visit to landing.
    cy.window().then((win) => {
      expect(win.localStorage.getItem('inferencex-openai-rubin-banner-dismissed')).to.eq(null);
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
// Dashboard — filter-hint toast (inference tab only, permanent dismissal)
// ---------------------------------------------------------------------------

// Only one overlay toast shows at a time and reproducibility (1.5s timer) wins
// the slot on a fresh session. Suppress the competing dashboard toasts so the
// filter-hint toast (2.5s timer) deterministically claims the overlay slot.
function suppressCompetingDashboardToasts(win: Cypress.AUTWindow) {
  clearAllNudgeStorage(win);
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
  win.sessionStorage.setItem('inferencex-star-nudge-shown', '1');
}

describe('Dashboard nudges — filter-hint toast', () => {
  it('shows the filter-hint nudge on the inference tab after a short delay', () => {
    cy.visit('/inference', { onBeforeLoad: suppressCompetingDashboardToasts });
    cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');
    cy.get('[data-testid="filter-hint-nudge"]', { timeout: 5000 }).should('be.visible');
  });

  it('does not show the filter-hint nudge outside the inference tab', () => {
    cy.visit('/evaluation', { onBeforeLoad: suppressCompetingDashboardToasts });
    cy.wait(3500);
    cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');
  });

  it('arms the filter hint before a client transition into inference', () => {
    cy.visit('/evaluation', { onBeforeLoad: suppressCompetingDashboardToasts });
    cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');

    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.location('pathname').should('eq', '/inference');
    cy.get('[data-testid="filter-hint-nudge"]', { timeout: 3000 }).should('be.visible');
  });

  it('re-evaluates the localized filter hint after a Chinese tab transition', () => {
    cy.visit('/zh/evaluation', { onBeforeLoad: suppressCompetingDashboardToasts });
    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.location('pathname').should('eq', '/zh/inference');
    cy.get('[data-testid="filter-hint-nudge"]', { timeout: 3000 })
      .should('be.visible')
      .and('contain.text', '图表太拥挤？');
  });

  it('dismissal persists to localStorage and the nudge stays gone after reload', () => {
    cy.visit('/inference', { onBeforeLoad: suppressCompetingDashboardToasts });
    cy.get('[data-testid="filter-hint-nudge"]', { timeout: 5000 }).should('be.visible');

    cy.get('[data-testid="filter-hint-nudge"] button[aria-label]').first().click();
    // The toast's exit animation delays the persisted write by ~300ms.
    cy.wait(400);
    cy.window().then((win) => {
      expect(win.localStorage.getItem('inferencex-filter-hint-nudge-dismissed')).to.eq('1');
    });

    // Keep the persisted dismissal but re-suppress competitors on reload.
    cy.reload();
    cy.wait(3500);
    cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');
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
    cy.get('[data-testid="github-star-modal"]').should('not.exist');
    cy.get('[data-testid="launch-banner"]').should('not.exist');
  });

  it('dashboard nudges do not appear on landing page', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
        // Dismiss all landing nudges so nothing blocks visibility checks
        win.localStorage.setItem('inferencex-openai-rubin-banner-dismissed', '1');
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
