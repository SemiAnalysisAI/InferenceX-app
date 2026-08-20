import type { ContextType } from 'react';
import type { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

export type MockAppRouter = NonNullable<ContextType<typeof AppRouterContext>>;

export function createMockRouter(): MockAppRouter {
  return {
    push: cy.stub(),
    replace: cy.stub(),
    refresh: cy.stub(),
    back: cy.stub(),
    forward: cy.stub(),
    prefetch: cy.stub().resolves(),
    bfcacheId: '',
  };
}
