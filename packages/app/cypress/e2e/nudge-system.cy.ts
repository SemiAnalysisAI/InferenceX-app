function clearAllNudgeStorage(win: Cypress.AUTWindow) {
  const keys = [
    'inferencex-starred',
    'inferencex-star-modal-dismissed',
    'inferencex-trainium3-glm-5-2-banner-dismissed',
    'inferencex-reproducibility-nudge-dismissed',
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
  // Pin the landing banner A/B arm so assertions on its copy are deterministic.
  win.localStorage.setItem('inferencex-landing-banner-variant', 'ubenchx');
}

beforeEach(() => {
  cy.clearAllLocalStorage();
  cy.clearAllSessionStorage();
});

/**
 * Nudge triggers are `window.setTimeout` delays armed after hydration. Advance the faked clock in
 * small steps until `selector` renders, so the test never guesses when the engine armed them.
 */
function tickUntilVisible(clock: Cypress.Clock, selector: string) {
  cy.get('body').should(($body) => {
    clock.tick(100);
    expect($body.find(selector).filter(':visible'), selector).to.have.length(1);
  });
}

/** Toasts unmount after a `setTimeout` exit transition, so advance the faked clock until they do. */
function tickUntilGone(clock: Cypress.Clock, selector: string) {
  cy.get('body').should(($body) => {
    clock.tick(100);
    expect($body.find(selector), selector).to.have.length(0);
  });
}

/** React renders what a faked timer showed on real frames, so wait two before asserting absence. */
function waitForRender() {
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve) => {
        win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()));
      }),
  );
}

describe('Landing nudges — modals', { testIsolation: true }, () => {
  it('shows the launch banner on fresh first load', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.get('[data-new-badge="launch-banner"]').should('have.class', 'new-badge-flash');
    cy.get('[data-new-badge]:visible')
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

    cy.get('[data-testid="github-star-modal"]').should('not.exist');
    cy.get('[data-testid="footer-star-cta"]').should('exist');
  });
});

const LAUNCH_MODAL_KEY = 'inferencex-trainium3-agentx-modal-dismissed';

function showLaunchModal(win: Cypress.AUTWindow) {
  clearAllNudgeStorage(win);
  win.localStorage.removeItem(LAUNCH_MODAL_KEY);
}

describe('Landing nudges — Trainium3 launch modal', { testIsolation: true }, () => {
  it('shows the new announcement despite a dismissal of the old TPUv7 one', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        showLaunchModal(win);
        win.localStorage.setItem(
          'inferencex-tpuv7-agentx-multiple-model-modal-dismissed',
          String(win.Date.now()),
        );
      },
    });
    cy.get('[data-testid="launch-modal"]').should('be.visible');
    cy.get('[data-testid="launch-modal"] button[aria-label="Close"]').click();
    cy.window().then((win) => {
      expect(Number(win.localStorage.getItem(LAUNCH_MODAL_KEY))).to.be.greaterThan(1);
    });
  });

  it('centers the modal content, Amazon mark and single GLM 5.2 action at 1280px', () => {
    cy.viewport(1280, 812);
    cy.visit('/', { onBeforeLoad: showLaunchModal });
    cy.get('[data-testid="launch-modal"]')
      .should('be.visible')
      .and('have.attr', 'aria-modal', 'true')
      .and('contain.text', 'Amazon Trainium3 Preliminary Results')
      .and('contain.text', 'GLM 5.2 AgentX Preview Submission')
      .then(($modal) => {
        const modal = $modal[0];
        const panel = modal.getBoundingClientRect();
        const root = modal.ownerDocument.documentElement;
        expect(Math.abs(panel.left + panel.width / 2 - root.clientWidth / 2)).to.be.lessThan(2);
        expect(Math.abs(panel.top + panel.height / 2 - root.clientHeight / 2)).to.be.lessThan(2);
        const buttons = [...modal.querySelectorAll('button[data-testid]')];
        expect(buttons.map((button) => button.textContent?.trim())).to.deep.eq(['GLM 5.2']);
        expect(modal.querySelector('[data-testid="launch-modal-dismiss"]')).to.eq(null);
        const action = buttons[0].getBoundingClientRect();
        expect(action.height).to.be.at.least(44);
        const left = action.left - panel.left;
        const right = panel.right - action.right;
        expect(Math.abs(left - right), 'action centered in the panel').to.be.lessThan(2);
        const heading = modal.querySelector('h2')!.getBoundingClientRect();
        const badge = modal.querySelector('[data-new-badge]')!.getBoundingClientRect();
        expect(badge.bottom).to.be.lessThan(heading.top);
        const amazon = modal.querySelector('svg[aria-label="Amazon"]')!;
        expect(amazon).not.to.eq(null);
        expect(amazon.getBoundingClientRect().width).to.eq(24);
        expect(
          [...amazon.querySelectorAll('path')].map((path) => path.getAttribute('fill')),
        ).to.deep.eq(['currentColor', '#FF9900']);
      });
    cy.get('[data-new-badge="launch-modal"]').should('have.class', 'new-badge-flash');
    cy.get('[data-testid="launch-modal-action"] img')
      .should('have.attr', 'src', '/logos/zai-color.svg')
      .and('be.visible');
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

  for (const prefix of ['', '/zh']) {
    it(`opens Trainium3 GLM 5.2 results from ${prefix || '/'}`, () => {
      cy.visit(prefix || '/', { onBeforeLoad: showLaunchModal });
      if (prefix) {
        cy.get('[data-testid="launch-modal"]')
          .should('contain.text', 'Amazon Trainium3 初步结果')
          .and('contain.text', 'GLM 5.2 AgentX 预览版提交结果');
      }
      cy.focused().should('have.attr', 'data-testid', 'launch-modal-action');
      cy.get('[data-testid="launch-modal-action"]').should('have.text', 'GLM 5.2').click();
      cy.location('pathname').should('eq', `${prefix}/infx/inference/glm-5-3`);
      cy.location('search').should('eq', '');
      cy.window().then((win) => {
        expect(Number(win.localStorage.getItem(LAUNCH_MODAL_KEY))).to.be.greaterThan(1);
      });
    });
  }
});

