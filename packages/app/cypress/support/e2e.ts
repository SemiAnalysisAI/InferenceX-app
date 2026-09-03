/**
 * Global e2e setup. Loaded before every `cy.visit` via `supportFile` in
 * `cypress.config.ts`.
 *
 * Suppresses overlay nudges (telemetry tutorial, agentic coach mark) so
 * their backdrops don't sit on top of the UI under test. Specs that want to
 * exercise a nudge flow can clear its storage key in their own
 * `onBeforeLoad`, which runs after this hook.
 */
import 'cypress-axe';

let suppressTelemetryTutorial = true;
let suppressAgenticCoachMark = true;

/**
 * Opt the whole spec out of the telemetry-tutorial suppression.
 *
 * Clearing the key in a visit's `onBeforeLoad` is not enough: this hook also
 * fires on `cy.reload()`, which takes no `onBeforeLoad`, so the key would be
 * re-seeded behind the test and a "still dismissed after reload" assertion
 * would pass even if dismissal never persisted anything. Call this at the top
 * of any spec that owns telemetry-tutorial state.
 *
 * The card is a bottom-right modal on /inference/agentic/[id]. It has no
 * backdrop, but it sits over the last chart in the grid, so agentic specs
 * suppress it by default.
 */
export function keepTelemetryTutorial(): void {
  suppressTelemetryTutorial = false;
}

/**
 * Opt the whole spec out of the agentic point coach-mark suppression, for the
 * same reason as `keepTelemetryTutorial` — the key is re-seeded on
 * `cy.reload()`, so a per-visit `onBeforeLoad` clear cannot own its state.
 *
 * The callout is anchored to a point inside `[data-testid="scatter-graph"]`,
 * so on the agentic view it sits over the plot area that other specs click.
 */
export function keepAgenticCoachMark(): void {
  suppressAgenticCoachMark = false;
}

Cypress.on('window:before:load', (win) => {
  // Skip cross-document view transitions (`@view-transition` in motion.css).
  // Inside the Cypress AUT iframe Chrome starts the transition on every
  // same-origin cy.visit but never finishes it, and while a transition is
  // active the page's real DOM is excluded from hit-testing —
  // `elementFromPoint` returns bare <html>, clicks stall, and the
  // viewport-sized snapshot registers as horizontal overflow. Real top-level
  // windows finish the transition in ~200ms; only the iframe hangs, so skip
  // it here rather than gating the production feature.
  win.addEventListener('pagereveal', (event) => {
    const viewTransition = (
      event as Event & {
        viewTransition?: {
          skipTransition: () => void;
          ready?: Promise<void>;
          finished?: Promise<void>;
          updateCallbackDone?: Promise<void>;
        };
      }
    ).viewTransition;
    if (!viewTransition) return;
    // Skipping rejects the transition's promises with
    // "AbortError: Transition was skipped"; swallow those so Cypress
    // doesn't fail the test on an unhandled rejection.
    viewTransition.ready?.catch(() => {});
    viewTransition.finished?.catch(() => {});
    viewTransition.updateCallbackDone?.catch(() => {});
    viewTransition.skipTransition();
  });
  try {
    if (suppressTelemetryTutorial) {
      win.localStorage.setItem('inferencex-agentx-telemetry-tutorial-dismissed', '1');
    }
    if (suppressAgenticCoachMark) {
      win.localStorage.setItem('inferencex-agentic-point-coach-mark-dismissed', '1');
    }
  } catch {
    // localStorage unavailable — fine, the test will just see the modal.
  }
});

/**
 * Seed the shared feature-gate flag (the same localStorage key the ↑↑↓↓ konami
 * unlock writes — see use-feature-gate.ts).
 *
 * The agentic surfaces (the "Agentic" scenario, /agentx,
 * /inference/agentic/[id], and the AgentX nav link) are now PUBLIC by default
 * — they no longer sit behind this gate — so agentic specs no longer need it.
 * The helper is retained as a harmless no-op for those specs (and still unlocks
 * the remaining hidden features: the "Hidden" tab dropdown and Measured Energy).
 *
 * Call from a spec's `cy.visit(..., { onBeforeLoad })`:
 *   cy.visit('/agentx/x', { onBeforeLoad: unlockAgenticGate });
 * or compose inside an existing hook: `unlockAgenticGate(win)`.
 */
export function unlockAgenticGate(win: Window): void {
  try {
    win.localStorage.setItem('inferencex-feature-gate', '1');
  } catch {
    // localStorage unavailable — only the remaining hidden features stay locked;
    // agentic surfaces are public regardless.
  }
}

/**
 * Stub `/api/v1/derived-agentic-metrics` with deterministic per-id values.
 *
 * E2E Normalized Interactivity is the DEFAULT x-axis mode for agentic scenarios, so any spec
 * that loads the agentic view fires this fetch on mount — without a stub the
 * fixture server has no DB and the chart sits on its loading skeleton until
 * the query errors out. Values are index-stable so axis positions are
 * deterministic. Register BEFORE `cy.visit`.
 */
export function interceptDerivedAgenticMetrics(): void {
  cy.intercept('GET', '/api/v1/derived-agentic-metrics*', (request) => {
    const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
    request.reply({
      body: Object.fromEntries(
        ids.map((id, index) => [
          id,
          {
            id: Number(id),
            p75_e2e_norm_intvty: 40 + index,
            p90_e2e_norm_intvty: 25 + index,
          },
        ]),
      ),
    });
  }).as('derivedAgenticMetrics');
}

/**
 * Assert the page has no horizontal overflow at the current viewport — wide
 * content (tables, flamegraphs) must scroll inside its own container, never
 * the page body. Call after the route under test has rendered.
 */
export function expectNoPageOverflow(): void {
  cy.window().should((win) => {
    expect(win.document.body.scrollWidth, 'body scroll width').to.be.at.most(win.innerWidth);
    expect(win.document.documentElement.scrollWidth, 'document scroll width').to.be.at.most(
      win.innerWidth,
    );
  });
}
