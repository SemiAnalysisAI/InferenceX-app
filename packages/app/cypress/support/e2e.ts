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
