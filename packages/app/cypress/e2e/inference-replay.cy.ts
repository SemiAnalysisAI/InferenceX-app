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
    cy.get('[data-testid="replay-panel-chart-0"]').should('exist');
    // Either the loading message, the "not enough history" message, or the controls.
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
