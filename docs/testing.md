# Testing

## Structure

**Unit tests**: Vitest, colocated with source (`*.test.ts` next to `*.ts`). Config: `packages/app/vitest.config.ts`.
**E2E tests**: Cypress, in `packages/app/cypress/e2e/`. Config: `packages/app/cypress.config.ts`.

## Requirements (Mandatory)

Enforced by `@pr-claude` — missing/low-quality tests are flagged 🔴 BLOCKING.

1. New utility functions → colocated unit test
2. New UI features → E2E test in `cypress/e2e/<feature>.cy.ts`
3. Bug fixes → regression test reproducing the bug
4. Run `pnpm test:unit` and `pnpm test:e2e` before considering task complete

## Pre-commit Checklist

```bash
pnpm dev --hostname 0.0.0.0 --port 3000 &
curl --retry 10 --retry-delay 2 --retry-connrefused -sSf http://localhost:3000 >/dev/null
pnpm test:unit
pnpm test:e2e
```

## Quality Standards

1. **No tautological tests** — every test must verify a real transformation
2. **Cover edge cases** — empty input, null, boundary values, error paths
3. **Meaningful assertions** — check specific values, not just truthiness
4. **Test behavior, not implementation**
5. **Realistic inputs** — real model names, GPU keys, sequence strings
6. **No shallow Cypress tests** — assert content/behavior, not just visibility
7. **Regression tests must reproduce the bug** with exact triggering input
8. **No inline Cypress timeout overrides** — use the global `defaultCommandTimeout` in `cypress.config.ts`. Never pass `{ timeout: N }` to individual commands.
