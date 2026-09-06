---
name: write-inferencex-whitepaper
description: Produce an InferenceX whitepaper end to end - the numbers, the executive-summary PDF in the SemiAnalysis house style, the dashboard-matched figures, the transparent hardware render, and the /whitepaper/[slug] landing page entry in the registry. Use when asked to write, scaffold, redesign, or update a whitepaper, an executive summary, a research paper landing page, or a /whitepaper route.
---

# Writing an InferenceX whitepaper

A whitepaper is a short research paper (cover + two pages) that anchors one headline economic claim to the live benchmark, and a landing page at `/whitepaper/<slug>` that presents the same claim with three KPI tiles, two figure cards, the method, the assumptions, and a PDF download. The first paper, `amd-mi355x-32b-revenue-per-gigawatt-kimi-k3`, is the reference for every rule below; open it before starting.

Everything is driven by two sources of truth:

| Artifact                                                         | Source of truth                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Landing page, index card, sitemap, `llms.txt`, JSON-LD, metadata | one entry in `packages/app/src/lib/whitepapers.ts` (`WHITEPAPERS`)              |
| PDF cover, pages, charts                                         | one spec JSON consumed by `pipeline/` (example: `examples/mi355x-kimi-k3.json`) |

Both carry the same numbers, so compute the numbers once, write them to the spec, and copy them into the registry from there.

## Step 0: What the user must supply

Ask for whichever of these are missing; do not invent them.

1. The claim: a headline number and the scenario it holds under (model, SKU, framework, operating point). Example: "MI355X on Kimi K3 2.8T can generate up to $32B of revenue per GW-year at P90 45 tok/s/user".
2. The scope boundaries. The reference paper was vLLM only, MI355X only, no vendor-vs-vendor and no framework-vs-framework comparison. Respect whatever boundary the user sets; do not add a competitor bar "for context".
3. Cost profiles. The estimator's cost tiers (Owning Hyperscaler, Neocloud, and the SKU's TCO $/chip/hr) or a Custom $/GPU/hr with its provenance (e.g. "August 2026 3-year MI355X rental pricing, $3.00"). Two scenarios fit the fixed page plan; more need a layout change (see Pipeline).
4. A hardware render for the cover and hero, ideally a clean product shot on white (2560x1440 or larger). `pipeline/cutout.py` makes it transparent.
5. Whether disclosures apply. Default: none, and no "commissioned by" line. Authors are always `SemiAnalysis InferenceX Team` (`WHITEPAPER_AUTHORS`), never an individual.

## Step 1: Compute and verify the numbers

Reproduce the number the estimator shows at `/profit-estimator-per-gigawatt`; the paper must match what a reader sees when they open the dashboard link.

1. Pull the AgentX rows for the exact configuration with the `inferencex-data` skill (latest run per config, correct ISL/OSL/trace, P90 interactivity, tok/s/GPU, input/output split, cache hit rate, avg power).
2. Interpolate the operating point on the upper-left Pareto frontier with the Steffen monotone cubic Hermite spline, never linear. Use `.claude/skills/write-inferencex-blog/iso_interactivity.py`; it is the Python port of `packages/app/src/components/calculator/profit-estimator.ts` and the chart code, and it refuses to extrapolate.
3. Apply the estimator formulas (`profit-estimator.ts`):
   - GPU-hours per GW-year = 1,000,000 kW / all-in kW per GPU x 8,760 h (`gpuHoursPerGwYear`). All-in kW comes from the TCO model (2.09 kW for MI355X), not the board TDP.
   - Gross $/GPU/hr = tok/s/GPU x 3,600 x blended $/M tok, where the blended price weights input share, cache hit rate (cached input billed at the cached price) and output share at the interpolated point.
   - Revenue = gross $/GPU/hr x GPU-hours x utilization (default 60%, `DEFAULT_UTILIZATION_PCT`).
   - Compute expense = cost tier $/GPU/hr x GPU-hours (every provisioned hour, busy or idle).
   - License fee = revenue x 30% (`DEFAULT_LAB_CUT_PCT`).
   - Profit = revenue - compute - license fee; margin = profit / revenue; per chip-hour values divide by GPU-hours.
