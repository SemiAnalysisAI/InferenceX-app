# AGENTS.md

## UX, DX and AX

- Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout.
- Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything.

## Repository guidance

InferenceX App is a Next.js dashboard for ML inference benchmark data (Neon PostgreSQL → `/api/v1/*` routes → React Query hooks → D3 charts). Setup, scripts, and package layout are in [README.md](./README.md). The `@/*` import alias maps to `packages/app/src/`.

For detailed subsystem docs, see [docs/index.md](./docs/index.md). **MUST ALWAYS READ IN CASE OF RELEVANT INFORMATION.**

- Pareto logic changes must update both InferenceX and InferenceX-app with matching regression tests and cross-linked PRs.
- Changes under `packages/app/src/lib/power/power_model/` need a companion InferenceX `power_model/` PR, cross-linked both ways. See [Power Model — TS Port and Upstream Python MUST Stay in Sync](#power-model--ts-port-and-upstream-python-must-stay-in-sync).
- **Easter egg themes and games are just for fun.** They get no feature tests or compatibility guarantees and may be deleted at any time. See the [easter egg policy](./docs/testing.md#easter-egg-themes-and-games) for the two main-site isolation checks that stay.
- Any added, changed, or removed filter, frontend view, or page MUST include the corresponding API and `inferencex-skills` changes in the same PR. See [Read-only coverage for public views](#read-only-coverage-for-public-views).

## PR descriptions

- **Keep PR descriptions high signal and low noise.** Lead with a short explanation of the problem, what changes, and why it matters to a human reviewer, so the PR is understandable without expanding any section. Keep material risks, breaking changes, and unresolved failures visible. Put AI disclosure, change-type lists, author checklists, and other administrative boilerplate after the summary in clearly named `<details><summary>…</summary>` blocks, without the `open` attribute, with blank lines around the Markdown inside each block. Collapsing required checklist items changes presentation, not review or merge requirements.
- **Report validation only from actual integration or end-to-end runs**, with a concise outcome and a run link when available. Put supporting evidence, verbose check output, and logs in a collapsed `<details><summary>Validation details</summary>` block, and keep material failures and regressions visible. Omit routine local-check inventories (unit-test counts, lint/format, typecheck) and empty or pending validation sections. Keep running the appropriate checks; this rule only governs what goes in the description.
- Every PR description must include an **AI model disclosure** section inside a collapsed-by-default `<details><summary>AI model disclosure</summary>` block, naming the exact model/version used to prepare the PR. List each contributing model and its role, including delegated agents. Tool names such as Claude Code, Cursor, or Perplexity Computer are not model identities. Copy the model identifier exposed by the runtime; do not guess an unavailable identifier. If the runtime does not expose the exact model, explicitly state that it could not be verified. Human-only PRs must state `No AI used`. Keep the disclosure current when later edits use another model.

## Contribution requirements

> **PR and GitHub-issue titles & descriptions must be bilingual — include a Simplified Chinese version in addition to English.** Title format: `<English title> / <中文标题>` (keep bracket prefixes at the front untranslated). In PR and issue bodies and human-authored PR comments, keep English visible and put the Chinese in one collapsed `<details><summary>中文</summary>` section at the end; don't translate code blocks, logs, or stack traces — summarize around them. **Commit messages must include a Chinese translation too**: keep the subject line in English (conventional-commit style) and include the Chinese translation of the subject and key points in the commit body (e.g. a trailing `中文：<translation>` paragraph); squash-merge commits inherit the bilingual PR title, which satisfies the subject requirement automatically.

> **Translation quality bar:** write natural technical Chinese, not word-for-word machine translation (style reference: [`vllm-project/vllm-ascend` `README.zh.md`](https://github.com/vllm-project/vllm-ascend/blob/main/README.zh.md)). Preserve product names, hardware SKUs, framework/library names (Next.js, React Query, D3.js, Tailwind ...), flags, and code identifiers in English. Use parenthetical English clarification for acronyms on first use. Use the preferred renderings in the `docs/chinese-copy.md` terminology table, and 单节点/多节点 for single-node/multi-node. In first-party ML infrastructure UI and technical prose, keep established English technical terms and phrases that Chinese engineers normally use in English; decide from real industry usage and the surface, not from a closed list. `warmup`, `seed`, and `offload` are examples, not the whole category. Follow `docs/chinese-copy.md` for explanatory and quotation exceptions.

> **Chinese editorial decisions are context-aware.** Follow [docs/chinese-copy.md](./docs/chinese-copy.md) for audience, surface-specific register, terminology exceptions, the two independent fidelity/naturalness gates, the Claude-plus-manual-review workflow, and the PR checklist. Do not turn a preferred wording or pronoun choice into a global mechanical rule unless it is correct in every supported context.

> **The website itself is bilingual too — every indexable page must ship a Simplified Chinese sibling under `/zh`.** See [Chinese Website Pages](#chinese-website-pages-zh--mandatory-for-all-indexable-surfaces) below; a new page, tab, or blog post without its `/zh` version is 🔴 BLOCKING on PR review.

> **Cursor Bugbot re-reviews on EVERY push** — each new commit to a PR can surface new inline comments, including on code an earlier review passed. Before merging, loop until convergence: wait for checks (the Bugbot review is one of the PR checks) → fetch unresolved review comments → fix or answer each with a reply → push → repeat until a push produces no new findings. Branch rules require all review threads resolved before merge, so resolve addressed threads as you go.

## Data Architecture

**Raw-data API routes return raw DB data.** Keep their contracts separate from the `/api/v1/views/*` dashboard projections. [Deliberate API Exceptions](./docs/architecture.md#deliberate-api-exceptions) lists the routes that differ and why.

### Read-only coverage for public views

Every non-sensitive public-facing data view must have a read-only API. Adding,
changing, or removing any filter, frontend view, or page MUST include the
corresponding API and `packages/skills` (`@semianalysisai/inferencex-skills`)
changes in the same PR. This includes every data selector, filter option,
date/run comparison, unit, default, and calculation. Missing API or skills
updates are BLOCKING on PR review; do not defer them to a follow-up PR.
Reuse the dashboard's pure transformation functions so the API and UI cannot
silently calculate different results. Return resolved parameters and preserve
missing measurements and source identities.

Update the documentation registry, OpenAPI schemas, route catalog, and the
existing `packages/skills` npm package (`@semianalysisai/inferencex-skills`) in
the same PR. Extend that package; do not create a competing installer or skill
package. Include tests for filter behavior and UI/API numerical parity, plus a
view/control coverage inventory. Presentation-only controls may be excluded when
they do not change the returned data; record that distinction explicitly.

Never expose sensitive feedback, credentials, private artifacts, admin actions,
or mutation handlers to satisfy coverage. Record a concrete exclusion reason for
each such surface. A navigation feature gate alone is not evidence that data is
sensitive.

### API reference and contract synchronization

The public API reference at `/api` and `/zh/api`, plus the OpenAPI 3.1 document at
`/api/openapi.json`, are generated from `packages/app/src/lib/api/api-documentation.ts`.

**Any change to an API route, request parameter, response shape, status code, authentication,
caching behavior, or shared API type MUST update the documentation registry in the same change.**
Keep `packages/app/src/lib/api/api-route-catalog.ts` synchronized with every handler under
`packages/app/src/app/api/`; the catalog classifies unpublished routes and records review digests
for handlers and shared contract sources. Do not update a digest without first confirming whether
the human reference, Chinese copy, examples, or OpenAPI schema also need changes.

Run the synchronization guard from `packages/app`:

```bash
bun --env-file=../../.env vitest run src/lib/api/api-route-catalog.test.ts
```

## Code Style & Tooling

`bun run check:typography` runs in CI and pre-commit and blocks new arbitrary font sizes and letter-spacing. See [Typography](./docs/typography.md).

## Environment Variables

See `.env.example`. Key vars: `GITHUB_TOKEN`, `DATABASE_READONLY_URL`, `DATABASE_WRITE_URL` (admin only).

## Testing

See [Testing](./docs/testing.md) for full requirements, quality standards, and pre-commit checklist. Tests are **mandatory**, and missing or low-quality tests are 🔴 BLOCKING on PR review. Easter egg features are the exception (see the top of this file).

## Analytics Requirement

All interactive elements should have `track()` from `@/lib/analytics/analytics` (autocapture provides baseline coverage).

**Convention**: `[section]_[action]` — e.g., `latency_zoom_reset`, `calculator_bar_selected`, `tab_changed`

## Tab Structure

`packages/app/src/lib/routing/dashboard-routes.ts` is the single dashboard route registry. `TabNav`, `DashboardShell`, metadata, i18n, share URLs, and the sitemap derive from it, so do not add a second route array.

## Unofficial Run Support — Mandatory for Inference / Evaluation Features

Any new feature that operates on inference or evaluation chart data **must** also work for unofficial run overlays — not just the official run rendering path. The overlay path is a separate code branch (`overlayData`, `processedOverlayData`, `overlayRooflines`, `activeOverlayHwTypes`, `overlayRunColor`/`overlayRunIndex` from `@/lib/charts/overlay-run-style`, `useUnofficialRun()` from `@/providers/unofficial-run-provider`) that is easy to forget — features that only handle the official path silently degrade for users who load an unofficial run via `?unofficialrun=…`.

When adding a chart feature (toggle, label, overlay, filter, export, share-link param, tooltip enrichment, …):

1. Implement it for both official and overlay data paths. Use `overlayRunColor(runIndex)` for overlay strokes / labels so they match the legend swatches; do **not** reuse the hw-derived color helper (`getCssColor(resolveColor(hw))`) for overlay items.
2. Respect overlay visibility filters: `activeOverlayHwTypes` (hw toggles) and any per-run dismissal in `unofficialRunInfos`. Don't draw overlay items the user has hidden.
3. Verify it manually with an unofficial run loaded — paste a `?unofficialrun=<github-actions-run-id>` URL and confirm the new feature renders for overlay rooflines / points / rows, animates with zoom, and survives a per-run dismiss.
4. Add at least one E2E or unit test that exercises the overlay path. The mock helper `createMockUnofficialRunContext` (cypress/support/mock-data.ts) and the `cypress/e2e/inference-chart.cy.ts` overlay setup are good starting points.
5. Note overlay support explicitly in the PR description so reviewers can verify it ("works for both official runs and `?unofficialrun=` overlays — verified at <preview-url>").

If the feature genuinely cannot apply to overlays (e.g., it depends on data only ingested for official runs), say so explicitly in the PR description. Default to "must support overlays."

## Chinese Website Pages (/zh) — Mandatory for All Indexable Surfaces

The site ships a hand-authored Simplified Chinese sibling for every indexable page under the `/zh` route prefix (`/` ↔ `/zh`, `/about` ↔ `/zh/about`, `/blog/<slug>` ↔ `/zh/blog/<slug>`, …) so the site is crawled and indexed in Chinese as well as English. There is no i18n framework — each `/zh` page is a real page that reuses the shared helpers in `packages/app/src/lib/i18n/i18n.ts` (`zhAlternates`, `enAlternates`, `ZH_OG_LOCALE`, `ZH_MIRRORED_ROUTES`) and `src/lib/routing/tab-meta-zh.ts`. The translation quality bar above applies to all site content.

**Every new indexable page, dashboard tab, or blog post MUST ship its Chinese version in the same PR:**

1. **New page** → create `packages/app/src/app/zh/<route>/page.tsx` with fully translated content and metadata. Metadata: `alternates: zhAlternates('<en-path>')` plus `openGraph.locale: ZH_OG_LOCALE`. Switch the English page's `alternates` to `enAlternates('<en-path>')` so both sides carry bidirectional hreflang. Register non-dashboard routes in `ZH_MIRRORED_ROUTES` (`src/lib/i18n/i18n.ts`) so the header nav and EN↔中文 toggle link to them, and add them to the sitemap via `localizedPair()`.
2. **New dashboard tab** → add one entry to `src/lib/routing/dashboard-routes.ts`, then add exact entries to `TAB_META_ZH`, `TAB_INTRO_ZH`, and `TAB_LABELS_ZH` in `src/lib/routing/tab-meta-zh.ts`. Create `src/app/zh/(dashboard)/<tab>/page.tsx` mirroring the English page with `tabMetadataZh('<tab>')` and a `<ZhTabIntro tab="<tab>" />` block above the chart; the registry automatically supplies `/zh` route matching and indexable sitemap entries. The chart's own UI strings must follow rule 5. Registry and metadata tests enforce route parity and dictionary completeness.
3. **New blog post** → the translation `packages/app/content/blog/zh/<same-filename>.mdx` is REQUIRED in the same PR. Translate frontmatter `title`/`subtitle` and the body; keep `date`, `publishDate`, `modifiedDate`, `tags`, and the filename/slug identical (English and Chinese posts pair by filename; visibility gating always follows the English post's `publishDate`). Rewrite internal `/blog/<slug>` links to `/zh/blog/<slug>`; never alter numbers, code blocks, or `<Figure>`/`<JsonLd>` structure. The `/zh/blog` listing, hreflang, and sitemap pick the file up automatically.
4. **Editing an existing English page or post** → update its Chinese sibling in the same PR. Omitting the required Chinese sibling update is a 🔴 BLOCKING review issue. Fidelity or wording issues inside an updated Chinese sibling follow the advisory workflow below; serious findings require Chinese maintainer confirmation.
5. **ALL user-visible UI strings MUST have a Chinese equivalent**, with no carve-outs for "chart internals" or "option labels". This includes: headers/footers, card titles/descriptions, control and filter labels, buttons, toggles (Log Scale, Optimal Only, …), nudges, dropdown OPTION display names (Y-axis metric names, token types, scale modes), searchable-select placeholders ("Search…"), table column headers and action buttons ("Prompts"), modal/drawer chrome, legend footnotes, and empty/loading/error messages. Mechanism: client components call `useLocale()` (`src/lib/i18n/use-locale.ts`) and read from a component-local `STRINGS = { en, zh }` dict; server components take an optional `locale` prop passed from the /zh page; registry-defined display names (e.g. `METRIC_REGISTRY` entries) carry a `labelZh` field resolved through a locale-aware label helper at render time. The `en` values must keep the exact original strings so English pages stay byte-identical.
6. **What stays English**: brand/product names, hardware SKUs, model/framework/precision names, units (tok/s/user, GB/s, $/M tok), code identifiers and flags — per the translation quality bar — plus established English technical terms and phrases that Chinese ML infrastructure engineers normally use in English, as documented contextually in `docs/chinese-copy.md` (`warmup`, `seed`, and `offload` are non-exhaustive examples), and DB-stored _content_ (benchmark rows, dataset conversation text, run logs), which is data, not UI.
7. **Compare slug narrative sync**: the per-slug compare pages are mirrored at `/zh/compare/[slug]` and `/zh/compare-per-dollar/[slug]`; their Chinese prose templates live in `src/lib/compare/compare-ssr-zh.ts`, a 1:1 port of the English templates in `compare-ssr.ts`. The variant compare pages (`/zh/compare-precision/[slug]` and `/zh/compare-spec-decode/[slug]`) have their Chinese templates in `src/lib/compare/compare-variant-ssr-zh.ts`, porting `compare-variant-ssr.ts`. Any PR that changes the English narrative templates MUST update the zh port in the same commit.
8. **Every route gets a /zh sibling, including hidden or feature-gated ones** (`/agentx`, `/ai-chart`, `/current-inferencex-image`, `/feedback`, agentic detail pages). Noindex routes keep their noindex on both sides. The only exceptions are `feed.xml` and `llms.txt` (single-language machine feeds) plus per-post OG images. Chinese posts reuse the English post's OG image because the renderer font has no CJK glyphs.

> **Claude reviews every changed user-visible Chinese string, but the Chinese maintainer makes the final decision.** Load `review-zh-copy` before opening or reviewing any PR that touches user-visible Chinese text, including refactors whose filenames do not contain `zh`. Its findings are advisory and never block another contributor's merge. [docs/chinese-copy.md](./docs/chinese-copy.md) defines the review gates, when to mention `@edwingao28`, and what the objective CI guard (`packages/app/src/lib/i18n/zh-objective-guard.test.ts`) does and does not check.

## Chart Interpolation — TS and Python Helpers MUST Stay in Sync

The blog-writing workflow (`.claude/skills/write-inferencex-blog/`) ships a Python port of the chart's interpolation algorithm at `.claude/skills/write-inferencex-blog/iso_interactivity.py`. It exists so iso-interactivity tables in blog posts produce **exactly the same numbers** readers see when they hover the rendered chart. Linear-interpolation shell scripts will produce visibly different values — Cursor Bugbot has flagged this on prior posts.

The Python helper is a 1:1 port of these three TypeScript functions:

- `paretoFrontUpperLeft` — `packages/app/src/components/calculator/interpolation.ts`
- `monotoneSlopes` (Steffen 1990, matches `d3.curveMonotoneX`) — same file
- `hermiteInterpolate` — same file

Plus the wrapper `interpolateMetricAtInteractivity` in `packages/app/src/components/inference/hooks/interpolated-trend-core.ts` which composes them with the "no extrapolation → return null" rule.

Plus `recoverReciprocalNumerator` in `interpolation.ts`, which decides whether a metric is splined directly or derived from the interpolated throughput. $/M tok and J/token are a per-chip constant over a throughput, so independently splining the metric breaks that identity between knots; both TS and Python spline the throughput and re-derive instead. See `docs/tco-calculator.md` for the reproducible measurement.

**Rule: any PR that changes any of those four TypeScript functions MUST also update `.claude/skills/write-inferencex-blog/iso_interactivity.py` in the same commit.** Drift between the TS and Python implementations means the blog tables will silently diverge from the live chart on the very next post — readers will see one number in the table and a different one in the chart they click through to. This includes:

- Changing the Pareto frontier definition (upper-left → lower-left, or adding tie-breaking rules)
- Switching from Steffen's monotone slopes to a different spline construction (Fritsch-Carlson, natural cubic, etc.)
- Loosening or tightening the extrapolation rule (currently: return `null` outside `[min x, max x]`)
- Changing which metrics are derived from throughput rather than splined, or the tolerance that decides whether the data obeys `metric x throughput = constant`
- Adjusting the Y-clamp behavior that prevents spline overshoot

The Python file has a header comment explaining the pipeline and a `_cli()` entrypoint for stdin/stdout JSON usage. When you update it, keep the structure 1:1 with the TS so future readers can diff the two files line by line. Run the helper against a known dataset and confirm the outputs match what the chart renders before merging.

## Power Model — TS Port and Upstream Python MUST Stay in Sync

`packages/app/src/lib/power/power_model/` is a file-for-file TypeScript port of the InferenceX [`power_model`](https://github.com/SemiAnalysisAI/InferenceX/tree/main/power_model) package (`power_model/src/power_model`): one `.ts` per `.py`, the same directory tree, and the same class, field and method names. `power-model.manifest.json` records the pinned upstream merge commit and every upstream module; `power-model.parity.json` holds that revision's own outputs for the catalog grid plus seeded random inputs. `power-model-parity.test.ts` fails on a missing or extra module and on any number outside a relative 1e-12 of the fixture, so the port cannot drift from its pin unnoticed. The dashboard never runs the Python package, so a merged upstream change is invisible to users until the companion app PR lands.

**Rule: every change to either side needs a companion PR on the other side, and each PR body links the other.** A missing companion PR is 🔴 BLOCKING on review in both repositories.

- **Upstream change** (new system or component, profile value, validator, message text, workload state): land the InferenceX `power_model/` PR first. The companion app PR ports the same change with identical identifiers, bumps `REVISION` in `packages/app/scripts/generate-power-model-parity.py` to that merge commit, and regenerates the manifest and fixture with that script (Python 3.12 with pydantic, pointed at an InferenceX clone that contains the commit).
- **Port change that upstream needs too** (a bug found in the port, a missing rejection, a new field): open the InferenceX PR first, then follow the upstream-change route.
- **Port-only change** is allowed only when it brings the port closer to the pinned upstream behaviour and needs no upstream edit, for example matching a pydantic rejection or Python's `%g` rounding. Cite the upstream lines it mirrors, cover the case in `power-model-validation.test.ts` or the parity generator, and keep the regenerated fixture byte-stable apart from the cases you added.
- Never hand-edit `power-model.parity.json` or `power-model.manifest.json`; regenerate them.

## Model Parameter Counts

Total / active parameter counts live in `MODEL_ARCHITECTURES` (`packages/app/src/lib/catalog/model-architectures.ts`). Verify against the HF model card before adding a model or changing `MODEL_CONFIG` labels in `packages/app/src/lib/catalog/data-mappings.ts` or blog/docs prose. Point releases (e.g. K2 → K2.5, GLM-4.5 → GLM-5) often keep or change sizes in non-obvious ways.

**Common mislabel traps** (have all bitten this repo at least once — do not repeat):

- **DeepSeek-V4.1-Flash is 552B, and its active count is two numbers.** The
  Causal Encoder-Decoder split means 8B activates during prefill and 16B during
  decode — quoting a single "active" figure loses that. The 196B Engram
  conditional-memory table is excluded from the 552B backbone total: it is
  sparsely accessed by token lookup, not resident per-token compute, so it is
  treated like a separate MTP head rather than like Qwen3.8's n-gram embedding
  table (which IS counted). Hugging Face safetensors metadata says 485B, which
  matches neither figure. Do not fold it into the `dsv4` bucket — V4.1-Flash is
  a different architecture (CED + CSA2), not a V4-Pro point release.
- **Qwen3.8-Flash-Next is 176B, not 125B.** The model card leads with "125B with 6B activated", but that is the main model only; the 51B n-gram embedding table brings the total to 176B. The separate 4B MTP head sits outside both figures. It is a Qwen4-architecture preview (GatedDeltaNet + Qwen Sparse Attention, 512 experts, 10 routed + 1 shared), not a Qwen3.5 point release, so it gets its own DB bucket.
- **GLM-5 ≠ 355B.** 355B is GLM-4.5. GLM-5 jumped to 744B / 40B active (256-expert MoE with DSA).
- **MiniMax-M2.5/M2.7 ≠ 456B.** 456B is the older MiniMax-Text-01 / M1 (32 large experts). The M2 series is a different architecture: 230B / 10B active, 256 small experts.
- **DeepSeek-R1 is 671B, not 685B.** HF metadata shows 685B because the bundled MTP head adds ~14B; the core MoE is 671B / 37B active.
- **Kimi K2.5, K2.6, and K2.7-Code are post-training refinements**, not new pre-trained sizes. Same 1T / 32B / 384-expert backbone as the original K2. K2.7-Code is a coding-focused refinement of the same backbone.

## Common Development Tasks

### Add/modify a metric

1. Register the field, bilingual labels/titles, polarity, and custom-source metadata in `src/components/inference/metric-registry.ts` (`METRIC_REGISTRY`).
2. Add or reuse the derived field in `buildDerivedChartFields` (`src/lib/charts/chart-utils.ts`) and the corresponding optional `InferenceData` field. Historical trends request the same selective builder; do not duplicate formulas.
3. Add the metric to `METRIC_CONTROL_GROUPS` when it belongs in a selector group. Chart definitions and metric key types derive from the registry.
4. Add subtitle/disclaimer copy in `ChartDisplay.tsx` if the metric depends on assumed constants.
5. Add the disaggregated-config caveat banner for per-GPU or per-MW metrics.
6. Verify both official rows and `?unofficialrun=` overlays, including clipping, CSV/table behavior where applicable, zoom, labels, and Chinese UI.

### Add a new blog post

Create `packages/app/content/blog/<slug>.mdx` and its required Simplified Chinese translation at `packages/app/content/blog/zh/<slug>.mdx` in the same PR (see [Chinese Website Pages](#chinese-website-pages-zh--mandatory-for-all-indexable-surfaces)). Frontmatter and authoring rules are in [Blog](./docs/blog.md). A post without `publishDate` stays hidden in production. No code changes are needed, since the blog list, sitemap, RSS feed, llms.txt, and OG image pick up the post automatically.

### Add a hardware results page

Create `packages/app/content/hardware/<slug>.mdx` and its Chinese sibling `packages/app/content/hardware/zh/<slug>.mdx` in the same PR. The frontmatter schema is in [Blog](./docs/blog.md#hardware-results-pages). The `/hardware` index, sitemap, llms.txt, llms-full.txt, and OG image pick the page up automatically; the RSS feed stays blog-only.

### Write or update a whitepaper

Load `.claude/skills/write-inferencex-whitepaper/` first. It holds the numbers workflow, copy rules, the PDF/chart pipeline, and the registry checklist for `src/lib/content/whitepapers.ts`.

### Add a new model or GPU

**First ask for the PR / GitHub Actions run URL** — see [Adding Entities](./docs/adding-entities.md) for the full workflow. Never ask other questions before getting the URL.

### Adding a new tab

1. Add the canonical route entry to `packages/app/src/lib/routing/dashboard-routes.ts`, including navigation group, indexability, provider capabilities, locale mirroring, and share scopes.
2. Add explicit English metadata in `src/lib/routing/tab-meta.ts` and Chinese metadata, intro, and label entries in `src/lib/routing/tab-meta-zh.ts`.
3. Create the English and Chinese App Router pages. `dashboard-routes.test.ts` enforces structural parity.
4. Add the tab content and any section-specific provider only when the route actually needs one; declare dashboard-wide provider needs in the registry.
5. Use `ChartLegend` with `variant="sidebar"`, sorted by `HW_REGISTRY` sort order, default expanded.
6. Track interactive actions with the `{tabname}_` analytics prefix.

### Bumping dependencies

Workflow for a periodic dep bump. Branch: `chore/bump-deps-YYYY-MM-DD`. Commit each step separately so failures are easy to bisect.

1. **Bump versions**: `bun update --interactive --recursive`. Review every proposed update across workspaces. Press `l` to select the latest version when an update must cross the declared semver range.
2. **Resolve install errors**: follow Bun's reported remediation and keep package-manager settings in `bunfig.toml` only when the documented configuration requires them.
3. **Audit security**: `bun audit` checks the installed packages recorded in `bun.lock`. For each finding, update the affected dependency with `bun update` or `bun update --latest`, then rerun the audit. Do not suppress an advisory without a documented reason.
4. **Fix lint/format**: `bun run lint:fix && bun run fmt:fix`. New rules from oxlint version bumps may not have autofixers (e.g. `unicorn/no-negated-condition`), so fix those manually. For mechanical bulk changes, delegate to a subagent and verify with `bun run typecheck`.
5. **Final check**: `bun run lint && bun run fmt && bun run typecheck && bun run security` all pass.
