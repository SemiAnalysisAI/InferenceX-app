/**
 * E2E tests for the unified NudgeEngine.
 *
 * Covers: landing modals (priority ordering, dismissal persistence),
 * landing banner, dashboard toasts, evaluation toast, and the
 * permanent-suppress ("starred") cross-nudge mechanism.
 */

import { assertTpuGb300Selected, interceptTpuLaunchData } from '../support/tpu-launch-fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearAllNudgeStorage(win: Cypress.AUTWindow) {
  const keys = [
    'inferencex-starred',
    'inferencex-star-modal-dismissed',
    'inferencex-tpuv7-qwen-3-5-agentx-banner-dismissed',
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

describe('Landing nudges — modals', { testIsolation: true }, () => {
  it('shows the launch banner on fresh first load', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]')
      .should('be.visible')
      .and('contain.text', 'Google TPUv7 joins AgentX')
      .and('contain.text', 'TPUv7 Kimi K2.8T prelimary Submisison: Competitive Results')
      .and('contain.text', 'View results');
    cy.get('[data-new-badge="launch-banner"]').should('have.class', 'new-badge-flash');
    // Banner + header-nav badges and both flashing TPU card badges — the shared
    // pill must render at the same fixed size everywhere it appears.
    cy.get('[data-new-badge]')
      .should('have.length', 4)
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

    // The persistent star CTA lives in the footer grid (footer-star-cta) and
    // the header; the old immediate star modal duplicated it and covered the
    // footer, so it must stay gone.
    cy.get('[data-testid="github-star-modal"]').should('not.exist');
    cy.get('[data-testid="footer-star-cta"]').should('exist');
  });

  it('localizes the launch banner title in Chinese', () => {
    cy.visit('/zh', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]')
      .should('be.visible')
      .and('contain.text', 'Google TPUv7 加入 AgentX')
      .and('contain.text', 'TPUv7 Kimi K2.8T 初步提交：成绩具有竞争力')
      .and('contain.text', '查看结果');
  });
});

// ---------------------------------------------------------------------------
// Landing — centered TPUv7 launch modal
// ---------------------------------------------------------------------------

const LAUNCH_MODAL_KEY = 'inferencex-tpuv7-agentx-modal-dismissed';
const TPU_RESULTS_HREF =
  '/inference/qwen-3-5?g_model=Qwen-3.5-397B-A17B&i_xmode=interactivity&i_seq=agentic-traces&i_prec=fp8';

function assertTpuResultsFilters() {
  assertTpuGb300Selected();
  cy.get('[data-testid="model-selector"]').should('contain.text', 'Qwen3.5 397B');
  cy.get('[data-testid="scenario-selector"]')
    .invoke('text')
    .should('match', /Agentic|智能体/u);
  cy.get('[data-testid="precision-multiselect"]')
    .should('contain.text', 'FP8')
    .and('not.contain.text', 'FP4');
  cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'interactivity');
}

// cypress/support/e2e.ts seeds the modal key on every load; clearing it here
// runs after that hook, so only these visits see the modal.
function showLaunchModal(win: Cypress.AUTWindow) {
  clearAllNudgeStorage(win);
  win.localStorage.removeItem(LAUNCH_MODAL_KEY);
}

