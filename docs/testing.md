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

## Easter egg themes and games

Easter egg themes (Minecraft, CS:GO, GTA, DOOM, Halo, and any future optional theme) and every game launched from them are just for fun. They do not need stable infrastructure, have no compatibility or uptime guarantees, and may be deleted at any point without notice or migration.

- Do not add unit, Cypress component, Cypress E2E, or CI checks for easter egg features. The only exceptions are the two main-site isolation checks listed below.
- The mandatory test requirements above do not apply to them. Reviewers, including `@pr-claude`, must not flag missing tests on easter egg code as blocking or request them.
- When an existing easter egg feature test fails or slows CI, delete it. Do not fix or extend it. This does not apply to the two retained isolation checks.
- Do not add CI jobs, shards, fixtures, or infrastructure for them.

Retain and maintain exactly these two checks:

- `packages/app/src/lib/optional-theme-imports.test.ts`: prevents eager optional code, engine, asset, and font imports into normal pages.
- `packages/app/cypress/e2e/optional-theme-isolation.cy.ts`: checks normal light/dark pages, embeds, resource loading, and SEO, including theme activation/cleanup needed to verify isolation.

Keep their existing support helper and E2E browser setup. Do not expand these checks into gameplay, decorative styling, or visual-fidelity tests. Ordinary light/dark UI, dashboard, export, and announcement tests remain required; those are not easter egg tests.

## Pre-commit Checklist

```bash
bun run dev -- --hostname 0.0.0.0 --port 3000 &
curl --retry 10 --retry-delay 2 --retry-connrefused -sSf http://localhost:3000 >/dev/null
bun run test:unit
bun run test:e2e
```

## Runtime and CI Sharding

The local `bun run test:e2e` command is a curated smoke suite across the core page, chart, overlay, localization, and component paths. It is the default agent and developer check and is intended to stay under one minute once the app is running.

The complete suite is `bun run test:e2e:full`. It runs all Cypress component and integration specs. GitHub Actions runs that same coverage as four component shards (Chrome) plus eight integration shards per browser, Chrome and Firefox. The CI workflow is the merge gate for the full E2E suite.

`packages/app/timings.json` is the committed `cypress-split` baseline. Its unit guard requires one positive timing for every integration spec and rejects removed entries. When deleting specs, remove only their entries and preserve the remaining observed timings. Regenerate the baseline from an observed full integration run when specs are added or materially rebalanced; do not invent durations.

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

`SPLIT=1` intentionally runs every spec in one chunk so one process records the complete baseline. CI uses `SPLIT=8` for integration shards and `SPLIT=4` for component shards, only for parallel execution, and writes each shard's timing output to a throwaway file.

`packages/app/component-timings.json` is the matching baseline for component specs, guarded the same way. Component durations include each spec's webpack bundling, so they track wall time rather than only test time. Regenerate it with the same `SPLIT=1` variables, `SPLIT_FILE=component-timings.json` and `SPLIT_OUTPUT_FILE=component-timings.json`, and `bun run --cwd packages/app test:e2e:component`; no app server is needed.

`E2E_FIXTURES=1` serves the committed API snapshots under `packages/app/cypress/fixtures/api/`. Refresh them with `bun run --cwd packages/app capture:fixtures`. The capture script updates `_manifest.json`, which records the fixture shape, byte length, checksum, source, and capture timestamp. The manifest guard rejects partial or hand-edited snapshots; benchmark history must also contain at least two dates so replay tests cannot silently skip their substantive path.

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
