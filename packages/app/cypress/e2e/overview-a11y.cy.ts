import type { Result } from 'axe-core';

const OVERVIEW_SURFACE = '[data-testid="overview-page"]';

const OVERVIEW_ROUTES = [
  { name: 'English hardware comparison', path: '/overview' },
  { name: 'Chinese hardware comparison', path: '/zh/overview' },
  { name: 'historical comparison', path: '/overview?compare=30d' },
] as const;

const OVERVIEW_THEMES = ['light', 'dark'] as const;

const WCAG_AA_RULES = {
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },
};

function reportViolations(violations: Result[]): void {
  const summary = violations
    .map(
      ({ help, id, nodes }) =>
        `${id}: ${help}\n${nodes.map(({ target }) => `  ${target.join(' ')}`).join('\n')}`,
    )
    .join('\n');
  throw new Error(`Overview accessibility violations:\n${summary}`);
}

describe('Overview accessibility', () => {
  for (const { name, path } of OVERVIEW_ROUTES) {
    for (const theme of OVERVIEW_THEMES) {
      it(`has no WCAG 2.0/2.1 A or AA violations in the ${name} view using the ${theme} theme`, () => {
        cy.visit(path, {
          onBeforeLoad(win) {
            win.localStorage.setItem('theme', theme);
          },
        });
        cy.get('html').should(theme === 'dark' ? 'have.class' : 'not.have.class', 'dark');
        cy.get(OVERVIEW_SURFACE).should('be.visible');

        cy.injectAxe();
        cy.checkA11y(OVERVIEW_SURFACE, WCAG_AA_RULES, reportViolations);
      });
    }
  }
});
