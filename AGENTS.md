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

## Unofficial Run Support — Mandatory for Inference / Evaluation Features

Any new feature that operates on inference or evaluation chart data **must** also work for unofficial run overlays — not just the official run rendering path. The overlay path is a separate code branch (`overlayData`, `processedOverlayData`, `overlayRooflines`, `activeOverlayHwTypes`, `overlayRunColor`/`overlayRunIndex` from `@/lib/overlay-run-style`, `useUnofficialRun()` from `@/components/unofficial-run-provider`) that is easy to forget — features that only handle the official path silently degrade for users who load an unofficial run via `?unofficialrun=…`.

When adding a chart feature (toggle, label, overlay, filter, export, share-link param, tooltip enrichment, …):

1. Implement it for both official and overlay data paths. Use `overlayRunColor(runIndex)` for overlay strokes / labels so they match the legend swatches; do **not** reuse the hw-derived color helper (`getCssColor(resolveColor(hw))`) for overlay items.
2. Respect overlay visibility filters: `activeOverlayHwTypes` (hw toggles) and any per-run dismissal in `unofficialRunInfos`. Don't draw overlay items the user has hidden.
3. Verify it manually with an unofficial run loaded — paste a `?unofficialrun=<github-actions-run-id>` URL and confirm the new feature renders for overlay rooflines / points / rows, animates with zoom, and survives a per-run dismiss.
4. Add at least one E2E or unit test that exercises the overlay path. The mock helper `createMockUnofficialRunContext` (cypress/support/mock-data.ts) and the `cypress/e2e/inference-chart.cy.ts` overlay setup are good starting points.
5. Note overlay support explicitly in the PR description so reviewers can verify it ("works for both official runs and `?unofficialrun=` overlays — verified at <preview-url>").

If the feature genuinely cannot apply to overlays (e.g., it depends on data only ingested for official runs), say so explicitly in code comments and the PR description. Default to "must support overlays."

## Chart Interpolation — TS and Python Helpers MUST Stay in Sync

The blog-writing workflow (`.claude/skills/write-inferencex-blog/`) ships a Python port of the chart's interpolation algorithm at `.claude/skills/write-inferencex-blog/iso_interactivity.py`. It exists so iso-interactivity tables in blog posts produce **exactly the same numbers** readers see when they hover the rendered chart. Linear-interpolation shell scripts will produce visibly different values — Cursor Bugbot has flagged this on prior posts.

The Python helper is a 1:1 port of these three TypeScript functions:

- `paretoFrontUpperLeft` — `packages/app/src/components/calculator/interpolation.ts`
- `monotoneSlopes` (Steffen 1990, matches `d3.curveMonotoneX`) — same file
- `hermiteInterpolate` — same file

Plus the wrapper `interpolateMetricAtInteractivity` in `packages/app/src/components/inference/hooks/useInterpolatedTrendData.ts` which composes them with the "no extrapolation → return null" rule.

**Rule: any PR that changes any of those four TypeScript functions MUST also update `.claude/skills/write-inferencex-blog/iso_interactivity.py` in the same commit.** Drift between the TS and Python implementations means the blog tables will silently diverge from the live chart on the very next post — readers will see one number in the table and a different one in the chart they click through to. This includes:

- Changing the Pareto frontier definition (upper-left → lower-left, or adding tie-breaking rules)
- Switching from Steffen's monotone slopes to a different spline construction (Fritsch-Carlson, natural cubic, etc.)
- Loosening or tightening the extrapolation rule (currently: return `null` outside `[min x, max x]`)
- Adjusting the Y-clamp behavior that prevents spline overshoot

The Python file has a header comment explaining the pipeline and a `_cli()` entrypoint for stdin/stdout JSON usage. When you update it, keep the structure 1:1 with the TS so future readers can diff the two files line by line. Run the helper against a known dataset and confirm the outputs match what the chart renders before merging.

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
3. Use `ChartLegend` with `variant="sidebar"`, sorted by `HW_REGISTRY` sort order, default expanded
4. Analytics: all interactive elements use `track()` with `{tabname}_` prefix

### Bumping dependencies

Workflow for a periodic dep bump. Branch: `chore/bump-deps-YYYY-MM-DD`. Commit each step separately so failures are easy to bisect.

1. **Bump versions**: `pnpm taze -I -r latest` (interactive, all workspaces). Approve what you want, skip what you don't.
2. **Resolve install errors**:
   - `ERR_PNPM_IGNORED_BUILDS` after a pnpm major bump means new `allowBuilds` entries in `pnpm-workspace.yaml` were left as placeholder strings — set them to `true` (or `false` if you don't want the build script to run).
   - pnpm 11 moved `pnpm.overrides` from `package.json` to `pnpm-workspace.yaml`. Overrides left in `package.json` are silently ignored. Migrate them.
3. **Audit security**: `pnpm security` (runs `pnpm audit && audit-ci`). For each remaining vulnerability, add a targeted override in `pnpm-workspace.yaml`:

   ```yaml
   overrides:
     <pkg>@<vulnerable-range>: '>=<min-patched-version>'
   ```

   - **Use the lowest patched version** (e.g. `>=8.5.10`, not `>=8.5.14`). pnpm resolves to the highest available that satisfies the constraint, so we automatically get the latest patch — and the override doesn't go stale when 8.5.15 ships.
   - **Use the narrow `<vulnerable-range>` selector** (not bare `<pkg>:`) so the override only fires on vulnerable resolutions and doesn't disturb pins already on safe versions.
   - **Verify minimum set**: drop any override that doesn't map to a current advisory. Test by removing it and re-running `pnpm security`.

4. **Fix lint/format**: `pnpm lint:fix && pnpm fmt:fix`. New rules from oxlint version bumps may not have autofixers (e.g. `require-unicode-regexp`, `unicorn/no-negated-condition`) — fix manually. For mechanical bulk changes, delegate to a subagent and verify with `pnpm typecheck`.
5. **Final check**: `pnpm lint && pnpm fmt && pnpm typecheck && pnpm security` all pass. Pre-commit hook reruns these.

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

### `@claude` (`.github/workflows/claude.yml`)

All Claude AI workflows are dispatched from a single trigger word `@claude`. The next word selects the mode:

- `@claude` (or `@claude <anything>`) — implementation with Playwright MCP. Triggered by mentioning in issues/comments. Full code implementation + browser testing. Creates `claude/issue-{N}-*` branches. Must verify charts render real data (no "No data available").
- `@claude chrome` — implementation with Chrome DevTools MCP instead of Playwright. Preferred when you need deeper debugging (network requests, console messages, JS evaluation).
- `@claude review` — code review only. Also auto-runs on PR open/sync. Flags: bugs, security, breaking changes, missing tests (🔴 BLOCKING), low-quality tests (🔴 BLOCKING). Ignores: style, naming, docs.
