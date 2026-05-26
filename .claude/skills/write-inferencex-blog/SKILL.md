---
name: write-inferencex-blog
description: Author an InferenceX benchmark blog post in MDX. Codifies the structure, numeric-verification workflow, frontmatter, MDX components, dashboard links, and FAQ JSON-LD pattern used by published InferenceX posts. Use when asked to draft, write, or scaffold a new blog post comparing GPUs/frameworks/precisions/models, or to write up a specific PR-driven performance change.
---

# Writing an InferenceX blog post

InferenceX blog posts are short, evidence-dense technical writeups that anchor a single headline number (e.g. "1.41x cheaper", "3.13x throughput", "7.7x peak throughput in 25 days") to (a) a Pareto chart from the live dashboard, (b) verified per-concurrency tables, and (c) the upstream PR that drove the change.

Posts live at `packages/app/content/blog/{slug}.mdx`. Images live at `packages/app/public/images/{slug}/`. The slug matches the MDX filename without `.mdx`.

## Step 0: Get the source of truth from the user

Before writing anything, ask the user for whichever of these they have:

1. **A chart image** from the InferenceX dashboard (this is the visual that will ship in the post)
2. **A CSV export** from the dashboard with the underlying rows (this is the authoritative numeric source)
3. **An "instant link" / preset URL** to the chart on `inferencex.semianalysis.com/inference?...` (this becomes both the `DashboardCTA` href and the live-chart link)
4. **The upstream PR** that caused the change (SGLang / vLLM / TRT-LLM)
5. **The InferenceX recipe PR** that wired it into the benchmark loop
6. **Tweet / X post text** if there's a marketing framing they want the lede to echo

If the user gives you only the chart, ask for the CSV — the chart is for the figure, the CSV is for the tables. If they give only the CSV, that becomes source of truth even if a chart later appears.

## Step 1: Verify the numbers

When chart, CSV, and the InferenceX data dump disagree, use this priority:

1. **CSV the user pasted in chat** — they exported it from the dashboard, it matches whatever they saw
2. **Chart image the user shared** — read points off the curves visually; use it only when no CSV is available
3. **InferenceX data dump** (via the `inferencex-data` skill) — useful for sanity-check and for fields not in the CSV (TPOT, run IDs, image tags), but the dump can lag the chart by a week or more

Common gotchas:

