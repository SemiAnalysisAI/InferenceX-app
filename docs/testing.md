# Testing

## Structure

**Unit tests**: Vitest, colocated with source (`*.test.ts` next to `*.ts`). Config: `packages/app/vitest.config.ts`.
**Component tests**: Cypress, in `packages/app/cypress/component/`. Use these for isolated UI behavior with controlled providers, routes, and API intercepts.
**Integration tests**: Cypress, in `packages/app/cypress/e2e/`. Use these for page routing, browser history, API fixture mode, and cross-component workflows. Config: `packages/app/cypress.config.ts`.

## Requirements (Mandatory)

Enforced by `@pr-claude` — missing/low-quality tests are flagged 🔴 BLOCKING.

1. New utility functions → colocated unit test
2. Component-local UI behavior → Cypress component test in `cypress/component/`
3. Route, navigation, or cross-component behavior → Cypress integration test in `cypress/e2e/`
4. Bug fixes → regression test at the narrowest layer that reproduces the bug
5. Run `bun run test:unit` and the local smoke suite, `bun run test:e2e`, before considering a task complete. The full E2E suite runs in CI and is available locally as `bun run test:e2e:full`.

## Pre-commit Checklist

```bash
bun run dev -- --hostname 0.0.0.0 --port 3000 &
curl --retry 10 --retry-delay 2 --retry-connrefused -sSf http://localhost:3000 >/dev/null
bun run test:unit
bun run test:e2e
```

## Runtime and CI Sharding

The local `bun run test:e2e` command is a curated smoke suite across the core page, chart, overlay, localization, and component paths. It is the default agent and developer check and is intended to stay under one minute once the app is running.

The complete suite is `bun run test:e2e:full`. It runs all Cypress component and integration specs. GitHub Actions runs that same coverage as one component job plus four integration shards per browser, Chrome and Firefox. The CI workflow is the merge gate for the full E2E suite.

`packages/app/timings.json` is the committed `cypress-split` baseline. Its unit guard requires one positive timing for every integration spec and rejects removed entries. Regenerate the baseline from an observed full integration run when specs are added, removed, or materially rebalanced.

With an `E2E_FIXTURES=1` app server running on port 3000, run this from the repository root:

```bash
E2E_FIXTURES=1 \
  SPLIT=1 \
  SPLIT_INDEX1=1 \
  SPLIT_FILE=timings.json \
  SPLIT_OUTPUT_FILE=timings.json \
  SPLIT_SUMMARY=false \
  bun run --cwd packages/app test:e2e:integration
```

`SPLIT=1` intentionally runs every spec in one chunk so one process records the complete baseline. CI uses `SPLIT=4` only for parallel execution and writes each shard's timing output to a throwaway file.

`E2E_FIXTURES=1` serves the committed API snapshots under `packages/app/cypress/fixtures/api/`. Refresh them with `bun run --cwd packages/app capture:fixtures`. The capture script updates `_manifest.json`, which records the fixture shape, byte length, checksum, source, and capture timestamp. The manifest guard rejects partial or hand-edited snapshots; benchmark history must also contain at least two dates so replay tests cannot silently skip their substantive path.

### Route bundle budgets

Production builds emit deterministic per-route first-load JavaScript sizes in `.next/diagnostics/route-bundle-stats.json`. `bun run build` runs `bun run check:bundle-budgets` after Next.js finishes, and the guard checks the measured landing, dashboard, AgentX, blog-detail, and comparison route families in both locales.

Each budget records the measured byte baseline plus 2% headroom. The guard rejects both oversized routes and missing route entries, so deleting or renaming a route cannot silently remove it from performance coverage. The colocated Vitest contract runs in the normal unit workflow and verifies those failure modes without relying on wall-clock timing.

After an intentional bundle change, inspect the generated route diagnostics, account for the size change, and update the relevant baselines in `src/lib/route-bundle-budgets.ts`. Do not raise a family-wide ceiling to hide one route's regression.

Server-cache performance regressions must assert source-reader call counts for repeated identical inputs. Do not use elapsed-time thresholds: CI scheduling and cold-start variance make wall-clock assertions nondeterministic.

## Quality Standards

1. **No tautological tests** — every test must verify a real transformation
2. **Cover edge cases** — empty input, null, boundary values, error paths
3. **Meaningful assertions** — check specific values, not just truthiness
4. **Test behavior, not implementation**
5. **Realistic inputs** — real model names, GPU keys, sequence strings
6. **No shallow Cypress tests** — assert content/behavior, not just visibility
7. **Regression tests must reproduce the bug** with exact triggering input
8. **No inline Cypress timeout overrides** — use the global `defaultCommandTimeout` in `cypress.config.ts`. Never pass `{ timeout: N }` to individual commands.