4. Token prices come from the model's public OpenRouter page at the data date; record input, cached input, and output per million tokens and the URL.
5. Sanity checks before writing a word: recompute revenue per GW-year in a fresh Python shell from tok/s/GPU, blended price, GPU count, and utilization; confirm the headline rounds the same way everywhere ($32.6B in body copy, "$32B" only in the title); compute the break-even utilization for each cost profile (compute / (revenue at 100% x 0.7)) because reviewers ask.
6. Save every derived value to the spec JSON (`operating_point`, `scenarios`). Body copy quotes those fields; no number appears in prose that is not in the spec or the registry.

Common mistakes: using board TDP instead of all-in kW; forgetting that cached input is billed at the cached price; quoting $/M tok at 100% utilization then revenue at 60%; stating the rental scenario's compute as "double" when the tiers are not exactly 2x.

## Step 2: Write the copy

Length discipline is the main quality lever. The PDF is an executive summary: one Summary paragraph, one bold callout, two figures, four method bullets, one source line. The landing page carries the longer material (abstract, five key findings, seven method steps, assumptions table).

Prose rules (load `ai-isms-writing-style` if available and run its pre-send check):

- Lead with the number and the condition it holds under. "$32.6B of revenue per GW-year at P90 45 tok/s/user and 60% utilization."
- Name the mechanism behind each finding (cache hit rate, input share, utilization break-even), not its importance.
- No "delve", "robust", "seamless", "landscape", "leverage", "underscore", "pivotal", no "not just X but Y", no em-dash chains, no closing recap.
- Do not compare against vendors, frameworks, or firms the user excluded. Do not name any third-party research firm.
- Titles: `<Vendor> <SKU> <Model> Can Generate Up to $<N>B of Revenue per GigaWatt per Year`. No "White Paper" in the title. Subtitle: `Executive Summary - <Topic> Analysis` (plain hyphen, not an em dash). Cover line: `Published by SemiAnalysis InferenceX Team - <Month YYYY>`.
- Figure card title mirrors the estimator title verbatim: `<Model> Agentic Revenue & Profit Estimates per GigaWatt Per Year at P90 <N> tok/s/user Interactivity`. Cost tier strings mirror the estimator's `Cost Tier` values (`Owning Hyperscaler`, `Custom $/GPU/hr (...)`).
- Captions state what changed between figures and the resulting profit per chip-hour.
- Chinese copy is a real translation of every field (title, subtitle, description, abstract, findings, KPI labels and captions, comparison, method, assumptions, sources, figure captions, alt text). Load `review-zh-copy` before the PR.

## Step 3: Build the assets with `pipeline/`

Everything lives in this skill directory. The pipeline reproduces the shipped PDF byte-for-text from `examples/mi355x-kimi-k3.json`, so copy that file as the starting spec and edit the fields.

```bash
SKILL=.claude/skills/write-inferencex-whitepaper
OUT=/tmp/wp-<slug>
python3 $SKILL/pipeline/cutout.py render.png $OUT/<sku>-transparent.png   # prints WxH for the registry
python3 $SKILL/pipeline/make_charts.py $SKILL/examples/<slug>.json $OUT  # chart-<id>-{light,dark}.{svg,png}
python3 $SKILL/pipeline/build_pdf.py   $SKILL/examples/<slug>.json $OUT  # paper.html
NODE_PATH=$(npm root -g) node $SKILL/pipeline/render_pdf.js $OUT         # paper.pdf + overflow report
pdftoppm -r 60 -png $OUT/paper.pdf $OUT/pg                                # look at every page
```

Dependencies: Python 3 with matplotlib, numpy, Pillow, scipy; Playwright (Chromium) on the global npm path; poppler for `pdftoppm`. DM Sans TTFs and the OFL notice are in `pipeline/fonts/`.

Spec fields (`examples/mi355x-kimi-k3.json`):

- `title`, `subtitle`, `publisher_line`, `meta_line`: cover and page-1 header strings.
- `cover.hardware_image`: transparent PNG, path relative to the spec file. Placed at right 0.45in / top 3.45in / width 3.7in with a drop shadow, no caption.
- `chart`: `title`, `x_label` (`<SKU> (<framework>)`), `sku`, `y_max`/`y_step` (billions; choose so the tallest bar sits at roughly 70% of the axis), `utilization`, `license_fee`, `updated`, `source`, `tco_source_title`/`tco_source_href`, `selling_prices`, `model_logo_svg` (from `packages/app/public/logos/`), `vendor_mark` (PNG mark drawn above the bar; `pipeline/assets/amd_mark.png` ships, add an `nvidia_mark.png` beside it for NVIDIA papers).
- `scenarios[2]`: `id`, `cost_tier`, `tco_badge` (the estimator pill text after the SKU, `1.5` or `3`), `cost_per_gpu_hr`, `revenue`, `compute`, `license`, `profit`, `margin`, `profit_per_chip_hr`, `kpi_profit_note`, `caption` (HTML allowed).
- `kpi_notes.revenue`, `kpi_notes.margin`: tile captions shared by both scenarios.
- `summary[]` (HTML paragraphs), `callout`, `method_heading`, `method[]` (HTML list items), `sources[]` (`label`, `href`), `footnote`.