- **Workload mismatch**: chart headers can mislead. Verify ISL/OSL from the data itself — 1k/1k and 8k/1k give wildly different `tok/s/GPU` and `$/M tokens` numbers. The blog title, lede, tables, and chart caption must all use the same ISL/OSL.
- **Latest run only**: filter to the highest `run_attempt` per `github_run_id`, then take the latest `date` per `(config_id, conc, isl, osl)`. See the `inferencex-data` skill for the exact filter.
- **Model spec verification**: never invent parameter counts. Always `WebSearch` the model's released specs (total params, active params, expert count, attention type) before writing the architecture paragraph. Cite sources. GLM-5 is _not_ GLM-4.5 — the numbers changed.
- **TCO values**: pull from the [SemiAnalysis AI Cloud TCO Model](https://newsletter.semianalysis.com/p/ai-cloud-economics). Current values (verify if older than a quarter):
  - H100 $1.30, H200 $1.41, B200 $1.95, B300 $2.34, GB200 $2.21, GB300 $2.652
  - MI300X $1.12, MI325X $1.28, MI355X $1.48
- **Cost per million tokens formula**: `$/M tok = TCO_$/GPU/hr * 1e6 / (3600 * tput_per_gpu)`. Equivalently in Python: `cost = tco / (3600 * tput / 1e6)`. Throughput is per-GPU, so GPU count cancels out for aggregated configs.

### Iso-interactivity interpolation — match the chart, not your shell script

The dashboard chart uses a **monotone cubic Hermite spline (Steffen 1990, identical to `d3.curveMonotoneX`)** on the **upper-left Pareto frontier** of (interactivity, throughput). Linear interpolation in a one-off Python REPL will not match what readers see in the chart and will get flagged in review.

**Always use the bundled helper:**

```bash
python3 .claude/skills/write-inferencex-blog/iso_interactivity.py
# stdin:  {"points": [{"interactivity": .., "throughput": .., "cost_per_M": ..}, ...],
#          "target_iv": 18.0, "metric_key": "cost_per_M"}
# stdout: {"value": 0.22}  // or null when target is outside frontier range
```

Or import it as a module from a small wrapper script if you're computing many rows at once.

Rules to follow because the helper enforces them — but you need to interpret them correctly when writing the table:

- **No extrapolation.** When the target interactivity falls outside the frontier's `[min x, max x]`, the helper returns `null`. Render those cells as `_unreachable_` (and the ratio column as `_∞_` if comparing two dates/configs). Do not invent a value. This is the whole reason the chart code returns `null` — the recipe physically can't reach that operating point.
- **Frontier is always built on (interactivity, throughput).** Even when interpolating cost or TPOT or energy, the frontier itself is the upper-left envelope on throughput-vs-interactivity. Other metrics are derived values at frontier knots. This matches `interpolateForGPU` in the chart code: one frontier, many metrics interpolated against it.
- **Multiple recipes (TP=4, TP=8, etc.) for the same hardware go into one points list together.** The Pareto operation collapses them into a single combined frontier, exactly as the chart does when both recipes are toggled on.
- **The Y values are clamped to the frontier's min/max** to prevent cubic-spline overshoot above/below the data. Don't be surprised when the interpolated value sits at a knot value rather than between two knots — that's the spline saying "any value here would overshoot the data."

The canonical source of truth is `packages/app/src/components/calculator/interpolation.ts` (functions `paretoFrontUpperLeft`, `monotoneSlopes`, `hermiteInterpolate`) and `packages/app/src/components/inference/hooks/useInterpolatedTrendData.ts` (function `interpolateMetricAtInteractivity`). If you ever need to change the algorithm, change all three files — the TS pair plus the Python helper — in the same PR. The repository's `AGENTS.md` codifies this as a hard rule.

#### How the Pareto frontier behaves between the knots

The frontier is the set of measured `(interactivity, throughput)` points that are **not dominated** by any other point — a point is dominated if some other point in the dataset has both higher interactivity AND higher throughput. Geometrically, you sort the points by interactivity ascending, walk from left to right, and keep popping the previous point off the stack as long as the new point's throughput is greater or equal. What survives is the upper-left envelope: a staircase of points where as interactivity decreases (moving left), throughput increases (moving up), monotonically. Everything "inside" that envelope was a worse operating point on both axes simultaneously and is discarded — it could never be chosen in production.

The chart then draws a smooth curve **through these surviving knots only**. The curve is a piecewise cubic — between each adjacent pair of frontier knots `(xᵢ, yᵢ)` and `(xᵢ₊₁, yᵢ₊₁)`, the chart draws a Hermite cubic specified by the two endpoint values and two tangent slopes `mᵢ`, `mᵢ₊₁` at each end. The tangents are computed by Steffen's 1990 monotone construction (identical to d3's `curveMonotoneX`), which has one critical property: the cubic between two knots **never overshoots** the throughput values at those knots. If two adjacent knots have throughputs 3,000 and 4,000, the curve between them stays inside `[3,000, 4,000]` — no spurious bumps above 4,000 or dips below 3,000, even if the slopes from neighboring segments would push it that way. This is why simple cubic splines aren't used: they wiggle, and the chart would imply throughput values that the silicon never actually produced.

So when you interpolate at `target_iv = 18`, the helper does this: (1) finds the bracket `[xᵢ, xᵢ₊₁]` containing 18, (2) evaluates the Hermite cubic `h₀₀·yᵢ + h₁₀·hh·mᵢ + h₀₁·yᵢ₊₁ + h₁₁·hh·mᵢ₊₁` at `t = (18 − xᵢ) / (xᵢ₊₁ − xᵢ)`, and (3) clamps the result to the metric's `[min, max]` across the entire frontier as a final safety net against any residual overshoot. If 18 is to the left of the smallest frontier x or to the right of the largest, the helper returns `null` — there is no extrapolation, because the chart code itself draws no curve outside the data range.

What this means for the blog tables: the interpolated values you publish track the **shape of the rendered curve** between knots, not a straight line. At iso-interactivity points that happen to sit very close to a knot, the published number will land very close to that knot's measured value. In the middle of a wide segment, the spline can sit noticeably above or below the linear-interpolation guess — sometimes by 10% or more on steep parts of the curve. That difference is what readers see in the chart, so it's what the table must show.

## Step 2: Slug and image directory

