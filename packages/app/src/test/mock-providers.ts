// The Cypress component specs' mock providers, with their named cy.stub callbacks recorded as
// vi.fn mocks. `stubs.setSelectedYAxisMetric` is the bun side of cy.get('@setSelectedYAxisMetric').
import { vi, type Mock } from 'bun:test';

import { stubFactory } from '../../cypress/support/mock-data';

export const stubs: Record<string, Mock<(...args: unknown[]) => unknown>> = {};

stubFactory.create = (alias) => {
  const stub = vi.fn();
  stubs[alias] = stub;
  return stub as never;
};

export { withProviders, type ProviderOverrides } from '../../cypress/support/test-utils';
export * from '../../cypress/support/mock-data';
