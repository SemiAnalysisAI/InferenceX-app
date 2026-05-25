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

For iso-interactivity comparison: linear-interpolate each (interactivity, cost) curve, then take the Pareto-cheapest cost at each interactivity. When a model has multiple recipes (TP=4 and TP=8 for the same hardware), the Pareto frontier is the lower of the two at each interactivity — usually one recipe dominates a band and the other dominates the rest.

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

### `<Figure>` with the chart image

```mdx
<Figure
  srcLight="/images/{slug}/benchmark-light.png"
  srcDark="/images/{slug}/benchmark-dark.png"
  alt="Plain-English description of the chart including model, precision, ISL/OSL, both compared SKUs/frameworks, and any toggles (MTP/non-MTP)"
  caption="Short caption. Note any non-obvious labeling convention used on the chart (e.g. 'Labels denote GPU count per config.')."
/>
```

Immediately followed by a `[Live chart]({preset URL})` link with the same preset as the `DashboardCTA` so readers can drill into a single point.

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

## Step 5: Verify, commit, push, PR

```bash
pnpm lint && pnpm typecheck       # pre-commit hooks rerun these
git checkout -b blog/{slug} origin/master
git add packages/app/content/blog/{slug}.mdx packages/app/public/images/{slug}/
git commit -m "feat(blog): {title-ish}"
git push -u origin blog/{slug}
gh pr create --title "feat(blog): ..." --body "..."
```

The pre-commit hook runs `oxlint`, `oxfmt`, and `tsc --noEmit`. All three must pass. If lint/format fails, run `pnpm lint:fix && pnpm fmt:fix` and re-commit (don't `--no-verify`).

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

## Reference posts

Open these in order to match tone and structure when in doubt:

- `packages/app/content/blog/mi355x-glm5-fp8-sglang-40-cheaper-than-b200.mdx` — AMD wins on TCO, single-node, MTP + non-MTP, with iso-interactivity tables and honest gap-inversion call-out. Closest template for AMD-vs-NVIDIA single-node cost posts.
- `packages/app/content/blog/mi355x-kimi-k2-5-vllm-aiter-7x-speedup.mdx` — Single-PR speedup story, 25-day cadence, iso-throughput interpolation. Closest template for "one PR moved the curve" posts.
- `packages/app/content/blog/sglang-0-5-6-b200-deepseek-r1-fp4-up-to-1-8x.mdx` — Same-hardware version-bump story. Closest template for "framework release X is N% faster than X-1" posts.
- `packages/app/content/blog/gb200-nvl72-kimi-k2-5-vllm-wide-ep-3x-vs-b200.mdx` — Rack-scale wide EP story. Closest template for "scale-up fabric unlocks a new operating regime" posts.

## When the user has only a chart image

If no CSV is available and you must read values off the chart:

1. Identify the metric (y-axis label) and units. Cost charts on the dashboard are typically "Cost per Million Total Tokens (Owning – Hyperscaler)" — these are owning-cost values, not the difference.
2. Identify the curves by legend color. AMD lines are typically pink/red, NVIDIA lines green. MTP variants are darker shades of the base curve color.
3. Identify the labels on each point — typically the GPU count for the config, _not_ the concurrency. Concurrency increases as you move down-and-left on the cost-vs-interactivity curve (more batch → lower latency-per-token but lower interactivity).
4. Read 5-7 points off each curve, recording (interactivity, cost).
5. Linearly interpolate at the iso-interactivity comparison points.
6. **Flag in the post that the per-conc tables would need a fresh dump to match the chart exactly** — readers should know which view is the canonical source.

Better: push back on the user and ask for the CSV before writing. It saves time downstream when a number needs to change.
