import { interceptProfitData } from './profit-fixtures';

export const OPENROUTER_MODELS = {
  data: [
    {
      id: 'moonshotai/kimi-k3',
      pricing: { prompt: '0.0000006', completion: '0.0000025', input_cache_read: '0.0000001' },
    },
    {
      id: 'z-ai/glm-5.3',
      pricing: { prompt: '0.00000115', completion: '0.0000035', input_cache_read: '0.0000002' },
    },
    {
      id: 'minimax/minimax-m3',
      pricing: { prompt: '0.00000023', completion: '0.00000096', input_cache_read: '0.00000005' },
    },
    {
      id: 'deepseek/deepseek-v4-pro-0813',
      pricing: { prompt: '0.00000066', completion: '0.00000198', input_cache_read: '0.000000022' },
    },
    {
      id: 'deepseek/deepseek-v4.1-flash',
      pricing: { prompt: '0.00000015', completion: '0.0000006', input_cache_read: '0.000000003' },
    },
  ],
};

export function stubOpenRouter(): void {
  interceptProfitData();
  cy.intercept('GET', 'https://openrouter.ai/api/v1/models', OPENROUTER_MODELS).as('openrouter');
}

export function suppressNudges(win: Cypress.AUTWindow): void {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.localStorage.setItem('inferencex-reproducibility-nudge-dismissed', '1');
}

export const chart = () => cy.get('[data-testid="profit-estimator-chart"]');
export const chartSvg = () => chart().find('svg').filter(':has(.chart-root)').first();
export const bars = () => chart().find('rect.bar');

export const openFormulaNotes = () =>
  cy.get('[data-testid="profit-formula-notes"] button').then(($btn) => {
    if ($btn.attr('aria-expanded') === 'false') cy.wrap($btn).click();
  });
export const revenueLabels = () => chart().find('text.revenue-label tspan.revenue-amount');

export const chipTrigger = () =>
  cy.get('[data-testid="profit-history-gpu-multiselect"] [role="combobox"]');
export const pickChip = (label: string) => {
  chipTrigger().click({ force: true });
  cy.get('[role="option"]').contains(label).click();
  cy.get('body').type('{esc}');
};
