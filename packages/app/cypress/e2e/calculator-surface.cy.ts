// The Interactivity Surface: the Fleet Lifecycle with interactivity as a third
// axis. What is worth locking down here is mostly about cost and honesty rather
// than pixels — a WebGL canvas cannot be asserted on directly, and CI has no GPU:
//  - the section is folded by default, so neither three.js nor the grid build is
//    paid for by a reader who never opens it;
//  - with no WebGL context it degrades to a named note, never a blank box;
//  - the coverage disclosure is present, because the surface has real holes;
//  - isolating one chip works, since overlapping surfaces occlude each other.

/** Whether this browser will give the page a WebGL context at all. */
const hasWebgl = () =>
  cy.window().then((win) => {
    const canvas = win.document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  });

const surfaceSection = () => cy.get('[data-testid="calculator-lifecycle-surface-section"]');

const surfaceCanvas = () => cy.get('[data-testid="calculator-lifecycle-surface"] canvas');

describe('Calculator — Interactivity Surface', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      // A toast re-renders the chart tree; keep it out of this spec's way.
      win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
    });
    cy.visit('/calculator');
    cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    cy.get('[data-testid="calc-fleet-mw-input"]').type('10');
    // The table is behind a tab now; the figure is what proves the section rendered.
    cy.get('[data-testid="calculator-lifecycle-figure"]', { timeout: 30_000 }).should('be.visible');
  });

  it('stays folded, and mounts nothing 3D until asked', () => {
    surfaceSection().should('be.visible').and('contain.text', 'Interactivity Surface');
    // Folded means unmounted: no canvas, and no three.js fetched either.
    cy.get('canvas').should('not.exist');
    cy.get('[data-testid="calculator-lifecycle-surface"]').should('not.exist');
    cy.get('[data-testid="calculator-lifecycle-surface-unavailable"]').should('not.exist');
  });

  it('renders the surface when expanded, or says why it cannot', () => {
    cy.get('[data-testid="calculator-lifecycle-surface-collapse"]').click();
    hasWebgl().then((webgl) => {
      if (!webgl) {
        // The path CI takes on a GPU-less runner: a named note, not a blank box.
        cy.get('[data-testid="calculator-lifecycle-surface-unavailable"]')
          .should('be.visible')
          .and('contain.text', 'WebGL');
        return;
      }
      cy.get('[data-testid="calculator-lifecycle-surface"]', { timeout: 20_000 }).should(
        'be.visible',
      );
      cy.get('[data-testid="calculator-lifecycle-surface"] canvas').should('exist');
      // Axis titles are DOM, not textures — which is also why they are assertable.
      surfaceSection().should('contain.text', 'Interactivity (tok/s/user)');
      surfaceSection().should('contain.text', 'Margin ($/day)');
    });
  });

  it('discloses the holes rather than presenting a solid surface', () => {
    // Reads outside a run's measured interactivity range are excluded, so a surface
    // legitimately has gaps. Saying so is load-bearing, not decoration.
    surfaceSection().should('contain.text', 'Gaps are interactivity levels no run measured');
    surfaceSection().should('contain.text', 'Slider interactivity');
    // And the limitation of holding one config across the axis: away from the
    // slider this is the chosen fleet, not the best config for that speed.
    surfaceSection().should('contain.text', 'not the best config for that speed');
  });

  it('isolates one chip, since overlapping surfaces occlude each other', () => {
    hasWebgl().then((webgl) => {
      if (!webgl) return;
      cy.get('[data-testid="calculator-surface-focus-all"]').should(
        'have.attr',
        'aria-pressed',
        'true',
      );
      cy.get('[data-testid^="calculator-surface-focus-"]')
        .not('[data-testid="calculator-surface-focus-all"]')
        .first()
        .click();
      cy.get('[data-testid="calculator-surface-focus-all"]').should(
        'have.attr',
        'aria-pressed',
        'false',
      );
      // Clicking the same chip again clears the isolation.
      cy.get('[data-testid^="calculator-surface-focus-"]')
        .not('[data-testid="calculator-surface-focus-all"]')
        .first()
        .click();
      cy.get('[data-testid="calculator-surface-focus-all"]').should(
        'have.attr',
        'aria-pressed',
        'true',
      );
    });
  });

  it('follows the 2D chart’s y-axis selector', () => {
    // One selector drives both views. Asserting on the axis title is the cheap
    // proxy for "the cells hold the metric the label claims" — the value itself is
    // pinned in the unit tests, which can compare the two grids cell by cell.
    hasWebgl().then((webgl) => {
      if (!webgl) return;
      cy.get('[data-testid="calc-lifecycle-metric-revenue"]').click();
      surfaceSection().should('contain.text', 'Revenue ($/day)');
      surfaceSection().should('not.contain.text', 'Margin ($/day)');
      cy.get('[data-testid="calc-lifecycle-metric-cumulative-revenue"]').click();
      surfaceSection().should('contain.text', 'Cumulative Revenue ($)');
      surfaceSection().should('not.contain.text', 'Revenue ($/day)');
      cy.get('[data-testid="calc-lifecycle-metric-margin"]').click();
      surfaceSection().should('contain.text', 'Margin ($/day)');
      surfaceSection().should('not.contain.text', 'Revenue ($/day)');
    });
  });

  it('keeps the viewpoint after a drag, and restores it on double-click', () => {
    // A rebuilt rig used to re-frame the camera, so any re-render during a drag —
    // the hover readout alone causes several — snapped the view back to the default
    // bearing the instant the pointer was released. A canvas has no DOM to assert on,
    // so the rig publishes its spherical position to `data-orbit`.
    hasWebgl().then((webgl) => {
      if (!webgl) return;
      // OrbitControls captures the pointer, and a synthetic pointerdown is not a real
      // active pointer, so the browser throws. Stubbing capture leaves the orbit maths
      // and the effect lifecycle — the things under test — untouched.
      surfaceCanvas().then(($canvas) => {
        const element = $canvas[0]!;
        element.setPointerCapture = () => undefined;
        element.releasePointerCapture = () => undefined;
      });
      surfaceCanvas().should('have.attr', 'data-orbit');
      surfaceCanvas()
        .invoke('attr', 'data-orbit')
        .then((before) => {
          surfaceCanvas()
            .trigger('pointerdown', { button: 0, clientX: 400, clientY: 300, force: true })
            .trigger('pointermove', { clientX: 520, clientY: 330, force: true })
            .trigger('pointerup', { force: true });
          // Well past the damping glide: the viewpoint must still be the new one.
          cy.wait(600);
          surfaceCanvas().invoke('attr', 'data-orbit').should('not.eq', before);

          surfaceCanvas()
            .invoke('attr', 'data-orbit')
            .then((dragged) => {
              // The actual regression: a React re-render must not disturb the camera.
              // In the app the hover readout re-renders the moment the drag ends,
              // which is why the snap-back appeared exactly on release; isolating a
              // chip is the same re-render, provoked deterministically rather than
              // depending on a raycast landing on a surface.
              cy.get('[data-testid^="calculator-surface-focus-"]')
                .not('[data-testid="calculator-surface-focus-all"]')
                .first()
                .click();
              cy.wait(300);
              surfaceCanvas().invoke('attr', 'data-orbit').should('eq', dragged);
              cy.get('[data-testid="calculator-surface-focus-all"]').click();
              cy.wait(300);
              surfaceCanvas().invoke('attr', 'data-orbit').should('eq', dragged);

              // Double-click is the way back, and it must actually go back.
              surfaceCanvas().dblclick({ force: true });
              cy.wait(300);
              surfaceCanvas().invoke('attr', 'data-orbit').should('eq', before);
            });
        });
    });
  });

  it('releases the context when folded away again', () => {
    // testIsolation is off in this repo, so a leaked GL context would accumulate
    // across the rest of the spec file — browsers cap them at around sixteen.
    cy.get('[data-testid="calculator-lifecycle-surface-collapse"]').click();
    cy.get('[data-testid="calculator-lifecycle-surface"]').should('not.exist');
    cy.get('canvas').should('not.exist');
  });
});

