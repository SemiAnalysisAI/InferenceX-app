import 'cypress-axe';

let suppressLaunchModal = true;
let suppressTelemetryTutorial = true;

export function keepLaunchModal(): void {
  suppressLaunchModal = false;
}

export function keepTelemetryTutorial(): void {
  suppressTelemetryTutorial = false;
}

function skipCrossDocumentTransition(event: Event) {
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
  viewTransition.ready?.catch(() => {});
  viewTransition.finished?.catch(() => {});
  viewTransition.updateCallbackDone?.catch(() => {});
  viewTransition.skipTransition();
}

Cypress.on('window:before:load', (win) => {
  win.addEventListener('pageswap', skipCrossDocumentTransition);
  win.addEventListener('pagereveal', skipCrossDocumentTransition);
  try {
    if (suppressLaunchModal) {
      win.localStorage.setItem(
        'inferencex-tpuv7-agentx-multiple-model-modal-dismissed',
        String(win.Date.now()),
      );
    }
    if (suppressTelemetryTutorial) {
      win.localStorage.setItem('inferencex-agentx-telemetry-tutorial-dismissed', '1');
    }
  } catch {}
});

export function unlockAgenticGate(win: Window): void {
  try {
    win.localStorage.setItem('inferencex-feature-gate', '1');
  } catch {}
}

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

export function expectNoPageOverflow(): void {
  cy.window().should((win) => {
    expect(win.document.body.scrollWidth, 'body scroll width').to.be.at.most(win.innerWidth);
    expect(win.document.documentElement.scrollWidth, 'document scroll width').to.be.at.most(
      win.innerWidth,
    );
  });
}

export function openXAxisMenu(): void {
  cy.get('[data-testid="inference-secondary-controls"] > button').then(($toggle) => {
    if ($toggle.is(':visible') && $toggle.attr('aria-expanded') !== 'true') {
      cy.wrap($toggle).click();
    }
  });
  cy.get('[data-testid="x-axis-mode-selector"]').click();
}

export function selectXAxisMode(
  mode: 'interactivity' | 'e2e' | 'ttft' | 'e2e-normalized-interactivity',
  label?: string,
): void {
  openXAxisMenu();
  cy.get(`[data-testid="x-axis-mode-${mode}"]`).click();
  cy.get('[data-testid="x-axis-mode-selector"]')
    .should('have.attr', 'data-value', mode)
    .and('have.attr', 'aria-expanded', 'false');
  if (label) cy.get('[data-testid="x-axis-mode-selector"]').should('contain.text', label);
}
