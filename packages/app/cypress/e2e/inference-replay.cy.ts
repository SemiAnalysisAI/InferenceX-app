describe('Inference Replay', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('renders a Replay launcher under each scatter chart', () => {
    cy.get('[data-testid^="replay-launcher-"]').should('have.length.at.least', 1);
    cy.get('[data-testid^="replay-launcher-"]').first().should('contain', 'Replay');
  });

  it('opens the replay panel when the launcher is clicked', () => {
    cy.get('[data-testid="replay-launcher-chart-0"]').click();
    cy.get('[data-testid="replay-panel-chart-0"]').should('exist');
    // Either the loading message, the "not enough history" message, or the controls.
    cy.get('[data-testid="replay-panel-chart-0"]').then(($panel) => {
      const text = $panel.text();
      const hasControls = $panel.find('[data-testid="replay-play-pause"]').length > 0;
      const hasMessage = /Loading benchmark history|Not enough history/.test(text) || hasControls;
      expect(hasMessage).to.equal(true);
    });
  });

  it('exposes scrubber + play/pause + speed controls when history is available', () => {
    // Wait for history to resolve into either the controls UI or the empty-state message.
    cy.get('[data-testid="replay-panel-chart-0"]', { timeout: 15_000 }).should(($panel) => {
      const hasControls = $panel.find('[data-testid="replay-play-pause"]').length > 0;
      const hasEmpty = /Not enough history/.test($panel.text());
      expect(hasControls || hasEmpty).to.equal(true);
    });

    cy.get('[data-testid="replay-panel-chart-0"]').then(($panel) => {
      if ($panel.find('[data-testid="replay-play-pause"]').length === 0) {
        cy.log('Replay history fixture has < 2 dates; skipping interactive checks');
        return;
      }
      cy.get('[data-testid="replay-scrubber"]').should('exist');
      cy.get('[data-testid="replay-speed-1x"]').should('exist');
      cy.get('[data-testid="replay-export-mp4"]').should('exist');

      // Play, then pause, and confirm the button toggles label.
      cy.get('[data-testid="replay-play-pause"]').click().should('contain.text', 'Pause');
      cy.get('[data-testid="replay-play-pause"]').click().should('contain.text', 'Play');
    });
  });

  it('closes the modal via the dialog close button', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      // shadcn Dialog renders an X button inside the dialog content.
      cy.get('[data-testid^="replay-dialog-"]').find('button').first().click();
      cy.get('[data-testid="replay-panel-chart-0"]').should('not.exist');
      cy.get('[data-testid="replay-launcher-chart-0"]').should('be.visible');
    });
  });
});
