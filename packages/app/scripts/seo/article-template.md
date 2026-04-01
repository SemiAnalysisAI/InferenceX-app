# SEO Article Template

Claude uses this template to generate per-model benchmark articles.
Every article MUST follow this section order. Claude's job is to fill in the data
and write natural prose that reads like a SemiAnalysis engineer wrote it — not a content farm.

**Key principle:** Adapt depth and tone to the data. A model with 9 GPUs, 6 frameworks,
and disaggregated data should produce a rich, detailed article. A model with 3 GPUs and
1 framework should be shorter and honest about limited coverage.

---

## Frontmatter

```yaml
---
title: 'Best GPU for <DisplayName> Inference — Benchmarks & Comparison (<Month Year>)'
subtitle: '<write a natural, editorial subtitle — avoid formulaic patterns like "We benchmarked X across Y GPUs">'
date: '<YYYY-MM-DD — preserve from existing file if updating, otherwise today>'
modifiedDate: '<today YYYY-MM-DD>'
publishDate: '<today YYYY-MM-DD — required for the post to be visible in production>'
tags:
  - benchmark
  - inference
  - gpu
  - <model-display-name-slugified>
---
```

**Subtitle examples (good):**

- "GB300 takes the crown, but AMD's MI 355X closes the gap on this 671B MoE beast"
- "A dense 70B model where framework choice matters as much as GPU generation"
- "Limited data, clear winner — B200 dominates with only 3 GPUs tested so far"

**Subtitle examples (bad — too formulaic):**

- "We benchmarked X across Y GPUs, Z precisions, and N frameworks"
- "Comprehensive benchmarks across N GPUs with real throughput data"

## Section 1: Intro (1 paragraph)

2-3 sentences. Describe the model (size, architecture if known). Explain what makes
GPU selection interesting _for this specific model_ — don't just repeat generic "GPU choice matters."
Link to the dashboard: `[InferenceX](https://inferencex.semianalysis.com)`

**Cross-link:** If there are related models (same vendor, similar size, or interesting to compare),
mention 1-2 with links: `[see our DeepSeek-R1 benchmarks](/blog/best-gpu-for-dsr1-inference)`

## Section 2: Key Findings (h2)

3-5 bullet points. Rules:

- First bullet: the overall winner GPU, with bold throughput number
- Second bullet: runner-up — MUST be a different GPU than the winner
- Remaining bullets: highlight what's INTERESTING about this model's data specifically.
  Don't just list numbers — surface insights (e.g. "AMD closes the gap to within 10%",
  "FP4 provides a 2x uplift", "disagg actually hurts on this model", "the H100 holds up
  surprisingly well", "only 1 framework was tested so results may improve")
- Every bullet must contain a concrete number from the data

## Section 3: GPU Comparison Table (h2)

Title: `## GPU Comparison — <DisplayName> at 8k/1k`

Markdown table with ONE row per GPU (best config for that GPU), sorted by throughput descending.

| GPU | Precision | Framework | Throughput/GPU (tok/s) | Median TTFT (ms) | Median TPOT (ms) | Concurrency | Date |
| --- | --------- | --------- | ---------------------: | ---------------: | ---------------: | ----------: | ---- |

- Use gpuDisplayName (e.g. "NVIDIA B200", "AMD MI 355X")
- Precision in UPPERCASE (FP4, FP8, BF16, INT4)
- TTFT and TPOT: convert from seconds to milliseconds (multiply by 1000)
- Format large numbers with commas (e.g. 18,131.6)

Footer: `*One row per GPU showing the highest-throughput configuration. All data from automated [InferenceX](https://inferencex.semianalysis.com) benchmarks.*`

## Section 4: FAQ Sections (h2 each)

Each FAQ is an h2 heading with 1 paragraph answer. Cover these topics IN ORDER,
skipping any that don't apply to this model's data:

### 4a: Best GPU (always include)

Write a natural heading — doesn't have to be "What is the best GPU for X?"
Could be "Which GPU should you pick for X?" or "The fastest GPU for X" etc.
Mention the winner, a practical alternative, and AMD option if available.

### 4b: Best Precision (include if >1 precision in data)