describe('Landing nudges — TPUv7 launch modal', { testIsolation: true }, () => {
  for (const prefix of ['', '/zh']) {
    for (const width of [1280, 375]) {
      it(`centers each button row and loads model logos at ${width}px on ${prefix || '/'}`, () => {
        cy.viewport(width, 812);
        cy.visit(prefix || '/', { onBeforeLoad: showLaunchModal });
        cy.get('[data-testid="launch-modal"]')
          .should('be.visible')
          .then(($modal) => {
            const modal = $modal[0];
            const panel = modal.getBoundingClientRect();
            const rows = new Map<number, DOMRect[]>();
            modal.querySelectorAll('button[data-testid]').forEach((button) => {
              const rect = button.getBoundingClientRect();
              const top = Math.round(rect.top);
              rows.set(top, [...(rows.get(top) ?? []), rect]);
            });
            expect(modal.querySelectorAll('button[data-testid]')).to.have.length(2);
            expect(modal.querySelector('[data-testid="launch-modal-dismiss"]')).to.eq(null);
            const close = modal.querySelector('button[aria-label]')!;
            expect(close.getBoundingClientRect().width).to.eq(36);
            expect(close.getBoundingClientRect().height).to.eq(36);
            expect(close.querySelector('svg')!.getBoundingClientRect().width).to.eq(20);
            const actions = [...modal.querySelectorAll('button[data-testid]')].map((button) =>
              button.getBoundingClientRect(),
            );
            expect(Math.abs(actions[0].width - actions[1].width)).to.be.lessThan(1);
            expect(actions[0].top).to.eq(actions[1].top);
            expect(actions[0].height).to.be.at.least(44);
            const heading = modal.querySelector('h2')!.getBoundingClientRect();
            const badge = modal.querySelector('[data-new-badge]')!.getBoundingClientRect();
            expect(badge.bottom).to.be.lessThan(heading.top);
            const styles = modal.ownerDocument.defaultView!.getComputedStyle(
              modal.querySelector('h2')!,
            );
            expect(styles.textAlign).to.eq('center');
            expect(styles.fontSize).to.eq('22px');
            expect(
              modal.ownerDocument.defaultView!.getComputedStyle(modal.querySelector('p')!)
                .textAlign,
            ).to.eq('center');
            const eyebrow = modal.querySelector('[data-new-badge]')!.parentElement!;
            const google = eyebrow.querySelector('svg[aria-label="Google"]')!;
            expect(google).not.to.eq(null);
            expect(google.getBoundingClientRect().width).to.eq(24);
            expect(
              [...google.querySelectorAll('path')].map((path) => path.getAttribute('fill')),
            ).to.deep.eq(['#EA4335', '#4285F4', '#FBBC05', '#34A853']);
            const center = (google.getBoundingClientRect().left + badge.right) / 2;
            expect(Math.abs(center - (panel.left + panel.width / 2))).to.be.lessThan(1);
            for (const row of rows.values()) {
              const left = Math.min(...row.map((rect) => rect.left)) - panel.left;
              const right = panel.right - Math.max(...row.map((rect) => rect.right));
              expect(left).to.be.greaterThan(0);
              expect(
                Math.abs(left - right),
                'equal space on both sides of each row',
              ).to.be.lessThan(2);
            }
          });
        for (const [action, logo] of [
          ['action', 'qwen-color.svg'],
          ['secondary-action', 'kimi-color.svg'],
        ]) {
          cy.get(`[data-testid="launch-modal-${action}"] img`)
            .should('have.attr', 'src', `/logos/${logo}`)
            .and('have.attr', 'alt', '')
            .and('have.attr', 'aria-hidden', 'true')
            .and('be.visible')
            .should(($img) => {
              expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
            });
          cy.get(`[data-testid="launch-modal-${action}"] svg`).should('not.exist');
        }
      });
    }
  }

  it('centers the modal over a backdrop and opens Qwen3.5 AgentX results', () => {
    interceptTpuLaunchData();
    cy.visit('/', { onBeforeLoad: showLaunchModal });
    cy.get('[data-testid="launch-modal"]')
      .should('be.visible')
      .and('have.attr', 'aria-modal', 'true')
      .and('contain.text', 'TPUv7 prelimary results across multiple models')
      .and('contain.text', 'AgentX Preview Submissions')
      .then(($modal) => {
        const rect = $modal[0].getBoundingClientRect();
        // clientWidth/Height exclude the scrollbar, which the fixed overlay also excludes.
        const root = $modal[0].ownerDocument.documentElement;
        expect(Math.abs(rect.left + rect.width / 2 - root.clientWidth / 2)).to.be.lessThan(2);
        expect(Math.abs(rect.top + rect.height / 2 - root.clientHeight / 2)).to.be.lessThan(2);
      });
    cy.get('[data-new-badge="launch-modal"]').should('have.class', 'new-badge-flash');
    // Focus moves into the dialog so keyboard users land on the action.
    cy.focused().should('have.attr', 'data-testid', 'launch-modal-action');
    cy.get('[data-testid="launch-modal-action"]').should('have.text', 'Qwen3.5').click();
    cy.location('pathname').should('eq', '/inference/qwen-3-5');
    assertTpuResultsFilters();
  });

  it('keeps Shift+Tab inside the dialog after clicking the panel', () => {
    cy.visit('/', { onBeforeLoad: showLaunchModal });
    cy.get('[data-testid="launch-modal"]').should('be.visible').click(12, 12);
    cy.focused().should('have.attr', 'data-testid', 'launch-modal');
    cy.focused().trigger('keydown', { key: 'Tab', shiftKey: true });
    cy.focused().should('have.attr', 'data-testid', 'launch-modal-secondary-action');
    cy.focused().trigger('keydown', { key: 'Tab' });
    cy.focused().should('have.attr', 'aria-label', 'Close');
    cy.get('[data-testid="launch-modal"]').should('be.visible');
  });

  it('dismisses on Escape', () => {
    cy.visit('/', { onBeforeLoad: showLaunchModal });
    cy.get('[data-testid="launch-modal"]').should('be.visible');
    cy.focused().type('{esc}');
    cy.get('[data-testid="launch-modal"]').should('not.exist');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(LAUNCH_MODAL_KEY)).to.not.eq(null);
    });
  });

  it('persists close-button dismissal', () => {
    cy.visit('/', { onBeforeLoad: showLaunchModal });
    cy.get('[data-testid="launch-modal"] button[aria-label="Close"]').click();
    cy.get('[data-testid="launch-modal"]').should('not.exist');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(LAUNCH_MODAL_KEY)).to.not.eq(null);
    });
    cy.reload();
    cy.get('[data-testid="launch-modal"]').should('not.exist');
  });

  it('localizes the modal and keeps the Chinese route tree', () => {
    interceptTpuLaunchData();
    cy.visit('/zh', { onBeforeLoad: showLaunchModal });
    cy.get('[data-testid="launch-modal"]')
      .should('be.visible')
      .and('contain.text', 'TPUv7 多模型初步结果')
      .and('contain.text', 'AgentX 预览版提交结果')
      .and('not.contain.text', '稍后再看');
    cy.get('[data-testid="launch-modal-action"]').should('have.text', 'Qwen3.5').click();
    cy.location('pathname').should('eq', '/zh/inference/qwen-3-5');
    assertTpuResultsFilters();
  });

  for (const prefix of ['', '/zh']) {
    it(`opens Kimi K3 and persists dismissal from ${prefix || '/'} on mobile`, () => {
      cy.viewport(375, 812);
      cy.visit(prefix || '/', { onBeforeLoad: showLaunchModal });
      cy.get('[data-testid="launch-modal"]')
        .should('be.visible')
        .within(() => {
          cy.get('button[data-testid]')
            .should('have.length', 2)
            .each(($button) => {
              const rect = $button[0].getBoundingClientRect();
              expect(rect.left).to.be.at.least(0);
              expect(rect.right).to.be.at.most(375);
            });
          cy.get('[data-testid="launch-modal-secondary-action"]')
            .should('have.text', 'Kimi K3')
            .click();
        });
      cy.location('pathname').should('eq', `${prefix}/inference/kimi-k3`);
      cy.window().then((win) => {
        expect(win.localStorage.getItem(LAUNCH_MODAL_KEY)).to.not.eq(null);
      });
      cy.get('[data-testid="model-selector"]').should('contain.text', 'Kimi K3');
    });
  }
});