Slug naming follows the pattern of existing posts (see `packages/app/content/blog/*.mdx`):

- `{hardware}-{model}-{framework}-{key-claim-or-number}` — e.g. `mi355x-kimi-k2-5-vllm-aiter-7x-speedup`
- `{framework}-{version}-{hardware}-{model}-{key-claim}` — e.g. `sglang-0-5-6-b200-deepseek-r1-fp4-up-to-1-8x`
- Include a comparator when relevant — e.g. `gb200-nvl72-kimi-k2-5-vllm-wide-ep-3x-vs-b200`

Then `mkdir -p packages/app/public/images/{slug}/` and ask the user to drop `benchmark-light.png` and `benchmark-dark.png` there (or do it yourself if they shared the files).

## Step 3: Frontmatter

```yaml
---
title: 'Punchy headline with the number — under ~75 chars'
subtitle: 'One-sentence explanation of the mechanism, the workload, and the comparator — ~150-200 chars'
date: '2026-MM-DD'
publishDate: '2026-MM-DD'
tags:
  - benchmark
  - gpu
  - inference
  - {model-slug, e.g. glm5, kimi, deepseek}
  - {vendor, e.g. amd, nvidia}
  - {hardware-slug, e.g. mi355x, b200, gb200}
  - {framework, e.g. sglang, vllm, trtllm}
  - {os/runtime, e.g. rocm} (optional)
---
```

Use `date` == `publishDate` == ISO YYYY-MM-DD. The same date appears in the lede ("measured on InferenceX on 2026-MM-DD").

## Step 4: Body structure

Sections, in order:

### Lede (1-2 short paragraphs, no heading)

Lead with the headline number and the workload, both in the first sentence:

> "14 weeks after GLM-5's release, AMD MI355X SGLang FP8 undercuts NVIDIA B200 SGLang FP8 on cost per million tokens across the entire single-node Pareto frontier on the 8k/1k workload. The peak gap is **1.41x at 18 tok/s/user with MTP** ($0.30/M on B200 vs $0.22/M on MI355X — a 40% reduction)..."

Bold the peak ratio in the lede. Second paragraph: name the upstream PRs that made it happen, then end with a short framing line ("Speed is the moat.", "Software is the moat.", etc.) if it fits — don't force it.

### `<DashboardCTA>` immediately after the lede

```mdx
<DashboardCTA href="{the instant link / preset URL}">
  Click to see the full InferenceX dashboard →
</DashboardCTA>
```

Use the preset URL the user provided so clicking lands on the exact comparison view, not the bare dashboard. Format: `https://inferencex.semianalysis.com/inference?g_model=...&i_prec=...&g_rundate=...&g_runid=...&i_active={hw1}_{fw1}%2C{hw2}_{fw2}&i_metric=y_costh&i_linelabel=1`.

### `<Figure>` hero image immediately after the top DashboardCTA

The chart image is the **hero** of the post — it goes right after the top `<DashboardCTA>`, **before** the model / architecture paragraph, so readers see the curves before they read the prose. Do not bury the figure halfway down without one at the top.

```mdx
<Figure
  srcLight="/images/{slug}/benchmark-light.png"
  srcDark="/images/{slug}/benchmark-dark.png"
  alt="Plain-English description of the chart including model, precision, ISL/OSL, both compared SKUs/frameworks, and any toggles (MTP/non-MTP)"
  caption="Short caption. Note any non-obvious labeling convention used on the chart (e.g. 'Labels denote GPU count per config.')."
/>
```

Use the **same `<Figure>` block twice**: once here as the hero (so the chart anchors the post visually before the reader hits the technical prose), and once more directly below the iso-interactivity table further down (so the chart is right next to the data that derives from it, instead of forcing readers to scroll back up). Both `<Figure>` blocks are identical — same `srcLight`/`srcDark`/`alt`/`caption`. The repetition is intentional and matches how readers consume the post.

### Model / architecture paragraph

One paragraph naming the model, vendor, release date (use it to compute "N weeks after release" if it sharpens the cadence framing), total/active parameters, expert count + top-K routing, attention mechanism (MLA, NSA/DSA, GQA, etc.), and context window. **Always WebSearch to verify these numbers** — don't carry over from a prior generation. Cite a source URL inline if the number is non-obvious.

