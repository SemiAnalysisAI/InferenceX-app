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

Show the full performance history for this GPU+model config.

```mdx
<TrendChart
  metric="Throughput/GPU (tok/s)"
  data='{"series":{"yyy":[{"date":"YYYY-MM-DD","value":xxx},...]}}'
/>
```

Commentary: was this a sudden jump or gradual improvement? Are there other configs on
the same GPU that also improved?

## Section 4: What Changed (2-3 sentences)

What framework version, PR, or config change drove the improvement? Reference the
changelog data if available. If unknown, say so.

> **EXAMPLE:**
>
> The main driver was the vLLM x.xx release, which fixed the AITER integration
> for MLA (PR #xxxxx). This enabled proper tensor parallelism for this model's
> architecture on AMD hardware.

If the improvement reason isn't in the data, write: "The specific changes haven't been
identified from our benchmarking data alone."

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
