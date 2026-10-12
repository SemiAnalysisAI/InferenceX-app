# Test suite audit — October 2026

## Scope and method

Audited the test inventory at `c93d65bc` across app, constants, database, MCP,
and skills: 668 tracked test files, including 121 Cypress specs, totaling
156,168 lines. This inventory includes the skills package's Python release tests,
which are not part of the workspace `test:unit` command.

The audit combined an import/source-read inventory, syntax-tree comparison of
test bodies, review of assertions and shared setup, and comparison with the
production implementation and surviving tests. Matching test bodies are only a
candidate signal: different model architectures, storage strategies, API routes,
or fixtures can make superficially identical tests necessary.

The removal criterion is whether a test detects a meaningful production failure
beyond the remaining coverage. No test is removed just because it is slow or
failing. Numerical edge cases, security boundaries, missing-data handling,
state transitions, and known regression inputs remain valuable even when their
assertions are short.

This change only edits tests, their timing inventory, and contributor docs.
It changes no page, filter, calculation, API contract, or skills behavior, so
there are no corresponding public-view/API/skills changes to synchronize.

## Removed suites

Paths below are relative to `packages/app/`.

| Removed file                                                                    | Why it does not justify a separate CI test                                                                                                                                                       | Coverage retained                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/setup.test.ts`                                                         | Only checks `1 + 1 === 2`; no production code is exercised.                                                                                                                                      | Every real Vitest suite exercises runner setup.                                                                                                                                                                                                                     |
| `src/components/agentic-workload-explorer/__tests__/error-sanitization.test.ts` | Tests local regexes and locally constructed `Response.json` objects. It passes even when the real handler leaks an exception.                                                                    | `api-wrappers.test.ts` calls the real wrapper. Its existing thrown-error case now checks the complete sanitized response body as well as status and cache headers.                                                                                                  |
| `src/components/inference/ui/ComparisonChangelog.test.ts`                       | Tests copies of date-filter helpers, never the component. The copied addable-date algorithm has already drifted from production's multi-run entries.                                             | `comparisonEntry.test.ts`, `runEnumeration.test.ts`, `changelogFormatters.test.ts`, and the embedded changelog interaction in `model-architecture.cy.ts`. These do not imply exhaustive component callback coverage; the deleted copy never provided that coverage. |
| `src/lib/models-mapping.test.ts`                                                | Retests constants-package functions directly, without exercising an app integration boundary. Sequence conversions, inverses, and GLM buckets duplicate `packages/constants/src/models.test.ts`. | Constants-package tests. The unique legacy identity assertions are consolidated there before removing the app copy.                                                                                                                                                 |
| `src/components/ui/heading.test.ts`                                             | Four cases repeat fixed CVA class recipes.                                                                                                                                                       | The two substantive custom-token merge cases move to `src/lib/shared/utils.test.ts`; typography policy and browser layout checks remain.                                                                                                                            |
| `src/lib/engram-content.test.ts`                                                | A one-article publication checklist freezes prose, author names, numeric strings, term lists, and figure counts. It does not verify the article's calculations.                                  | `blog-content.test.ts`, `blog.test.ts`, `glossary.test.ts`, the Chinese objective guards, and Next.js MDX compilation. Article-specific editorial wording/counts are intentionally no longer frozen by CI.                                                          |
| `src/lib/glm53-article.test.ts`                                                 | Another one-article checklist repeats image/publishing checks and pins historical prose, dates, prices, and authors.                                                                             | The same generic content guards, feed tests, and build validation. The exact historical prose and image count are intentionally left to editorial review.                                                                                                           |
| `cypress/e2e/performance.cy.ts`                                                 | A wall-clock page-load threshold, an element-exists claim of interactivity, a short browser-dependent CLS observation, and a heap check that silently does nothing without `performance.memory`. | Real chart interactions, deterministic cache call-count tests, `landing-performance.cy.ts`, and optional-theme resource isolation. The generic dashboard timing/heap thresholds are intentionally removed.                                                          |
| `cypress/e2e/performance-over-time-removal.cy.ts`                               | Only checks that a deleted popup and its labels remain absent. It does not exercise a supported workflow.                                                                                        | Active point/tooltip interactions, historical trends, and comparison workflows. No continuing contract is imposed on retired UI text.                                                                                                                               |

## Pruned cases in surviving suites

### Unit tests

- `toggle-logic.test.ts`: remove repeated solo/restore examples that merely change
  set element names or size, the shorter duplicate cycle, and the assertion that
  restore must return the identical `allItems` object. Keep the partial-selection
  regression, full transition cycle, empty/unknown-item boundaries, and input
  immutability/React change detection.
- `nudges/persistence.test.ts`: remove two tests imposing a shared implementation
  on `markShown`/`markDismissed`, including a less-than-50ms clock comparison.
  Keep each function's storage behavior, expiry, corruption, and suppression tests.
- `minecraft-splash.test.tsx`: remove the purported SSR/hydration test, which only
  renders twice on the client. Keep both English and Chinese standard-page
  announcement cases; the directory name does not make them optional-theme tests.

### Browser tests

| Suites                                                                                                                                                      | Removed assertions                                                                                                                        | Meaningful checks retained                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sanity.cy.ts`                                                                                                                                              | A second header/footer presence check labeled as a 404 check, with no network assertion.                                                  | Fresh-page error capture, routing, FAQ links, announcements, and theme persistence.                                                                                                                                      |
| `csv-export.cy.ts`                                                                                                                                          | A claimed download test that only observes a closed menu, plus repeated PNG-option presence.                                              | Per-chart export wiring, `chart-buttons.cy.tsx` callback checks, actual captured CSV contents and dismissed-overlay filtering in `csv-export-overlay.cy.ts`.                                                             |
| `inference-chart.cy.ts`, `evaluation-chart.cy.ts`, `reliability-chart.cy.ts`                                                                                | Wrapper/SVG/heading/legend/selector presence and generic absence of “No data available”; redundant initial page loads.                    | Real plotted data, filter-driven results, official/unofficial paths, prompt evidence, retry behavior, empty states, localization, and responsive interactions.                                                           |
| `historical-trends.cy.ts`, `throughput-calculator.cy.ts`                                                                                                    | Repeated selector, legend, chart-shell, and title presence; a footer click repeated in the following navigation round trip.               | Selection changes, rendered values, table/chart parity, date/history loading, overlay calculations, costs, and responsive controls.                                                                                      |
| `gpu-specs.cy.ts`                                                                                                                                           | Section/view-toggle/selector/legend presence and navigation-arrow presence before tests that actually use those arrows.                   | FP4 filtering, radar selection/reset, topology content, keyboard navigation, wraparound, watermarks, localization, and overflow checks.                                                                                  |
| `model-architecture.cy.ts`                                                                                                                                  | Repeated static badges, developer/feature prose, and bare SVG presence.                                                                   | Architecture-specific expansion and collapse, dense/MoE/MLA/GQA/hybrid distinctions, no-orphan-caption regression, locale navigation, and embedded controls. Model data remains tested in `model-architectures.test.ts`. |
| `gradient-labels.cy.ts`, `line-labels.cy.ts`                                                                                                                | Label-switch presence, arbitrary SVG text/count claims, and a legacy URL assertion already covered more strongly in the line-label suite. | Actual gradient definitions, label elements, metric directions, zoom stacking, and URL precedence.                                                                                                                       |
| `chart-buttons.cy.tsx`, `chart-legend.cy.tsx`                                                                                                               | Menu/legend/icon/span presence already required by real interactions.                                                                     | Export callbacks, responsive controls, series selection, points-table contents, and overlay-specific links.                                                                                                              |
| `header.cy.tsx`, `footer.cy.tsx`                                                                                                                            | Branding/button presence, social-button counts, and a claim that all links open externally which only finds one matching anchor.          | Real navigation dispatch, locale paths, mobile menus, focus/touch targets, and clipping checks.                                                                                                                          |
| `date-picker.cy.tsx`, `date-range-picker.cy.tsx`                                                                                                            | Placeholder, calendar-shell, and month/header presence repeated by selection/cancel tests.                                                | Apply/cancel, selected dates, availability boundaries, localized controls, and responsive layout.                                                                                                                        |
| `eval-chart-controls.cy.tsx`, `reliability-chart-controls.cy.tsx`, `inference-chart-controls.cy.tsx`, `eval-bar-chart.cy.tsx`, `gpu-specs-bar-chart.cy.tsx` | Basic control/SVG/default-label presence; a purported bar-color test actually checks only two hard-coded legend swatches.                 | Callback values, disabled/available options, search, chart metric changes, missing/error data, localization, and layout.                                                                                                 |

