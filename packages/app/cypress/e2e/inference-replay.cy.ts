const openReplayDialog = () => {
  cy.get('[data-testid="chart-figure"]')
    .first()
    .within(() => {
      cy.get('[data-testid="export-button"]').click();
    });
  cy.get('[data-testid="export-mp4-button"]').first().click();
};

describe('Inference Replay', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('exposes MP4 export in the chart export menu', () => {
    cy.get('[data-testid="chart-figure"]')
      .first()
      .within(() => {
        cy.get('[data-testid="export-button"]').click();
      });
    cy.get('[data-testid="export-mp4-button"]').should('be.visible');
  });

  it('opens the replay preview modal from the MP4 menu item', () => {
    openReplayDialog();
    // Assert the dialog itself is visible. ChartDisplay now opens the launcher
    // via an imperative ref; the optional-chain `?.open()` would silently
    // no-op if the ref ever failed to attach, so this guards against that.
    cy.get('[data-testid="replay-dialog-chart-0"]').should('be.visible');
    cy.get('[data-testid="replay-panel-chart-0"]').should('exist');
    cy.get('[data-testid="replay-panel-chart-0"]').then(($panel) => {
      const text = $panel.text();
      const hasControls = $panel.find('[data-testid="replay-play-pause"]').length > 0;
      const hasMessage = /Loading benchmark history|Not enough history/u.test(text) || hasControls;
      expect(hasMessage).to.equal(true);
    });
  });

  it('exposes scrubber + play/pause + speed controls when history is available', () => {
    // Wait for history to resolve into either the controls UI or the empty-state message.
    cy.get('[data-testid="replay-panel-chart-0"]', { timeout: 15_000 }).should(($panel) => {
      const hasControls = $panel.find('[data-testid="replay-play-pause"]').length > 0;
      const hasEmpty = /Not enough history/u.test($panel.text());
      expect(hasControls || hasEmpty).to.equal(true);
    });

    cy.get('[data-testid="replay-panel-chart-0"]').then(($panel) => {
      if ($panel.find('[data-testid="replay-play-pause"]').length === 0) {
        cy.log('Replay history fixture has < 2 dates; skipping interactive checks');
        return;
      }
      cy.get('[data-testid="replay-scrubber"]').should('exist');
      // The speed trigger is always present; individual SelectItems are only
      // mounted in the Radix portal while the dropdown is open.
      cy.get('[data-testid="replay-speed-select"]').should('exist');
      cy.get('[data-testid="replay-export-mp4"]').should('exist');

      // Play, then pause, and confirm the button toggles label.
      cy.get('[data-testid="replay-play-pause"]').click().should('contain.text', 'Pause');
      cy.get('[data-testid="replay-play-pause"]').click().should('contain.text', 'Play');
    });
  });

  it('advances the date overlay and scrubber when Play is pressed', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-play-pause"]').length === 0) {
        cy.log('Replay history fixture has < 2 dates; skipping animation check');
        return;
      }
      cy.get('[data-testid="replay-scrubber"]')
        .invoke('val')
        .then((startVal) => {
          cy.get('[data-testid="replay-date-overlay"]')
            .invoke('text')
            .then((startDate) => {
              cy.get('[data-testid="replay-play-pause"]').click();
              cy.wait(800);
              cy.get('[data-testid="replay-play-pause"]').click();
              cy.get('[data-testid="replay-scrubber"]')
                .invoke('val')
                .should((endVal) => {
                  expect(Number(endVal)).to.be.greaterThan(Number(startVal));
                });
              cy.get('[data-testid="replay-date-overlay"]')
                .invoke('text')
                .should((endDate) => {
                  expect(endDate).not.to.equal(startDate);
                });
            });
        });
    });
  });

  it('re-renders the replay frame when a parent-chart toggle changes', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      // Capture the SVG path data for the first roofline as a stable signature.
      cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path')
        .first()
        .invoke('attr', 'd')
        .then((beforeD) => {
          // Toggle the log-scale setting in the underlying inference context —
          // the replay panel shares state with the parent chart, so the chart
          // re-renders without us touching the replay UI.
          cy.window().then((win) => {
            const url = new URL(win.location.href);
            const cur = url.searchParams.get('i_log') === '1';
            url.searchParams.set('i_log', cur ? '0' : '1');
            win.history.replaceState(null, '', url.toString());
            // Dispatch a popstate so InferenceContext picks up the change.
            win.dispatchEvent(new win.PopStateEvent('popstate'));
          });
          cy.wait(400);
          cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path')
            .first()
            .invoke('attr', 'd')
            .should((afterD) => {
              expect(afterD).not.to.equal(beforeD);
            });
        });
    });
  });

  it('closes the modal', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      // Radix Dialog closes on Escape — more robust than picking the X by DOM
      // order now that the panel contains its own buttons (Play, Reset, …).
      cy.get('body').type('{esc}');
      cy.get('[data-testid="replay-panel-chart-0"]').should('not.exist');
    });
  });
});