Then a follow-on paragraph that ties the architecture details to _why this PR matters on this hardware_ — e.g. "MI355X's FP8 KV path landed in mid-April, and the resulting decode throughput moved enough that MI355X's lower per-GPU TCO ($1.48/GPU/hr vs B200 at $1.95/GPU/hr per the [SemiAnalysis AI Cloud TCO Model](...)) now compounds into a real cost-per-token advantage instead of being swamped by software gaps."

### `## What Shipped to Make This Happen`

The technical breakdown. For each PR:

- Link with `[{org}/{repo} PR #{n}]({url})`
- Name the author (link their GitHub handle)
- Merge date
- One sentence on what the kernel/feature does
- A bullet or two on the per-hardware fusion strategy (this is what makes the post interesting to engineers — fusion shapes differ per generation, e.g. MI355 vs MI300)
- Activation flags (e.g. `--kv-cache-dtype fp8_e4m3 --nsa-prefill-backend tilelang`)
- Quantitative claims from the PR description (throughput delta, accuracy delta)

If there are multiple PRs (upstream framework + InferenceX recipe), list them in causal order — upstream first, recipe second.

### `## The Numbers`

Intro paragraph: state the workload (ISL/OSL), the disaggregation status (single-node aggregated, or disagg + N prefill / M decode), the measurement date, the cost formula, and the TCO values used.

Then one labeled table per (hardware, framework, spec_method, TP, GPU-count) combination, in this order:

1. Reference recipe being compared _against_ (typically NVIDIA)
2. The headline-winning recipe (typically the AMD config that anchors the cost win)
3. Any additional recipes that fill out the Pareto (e.g. the same vendor's TP=8 arm if TP=4 was the anchor)
4. Non-MTP variants of the above if the post covers both

Table columns: `Conc | tok/s/GPU | tok/s/user | TPOT (ms) | $/M tokens`. Right-align numerics by using markdown column alignment. Show all measured concurrencies, not just the headline one. Numbers come straight from the CSV; round throughput to 1 decimal, TPOT to 2 decimals, cost to 2 decimals.

### `## Iso-Interactivity Cost Comparison`

This is where the headline ratio gets made explicit. Brief intro sentence explaining the interpolation method. Then two tables (MTP and non-MTP) if both are in scope, otherwise one.

Columns: `Interactivity (tok/s/user) | {NVIDIA} $/M tok | {AMD} $/M tok | {NVIDIA} / {AMD}`. Bold the peak-gap row. Show 5-8 rows covering the interesting band — include at least one row where the gap narrows or reverses, so the post stays honest.

Follow with one paragraph explaining _why_ the gap peaks where it does (e.g. "the MI355X 4-GPU TP=4 recipe plateaus at $0.22 while B200 is still climbing"), and one sentence noting where the gap inverts (e.g. "Above 90 tok/s/user the comparison flips marginally back to B200 because there is no MI355X recipe matching B200's TP=8 conc 4 at 100+ tok/s/user."). **Don't paper over the inversion** — call it out.

### Second `<Figure>` + `[Live chart]` link after the iso-interactivity tables

Place the **same** `<Figure>` block from Step 4 here again, immediately followed by a `[Live chart]({preset URL})` link. The repeat is intentional: readers who scrolled past the hero figure at the top need to see the chart next to the data table that derives from it, not scroll back up.

```mdx
<Figure
  srcLight="/images/{slug}/benchmark-light.png"
  srcDark="/images/{slug}/benchmark-dark.png"
  alt="..."
  caption="..."
/>

[Live chart](https://inferencex.semianalysis.com/inference?...), pre-filtered to {hardware/framework/model/precision}.
```

Same `srcLight`/`srcDark`/`alt`/`caption` as the top placement — copy-paste, do not vary.

### `## What's Next for {SKU/framework} on {Model}` (or similar)

The honest scope-limiting section. Bullet list of what this result _doesn't_ cover yet, each with concrete context:

- **FP4 composability** — link the InferenceX FP4 recipe PR if it exists, note its current state
- **Disaggregation / wide expert parallelism** — link a relevant prior InferenceX post or recipe
- Anything else the headline number leaves on the table

End with one sentence affirming where the result _is_ definitive ("For chat-style serving in the 30-60 tok/s/user band, MI355X SGLang FP8 with MTP is the cheaper per-million-tokens choice today on GLM-5.").

### `## Acknowledgments`

Name the engineers who shipped the upstream + InferenceX changes. Link X handles and GitHub handles. Close with a one-sentence framing if it fits.

### Trailing `<DashboardCTA>`

Repeat the same `DashboardCTA` block. This is the reader's exit ramp into the dashboard.

### `<JsonLd>` FAQ

Five questions covering: (1) the headline cost / throughput ratio, (2) what the upstream PR does, (3) why the gap peaks where it does, (4) does the result hold for the non-MTP / FP4 / alternate variant, (5) what's not yet covered. Numbers in the answers must match the body verbatim. Plain-text only inside the JSON string — no markdown, no emoji, no special quotes.

```mdx
<JsonLd>{`{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {"@type": "Question", "name": "...", "acceptedAnswer": {"@type": "Answer", "text": "..."}},
    ...
  ]
}`}</JsonLd>
```

