import type { AxeResults, ElementContext, Result, RunOptions } from 'axe-core';

type AxeWindow = Cypress.AUTWindow & {
  axe: { run: (context: ElementContext, options: RunOptions) => Promise<AxeResults> };
};

/**
 * Runs axe-core on `context` inside the page under test and fails the test when it reports
 * violations. Each violation is logged with its nodes highlighted. `onViolations` sees them
 * first and may throw its own report instead of the default count assertion.
 */
export function checkA11y(
  context: ElementContext,
  options: RunOptions = {},
  onViolations?: (violations: Result[]) => void,
): void {
  // axe has to run in the page's own window to audit that document and its computed styles,
  // so the published bundle is evaluated there rather than bundled into the spec.
  cy.task<string>('axeSource', null, { log: false })
    .then((source) =>
      cy.window({ log: false }).then((win) => {
        win.eval(source);
        return (win as AxeWindow).axe.run(context, options);
      }),
    )
    .then(({ violations }) => {
      if (violations.length > 0) onViolations?.(violations);
      for (const violation of violations) {
        const count = violation.nodes.length;
        Cypress.log({
          $el: Cypress.$(violation.nodes.flatMap(({ target }) => target).join(', ')),
          name: 'a11y error!',
          consoleProps: () => violation,
          message: `${violation.id} on ${count} Node${count === 1 ? '' : 's'}`,
        });
      }
      const verb = violations.length === 1 ? 'violation was' : 'violations were';
      assert.equal(violations.length, 0, `${violations.length} accessibility ${verb} detected`);
    });
}
