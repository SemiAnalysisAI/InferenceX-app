# CLAUDE.md

For detailed subsystem docs, see [docs/index.md](./docs/index.md).

## Project Overview

InferenceX App — Next.js 16 dashboard for ML inference benchmark data. DB-backed with Neon PostgreSQL, React Query for data fetching, D3.js for charts.

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 4 + shadcn/ui (Radix UI primitives)
- **Charts**: D3.js — shared library at `src/lib/d3-chart/`, scatter/GPU/bar charts
- **Data**: Neon DB → API routes (`/api/v1/*`) → React Query hooks → Context providers
- **Deployment**: Vercel with daily cron-triggered rebuilds
- **Analytics**: PostHog (`posthog-js`) via `@/lib/analytics` — recommended on all interactive elements (autocapture provides baseline coverage)

## Quick Start

```bash
pnpm install              # Install dependencies
pnpm dev                  # Dev server with Turbopack (http://localhost:3000)
pnpm build                # Production build
pnpm typecheck            # TypeScript type checking (all packages)
pnpm lint                 # Lint with oxlint
pnpm lint:fix             # Auto-fix lint issues
pnpm fmt                  # Format check with oxfmt
pnpm fmt:fix              # Auto-fix formatting
pnpm test:unit            # Vitest unit tests
pnpm test:e2e             # Cypress E2E tests
```

## Monorepo Structure

```
packages/
├── app/                  # Next.js frontend (@semianalysisai/inferencex-app)
│   └── src/
│       ├── app/          # Pages, layouts, API routes (/api/v1/*)
│       ├── components/   # Tab sections: inference/, evaluation/, historical-trends/,
│       │                 #   throughput-calculator/, reliability/, gpu-specs/, ui/
│       ├── hooks/api/    # React Query hooks (use-benchmarks, use-availability, etc.)
│       └── lib/          # Utilities, constants, d3-chart/, chart-utils, data-mappings
├── constants/            # Shared constants (GPU keys, model mappings)
└── db/                   # DB layer, ETL, migrations, queries, ingest scripts
```

**Path alias**: `@/*` → `packages/app/src/`

## Data Architecture

```
Frontend → React Query hooks (src/hooks/api/) → /api/v1/* routes → Neon DB
```

API routes (`packages/app/src/app/api/v1/`):

- `benchmarks?model=X&date=YYYY-MM-DD` — latest benchmark per (config, concurrency)
- `benchmarks/history?model=X&gpu=Y` — historical benchmark data for trend charts
- `workflow-info?date=YYYY-MM-DD` — runs, changelogs, configs for a date
- `availability` — `Record<model, dates[]>`
- `reliability` — raw `ReliabilityRow[]`
- `evaluations` — raw `EvalRow[]`
- `server-log` — retrieve benchmark runtime logs
- `github-stars` — star count for the repo
- `invalidate` — invalidate API cache (admin)

**API routes return raw DB data** — no presentation logic. Frontend handles all transformations.

## Code Style & Tooling

- **Linter**: oxlint — `pnpm lint` / `pnpm lint:fix`
- **Formatter**: oxfmt — `pnpm fmt` / `pnpm fmt:fix`
- **Type checking**: `pnpm typecheck` (tsc --noEmit, strict mode)
- **Node**: 24.x

## Environment Variables

See `.env.example`. Key vars: `GITHUB_TOKEN`, `DATABASE_READONLY_URL`, `DATABASE_WRITE_URL` (admin only).

## Testing

**Unit tests**: Vitest, colocated with source (`*.test.ts` next to `*.ts`). Config: `packages/app/vitest.config.ts`.
**E2E tests**: Cypress, in `packages/app/cypress/e2e/`. Config: `packages/app/cypress.config.ts`.

### Testing Requirements (Mandatory)

Enforced by `@pr-claude` — missing/low-quality tests are flagged 🔴 BLOCKING.

1. New utility functions → colocated unit test
2. New UI features → E2E test in `cypress/e2e/<feature>.cy.ts`
3. Bug fixes → regression test reproducing the bug
4. Run `pnpm test:unit` and `pnpm test:e2e` before considering task complete

### Pre-commit checklist

```bash
pnpm dev --hostname 0.0.0.0 --port 3000 &
curl --retry 10 --retry-delay 2 --retry-connrefused -sSf http://localhost:3000 >/dev/null
pnpm test:unit
pnpm test:e2e
```

### Test Quality Standards

1. **No tautological tests** — every test must verify a real transformation
2. **Cover edge cases** — empty input, null, boundary values, error paths
3. **Meaningful assertions** — check specific values, not just truthiness
4. **Test behavior, not implementation**
5. **Realistic inputs** — real model names, GPU keys, sequence strings
6. **No shallow Cypress tests** — assert content/behavior, not just visibility
7. **Regression tests must reproduce the bug** with exact triggering input
8. **No inline Cypress timeout overrides** — use the global `defaultCommandTimeout` in `cypress.config.ts`. Never pass `{ timeout: N }` to individual commands.