Heading should name the specific precisions being compared (e.g. "FP4 vs FP8", "FP8 vs BF16").
Compare throughput at same GPU where possible. State the winner clearly.

### 4c: Best Framework (include if >1 framework in data)

Compare frameworks, noting which GPU each excels on.

### 4d: Disaggregated Prefill (include if both disagg=true and disagg=false exist)

Compare best disagg vs best non-disagg result with percentage difference.

### 4e: GPU Head-to-Head (always include)

Top 2 GPUs by throughput. Compare throughput, TTFT, TPOT. Note tradeoffs.
Phrase the heading naturally for the specific matchup.

### 4f: Lowest TTFT (always include)

Find the config with the ACTUAL lowest medianTtft across ALL configs at 8k/1k
(not just best-per-GPU rows). Note the throughput tradeoff.

**IMPORTANT:** Write each answer differently. Vary sentence length, structure, and opening.
Don't start every answer with "The NVIDIA B200..." — mix it up with context, tradeoffs,
or the surprising finding first.

## Section 5: Additional Sequence Table (h2)

`## Additional Results — 1k/1k Sequence Length`

Same table format as Section 3, one row per GPU, sorted by throughput descending.
Skip this section if no 1k/1k data exists.
NEVER include 1k/8k data.

## Section 6: Cross-Links (h2)

`## Related Benchmarks`

Link to 2-3 other model articles that readers might find useful.
Group by relevance: similar model size, same vendor, or commonly compared.
Example: "If you're evaluating MoE models, see our [DeepSeek-R1 benchmarks](/blog/best-gpu-for-dsr1-inference) and [Qwen-3.5 results](/blog/best-gpu-for-qwen3.5-inference)."

Use these slugs for cross-links:

- `/blog/best-gpu-for-dsr1-inference` (DeepSeek-R1-0528)
- `/blog/best-gpu-for-gptoss120b-inference` (gpt-oss-120b)
- `/blog/best-gpu-for-llama70b-inference` (Llama-3.3-70B)
- `/blog/best-gpu-for-qwen3.5-inference` (Qwen-3.5-397B)
- `/blog/best-gpu-for-kimik2.5-inference` (Kimi-K2.5)
- `/blog/best-gpu-for-minimaxm2.5-inference` (MiniMax-M2.5)
- `/blog/best-gpu-for-glm5-inference` (GLM-5)

## Section 7: ClusterMax CTA (h2)

`## Where to Run <DisplayName> Inference`

One line: `Looking for <DisplayName> API providers? See real-time provider rankings on [ClusterMax](https://www.clustermax.ai/).`

## Section 8: Methodology (h2)

`## Methodology`

2-3 sentences about automated nightly benchmarking. Link to dashboard.
End with: `*Last updated: <YYYY-MM-DD>.*`

Do NOT say "automatically generated" — just give the date.

## Section 9: JsonLd (no heading)

```mdx
<JsonLd>{`<FAQPage JSON-LD string>`}</JsonLd>
```

The JSON-LD must include every FAQ from Section 4 as a Question/Answer pair.

---

## Rollup Article Template

Slug: `inference-benchmark-roundup`

### Frontmatter

```yaml
title: 'ML Inference Benchmark Roundup — GPU Comparison (<Month Year>)'
subtitle: '<editorial subtitle, not formulaic>'
date: '<YYYY-MM-DD — preserve from existing file if updating, otherwise today>'
modifiedDate: '<today YYYY-MM-DD>'
publishDate: '<today YYYY-MM-DD>'
tags: [benchmark, inference, gpu, roundup]
```

### Sections (in order):

1. **Overview** (h2) — 1 paragraph explaining this is a cross-model summary, link to dashboard
2. **Best GPU Per Model** (h2) — markdown table: Model (linked to article), Best GPU, Precision, Throughput/GPU
3. **Per-Model Details** (h2) — one h3 per model with best result, interesting insight, and link to full article
4. **ClusterMax CTA** (h2)
5. **Methodology** (h2) — end with `*Last updated: <YYYY-MM-DD>.*`
6. **JsonLd** — Article schema (not FAQPage)