// ---------------------------------------------------------------------------
// Landing — banner
// ---------------------------------------------------------------------------

describe('Landing nudges — banner', { testIsolation: true }, () => {
  it('wraps the full launch banner title on mobile without clipping', () => {
    cy.viewport(375, 812);
    cy.visit('/', { onBeforeLoad: clearAllNudgeStorage });
    cy.get('[data-testid="launch-banner"] p')
      .first()
      .should('contain.text', 'Google TPUv7 joins AgentX')
      .and('have.css', 'white-space', 'normal')
      .should(($title) => {
        expect($title[0].scrollWidth).to.be.at.most($title[0].clientWidth);
        expect($title[0].scrollHeight).to.be.at.most($title[0].clientHeight);
      });
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

  it('clicking the banner body navigates without persisting dismissal', () => {
    interceptTpuLaunchData();
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.window().then((win) => {
      // Only the X button should persist a dismissal — show alone must not.
      expect(win.localStorage.getItem('inferencex-tpuv7-qwen-3-5-agentx-banner-dismissed')).to.eq(
        null,
      );
    });

    cy.get('[data-testid="launch-banner"]')
      .should('be.visible')
      .and('have.attr', 'href', TPU_RESULTS_HREF);
    cy.get('[data-testid="launch-banner"]').click();

    cy.location('pathname').should('eq', '/inference/qwen-3-5');
    assertTpuResultsFilters();

    // Body click must not write the dismissal key — the banner should still
    // render after returning home and reloading the landing page.
    cy.get('[data-testid="nav-link-home"]').click();
    cy.location('pathname').should('eq', '/');
    cy.reload();
    cy.window().then((win) => {
      expect(win.localStorage.getItem('inferencex-tpuv7-qwen-3-5-agentx-banner-dismissed')).to.eq(
        null,
      );
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
  });
});

// ---------------------------------------------------------------------------
// Dashboard — reproducibility toast
// ---------------------------------------------------------------------------

describe('Dashboard nudges — reproducibility toast', () => {
  it('reproducibility nudge is session-only — gone after reload', () => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        clearAllNudgeStorage(win);
      },
    });
    // Should not be visible immediately
    cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
    // After the timer fires (~1.5s + buffer)
    cy.get('[data-testid="reproducibility-nudge"]', { timeout: 4000 }).should('be.visible');

    // Session storage should be set
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem('inferencex-reproducibility-nudge-shown')).to.not.equal(
        null,
      );
    });
    cy.reload();
    cy.wait(2000);
    cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
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
    cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');
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
  it('eval-samples open event refreshes the cooldown timestamp', () => {
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
        win.localStorage.setItem('inferencex-tpuv7-qwen-3-5-agentx-banner-dismissed', '1');
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
