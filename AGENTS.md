# AGENTS.md

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
│   ├── content/blog/     # MDX blog posts (frontmatter + content)
│   └── src/
│       ├── app/          # Pages, layouts, API routes (/api/v1/*)
│       │   └── blog/     # Blog list + [slug] post pages, OG image generation
│       ├── components/   # Tab sections: inference/, evaluation/, historical-trends/,
│       │                 #   throughput-calculator/, reliability/, gpu-specs/, blog/, ui/
│       ├── hooks/api/    # React Query hooks (use-benchmarks, use-availability, etc.)
│       └── lib/          # Utilities, constants, d3-chart/, chart-utils, blog, data-mappings
├── constants/            # Shared constants (GPU keys, model mappings, SEO)
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
- `invalidate` — invalidate API cache (admin)

**API routes return raw DB data** — no presentation logic. Frontend handles all transformations.

Static content routes (no DB):

- `/blog` — blog listing (statically generated from MDX files in `content/blog/`)
- `/blog/[slug]` — blog post page with MDX rendering and OG image generation
- `/feed.xml` — RSS 2.0 feed
- `/llms.txt` — LLM-readable site index
- `/llms-full.txt` — full article content for LLM ingestion
- `/sitemap.xml` — dynamic sitemap (includes blog posts)

## Code Style & Tooling

- **Linter**: oxlint — `pnpm lint` / `pnpm lint:fix`
- **Formatter**: oxfmt — `pnpm fmt` / `pnpm fmt:fix`
- **Type checking**: `pnpm typecheck` (tsc --noEmit, strict mode)
- **Node**: 24.x

## Environment Variables

See `.env.example`. Key vars: `GITHUB_TOKEN`, `DATABASE_READONLY_URL`, `DATABASE_WRITE_URL` (admin only).

## Testing

See [Testing](./docs/testing.md) for full requirements, quality standards, and pre-commit checklist. Tests are **mandatory** — missing/low-quality tests are 🔴 BLOCKING on PR review.

## Analytics Requirement

All interactive elements should have `track()` from `@/lib/analytics` (autocapture provides baseline coverage).

**Convention**: `[section]_[action]` — e.g., `latency_zoom_reset`, `calculator_bar_selected`, `tab_changed`

**Prefixes**: `latency_`, `interactivity_`, `gpu_timeseries_`, `inference_`, `calculator_`, `evaluation_`, `reliability_`, `tab_`, `selector_`, `blog_`, `social_`

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
6. Add disagg caveat banner in `ChartDisplay.tsx` for per-GPU or per-MW metrics (animated amber `border-l-2` banner pattern)
7. Expose in UI state: `InferenceContext.tsx`

### Add a new blog post

1. Create `packages/app/content/blog/<slug>.mdx` with frontmatter: `title`, `subtitle`, `date` (required), `tags`, `modifiedDate` (optional)
2. Write content using Markdown + custom MDX components (`Figure`, `Blur`)
3. No code changes needed — the post automatically appears in the blog list, sitemap, RSS feed, llms.txt, and gets a generated OG image

See [Blog](./docs/blog.md) for content format, available MDX components, and design details.

### Modify blog components

- Blog library (posts, headings, reading time): `src/lib/blog.ts`
- Blog list page: `src/app/blog/page.tsx`
- Blog post page: `src/app/blog/[slug]/page.tsx`
- MDX components: `src/components/blog/mdx-components.tsx`
- TOC sidebar: `src/components/blog/blog-toc.tsx`
- OG image generation: `src/app/blog/[slug]/og-image-render.tsx`
- RSS feed: `src/app/feed.xml/route.ts`
- SEO constants: `packages/constants/src/seo.ts`

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
- **[Testing](./docs/testing.md)** — Requirements, quality standards, pre-commit checklist
- **[Data Transforms](./docs/data-transforms.md)** — BenchmarkRow → AggDataEntry → InferenceData pipeline, hardware key construction, derived metrics
- **[State Ownership](./docs/state-ownership.md)** — Context provider state map, availability filtering cascade, comparison dates, URL params
- **[Blog](./docs/blog.md)** — MDX content system, SEO features, TOC sidebar, reading progress, analytics events

## Claude AI Agents

### `@frontend-claude` (`.github/workflows/claude.yml`)

Triggered by mentioning in issues/comments. Full code implementation + Playwright browser testing. Creates `claude/issue-{N}-*` branches. Must verify charts render real data (no "No data available").

### `@chrome-claude` (`.github/workflows/claude-chrome.yml`)

Same as `@frontend-claude` but uses Chrome DevTools MCP instead of Playwright for browser automation. Preferred when you need deeper debugging (network requests, console messages, JS evaluation).

### `@pr-claude` (`.github/workflows/pr-claude.yml`)

Auto-runs on PR open/sync. Code review only. Flags: bugs, security, breaking changes, missing tests (🔴 BLOCKING), low-quality tests (🔴 BLOCKING). Ignores: style, naming, docs.
