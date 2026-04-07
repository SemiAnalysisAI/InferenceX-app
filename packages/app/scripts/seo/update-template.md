# Performance Update Article Template

Claude uses this template to generate articles about significant performance improvements.
These target search queries like "MI355X vLLM faster Kimi K2.5" and mirror the style of
SemiAnalysis tweet announcements.

**Read the writing style rules in `article-template.md` — they apply here too.**

**Voice:** News-style, punchy, lead with the result. Think tweet-expanded-to-article.

---

## Frontmatter

```yaml
---
title: '<GPU> <Framework> Gets <X>x Faster on <Model> (<Month Year>)'
subtitle: '<one-line context: what changed and why it matters>'
date: '<YYYY-MM-DD>'
modifiedDate: '<today YYYY-MM-DD>'
publishDate: '<today YYYY-MM-DD>'
tags:
  - benchmark
  - inference
  - gpu
  - performance-update
  - <gpu-slugified>
  - <model-slugified>
---
```

**Title patterns (vary these, don't always use the same one):**

- "<GPU> <Framework> Gets Xx Faster on <Model>"
- "<Model> Inference on <GPU>: Xx Improvement in X Weeks"
- "New <GPU> <Framework> Results: <Model> Throughput Doubles"

## Section 1: Headline Finding (1-2 sentences)

Lead with the result. No preamble.

> **EXAMPLE:**
>
> yyy on yyy just went from x,xxx to xx,xxx tok/s/GPU on yyy inference, a x.xx
> improvement in x weeks. The gains come from [framework version / config change].

## Section 2: Before/After Table

|                        |     Before |      After | Change |
| ---------------------- | ---------: | ---------: | -----: |
| Throughput/GPU (tok/s) |      x,xxx |     xx,xxx |   +xx% |
| Median TTFT (ms)       |        xxx |        xxx |   -xx% |
| Median TPOT (ms)       |         xx |         xx |   -xx% |
| Framework              |   yyy vX.Y |   yyy vX.Z |      — |
| Date                   | YYYY-MM-DD | YYYY-MM-DD |      — |

Follow with a `<BenchmarkChart variant="bar">` showing just the before/after throughput
(two bars: "Before (YYYY-MM-DD)" and "After (YYYY-MM-DD)").

## Section 3: TrendChart

Show **multiple series** in the TrendChart: the improved config AND other configs on the
same hardware for context. The `relatedHistory` field in the improvement data has this.

```mdx
<TrendChart
  metric="Throughput/GPU (tok/s)"
  data='{"series":{"yyy framework-A":[...], "yyy framework-B":[...]}}'
/>
```

This lets readers see whether the improvement was config-specific or affected all
frameworks on that GPU. Commentary: sudden jump or gradual? Other configs also improved?

## Section 4: What Changed (2-3 sentences)

The improvement data includes a `changelogs[]` array with descriptions and PR links.
Use these to explain what changed. Be specific: name the PR, the framework version,
the optimization.

> **EXAMPLE (when changelogs exist):**
>
> PR #xxxxx in yyy vX.Y fixed the AITER integration for MLA on AMD hardware.
> This unblocked proper tensor parallelism for this model's architecture,
> accounting for most of the throughput gain.

> **EXAMPLE (when changelogs are empty):**
>
> No changelog entries matched this date in our pipeline. The jump coincides with
> a yyy framework update, but the specific PR hasn't been identified.

**NEVER write "The specific changes haven't been identified from our benchmarking
data alone." That's filler. Either cite the changelog or say "No changelog matched."**

## Section 5: Competitive Context (2-3 sentences)

How does this change the competitive picture? Compare to other GPUs on the same model.

> **EXAMPLE:**
>
> Before this update, yyy was at xx% of yyy's throughput on yyy. Now it's at xx%.
> For cost-sensitive deployments, yyy at $x.xx/Mtok is now within striking distance
> of yyy at $x.xx/Mtok.

## Section 6: Cross-Links, CTA, Methodology, JsonLd

Link to the per-model article and any related matchup articles. ClusterMax CTA.
Methodology. Article schema JSON-LD (not FAQPage).

---

## Slug Convention

`<gpu-slug>-<framework-slug>-<model-slug>-performance-update-<YYYY-MM-DD>`

Example: `mi355x-sglang-deepseek-r1-performance-update-2026-03-13`

## Target Length

60-100 lines. These are news-style, not analysis. Short, punchy, data-heavy.

## When to Generate

Only generate for improvements where `pctGain >= 0.2` (20%+) in the data.
Skip minor incremental gains.