## Analytics Requirement

All interactive elements should have `track()` from `@/lib/analytics` (autocapture provides baseline coverage).

**Convention**: `[section]_[action]` — e.g., `latency_zoom_reset`, `calculator_bar_selected`, `tab_changed`

**Prefixes**: `latency_`, `interactivity_`, `gpu_timeseries_`, `inference_`, `calculator_`, `evaluation_`, `reliability_`, `tab_`, `selector_`

## Tab Structure

Order: `inference` → `evaluation` → `historical` → `calculator` → `reliability` → `gpu-specs` (defined in `page-content.tsx` `VALID_TABS`). Tab value = URL hash.

## Common Development Tasks

### Modify chart appearance/behavior

- D3 scatter plot: `src/components/inference/ui/ScatterGraph.tsx`
- D3 GPU graph: `src/components/inference/ui/GPUGraph.tsx`
- Chart layout/errors: `src/components/inference/ui/ChartDisplay.tsx`
- Shared D3 library: `src/lib/d3-chart/` (setup, axes, grid, watermark, layers)

### Change chart filters/state

- State: `src/components/inference/InferenceContext.tsx`
- Controls: `src/components/inference/ui/ChartControls.tsx`
- Filter logic: `src/components/inference/hooks/useChartData.ts`

### Add/modify a metric

1. Register in `src/lib/chart-utils.ts`: `Y_AXIS_METRICS`, `calculateRoofline`, `computeAllRooflines`, `markRooflinePoints`
2. Add TS types: optional field in `InferenceData`, add to `YAxisMetricKey`, add `ChartDefinition` fields
3. Add chart config: `src/components/inference/inference-chart-config.json`
4. Add Y-axis dropdown: `ChartControls.tsx`
5. Add subtitle/disclaimer in `ChartDisplay.tsx` if metric depends on assumed constants
6. Expose in UI state: `InferenceContext.tsx`

### Add a new model or GPU

**First ask for the PR / GitHub Actions run URL** — see [Adding Entities](./docs/adding-entities.md) for the full workflow. Never ask other questions before getting the URL.

### Adding a new tab

1. `page-content.tsx`: Add to `VALID_TABS`, add `TabsTrigger` (desktop), `SelectItem` (mobile), `TabsContent`
2. Create a per-section context provider (see `InferenceContext.tsx`, `EvaluationContext.tsx` for patterns)
3. Use `ChartLegend` with `variant="sidebar"`, sorted by `MODEL_ORDER`, default expanded
4. Analytics: all interactive elements use `track()` with `{tabname}_` prefix

## Subsystem Docs

Detailed design rationale (the "why" and "how", not the "what") lives in [docs/](./docs/index.md):

- **[Index](./docs/index.md)** — index of all docs **MUST ALWAYS READ IN CASE OF RELEVANT INFORMATION**
- **[Architecture](./docs/architecture.md)** — Client-first design, hash routing, caching, color system
- **[D3 Charts](./docs/d3-charts.md)** — 4-effect architecture, zoom refs, tooltip lifecycle
- **[Data Pipeline](./docs/data-pipeline.md)** — DB schema reasoning, ETL design, spline interpolation
- **[Pitfalls](./docs/pitfalls.md)** — Token type bugs, schema evolution, stale closures, zoom loss
- **[GPU Specs](./docs/gpu-specs.md)** — Topology invariants, unit conventions, hardware gotchas
- **[TCO Calculator](./docs/tco-calculator.md)** — Interpolation, composite keys, cost matrix
- **[Adding Entities](./docs/adding-entities.md)** — Checklists for adding models, GPUs, precisions, sequences, frameworks

## Claude AI Agents

### `@frontend-claude` (`.github/workflows/claude.yml`)

Triggered by mentioning in issues/comments. Full code implementation + Playwright browser testing. Creates `claude/issue-{N}-*` branches. Must verify charts render real data (no "No data available").

### `@chrome-claude` (`.github/workflows/claude-chrome.yml`)

Same as `@frontend-claude` but uses Chrome DevTools MCP instead of Playwright for browser automation. Preferred when you need deeper debugging (network requests, console messages, JS evaluation).

### `@pr-claude` (`.github/workflows/pr-claude.yml`)

Auto-runs on PR open/sync. Code review only. Flags: bugs, security, breaking changes, missing tests (🔴 BLOCKING), low-quality tests (🔴 BLOCKING). Ignores: style, naming, docs.

### `claude-cron-media` (`.github/workflows/claude-cron-media.yml`)

Weekly cron (Mondays 10 AM UTC). Searches for new media mentions of InferenceMAX/InferenceX and opens PRs to add them to `packages/app/src/components/media/media-data.ts`.