describe('Landing nudges — banner', { testIsolation: true }, () => {
  it('wraps the launch banner title and subtitle on mobile without clipping', () => {
    cy.viewport(375, 812);
    cy.visit('/', { onBeforeLoad: clearAllNudgeStorage });
    cy.get('[data-testid="launch-banner"] p')
      .should('contain.text', 'Amazon Trainium3 Results')
      .and('contain.text', 'GLM 5.2 AgentX Preview Results')
      .and('have.css', 'white-space', 'normal')
      .should(($paragraphs) => {
        for (const text of $paragraphs) {
          expect(text.scrollWidth).to.be.at.most(text.clientWidth);
          expect(text.scrollHeight).to.be.at.most(text.clientHeight);
        }
      });
    cy.get('[data-new-badge="launch-banner"]')
      .parent()
      .should('have.css', 'white-space', 'nowrap')
      .and('contain.text', 'Results');
    cy.get('[data-testid="launch-banner"] > svg').should('have.css', 'align-self', 'flex-start');
  });

  it('dismissing the banner persists across reloads', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.get('[data-testid="launch-banner-dismiss"]:visible').click();
    cy.get('[data-testid="launch-banner"]').should('not.exist');

    cy.reload();
    cy.get('[data-testid="launch-banner"]').should('not.exist');
  });

  it('clicking the banner body navigates without persisting dismissal', () => {
    cy.visit('/', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('inferencex-trainium3-glm-5-2-banner-dismissed')).to.eq(null);
    });

    cy.get('[data-testid="launch-banner"]')
      .should('be.visible')
      .and('have.attr', 'href', '/infx/inference/glm-5-3');
    cy.get('[data-testid="launch-banner"]:visible').click();

    cy.location('pathname').should('eq', '/infx/inference/glm-5-3');

    cy.get('[data-testid="nav-link-home"]').click();
    cy.location('pathname').should('eq', '/');
    cy.reload();
    cy.window().then((win) => {
      expect(win.localStorage.getItem('inferencex-trainium3-glm-5-2-banner-dismissed')).to.eq(null);
    });
    cy.get('[data-testid="launch-banner"]').should('be.visible');
  });
});

describe('Dashboard nudges — reproducibility toast', () => {
  it('reproducibility nudge stays dismissed across reloads', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout']).then((clock) => {
      cy.visit('/infx/inference?g_model=DeepSeek-V4-Pro', {
        onBeforeLoad(win) {
          clearAllNudgeStorage(win);
        },
      });
      cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
      tickUntilVisible(clock, '[data-testid="reproducibility-nudge"]');
      cy.get('[data-testid="reproducibility-nudge"] button[aria-label="Dismiss"]').click();
      tickUntilGone(clock, '[data-testid="reproducibility-nudge"]');

      cy.window().then((win) => {
        expect(win.localStorage.getItem('inferencex-reproducibility-nudge-dismissed')).to.eq('1');
      });
      cy.reload();
      // The filter hint timer (2.5s) fires after the reproducibility timer (1.5s), so the inline
      // filter hint appearing proves the reproducibility nudge stayed hidden.
      tickUntilVisible(clock, '[data-testid="filter-hint-nudge"]');
      cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
    });
  });
});

function suppressCompetingDashboardToasts(win: Cypress.AUTWindow) {
  clearAllNudgeStorage(win);
  win.localStorage.setItem('inferencex-reproducibility-nudge-dismissed', '1');
  win.sessionStorage.setItem('inferencex-star-nudge-shown', '1');
}