describe('Calculator — Interactivity Surface without WebGL', () => {
  before(() => {
    cy.visit('/calculator', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
        // Deny WebGL specifically, leaving 2d contexts alone — the colour probe and
        // the PNG export path both need 2d.
        const original = win.HTMLCanvasElement.prototype.getContext;
        win.HTMLCanvasElement.prototype.getContext = function patched(
          this: HTMLCanvasElement,
          type: string,
          ...rest: unknown[]
        ) {
          if (type.startsWith('webgl')) return null;
          return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
        } as typeof win.HTMLCanvasElement.prototype.getContext;
      },
    });
    cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    cy.get('[data-testid="calc-fleet-mw-input"]').type('10');
    // The table is behind a tab now; the figure is what proves the section rendered.
    cy.get('[data-testid="calculator-lifecycle-figure"]', { timeout: 30_000 }).should('be.visible');
  });

  it('falls back to a note and leaves the 2D chart working', () => {
    cy.get('[data-testid="calculator-lifecycle-surface-collapse"]').click();
    cy.get('[data-testid="calculator-lifecycle-surface-unavailable"]')
      .should('be.visible')
      .and('contain.text', 'WebGL');
    cy.get('[data-testid="calculator-lifecycle-surface"]').should('not.exist');
    // The point of the fallback: the page it sits on is untouched.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').should(
      'have.length.greaterThan',
      0,
    );
  });
});
