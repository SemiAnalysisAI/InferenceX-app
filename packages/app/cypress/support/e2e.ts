/**
 * Global e2e setup. Loaded before every `cy.visit` via `supportFile` in
 * `cypress.config.ts`.
 *
 * Suppresses the two centered modals (feedback-modal on the dashboard, the
 * agentic-results launch modal on the landing page) so their backdrops don't
 * sit on top of the UI under test. Specs that want to exercise the
 * feedback-modal flow can clear `inferencex-feedback-modal-snoozed` in their
 * own `onBeforeLoad`, which runs after this hook; specs that exercise the
 * launch modal call `keepLaunchModal()` instead — see below.
 */
import 'cypress-axe';

let suppressLaunchModal = true;
let suppressTelemetryTutorial = true;

/**
 * Opt the whole spec out of the launch-modal suppression.
 *
 * Clearing the key in a visit's `onBeforeLoad` is not enough: this hook also
 * fires on `cy.reload()`, which takes no `onBeforeLoad`, so the key would be
 * re-seeded behind the test and a "still dismissed after reload" assertion
 * would pass even if dismissal never persisted anything. Call this at the top
 * of any spec that owns launch-modal state.
 */
export function keepLaunchModal(): void {
  suppressLaunchModal = false;
}

/**
 * Opt the whole spec out of the telemetry-tutorial suppression, for the same
 * reason as `keepLaunchModal` — the card is seeded on `cy.reload()` too, so a
 * per-visit `onBeforeLoad` clear cannot own its state.
 *
 * The card is a bottom-right modal on /inference/agentic/[id]. It has no
 * backdrop, but it sits over the last chart in the grid, so agentic specs
 * suppress it by default.
 */
export function keepTelemetryTutorial(): void {
  suppressTelemetryTutorial = false;
}

Cypress.on('window:before:load', (win) => {
  try {
    win.localStorage.setItem('inferencex-feedback-modal-snoozed', String(Date.now()));
    if (suppressLaunchModal) {
      win.localStorage.setItem('inferencex-agentic-results-modal-dismissed', '1');
    }
    if (suppressTelemetryTutorial) {
      win.localStorage.setItem('inferencex-agentx-telemetry-tutorial-dismissed', '1');
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