describe('Dashboard nudges — inline filter hint', () => {
  it('does not show the filter-hint nudge outside the inference tab', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout']).then((clock) => {
      cy.visit('/infx/evaluation', { onBeforeLoad: suppressCompetingDashboardToasts });
      // The evaluation toast (1.5s) proves the hydrated engines have armed their timers.
      tickUntilVisible(clock, '[data-testid="eval-samples-nudge"]');
      cy.tick(2500);
      cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');
    });
  });

  it('arms the filter hint before a client transition into inference', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout']).then((clock) => {
      cy.visit('/infx/evaluation', { onBeforeLoad: suppressCompetingDashboardToasts });
      cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');

      cy.get('[data-testid="tab-trigger-inference"]').click();
      cy.location('pathname').should('eq', '/infx/inference');
      tickUntilVisible(clock, '[data-testid="filter-hint-nudge"]');
    });
  });

  it('re-evaluates the localized filter hint after a Chinese tab transition', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout']).then((clock) => {
      cy.visit('/zh/infx/evaluation', { onBeforeLoad: suppressCompetingDashboardToasts });
      cy.get('[data-testid="tab-trigger-inference"]').click();
      cy.location('pathname').should('eq', '/zh/infx/inference');
      tickUntilVisible(clock, '[data-testid="filter-hint-nudge"]');
      cy.get('[data-testid="filter-hint-nudge"]')
        .should('be.visible')
        .and('contain.text', '图表太拥挤？');
    });
  });

  it('dismissal persists to localStorage and the nudge stays gone after reload', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout']).then((clock) => {
      cy.visit('/infx/inference?g_model=DeepSeek-V4-Pro', {
        onBeforeLoad: suppressCompetingDashboardToasts,
      });
      cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');
      tickUntilVisible(clock, '[data-testid="filter-hint-nudge"]');
      cy.get('[data-testid="filter-hint-nudge"]')
        .should('be.visible')
        .and('have.css', 'position', 'static')
        .closest('[data-slot="chart-legend-wrapper"]')
        .should('exist');

      cy.get('[data-testid="filter-hint-nudge"] button[aria-label]').first().click();
      cy.window()
        .its('localStorage')
        .invoke('getItem', 'inferencex-filter-hint-nudge-dismissed')
        .should('eq', '1');

      // Let the reproducibility toast (1.5s) prove that the reloaded engine armed its timers.
      // Showing it re-arms every pending trigger, so 2.5s more covers the filter-hint timer once
      // its legend slot has mounted.
      cy.window().then((win) => {
        win.localStorage.removeItem('inferencex-reproducibility-nudge-dismissed');
      });
      cy.reload();
      tickUntilVisible(clock, '[data-testid="reproducibility-nudge"]');
      cy.get('body').should(($body) => {
        clock.tick(100);
        expect($body.find('[data-slot="chart-legend-wrapper"]')).to.have.length.at.least(1);
      });
      cy.tick(2500);
      waitForRender();
      cy.get('[data-testid="filter-hint-nudge"]').should('not.exist');
    });
  });
});

describe('Evaluation nudges — inline eval-samples hint', () => {
  it('eval-samples open event refreshes the cooldown timestamp', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout']).then((clock) => {
      cy.visit('/infx/evaluation', {
        onBeforeLoad(win) {
          clearAllNudgeStorage(win);
        },
      });
      tickUntilVisible(clock, '[data-testid="eval-samples-nudge"]');
    });

    cy.window().then((win) => {
      const value = win.localStorage.getItem('inferencex-eval-samples-nudge-dismissed');
      expect(value).to.not.equal(null);
      expect(Number(value)).to.be.greaterThan(0);
    });

    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-eval-samples-nudge-dismissed', '1');
      win.dispatchEvent(new CustomEvent('inferencex:eval-samples-opened'));
      expect(
        Number(win.localStorage.getItem('inferencex-eval-samples-nudge-dismissed')),
      ).to.be.greaterThan(1);
    });
  });
});

describe('Nudge scope isolation', () => {
  it('landing nudges do not appear on dashboard', () => {
    cy.visit('/infx/inference', {
      onBeforeLoad: clearAllNudgeStorage,
    });
    cy.get('[data-testid="github-star-modal"]').should('not.exist');
    cy.get('[data-testid="launch-banner"]').should('not.exist');
  });

  it('dashboard nudges do not appear on landing page', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout']);
    cy.visit('/', {
      onBeforeLoad(win) {
        showLaunchModal(win);
        win.localStorage.setItem('inferencex-trainium3-glm-5-2-banner-dismissed', '1');
        win.localStorage.setItem('inferencex-starred', '1');
      },
    });
    // The launch modal opens from an idle callback queued after the hydrated engines armed their
    // timers, so the faked 2.5s that follows covers every dashboard nudge timer.
    cy.get('[data-testid="launch-modal"]').should('be.visible');
    cy.tick(2500);
    waitForRender();
    cy.get('[data-testid="reproducibility-nudge"]').should('not.exist');
    cy.get('[data-testid="star-nudge"]').should('not.exist');
    cy.get('[data-testid="export-nudge"]').should('not.exist');
  });
});