## Explicitly retained boundaries

- Pareto, interpolation (including reciprocal metrics), pricing, energy, and
  UI/API numerical parity. Neither TypeScript nor Python calculation logic changes.
- Official and unofficial data paths, run identity, dismissal/visibility, and
  exported evidence.
- Database ingest idempotence, query scoping, migration safety, artifact handling,
  credentials/encryption, retries, and missing telemetry.
- API status/auth/cache contracts, documentation/catalog synchronization, MCP
  read-only restrictions, CLI packaging and installer recovery.
- Both required optional-theme isolation checks and their helpers. The audit
  found no standalone gameplay suite to remove; normal-page announcement and
  light/dark behavior tests remain.
- Chinese route/dictionary/content parity, metadata, accessibility interactions,
  and concrete browser layout regressions.

## Verification

The initial workspace run passed app (6,762 passed, 4 skipped), constants (63),
database (866), and MCP (25) tests before edits. Skills runs use their separate
Node test runner and are included in workspace validation.

The real error-wrapper test was also mutation-checked: replacing the sanitized
response with `String(error)` failed the response-body assertion with the injected
connection error. The production file was restored immediately afterward.

Run the workspace unit suite and Cypress smoke suite for the final change. Since
browser cases were removed from several specs, also run the remaining affected
component/integration specs. Remove only deleted-spec entries from the committed
timing inventory; replace other timings only with observed complete-run results.
Test counts and measured outcomes belong in the PR validation record, not a
claimed CI speedup inferred from deleted lines.
