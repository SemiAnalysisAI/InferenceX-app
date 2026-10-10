# App source organization

`packages/app/src/components/` groups rendered UI by feature or shared responsibility.
`packages/app/src/lib/` groups supporting modules by the domain that owns them.
Tests and small data files stay beside the implementation they exercise or support.
Next.js route entry points remain in `src/app/`; shared React providers live in
`src/providers/`.

## Components and providers

| Directory under `src/`     | Responsibility                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers/`               | Shared query, analytics, visit, global-filter, and unofficial-run providers. Global filters and unofficial runs also serve compare, model, and embed consumers. |
| `components/dashboard/`    | Dashboard shell and tab navigation.                                                                                                                             |
| `components/inference/ui/` | Inference controls, including engine-comparison consent and conflict notices.                                                                                   |
| `components/landing/`      | Landing-page introduction and supporters.                                                                                                                       |
| `components/effects/`      | Shared decorative backgrounds and the optional-theme lazy loader.                                                                                               |
| `components/seo/`          | Shared JSON-LD rendering.                                                                                                                                       |
| `components/errors/`       | Shared not-found content.                                                                                                                                       |
| `components/nudges/`       | Nudge rendering; rules remain in `lib/nudges/`.                                                                                                                 |
| `components/zh/`           | Chinese-page helpers, including document-language synchronization.                                                                                              |
| `components/ui/`           | Reusable UI, including sharing controls and benchmark preview notices used by several views.                                                                    |

Existing feature directories continue to own their components. A component shared by
several features belongs with its shared responsibility, rather than whichever feature
first imported it.

## Libraries

| Directory under `src/lib/`                                                     | Responsibility                                                                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api/`                                                                         | API client and shared types, HTTP helpers, authentication, public documentation/OpenAPI, route review ledger, and Pareto endpoint computation.         |
| `cache/`                                                                       | Server-side API and blob caching.                                                                                                                      |
| `benchmarks/`                                                                  | Benchmark identity, transforms, selection/defaults, server readers, supplemental results, topology, labels, exclusions, and unofficial-run selection.  |
| `catalog/`                                                                     | Model/hardware metadata, display mappings, specifications, framework families, logos, and model/chip content registries.                               |
| `charts/`                                                                      | Shared chart data, rendering helpers, colors, legends, Pareto geometry, and overlay styling. The existing `d3-chart/` renderer library stays separate. |
| `compare/`                                                                     | Comparison slugs, availability, defaults, server data/narratives, and comparison OG/PNG rendering.                                                     |
| `routing/`                                                                     | Dashboard and model route registries, tab metadata, client navigation, and URL state.                                                                  |
| `i18n/`                                                                        | Locale helpers and objective Chinese-copy guards with their regression data.                                                                           |
| `agentx/`                                                                      | AgentX benchmark catalog/detail links and optimization/telemetry articles. The existing `agentic-workload-explorer/` remains dedicated to ProxyTrace.  |
| `calculator/`                                                                  | Token cache pricing, cache-reuse links, and the TCO feed. HTTP cache infrastructure belongs in `cache/`.                                               |
| `power/`                                                                       | Measured-power tiers, modeled system power, reference/profile JSON, and power regressions.                                                             |
| `overview/`                                                                    | Overview data, navigation, metadata, and server rendering.                                                                                             |
| `live-seo/`                                                                    | Run and ranking page registries, narrative builders, and shared server data.                                                                           |
| `blog/`                                                                        | Blog loading, MDX/KaTeX processing, thumbnails, and content checks.                                                                                    |
| `content/`                                                                     | Glossary and whitepaper registries.                                                                                                                    |
| `github/`                                                                      | Artifact access, local artifact previews, repository stars, and star state.                                                                            |
| `analytics/`                                                                   | Browser/server tracking, CLI-request analytics, and visit tracking.                                                                                    |
| `runtime/`                                                                     | Polyfills, chunk recovery, feature gates, hostname helpers, and dev origins.                                                                           |
| `themes/`                                                                      | Theme selection and optional-theme activation helpers.                                                                                                 |
| `seo/`                                                                         | Shared OG assets; the existing `compare-og-fonts/` holds the font binaries.                                                                            |
| `export/`                                                                      | Shared CSV and chart-export helpers.                                                                                                                   |
| `embed/`, `evaluation/`, `collectivex/`, `video/`, `ai-chart/`, `submissions/` | Helpers owned by the corresponding feature.                                                                                                            |
| `testing/`                                                                     | Cypress fixture loading/validation, timing-baseline checks, and typography guard logic.                                                                |
| `shared/`                                                                      | Existing mixed-purpose utilities and generic toggle transitions.                                                                                       |

The existing `views-api/`, `operatorx/`, `nudges/`, and `fixtures/` directories keep
their responsibilities. `optional-theme-imports.test.ts` deliberately remains at the
library root: the [easter-egg policy](./testing.md#easter-egg-themes-and-games) names
that exact main-site isolation check.

## Import and refactor conventions

- Import the owning module directly. Folder membership does not imply that its
  modules are all safe to load on the client; preserve `server-only`, `use client`,
  and lazy-import boundaries. Avoid umbrella re-export files that combine them.
- Keep tests colocated and update mock specifiers with production imports so both
  refer to the same module instance.
- File moves must preserve relative asset/fixture resolution, source-scanner roots,
  generator output directories, and tool configuration. Update documentation links
  and script provenance paths as well as TypeScript imports.
- Refresh API review digests only after reviewing the referenced changes. A move
  does not change the API contract; verify the generated OpenAPI document remains
  identical when refreshing digests for import-only changes.
- Preserve UI copy, calculations, exports, route URLs, provider order, and test
  assertions in organizational refactors. Review normalized code and resolved
  module targets in addition to running typecheck, unit tests, browser tests, and
  a production build.
