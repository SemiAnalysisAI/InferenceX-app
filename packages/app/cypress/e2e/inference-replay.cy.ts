const openReplayDialog = () => {
  cy.get('[data-testid="chart-figure"]')
    .first()
    .within(() => {
      cy.get('[data-testid="export-button"]').click();
    });
  cy.get('[data-testid="export-mp4-button"]').first().click();
};

const setReplayScrubber = (v: number) =>
  cy.get('[data-testid="replay-scrubber"]').then(($el) => {
    const el = $el[0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

// Combined "<last-x-tick>|<last-y-tick>" signature so a change in EITHER axis is
// detected. The run can grow in x, y, or both between frames, so asserting on
// the y-axis alone would falsely fail when only x expands.
const replayAxisExtent = () =>
  cy.get('[data-testid="replay-panel-chart-0"] svg').then(($svg) => {
    const svg = $svg[0];
    const lastTick = (sel: string) => {
      const els = [...svg.querySelectorAll(sel)];
      return els.length > 0 ? (els.at(-1)!.textContent ?? '').trim() : '';
    };
    return `${lastTick('g.x-axis text')}|${lastTick('g.y-axis text')}`;
  });

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

  it('renders line labels in the foreground during replay', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      // Enable line labels inside the replay panel (scoped — the parent chart
      // renders the same control behind the dialog).
      cy.get('[data-testid="replay-panel-chart-0"]').within(() => {
        cy.get('[data-testid="scatter-line-labels"]').then(($el) => {
          if ($el.attr('data-state') !== 'checked') cy.wrap($el).click();
        });
      });
      cy.get('[data-testid="replay-panel-chart-0"] svg g.line-label', { timeout: 6000 }).should(
        'have.length.greaterThan',
        0,
      );
      // The shared-renderer foreground raise must apply to the replay chart too.
      cy.get('[data-testid="replay-panel-chart-0"] svg').then(($svg) => {
        const svg = $svg[0];
        const dots = svg.querySelectorAll('.dot-group');
        const labels = svg.querySelectorAll('g.line-label');
        if (dots.length === 0 || labels.length === 0) return;
        const lastDot = dots.item(dots.length - 1)!;
        const firstLabel = labels.item(0)!;
        expect(
          lastDot.compareDocumentPosition(firstLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
          'replay line label follows the scatter points (foreground)',
        ).to.be.greaterThan(0);
      });
    });
  });

  it('Fixed axes stay constant across frames; toggling off refits per frame', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-scrubber"]').length === 0) {
        cy.log('Replay history fixture has < 2 dates; skipping fixed-axes check');
        return;
      }
      // Fixed axes is the default — the extent is the whole-run box, so the first
      // and last frame share the same axes (this is the feature's core invariant,
      // independent of which axis the frontier grows along).
      cy.get('[data-testid="replay-fixed-axes"]').should('have.attr', 'data-state', 'checked');
      setReplayScrubber(0);
      cy.wait(300);
      replayAxisExtent().then((fixedAtStart) => {
        setReplayScrubber(1_000_000); // clamps to the scrubber max → last frame
        cy.wait(300);
        replayAxisExtent().then((fixedAtEnd) => {
          expect(fixedAtEnd, 'fixed axes are identical at the first and last frame').to.equal(
            fixedAtStart,
          );

          // Turn fixed axes off → the first frame refits to just that frame's
          // (smaller) frontier, so the extent differs from the whole-run box in
          // at least one axis (compared as an x|y pair, not y alone).
          cy.get('[data-testid="replay-fixed-axes"]').click();
          setReplayScrubber(0);
          cy.wait(300);
          replayAxisExtent().then((dynamicAtStart) => {
            expect(
              dynamicAtStart,
              'per-frame axes at the first frame differ from the whole-run fixed extent',
            ).not.to.equal(fixedAtStart);
          });
          // Restore the default.
          cy.get('[data-testid="replay-fixed-axes"]').click();
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
