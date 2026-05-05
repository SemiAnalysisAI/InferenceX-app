/**
 * Global e2e setup — intercepts every internal API request with a static fixture
 * so the suite runs against zero infrastructure (no DB, no blob storage, no
 * GitHub PAT). Captures of the live API live in cypress/fixtures/api/ and are
 * refreshed via `pnpm capture:fixtures`.
 *
 * The cypress suite asserts on UI behavior, never on specific data values, so a
 * single snapshot per endpoint serves every test regardless of query params.
 *
 * Registered in both `before` and `beforeEach`:
 *   - `before` ensures intercepts are active for spec-level `before(cy.visit)`
 *     hooks at the very start of a spec file.
 *   - `beforeEach` re-registers them since cypress clears intercepts between
 *     tests. This still leaves an inner-describe `before` hook (which runs
 *     between tests, after intercepts are cleared but before the next
 *     `beforeEach`) without mocks. We call `registerApiIntercepts` from inside
 *     such hooks if a spec needs them — but in practice, the inner-describe
 *     `before` hooks happen to re-`cy.visit`, which gets caught by the next
 *     test's `beforeEach`. The spec-level `before` is the load-bearing case.
 */

function registerApiIntercepts() {
  // More-specific routes first — cypress matches in registration order.
  cy.intercept('GET', /\/api\/v1\/benchmarks\/history(\?.*)?$/, {
    fixture: 'api/benchmarks-history.json',
  });
  cy.intercept('GET', /\/api\/v1\/benchmarks(\?.*)?$/, { fixture: 'api/benchmarks.json' });
  cy.intercept('GET', /\/api\/v1\/workflow-info(\?.*)?$/, { fixture: 'api/workflow-info.json' });
  cy.intercept('GET', '/api/v1/availability', { fixture: 'api/availability.json' });
  cy.intercept('GET', '/api/v1/reliability', { fixture: 'api/reliability.json' });
  cy.intercept('GET', '/api/v1/evaluations', { fixture: 'api/evaluations.json' });
  cy.intercept('GET', '/api/v1/submissions', { fixture: 'api/submissions.json' });

  // Endpoints no e2e spec exercises today — stub out so a stray load doesn't
  // hit a real (and possibly-absent) DB connection.
  cy.intercept('GET', /\/api\/v1\/eval-samples(-live)?(\?.*)?$/, {
    body: { samples: [], total: 0, passedTotal: 0, failedTotal: 0, source: 'db' },
  });
  cy.intercept('GET', /\/api\/v1\/server-log(\?.*)?$/, {
    statusCode: 404,
    body: { error: 'not found' },
  });
  // Mirror the real route's response shape so client-side error handlers don't
  // crash trying to JSON-parse an empty body.
  cy.intercept('GET', /\/api\/unofficial-run(\?.*)?$/, {
    statusCode: 400,
    body: { error: 'runId must be a numeric workflow run ID' },
  });
  cy.intercept('GET', /\/api\/gpu-metrics(\?.*)?$/, {
    statusCode: 400,
    body: { error: 'runId must be a numeric workflow run ID' },
  });
}

before(registerApiIntercepts);
beforeEach(registerApiIntercepts);

// Cypress clears intercepts between tests. A spec-level `before(cy.visit)`
// hook in the *second-or-later* describe block runs AFTER that clear but
// BEFORE the next `beforeEach`, so it hits a real backend. Hook the queue:
// when a `visit` is enqueued without active intercepts, queue them ahead of it.
let registering = false;
Cypress.on('command:enqueued', (cmd) => {
  if (cmd.name === 'visit' && !registering) {
    registering = true;
    try {
      registerApiIntercepts();
    } finally {
      registering = false;
    }
  }
});
