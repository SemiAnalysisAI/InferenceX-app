# GPU Matchup Article Template

Claude uses this template to generate GPU head-to-head comparison articles.
These target search queries like "B200 vs MI355X inference benchmark".

**Read the writing style rules in `article-template.md` — they apply here too.**
All anti-slop rules, banned words, em dash restrictions, and the mandatory editing pass
apply to matchup articles.

**Voice:** Write like a SemiAnalysis analyst. Opinionated, data-dense, specific.
Lead with iso-interactivity comparisons, not just peak throughput.

---

## Frontmatter

```yaml
---
title: '<GPU A> vs <GPU B> — <Model> Inference Benchmark (<Month Year>)'
subtitle: '<editorial subtitle with the key finding>'
date: '<YYYY-MM-DD>'
modifiedDate: '<today YYYY-MM-DD>'
publishDate: '<today YYYY-MM-DD>'
tags:
  - benchmark
  - inference
  - gpu
  - <gpu-a-slugified>
  - <gpu-b-slugified>
  - <model-slugified>
---
```

## Section 1: Intro (2-3 sentences)

What GPUs are being compared, on what model, and why this matchup matters.
Link to [InferenceX](https://inferencex.semianalysis.com).

> **EXAMPLE:**
>
> This is the matchup everyone asks about: yyy vs yyy on yyy inference. Both
> GPUs have production deployments, and the gap between them isn't as simple as
> "one is faster." We ran both across the full pareto frontier on
> [InferenceX](https://inferencex.semianalysis.com).

## Section 2: Key Numbers (3-4 bullets)

- Throughput winner with bold number
- Cost winner ($/Mtok) if different from throughput winner
- Interactivity comparison at a specific tok/s/user level
- The surprise or non-obvious finding

> **EXAMPLE:**
>
> ## Key Numbers
>
> - yyy leads on peak throughput: **xx,xxx tok/s/GPU** vs xx,xxx on yyy.
> - At iso-interactivity of xx tok/s/user, yyy is xx% cheaper per Mtok ($x.xx vs $x.xx hyperscaler pricing).
> - yyy has lower TTFT across all tested concurrencies (xxxms vs xxxms at conc xx).
> - On x out of x shared models, yyy wins on throughput. But yyy wins on cost/Mtok in x of those.

## Section 3: Throughput Comparison Table + Chart

Table with BOTH GPUs' best configs side by side. One row per model where both have data.

| Model | GPU A Throughput | GPU B Throughput | GPU A Wins? | Diff |
| ----- | ---------------: | ---------------: | ----------- | ---: |

Follow with a `<BenchmarkChart>` showing both GPUs' throughput.

## Section 4: InteractivityChart

Add an `<InteractivityChart>` showing throughput vs interactivity curves for both GPUs
on the most data-rich model. This is the core visualization.

```mdx
<InteractivityChart data='{"series":{"yyy":[{"interactivity":10,"throughput":5000},...],"yyy":[...]}}' />
```

The data comes from the history/benchmark rows at different concurrency levels for
both GPUs on the same model. Each point is a different concurrency level, giving the
pareto-like curve.

## Section 5: Cost Comparison

Table comparing $/Mtok at hyperscaler pricing for both GPUs across shared models.

| Model | GPU A $/Mtok | GPU B $/Mtok | Cheaper |
| ----- | -----------: | -----------: | ------- |

Commentary: which GPU wins on cost, and does the cost winner change at different
interactivity levels?

## Section 6: Performance Over Time (if history data exists)

Add a `<TrendChart>` showing how both GPUs' throughput has evolved on the most
interesting model.

```mdx
<TrendChart data='{"series":{"yyy":[{"date":"YYYY-MM-DD","value":xxx},...],"yyy":[...]}}' />
```

Commentary: which GPU is improving faster? What framework/config changes drove gains?

## Section 7: Iso-Interactivity Analysis

This is the SemiAnalysis signature analysis. At specific interactivity levels:

> **EXAMPLE:**
>
> ## At Different Interactivity Levels
>
> At xx tok/s/user (chatbot-grade), yyy delivers xx,xxx tok/s/GPU throughput vs
> yyy's xx,xxx. That's a xx% gap.
>
> Push interactivity to xxx tok/s/user (real-time voice) and the gap changes: yyy
> drops to x,xxx tok/s/GPU while yyy holds at x,xxx.
>
> Below xx tok/s/user (batch processing), yyy pulls ahead on cost/Mtok because its
> higher throughput amortizes the $/hr better.

If interactivity data isn't available for this pair, skip this section.

## Section 8: Cross-Links, CTA, Methodology, JsonLd

Same as per-model articles (see `article-template.md`). Link to both GPUs' per-model
articles. ClusterMax CTA. Methodology (framework updates cadence). FAQPage JSON-LD
with key questions from the article.

---

## Slug Convention

`<gpuA-slug>-vs-<gpuB-slug>-<model-slug>-inference`

Example: `b200-vs-mi355x-deepseek-r1-inference`

## Target Length

100-180 lines. These are focused matchup articles, not exhaustive roundups.
