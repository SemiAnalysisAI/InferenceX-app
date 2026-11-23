import {
  OPENROUTER_PRICING_PATH,
  type OpenRouterModelsPayload,
  type OpenRouterPricingResponse,
  openRouterPrices,
} from '@/lib/calculator/openrouter-pricing';

import openRouterModels from '../fixtures/api/openrouter-models.json';
import { interceptProfitData } from './profit-fixtures';

/** OpenRouter's own model-list shape; fixture builds serve the same file from the pricing route. */
export const OPENROUTER_MODELS: OpenRouterModelsPayload = openRouterModels;

/** Serves `/api/v1/openrouter-pricing` as the server would build it from `models`. */
export function interceptOpenRouterPricing(models: OpenRouterModelsPayload = OPENROUTER_MODELS) {
  const body: OpenRouterPricingResponse = {
    fetchedAt: '2026-11-23T00:00:00.000Z',
    models: openRouterPrices(models),
  };
  return cy.intercept('GET', OPENROUTER_PRICING_PATH, body);
}

export function stubOpenRouter(): void {
  interceptProfitData();
  interceptOpenRouterPricing().as('openrouter');
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
