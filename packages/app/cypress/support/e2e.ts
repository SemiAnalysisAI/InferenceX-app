/**
 * Global e2e setup. Loaded before every `cy.visit` via `supportFile` in
 * `cypress.config.ts`.
 *
 * Suppresses the two centered modals (feedback-modal on the dashboard, the
 * agentic-results launch modal on the landing page) so their backdrops don't
 * sit on top of the UI under test. Specs that want to exercise either flow
 * can clear `inferencex-feedback-modal-snoozed` /
 * `inferencex-agentic-results-modal-dismissed` in their own `onBeforeLoad`,
 * which runs after this hook.
 */
Cypress.on('window:before:load', (win) => {
  try {
    win.localStorage.setItem('inferencex-feedback-modal-snoozed', String(Date.now()));
    win.localStorage.setItem('inferencex-agentic-results-modal-dismissed', '1');
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
