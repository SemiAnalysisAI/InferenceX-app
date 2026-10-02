# Test cleanup audit

Reviewed against `fe768b3614ca8396173e30ac510fb52279540af9` on September 22, 2026.
This is a targeted redundancy review, not a claim that every test body was audited.

## Scope and method

- Inventoried all 442 Vitest files across app, constants, DB, and MCP, then scanned
  their imports for suites disconnected from production code.
- Read the disconnected candidates, their production implementations, the existing
  zoom-hook suite, and related chart component and integration coverage.
- Compared inference, evaluation, reliability, and sanity smoke assertions with
  stronger checks in the same specs. Read shared Cypress setup, CI workflows,
  quick-suite scripts, the timing-baseline guard, and recent CI outcomes.
- Ran the baseline workspace unit command and post-change app tests. Exercised the
  smoke suite locally and corrected setup dependencies exposed by browser testing.

## Removal decisions

Paths below are relative to `packages/app`.

- `src/lib/setup.test.ts`: only asserts `1 + 1 === 2`; imports no application code.
  Every real Vitest test already verifies that the runner can execute.
- `src/hooks/useChartZoom.test.ts`: tests local copies of wheel callbacks.
  All 13 input cases move into two tests in `useChartZoom.setup.test.ts`, calling
  callbacks installed by the real hook. Temporarily accepting unmodified wheel
  events and removing the `deltaX` fallback makes both replacement tests fail.
  Restoring production code makes all seven hook tests pass.
- `src/components/inference/ui/ComparisonChangelog.test.ts`: tests two local
  functions without importing the component. Its date-only copy omits the
  production run-specific add/remove path. This removes false coverage, not an
  exercised production path. `changelogFormatters`, `runEnumeration`, and
  `comparisonEntry` tests remain, but do not replace a mounted add-all interaction
  test. That interaction remains a coverage gap.
- `cypress/e2e/performance.cy.ts`: four generic checks use a 15-second wall-clock
  load ceiling, graph existence, a one-second CLS observation with a 0.5 ceiling,
  and optional Chromium heap usage under 200 MiB. The heap test can pass without
  asserting anything. Data-rendering tests and targeted `landing-performance.cy.ts`
  hydration, resource, and theme checks remain. No equivalent inference-page CLS
  or heap budget is claimed after deletion.
- Five inference E2E cases: wrapper, figure, SVG, negative empty-text, and
  legend-existence checks add little alongside loaded points, captions, and chart
  interactions. The same spec retains loaded circles, headings, filters,
  official/unofficial numerical assertions, errors, and Chinese mobile paths.
  Component legend tests remain.
- Six evaluation E2E cases and one repeated page visit: selector, SVG, empty-text,
  and attribution checks repeat the content/interaction group. The heading moves
  into the loaded-points test; caption attribution remains. The old benchmark-switch
  case silently returned because this model's fixture only has GSM8K. Its replacement
  asserts that the sole selected option cannot be deselected and Escape closes the
  menu. `component/eval-chart-controls.cy.tsx` still tests selecting another
  benchmark with multiple options. Cross-benchmark page integration is not claimed.
- Four reliability E2E cases: selector visibility, selection text, bare SVG, and
  negative empty-text checks repeat stronger interactions. The retained date-range
  test checks selector visibility and selected text, requires fewer bars after
  filtering, then restores All time. Keep the content group's separate fixture-clock
  visit: combining it with the earlier group failed in the browser because Cypress
  restores clocks between tests and selector interactions can reaggregate under the
  real date. Heading, options, attribution, chart labels, errors, and Chinese routes
  remain.
- Sanity “page loads without 404 errors”: repeats the preceding visit/header/footer
  checks without observing failed subresource requests. The JavaScript-error test
  still visits the page and checks both elements. Navigation, FAQ deep-link, theme
  persistence, and launch tests remain.

## Explicitly retained

- API contracts and public-view numerical parity, DB ingestion and provenance,
  Pareto/interpolation, pricing, power, and calculator math.
- Authentication, source-code/catalog guards, fixture integrity, and the Cypress
  timing-baseline guard. A filesystem-based guard can be meaningful without an
  application-module import.
- Locale parity, date/timezone formatting, accessibility, route aliases, browser
  history, share links, unofficial overlays, and launch-destination state.
- `performance-over-time-removal.cy.ts`: negative assertions here follow real
  double-click and pinned-tooltip interactions on a retired feature.
- The full Chrome/Firefox CI matrix, component job, retry settings, and local smoke
  list. No production source, dependencies, or API/skills contracts change.

## Cost and verification boundaries

The deleted performance spec has a committed historical duration of 2,377 ms.
That is not a before/after measurement or a predicted CI wall-clock saving.
Eight E2E jobs still build the app independently, so test-count reduction does not
remove that fixed build cost. This cleanup removes 20 E2E cases and reduces the
app unit count by 17 while retaining all 13 zoom input cases against production.

The PR description records actual post-change commands and results, including
environment limitations. Timing data must come from observed runs, not estimates.