## Step 5: Draft → browser editor → human review → commit → push → PR

**Do not commit, push, or open a PR on your own.** When the MDX file is written, stop and hand it to the user for review. Wait for explicit approval (e.g. "ship", "looks good, push", "create the PR") before touching git. Reasons:

- Numbers in the post are claims the user will be publicly attached to. They need a chance to spot-check ratios, names, and PR descriptions before the PR notification fires.
- The frontmatter date, slug, image filenames, and dashboard URL are all hard to change once a PR is open and a Vercel preview is generated.
- A blog post is not a code change — it benefits from an editorial pass, not a CI pass.

**Always launch the bundled browser editor for the review pass.** Do not ask the user to read MDX in their IDE — the auto-save split-pane editor in this skill gives them a rendered preview, an editable source pane, and writes changes back to disk automatically. Launch it as soon as the draft is written:

```bash
node .claude/skills/write-inferencex-blog/editor.mjs \
  packages/app/content/blog/{slug}.mdx &
sleep 1 && open http://127.0.0.1:4747/
```

The editor runs as a background Node process on `127.0.0.1:4747`, reads from and writes to the absolute path of the file you pass on argv (no hard-coded paths — `~/`-normalized display only), and auto-saves ~800 ms after the last keystroke. `Cmd+S` forces an immediate save. Tell the user the URL, that edits are auto-saved, and that `git status` will reflect their changes when they're done.

While the user reviews in the browser, you can:

- Run `pnpm lint && pnpm typecheck` against the working tree to catch any MDX errors that would block the pre-commit hook later.
- Save the chart image into `packages/app/public/images/{slug}/benchmark-light.png` (and `benchmark-dark.png` if the user provided both) so the `<Figure>` placeholder in the preview shows a real path.

When the user gives the green light, stop the editor process (`TaskStop` if you started it via Bash background, otherwise `kill` the PID listening on 4747), then run the git sequence in one shot:

```bash
git checkout -b blog/{slug} origin/master
git add packages/app/content/blog/{slug}.mdx packages/app/public/images/{slug}/
git commit -m "feat(blog): {title-ish}"
git push -u origin blog/{slug}
gh pr create --title "feat(blog): ..." --body "..."
```

