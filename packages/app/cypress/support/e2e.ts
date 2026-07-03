/**
 * Global e2e setup. Loaded before every `cy.visit` via `supportFile` in
 * `cypress.config.ts`.
 *
 * Snoozes the feedback-modal nudge so it doesn't render its centered modal
 * + backdrop on top of the UI under test. Specs that want to exercise the
 * feedback-modal flow can clear `inferencex-feedback-modal-snoozed` in their
 * own `onBeforeLoad`.
 */
Cypress.on('window:before:load', (win) => {
  try {
    win.localStorage.setItem('inferencex-feedback-modal-snoozed', String(Date.now()));
  } catch {
    // localStorage unavailable — fine, the test will just see the modal.
  }
});

/**
 * Unlock the shared feature gate for specs that exercise agentic surfaces
 * (the "Agentic Traces" scenario, /datasets, /inference/agentic/[id], and the
 * Datasets nav link). The gate is OFF by default so the PR can ship without
 * publicly exposing agentic features; agentic specs opt in by seeding the same
 * localStorage flag the ↑↑↓↓ konami unlock writes (see use-feature-gate.ts).
 *
 * Call from a spec's `cy.visit(..., { onBeforeLoad })`:
 *   cy.visit('/datasets/x', { onBeforeLoad: unlockAgenticGate });
 * or compose inside an existing hook: `unlockAgenticGate(win)`.
 */
export function unlockAgenticGate(win: Window): void {
  try {
    win.localStorage.setItem('inferencex-feature-gate', '1');
  } catch {
    // localStorage unavailable — spec will see the gate locked and likely 404.
  }
}