House style the pipeline enforces (from the ClusterMAX GPU Cloud Rentals paper):

- Letter pages, zero print margin, content box 0.75in sides, 1.0in top, 0.95in bottom.
- Cover: black, circuit mosaic band across the top 5.15in (`assets/cover_mosaic.png`), hardware render right, title block at 6.2in, 25pt bold title with 16pt regular subtitle.
- Content pages: circuit trace artwork top-right with the SemiAnalysis badge (`assets/trace.png`, `assets/badge.png`), the same trace mirrored bottom-left, "Page N" bottom-right.
- Palette: near-black ink on white; tiles and figure cards on `#eaebec` (the site's light `--background`); KPI values and the profit segment in the estimator red `#ba534b`; no yellow anywhere in the PDF.
- Charts: 7.0x2.7in, one stacked bar (compute `#dfc6c4`, license `#d09792`, profit `#ba534b`, edge `#c26962`, width 1.08 on xlim(-1,1)), grid `#d9dce0`, vendor mark above the total, "% margin" under the total, two-line y label. The dark variant swaps background/grid/ink to the site dark tokens and turns the vendor mark white; the two pink segments keep dark labels in both themes.

The render script prints `{pageH, bodyH, bodyBox}` per page. `bodyH` must equal `bodyBox` (868.8) on the content pages; a larger `bodyH` means clipped text. Cut copy first, then shorten a caption, then reduce chart height. Do not shrink type below the sizes in `build_pdf.py`.

Review the rasterised pages before shipping: title wraps, KPI tiles aligned, chart labels not colliding (segment labels switch to one line automatically under 0.42in), header trace not overlapping the doc title, footer trace not under the page number.

## Step 4: Install the assets in the app

```
packages/app/public/whitepaper/<slug>/
  pdf/SemiAnalysis-InferenceX-Executive-Summary_<Topic>.pdf     paper.pdf
  cover.webp                                                     page 1 of the PDF at 150 dpi, 1275x1650
  <sku>-transparent.png                                          cutout output
  figure-1-<scenario>-light.png / -dark.png                      chart-<id>-{light,dark}.png (2100x810)
  figure-2-<scenario>-light.png / -dark.png
```

```bash
pdftoppm -r 150 -f 1 -l 1 -png $OUT/paper.pdf $OUT/cover && python3 -c "from PIL import Image; Image.open('$OUT/cover-1.png').save('cover.webp', quality=88)"
```

Delete any asset a previous revision no longer references; `whitepapers.test.ts` checks that every path under the slug exists.

## Step 5: Register the paper

Add one object to `WHITEPAPERS` in `packages/app/src/lib/whitepapers.ts`. The type doc comments describe every field; the important ones:

- `slug` (URL-safe, unique), `publishedDate`, `dataDate` (benchmark snapshot), `pageCount` (content pages, cover excluded), `tags`.
- `pdfPath`, `coverImagePath` (also `heroImagePath`; used by the sitemap and JSON-LD image), `chipImagePath` with `chipImageWidth`/`chipImageHeight` from `cutout.py`.
- `figures[]`: `id`, `srcLight`, `srcDark`, `width`, `height`, `tcoBadge` (same string as the PDF pill).
- `chart`: `modelLogoPath`, `utilization`, `licenseFee`, `source`, `tcoSourceTitle`, `tcoSourceHref`, `sellingPrices` {input, cached, output, source}.
- `en` and `zh` (`WhitepaperCopy`): `typeLabel`, `title`, `subtitle`, `description` (meta, under 160 chars), `abstract`, `keyFindings[5]`, `kpis[3]` (value, label, caption, icon `dollar`|`trending`|`percent`), `comparison` (secondary scenario lead + three items), `methodSteps`, `assumptions[]`, `sources[]`, `authors` (`WHITEPAPER_AUTHORS` / `WHITEPAPER_AUTHORS_ZH`), `figureTitle`, `figures[]` copy (`costTier`, `caption`, `alt`), `coverAlt`, `chipAlt`.

The registry feeds everything else automatically: `/whitepaper` index cards, `/whitepaper/[slug]` and `/zh/whitepaper/[slug]` (static params), sitemap entries with the cover image, `llms.txt`, Report + Breadcrumb + Collection JSON-LD, and metadata. `/whitepaper` is already in `ZH_MIRRORED_ROUTES` and the footer; nothing to add there for a new paper.

Landing page anatomy (`packages/app/src/components/whitepaper/`), so you know what each field renders:

- `whitepaper-detail-content.tsx`: dark hero (also in light theme) with CSS grid texture, back link, `typeLabel` eyebrow, title, subtitle, meta row (authors, date, pages, tags), `WhitepaperPdfButton placement="hero"` + `WhitepaperEstimatorLink`, and the transparent hardware render overlaid on the right (hidden below `md`); three KPI tiles + comparison bar; two figure cards reproducing the estimator header (model mark, `figureTitle`, cost tier, utilization, license fee, updated, source, TCO badge pill, TCO source link, selling prices) with the light/dark PNG swap; two-column body (abstract, key findings as numbered cards, method as numbered list, assumptions table, sources) with a sticky sidebar (cover thumbnail + `placement="sidebar"` PDF button + on-this-page links) and a closing PDF card.
- `whitepaper-index-content.tsx`: eyebrow, H1, description, one card per paper (cover thumbnail, type label, title, subtitle, date, pages, three KPI values, tags, read + PDF links).
- `whitepaper-links.tsx`: every outbound click tracks a `whitepaper_*` event (`pdf_download_clicked` with `placement`, `estimator_clicked`, `back_clicked`, `source_clicked`, `card_clicked`, `read_clicked`). Use these components for links; do not add bare anchors.
- Page chrome strings (eyebrows, section headings, button labels) live in `WHITEPAPER_COPY[locale]`; per-paper strings live in the registry entry. Never hardcode a number in JSX.

Design rules for any change to these components: site tokens only (`--background`, `--card`, `--border`, `--primary`), plus the estimator red for KPI values; Heading/Eyebrow/Card/Badge primitives from `components/ui`; hero render hidden below `md`; screenshot dark and light at 1440 and 390 with Playwright and inspect for overflow, clipped text, and low contrast before committing.

## Step 6: Tests and checks

Update or extend, never delete:

- `packages/app/src/lib/whitepapers.test.ts`: unique slugs, asset paths exist, en/zh parity (same array lengths for findings, kpis, method, assumptions, sources, figures), headline numbers for the new paper, metadata and JSON-LD per locale.
- `packages/app/src/components/whitepaper/whitepaper-content.test.tsx`: KPI tiles, figure cards, sidebar, index card render from the registry.
- `packages/app/src/app/sitemap.test.ts` and `src/lib/i18n.test.ts` if a route or mirrored path changes.

```bash
PATH=$HOME/.bun/bin:$PATH bun run lint && bun run check:typography && bunx oxfmt --check
cd packages/app && bunx vitest run src/lib/whitepapers.test.ts src/components/whitepaper src/app/sitemap.test.ts src/lib/i18n.test.ts
bunx tsc --noEmit -p tsconfig.json 2>&1 | rg -i whitepaper   # must print nothing
```

The repo formats with oxfmt, not prettier. Commit messages are bilingual (English line, then a 中文 paragraph). PR descriptions describe the paper, the pages, the assets, and the checks; they never name third-party firms or link to competitor reports, and neither does any commit or code comment.

## Checklist before opening the PR

- Headline number matches `/profit-estimator-per-gigawatt` for the same model, SKU, framework, interactivity, utilization, and cost tier.
- Title without "White Paper", subtitle in the `Executive Summary - ... Analysis` form, publisher line with month and year, authors `SemiAnalysis InferenceX Team`.
- PDF: cover + two pages, `bodyH == bodyBox` on both content pages, two figures only, three KPI tiles per page, no yellow, header/footer artwork positioned as in the reference.
- Landing page: hero render present above `md`, KPI values equal the PDF tiles, both figure cards swap light/dark PNGs, PDF button in hero, sidebar, and closing card.
- Registry: en and zh complete, `chipImageWidth`/`Height` match the PNG, every asset path resolves, old assets removed.
- Copy passed the AI-isms pre-send check; zh copy passed `review-zh-copy`.
- No disclosures or "commissioned by" text unless the user asked for them.