The pre-commit hook runs `oxlint`, `oxfmt`, and `tsc --noEmit`. All three must pass. If lint/format fails, run `pnpm lint:fix && pnpm fmt:fix` and re-commit (don't `--no-verify`).

After the PR opens, expect Cursor Bugbot to flag correctness issues in the prose (numeric overstatement, claims contradicted by tables, wrong attribution). Treat its findings as real review comments — fix them in a follow-up commit, then resolve the threads. Branch protection on master requires resolved review threads before auto-merge fires.

## House style

- Numbers carry the post. Adjectives don't. Avoid "incredible", "massive", "huge", "groundbreaking" — say the number.
- Active voice, present tense for measured results, past tense for shipped PRs.
- "tok/s/user" not "TPS/user" or "tokens per second per user".
- "$/M tokens" or "per million tokens" — pick one and stay consistent.
- "MTP" on first mention can be spelled out as "Multi-Token Prediction speculative decoding"; after that just "MTP".
- For NVIDIA SKUs use the marketing capitalization: B200, GB200 NVL72, H100, H200, B300, GB300, GB300 NVL72.
- For AMD SKUs: MI300X, MI325X, MI355X.
- For frameworks: SGLang, vLLM, TRT-LLM (or TensorRT-LLM in formal contexts), Dynamo TRT-LLM, Dynamo vLLM, Dynamo SGLang. AMD's disagg fork is `mori-sglang`.
- Use em-dashes `—` not double-hyphens.
- Link the upstream PRs and InferenceX recipe PRs every time. Reader wants the receipts.
- Don't apologize for non-coverage in the lede — save it for "What's Next".

## Reference posts — REQUIRED reading before drafting

**Before writing a single word, read every existing post in `packages/app/content/blog/*.mdx`.** This is not optional and not "open when in doubt." The InferenceX voice — the cadence framing, the "speed is the moat" close, the way technical PRs get cited with author handles, the table → iso-interactivity → "What's Next" arc, the willingness to call out where the headline gap inverts — is set by the existing posts. A draft that hasn't absorbed them will read like a generic vendor comparison and get flagged. Use `ls packages/app/content/blog/` to enumerate, then `Read` each MDX in full.

**Two of the existing posts are foundational and must be read heavily** — multiple passes, paying attention to structure and tone, not just skimming for facts:

- **`packages/app/content/blog/inferencex-v2-nvidia-blackwell-vs-amd-vs-hopper.mdx`** — the launch piece for InferenceXv2 (formerly InferenceMAX). Sets the editorial voice for the whole series: the "composability" framing for AMD's gaps, the rack-scale vs single-node distinction, the way TCO and per-GPU economics get woven into the technical discussion, the Acknowledgments style that names individual NVIDIA and AMD engineers by first name, and the "key observations and results" overview that anchors everything in the actual benchmark dataset. Every later post implicitly assumes the reader has seen this one. Match its tone.
- **`packages/app/content/blog/inferencemax-open-source-inference-benchmarking.mdx`** — the origin story for the open-source benchmark. Establishes why InferenceX exists (continuous benchmarking vs point-in-time studies), what "the loop" is (upstream PR → InferenceX recipe → next benchmark run within days), and why "speed is the moat" is the recurring close — software cadence on the same hardware moves the curve more than silicon upgrades on any given quarter. Borrow its framing about why benchmark cadence matters.

After the two foundational posts, the closest structural templates per post type:

- `packages/app/content/blog/mi355x-glm5-fp8-sglang-40-cheaper-than-b200.mdx` — AMD wins on TCO, single-node, MTP + non-MTP, with iso-interactivity tables and honest gap-inversion call-out. Closest template for AMD-vs-NVIDIA single-node cost posts.
- `packages/app/content/blog/mi355x-kimi-k2-5-vllm-aiter-7x-speedup.mdx` — Single-PR speedup story, 25-day cadence, iso-throughput interpolation. Closest template for "one PR moved the curve" posts.
- `packages/app/content/blog/sglang-0-5-6-b200-deepseek-r1-fp4-up-to-1-8x.mdx` — Same-hardware version-bump story. Closest template for "framework release X is N% faster than X-1" posts.
- `packages/app/content/blog/gb200-nvl72-kimi-k2-5-vllm-wide-ep-3x-vs-b200.mdx` — Rack-scale wide EP story. Closest template for "scale-up fabric unlocks a new operating regime" posts.
- `packages/app/content/blog/mi355x-qwen3-5-sglang-v0-5-12-up-to-17x.mdx` — Three-date version-bump time series with the spline iso-interactivity comparison and the `_unreachable_` cell convention for out-of-frontier interactivities.

## When the user has only a chart image

If no CSV is available and you must read values off the chart:

1. Identify the metric (y-axis label) and units. Cost charts on the dashboard are typically "Cost per Million Total Tokens (Owning – Hyperscaler)" — these are owning-cost values, not the difference.
2. Identify the curves by legend color. AMD lines are typically pink/red, NVIDIA lines green. MTP variants are darker shades of the base curve color.
3. Identify the labels on each point — typically the GPU count for the config, _not_ the concurrency. Concurrency increases as you move down-and-left on the cost-vs-interactivity curve (more batch → lower latency-per-token but lower interactivity).
4. Read 5-7 points off each curve, recording (interactivity, cost).
5. Linearly interpolate at the iso-interactivity comparison points.
6. **Flag in the post that the per-conc tables would need a fresh dump to match the chart exactly** — readers should know which view is the canonical source.

Better: push back on the user and ask for the CSV before writing. It saves time downstream when a number needs to change.
