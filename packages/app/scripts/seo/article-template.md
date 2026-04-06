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

- "yyy takes the crown, but yyy closes the gap on this xxxB MoE beast"
- "A dense xxxB model where framework choice matters as much as GPU generation"
- "Limited data, clear winner. yyy dominates with only x GPUs tested so far"

**Subtitle examples (bad — too formulaic):**

- "We benchmarked X across Y GPUs, Z precisions, and N frameworks"
- "Comprehensive benchmarks across N GPUs with real throughput data"

## Section 1: Intro (1 paragraph, 2-3 sentences)

Describe the model, then say what makes GPU selection interesting for _this_ model.
Link to the dashboard. Cross-link 1-2 related models if they exist.

**Target length: ~40-60 words.**

> **EXAMPLE** (do not copy, match the length and tone):
>
> yyy is a xxxB mixture-of-experts reasoning model. Its sheer size means most
> GPUs can't even load it without quantization, which makes the precision and framework
> choice unusually important. We benchmarked it across x GPUs on
> [InferenceX](https://inferencex.semianalysis.com); for a smaller dense model comparison,
> see our [yyy benchmarks](/blog/best-gpu-for-yyy-inference).

## Section 2: Key Findings (h2, 3-5 bullets)

Rules:

- First bullet: the overall winner GPU, with bold throughput number
- Second bullet: runner-up (MUST be a different GPU than the winner)
- Remaining bullets: surface what's interesting about this model's data.
  Don't just list numbers; state an insight. Every bullet needs a concrete number.

**Target length: 3-5 bullets, each 15-25 words.**

> **EXAMPLE:**
>
> ## Key Findings
>
> - yyy on FP4 hits **xx,xxx tok/s/GPU**, the fastest config we've tested for this model.
> - yyy on FP8 comes in at xx,xxx tok/s/GPU. That's xx% of the yyy, closer than on most models.
> - FP4 nearly xxx throughput vs FP8 on the yyy (xx,xxx vs x,xxx tok/s/GPU). Worth the accuracy tradeoff on this model.
> - The yyy still manages x,xxx tok/s/GPU on FP8. Not bad for last-gen hardware at half the price.

## Section 3: GPU Comparison Table (h2)

Title: `## GPU Comparison — <DisplayName> at 8k/1k`

One row per GPU (best config for that GPU), sorted by throughput descending.

| GPU | Precision | Framework | Throughput/GPU (tok/s) | Median TTFT (ms) | Median TPOT (ms) | Concurrency | Date |
| --- | --------- | --------- | ---------------------: | ---------------: | ---------------: | ----------: | ---- |

- Use gpuDisplayName from the data (e.g. "Vendor Model")
- Precision in UPPERCASE (FP4, FP8, BF16, INT4)
- TTFT and TPOT: convert from seconds to milliseconds (multiply by 1000)
- Format large numbers with commas (e.g. xx,xxx.x)

Footer: `*One row per GPU showing the highest-throughput configuration. All data from automated [InferenceX](https://inferencex.semianalysis.com) benchmarks.*`

## Section 4: FAQ Sections (h2 each)

Each FAQ is an h2 heading with a 2-4 sentence answer. Cover these topics IN ORDER,
skipping any that don't apply to this model's data.

**Target length per FAQ: 40-80 words. Don't pad thin answers.**

**IMPORTANT:** Write each answer differently. Vary sentence length, structure, and opening.
Don't start every answer with "The [GPU name]..." Lead with context, tradeoffs,
or the surprising finding first.

### 4a: Best GPU (always include)

Write a natural heading. Mention the winner, a practical alternative, and alternate vendor option if available.

> **EXAMPLE:**
>
> ## Which GPU should you pick for yyy?
>
> yyy on FP4, if you can get the cards. It's xx% faster than anything else we tested,
> and the latency numbers are good too (xxxms TTFT, x.xms TPOT). If you're on a different
> vendor, the yyy on FP8 gets you xx% of that throughput. The yyy still works but you're
> leaving a lot on the table.

### 4b: Best Precision (include if >1 precision in data)

Heading should name the specific precisions (e.g. "FP4 vs FP8"). Compare throughput
at the same GPU where possible.

> **EXAMPLE:**
>
> ## FP4 vs FP8 on yyy
>
> On the yyy, FP4 nearly doubles throughput: xx,xxx vs x,xxx tok/s/GPU. TTFT drops from
> xxxms to xxxms too. We haven't measured accuracy loss from FP4 quantization on this model,
> so check your eval suite before committing. On other hardware, only FP8 is available right now.

### 4c: Best Framework (include if >1 framework in data)

Compare frameworks, noting which GPU each excels on.

> **EXAMPLE:**
>
> ## yyy vs yyy
>
> Split decision. yyy wins on yyy hardware by xx-xx% on throughput, but yyy
> is the only option on yyy. If you're running yyy, yyy gets you xx,xxx tok/s/GPU,
> which beats the yyy on yyy (xx,xxx tok/s/GPU). Framework matters almost as much as
> the GPU on this model.

### 4d: Disaggregated Prefill (include if both disagg=true and disagg=false exist)

Compare best disagg vs best non-disagg result with percentage difference.

> **EXAMPLE:**
>
> ## Does disaggregated prefill help?
>
> Yes, but only on the yyy. Disagg pushes throughput from xx,xxx to xx,xxx tok/s/GPU
> (an x% gain) while cutting TTFT from xxxms to xxxms. On the yyy, disagg actually
> hurt throughput by x%. Don't assume it helps everywhere.

### 4e: GPU Head-to-Head (always include)

Compare the top 2 GPUs on throughput, TTFT, and TPOT. Note tradeoffs.

> **EXAMPLE:**
>
> ## yyy vs yyy on yyy
>
> The yyy wins on throughput (xx,xxx vs xx,xxx tok/s/GPU) but the yyy actually has
> lower TTFT: xxxms vs xxxms. If your workload is latency-sensitive with short outputs,
> the yyy is competitive. For batch throughput, yyy is still the clear pick.

### 4f: Lowest TTFT (always include)

Find the config with the ACTUAL lowest medianTtft across ALL configs at 8k/1k
(not just best-per-GPU rows). Note the throughput tradeoff.

> **EXAMPLE:**
>
> ## Fastest time to first token
>
> yyy on FP8 with yyy at concurrency xx: xxxms TTFT. That's xx% faster than
> the yyy's best TTFT (xxxms), though throughput drops to xx,xxx tok/s/GPU at that
> concurrency. If TTFT matters more than throughput (interactive chat, for example),
> this is the config to run.

## Section 5: Additional Sequence Table (h2)

`## Additional Results — 1k/1k Sequence Length`

Same table format as Section 3, one row per GPU, sorted by throughput descending.
Skip this section entirely if no 1k/1k data exists.
NEVER include 1k/8k data.

> **EXAMPLE:**
>
> ## Additional Results — 1k/1k Sequence Length
>
> | GPU | Precision | Framework | Throughput/GPU (tok/s) | Median TTFT (ms) | Median TPOT (ms) | Concurrency | Date       |
> | --- | --------- | --------- | ---------------------: | ---------------: | ---------------: | ----------: | ---------- |
> | yyy | FP4       | yyy       |               xx,xxx.x |             xx.x |              x.x |         xxx | YYYY-MM-DD |
> | yyy | FP8       | yyy       |               xx,xxx.x |             xx.x |              x.x |         xxx | YYYY-MM-DD |
>
> _One row per GPU showing the highest-throughput configuration. All data from automated [InferenceX](https://inferencex.semianalysis.com) benchmarks._

## Section 6: Cross-Links (h2, 1-2 sentences)

`## Related Benchmarks`

Link to 2-3 other model articles. One or two sentences, no more.

> **EXAMPLE:**
>
> ## Related Benchmarks
>
> If you're comparing MoE models, see our [yyy benchmarks](/blog/best-gpu-for-yyy-inference).
> For a dense model at similar scale, check the [yyy results](/blog/best-gpu-for-yyy-inference).

Use these slugs for cross-links:

- `/blog/best-gpu-for-dsr1-inference` (DeepSeek-R1-0528)
- `/blog/best-gpu-for-gptoss120b-inference` (gpt-oss-120b)
- `/blog/best-gpu-for-llama70b-inference` (Llama-3.3-70B)
- `/blog/best-gpu-for-qwen3.5-inference` (Qwen-3.5-397B)
- `/blog/best-gpu-for-kimik2.5-inference` (Kimi-K2.5)
- `/blog/best-gpu-for-minimaxm2.5-inference` (MiniMax-M2.5)
- `/blog/best-gpu-for-glm5-inference` (GLM-5)

## Section 7: ClusterMax CTA (h2, exactly 1 line)

> **EXAMPLE:**
>
> ## Where to Run yyy Inference
>
> Looking for yyy API providers? See real-time provider rankings on [ClusterMax](https://www.clustermax.ai/).

## Section 8: Methodology (h2, 2-3 sentences)

Link to dashboard. End with the date line. Don't say "automatically generated."

> **EXAMPLE:**
>
> ## Methodology
>
> All benchmarks run nightly on dedicated hardware with standardized prompts and concurrency
> sweeps. Results are collected and published on [InferenceX](https://inferencex.semianalysis.com).
> Configs that fail health checks are excluded.
>
> _Last updated: YYYY-MM-DD._

## Section 9: JsonLd (no heading)

```mdx
<JsonLd>{`<FAQPage JSON-LD string>`}</JsonLd>
```

The JSON-LD must include every FAQ from Section 4 as a Question/Answer pair.

> **EXAMPLE:**
>
> ```mdx
> <JsonLd>{`{
>   "@context": "https://schema.org",
>   "@type": "FAQPage",
>   "mainEntity": [
>     {
>       "@type": "Question",
>       "name": "Which GPU should you pick for yyy?",
>       "acceptedAnswer": {
>         "@type": "Answer",
>         "text": "yyy on FP4. It's xx% faster than anything else we tested..."
>       }
>     }
>   ]
> }`}</JsonLd>
> ```

---

## Target Article Length

A complete per-model article should be roughly **150-250 lines of MDX** (including
frontmatter, tables, and JSON-LD). That works out to about 800-1,400 words of prose.

Scale with the data:

- **3 GPUs, 1 framework, 1 precision:** ~150 lines. Skip sections 4b, 4c, 4d. Keep answers short.
- **5-6 GPUs, 2 frameworks, 2 precisions:** ~200 lines. Include most FAQ sections.
- **7+ GPUs, 3+ frameworks, disagg data:** ~250 lines. Full article with all sections.

---

## Writing Style — Avoiding AI Tells

### Banned Words and Phrases

Never use these. They are the strongest signals of AI-generated text.

**Verbs:** delve, leverage, utilize, harness, unlock, unleash, streamline, foster,
facilitate, showcase, underscore, spearhead, revolutionize, navigate, orchestrate,
empower, elevate, transcend, unveil, bolster, garner, illuminate

**Adjectives:** comprehensive, robust, seamless, pivotal, crucial, paramount,
transformative, groundbreaking, cutting-edge, innovative, holistic, nuanced,
multifaceted, meticulous, intricate, profound, game-changing, revolutionary

**Adverbs:** significantly, notably, seamlessly, profoundly, ultimately, arguably,
essentially, fundamentally

**Nouns:** landscape, journey, tapestry, realm, odyssey, paradigm, nexus, synergy,
ecosystem, interplay, testament

**Phrases — never use these or anything like them:**

- "It's worth noting that..." / "It should be noted that..."
- "It's important to understand that..."
- "In today's fast-paced..." / "In the ever-evolving..."
- "When it comes to..."
- "Not only X, but also Y"
- "As we move forward..."
- "The future looks promising/bright..."
- "Stands as a testament to..."
- "Plays a vital/crucial/pivotal role..."
- "Underscores/highlights the importance..."
- "In conclusion..." / "In summary..." / "To summarize..."
- "Furthermore..." / "Moreover..." / "Additionally..."
- "That being said..." / "With that in mind..."

**Use instead:** "also", "and", "but", "still", "though", "here", simple connectors.
Plain English. Write like you talk to a coworker.

### Punctuation Rules

- **Em dashes (—):** ZERO em dashes in article prose. The only em dashes allowed are in
  the prescribed headings ("GPU Comparison — ...", "Additional Results — ...") and the
  title frontmatter. Everywhere else, rewrite:
  - "B200 hits 18k tok/s — 40% faster" → "B200 hits 18k tok/s, 40% faster"
  - "only on AMD — at a steep cost" → "only on AMD (at a steep cost)"
  - "FP4 is the winner — if accuracy allows" → "FP4 is the winner, if accuracy allows."
    Em dashes are the single strongest AI tell in technical writing. Don't use them.
- **Use contractions:** "it's", "don't", "won't", "doesn't", "isn't". Uncontracted
  forms ("it is", "do not") sound robotic.
- **Don't bold key terms** mechanically throughout the article. Bold only in Key Findings
  bullets where the template explicitly calls for it.

### Sentence and Paragraph Structure

- **Vary sentence length aggressively.** Mix 5-word sentences with 25-word ones.
  Three medium sentences in a row is a tell.
- **Vary paragraph length.** One-sentence paragraphs are fine. Five-sentence ones are fine.
  Don't make them all the same.
- **Don't start consecutive sentences the same way.** Especially not with "The [GPU name]..."
- **No rule-of-three lists in prose.** "Fast, efficient, and reliable" is a dead giveaway.
  Use two items or four. Never exactly three adjectives/adverbs in sequence.
- **No synonym cycling.** If you called it "the yyy", keep calling it "the yyy". Don't
  rotate through "the accelerator", "the chip", "the hardware", "the solution".

### Tone

- **Be direct.** State findings plainly. "The yyy is xx% faster" not "The yyy
  demonstrates a remarkable xx% improvement in throughput performance."
- **Be specific.** Every claim needs a number. No vague "significant improvement" or
  "notable performance gains."
- **Be honest about limitations.** If there's little data, say so. Don't pad thin
  results with filler.
- **Skip significance inflation.** A xx% throughput gain is a xx% throughput gain. It's
  not "transformative" or "groundbreaking."
- **No unearned profundity.** These are benchmark results, not philosophical revelations.
- **No filler padding.** "To" not "in order to". "Because" not "due to the fact that".
  Cut any sentence that conveys zero information.
- **Write like an analyst** Terse, opinionated, data-heavy.

### Mandatory Editing Pass

After writing each article, you MUST re-read it and fix these issues before moving
to the next article. This is not optional.

1. **Em dash sweep:** Search the file for "—". Delete every em dash that isn't in a
   prescribed heading ("GPU Comparison — ...", "Additional Results — ...") or the title
   frontmatter. Replace with a comma, period, semicolon, or parentheses. No exceptions.
2. **Banned word sweep:** Search for any word from the banned lists above. Replace with
   plain English.
3. **Sentence start check:** Read the first word of every sentence in each FAQ answer.
   If two consecutive sentences start the same way, rewrite one.
4. **Filler check:** Cut any sentence that restates the previous sentence or conveys
   zero new information.

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
4. **GPU Head-to-Head Comparisons** (h2) — see below
5. **ClusterMax CTA** (h2)
6. **Methodology** (h2) — end with `*Last updated: <YYYY-MM-DD>.*`
7. **JsonLd** — FAQPage schema (include every h3 matchup from section 4 as a Question/Answer)

### Section 4: GPU Head-to-Head Comparisons

This section targets search queries like "B200 vs MI355X inference" or "H100 vs H200 performance".

Generate one h3 subsection for every GPU pair where **both GPUs appear in at least 2 models'
data**. Skip pairs that only overlap on 1 model (not enough data to generalize).

Sort pairs by how interesting the matchup is (close races first, blowouts last).

Each h3 subsection:

**Heading:** `### <GPU A> vs <GPU B>` (use gpuDisplayName, alphabetical by vendor then model)

**Body (3-5 sentences):**

- Which GPU wins on throughput across more models, and by how much on average
- Any models where the loser wins instead (call these out, they're the interesting part)
- One sentence on latency tradeoffs if they diverge from the throughput story
- Link to the specific model article for the most interesting matchup

> **EXAMPLE:**
>
> ### NVIDIA B200 vs AMD MI355X
>
> B200 wins on throughput in x out of x models tested, by xx% on average. The exception is
> yyy, where MI355X edges ahead at xx,xxx vs xx,xxx tok/s/GPU. On latency, B200 consistently
> has lower TPOT (xxms vs xxms typical). MI355X tends to have better TTFT at lower
> concurrencies. For the full yyy matchup, see our [yyy benchmarks](/blog/best-gpu-for-yyy-inference).
>
> ### NVIDIA B200 vs NVIDIA H200
>
> Generational gap. B200 is x.xx faster on average across all x shared models. H200 still has
> competitive TTFT at low concurrency on some models (see [yyy results](/blog/best-gpu-for-yyy-inference)),
> but throughput isn't close. If you're choosing between the two, B200 is worth the upgrade
> unless you're TTFT-bound at low batch sizes.
