# Testing

## Structure

**Unit tests**: colocated with source (`*.test.ts` next to `*.ts`), run with `bun test` in every package. `bun run test:unit` in a package runs its suite; in `packages/app`, path substrings filter files (`bun run test:unit src/lib/api`), and a filter that matches no file fails. `bun run test:unit:coverage` in `packages/app` writes one report per pass, to `coverage/node` and `coverage/jsdom`.

`packages/app/scripts/test-unit.ts` runs files in parallel on half the CPUs, and `bun test --parallel` gives each file a fresh global object and module registry, so stubs, mocks and module state never leak between files. Files whose first lines include `// @test-environment jsdom` run in a second pass with `src/test/setup-dom.ts` preloaded, which installs a fresh jsdom window; every other file runs without DOM globals, as server code does. `src/test/setup.ts` is preloaded for all files. `mock.module` patches modules that are already imported, but a module whose import-time code reads a mocked dependency must be imported after the mock. Helpers bun:test does not ship (`stubGlobal`, `stubEnv`, `mocked`, `waitFor`, and fake timers backed by `@sinonjs/fake-timers`) live in `src/test/helpers.ts`. Unit tests never read the developer's `.env`. The db suite starts through `packages/db/scripts/test-unit.ts`, which builds the migrated PGlite template once and runs files on a third of the CPUs. Db tests that run production SQL connect the real postgres.js driver to PGlite over a Unix socket with `pgliteDriverSql` from `packages/db/src/lib/test-pglite.ts`, so they see what production sees, including bigint columns read back as strings and JSON parameters typed by the server. Pass JSON fixtures as objects, since a JSON string bound to a `jsonb` parameter is stored as a JSON string.

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

Easter egg themes (Minecraft, CS:GO, GTA, DOOM, Halo, Excalidraw, and any future optional theme) and every game launched from them are just for fun. They do not need stable infrastructure, have no compatibility or uptime guarantees, and may be deleted at any point without notice or migration.

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

The complete suite is `bun run test:e2e:full`. It runs all Cypress component and integration specs. GitHub Actions runs that same coverage as six component shards (Chrome) plus sixteen integration shards per browser, all on 8 vCPU runners. A sweep of shard counts and runner sizes (22 runs of each) found this the cheapest setup within a few seconds of the fastest one. Pull requests run Chrome only. Firefox runs in the merge queue, nightly (in `SemiAnalysisAI/InferenceX-app` only), and on manual dispatch, following Cypress's cross-browser guidance. The CI workflow is the merge gate for the full E2E suite.

Each integration shard builds the app with `E2E_FIXTURES=1` and then runs `next start`. With the mounted Turbopack cache that build takes about 10 to 15 seconds, which is faster than waiting for a shared build job and downloading its output. The fixture build skips Next's TypeScript pass because Lint & Format typechecks the workspace. `node_modules`, the Next.js build cache and the Cypress binary live on Blacksmith sticky disks. The Warm CI caches workflow rebuilds and commits them after every push to `main`, so pull requests build against the latest `main`; pull request, merge queue and nightly runs only read them. The Cypress binary disk is keyed by runner architecture only. After a `cypress` version bump, each job downloads the new binary until the next push to `main` commits it, and `cypress cache prune` drops the old version from the disk. Chrome shard 1 is also the only shard that runs `check:bundle` and `check:route-budgets`.

`bun run check:route-budgets` compares each route's first-load JavaScript (`firstLoadUncompressedJsBytes` in `packages/app/.next/diagnostics/route-bundle-stats.json`, written by `next build`) with `packages/app/scripts/route-bundle-budgets.json`. A route over its budget fails with its size, budget and overage. A route without an entry is held to `defaultBytes`, the budget of the bare `/_not-found` page, so a new page that ships client code needs its own entry. Entries for routes the build no longer has fail too, and so does a stats file that is empty or whose entries lack a route name or a finite byte count, so a change to Next's format cannot pass every route. When a change grows a route on purpose, or shrinks one (the check lists routes with slack), rebuild with `E2E_FIXTURES=1`, run `bun run check:route-budgets --update` to set every budget, and `defaultBytes`, to the size plus `tolerancePercent` (1%), and say why in the PR. To see which modules fill a route, run `bunx next analyze -o --snapshot <name>` in `packages/app`, then `bunx next analyze export --snapshot <name> --route '<route>'`, whose `part` records give each module's bytes per chunk.

`packages/app/timings.json` and `timings-firefox.json` are the committed Chrome
and Firefox `cypress-split` baselines. `component-timings.json` is the Chrome
component baseline. Their unit guard requires one positive duration for every
current spec and rejects removed entries.

CI uploads raw per-shard, per-test observations. Runs that include Firefox
validate the complete 38-shard matrix before publishing
`cypress-timing-baselines`. Refresh all three baselines from a successful full
run (dispatch the workflow on your branch to get one):

```sh
gh run download RUN_ID --pattern 'cypress-timings-*' --dir /tmp/cypress-observations
bun packages/app/scripts/refresh-cypress-timings.ts /tmp/cypress-observations
```

Use a fresh destination directory, review the generated diff and balance
report, and commit the baselines on a branch.
Do not invent timings or treat the plugin's merged output as a fresh full
measurement. Spec durations are Cypress's reported execution durations, not
whole-job wall time; checkout, dependency installation, and application build
time are not included.

`E2E_FIXTURES=1` serves the committed API snapshots under `packages/app/cypress/fixtures/api/`. Refresh them with `bun run --cwd packages/app capture:fixtures`. The capture script updates `_manifest.json`, which records the fixture shape, byte length, checksum, source, and capture timestamp. The manifest guard rejects partial or hand-edited snapshots; benchmark history must also contain at least two dates so replay tests cannot silently skip their substantive path. Fixture API responses are sent with `Cache-Control: no-store`. `cy.intercept` never sees a response the browser serves from its HTTP cache, so the production 60 s browser reuse would let an earlier test's response shadow a later test's stub.

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
