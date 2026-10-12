# Exact-text test audit — October 2026

## Scope and decision rule

This follow-up to the [test suite audit](./test-suite-audit.md) starts at
`faa2ed62`. A literal-text scan of 663 tracked JavaScript/TypeScript test files
flagged 2,745 candidate lines in 403 files. These are search candidates, not a
count of ineffective tests: they include API contracts, formatting, units,
security errors, and dynamic labels.

The review compared assertions with production implementations and surviving
tests across metadata, translation dictionaries, page chrome, articles, and
chart controls. A string assertion earns its place when it catches a behavioral
failure: wrong model or workload, wrong unit or locale, broken link, lost data,
unsafe error detail, or an incorrect rendering transformation. Merely reading a
constant does not exercise the state or interaction described by the test title.

This change removes 25 test cases (14 unit and 11 browser), including one whole
file, and removes incidental wording assertions from several retained cases.
No production code, pages, filters, API contracts, or skills behavior changes.
The test count reduction is not a measured CI speedup.

## Removed cases

App paths in this table are relative to `packages/app/`.

| Tests                                                                                                                                                                     | Why remove them                                                                                                  | Coverage retained                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/constants/src/seo.test.ts`; positioning cases in `src/lib/routing/tab-meta.test.ts` and `tab-meta-zh.test.ts`                                                   | Read static marketing copy and require particular category phrases, brand wording, and sentence order.           | Route validity, canonical paths, metadata construction, locale pairing, and Chinese content completeness.                                                                                             |
| Static Chinese page-copy case in `src/components/model/model-page-copy.test.ts`                                                                                           | Copies an entire introduction and several dictionary entries; does not render a page or select a locale.         | The English case now checks model/workload interpolation in both locales with two inputs. Locale paths, model metadata, and actual EN/ZH model-page browser checks remain.                            |
| Two dictionary cases in `src/components/evaluation/ui/evaluation-locale-copy.test.ts`                                                                                     | The claimed error/empty-state test only reads four messages. The other pins abbreviations and slash punctuation. | Date formatting, loading/error/ready transitions, valid unofficial rows during official failures, and `evaluation-chart.cy.ts` fetch-error, retry, empty-response, and Chinese-table scenarios.       |
| Dictionary case in `src/components/inference/InferenceContext.test.ts`                                                                                                    | Requires a reset-dialog message verbatim; never opens the dialog or resets a date range.                         | Axis resolution/provider tests and the objective dictionary-key guard. The deleted test supplied no reset-interaction coverage.                                                                       |
| Two cases in `src/components/inference/agentic-point/agentic-point-detail-copy.test.ts`                                                                                   | One claims to cover state branches but reads dictionary values; the other pins static link/badge wording.        | Generated source and subagent labels, phase labels, warmup composition, and `agentic-point-time-series.cy.ts` real failure/retry and Chinese-detail paths.                                            |
| Punctuation/keyword-quota cases in `src/lib/catalog/chip-pages.test.ts`, `src/lib/live-seo/rankings.test.ts`, and `src/lib/live-seo/run-pages.test.ts`                    | Ban all em/en dashes or demand an arbitrary keyword count; neither establishes content correctness.              | Registry integrity, links, translation coverage, model/chip identity, ranking calculations, missing-data behavior, and numerical formatting.                                                          |
| Heading/description/source cases in `cypress/e2e/compare-table.cy.ts`, `gpu-power.cy.ts`, `gpu-specs.cy.ts`, `historical-trends.cy.ts`, and `throughput-calculator.cy.ts` | Require static explanatory or branding phrases, sometimes repeating setup assertions.                            | Editing targets, interpolation results, validation, loaded metrics, model/metric changes, and layout/locale checks.                                                                                   |
| Scenario spelling case in `cypress/component/chart-selectors.cy.tsx`                                                                                                      | Pins “Agentic” versus “Agentic Traces” and a decorative group heading.                                           | Scenario selection and availability, help-link activation, localized controls, and shared selector behavior.                                                                                          |
| Five boilerplate cases in `cypress/e2e/blog.cy.ts`                                                                                                                        | Repeat card/title/link/metadata/content presence checks supplied by stronger rendering cases.                    | `blog-index-content.test.tsx` controlled post/filter inputs, `blog-post-chrome.test.tsx` metadata/navigation, and browser image optimization, figure decoding, heading structure, and math rendering. |

## Narrowed assertions

- Overview metadata keeps its configured hardware list, Chinese output,
  canonical URLs, Open Graph locale, and shared descriptions. It no longer
  freezes a complete paragraph or title wording.
- Nudge registry tests retain storage keys, localized destinations, analytics,
  and translation completeness; four static launch-headline assertions go.
  The browser still exercises banner rendering, localization, and dismissal.
- The warmup note retains its check against an accidental adjacent
  `warmup warmup`, without freezing its Chinese sentence opening or forbidding
  legitimate mentions in later sentences.
- Blog browser checks retain source/publication boundaries, one primary
  heading, decoded images and alt text. Arbitrary author/numeric snippets,
  section/figure counts, and listing-title wording are no longer snapshots.
- The methodology browser spec no longer bans two retired editorial phrases.
  Its methodological limitations, image/link handling, locale routes, and
  mobile behavior remain covered.

## Checks intentionally retained

Exact text is still appropriate for units and numerical formatting, raw versus
modeled measurements, official versus unofficial run identity, escaped output,
API error sanitization, and protocol/URL compatibility. Locale-selection tests
that render real components also remain useful. The two required optional-theme
isolation checks and both Chinese objective/mechanical guards are unchanged.

Representative retained cases include `ThroughputBarChart.test.ts` (input versus
output token units), `dashboard-section-header.test.tsx` (caller-provided text
and heading semantics reach the DOM), `d3-chart-wrapper.test.tsx` (touch versus
mouse instructions), and `blog.cy.ts` (dollar prices survive math rendering).
Each tests a transformation or selection rather than restating a constant.

## Mutation evidence

In a temporary source mutation, changing the model-index heading from
`Model Architectures` to `Explore Model Architectures` failed the old unit test
but passed the revised tests. A separate mutation dropping the model argument
from the detail title failed the revised test. Both mutations were restored.
This distinguishes an editorial change from lost data without adding a CI test
that tries to mechanically classify other tests.

The metadata check matches complete hardware names: `B200` must not pass merely
because `GB200 NVL72` is present. Temporary omissions of `B200` and `B300` from
the generated platform list each failed both locale cases; restored source
passed all four metadata cases.

Final unit, browser, lint, formatting, and typecheck results are recorded in the
PR. Full browser CI covers every changed spec; no timing baseline is adjusted
because no browser spec is deleted and no new duration has been measured.
