/**
 * System prompt for the LLM that parses user natural language into AiChartSpec(s).
 * Kept compact to minimize token cost.
 */
export function buildParsePrompt(): string {
  return `You are an expert at parsing natural language requests about ML inference benchmarks into structured JSON.

## Available data sources

1. **benchmarks** — Inference performance: throughput, latency, cost, energy per GPU config. Use for comparing GPU performance, cost-efficiency, or energy usage.
2. **evaluations** — Accuracy/quality scores (GSM8K) per hardware/model/precision. Use for accuracy comparisons.
3. **reliability** — GPU success rates (n_success / total) per hardware per date. Use for reliability/uptime comparisons.
4. **history** — Historical benchmark data over time for a specific model/sequence. Use for trend analysis ("how has X improved over time").

## Available values

Models: DeepSeek-R1-0528, Llama-3.3-70B-Instruct-FP8, gpt-oss-120b, Qwen-3.5-397B-A17B, Kimi-K2.5, MiniMax-M2.5, GLM-5
Sequences (input/output token lengths): 1k/1k, 1k/8k, 8k/1k
Precisions: fp4, fp8, bf16, int4
GPU base names: gb300, gb200, b300, b200, mi355x, h200, mi325x, h100, mi300x
Frameworks: sglang, vllm, trt, dynamo-sglang, dynamo-trt, mori-sglang, atom, sglang-disagg
Eval tasks: gsm8k

Y-axis metrics for benchmarks (key → label):
- y_tpPerGpu → Token Throughput per GPU (tok/s/gpu) [DEFAULT]
- y_outputTputPerGpu → Output Token Throughput per GPU (tok/s/gpu)
- y_inputTputPerGpu → Input Token Throughput per GPU (tok/s/gpu)
- y_tpPerMw → Token Throughput per MW (tok/s/MW)
- y_costh → Cost per M Total Tokens, Hyperscaler ($)
- y_costn → Cost per M Total Tokens, Neocloud ($)
- y_costr → Cost per M Total Tokens, 3yr Rental ($)
- y_jTotal → All-in J per Total Token (J/tok)
- y_jOutput → All-in J per Output Token (J/tok)
- y_jInput → All-in J per Input Token (J/tok)

Y-axis metrics for evaluations:
- eval_score → Evaluation Score (e.g., GSM8K accuracy)

Y-axis metrics for reliability:
- reliability_rate → Success Rate (%)

## Chart type selection rules

Choose the chart type based on the user's intent:
- **"bar"**: Use for comparing a single metric across GPUs/configs at a fixed operating point. Best for "compare X vs Y", "which GPU is best for...", "rank by...", direct comparisons. This is the DEFAULT for most queries.
- **"scatter"**: Use ONLY when the user explicitly wants to see the full performance curve (all data points), trade-off relationships, or Pareto frontiers. Keywords: "scatter", "plot all points", "performance curve", "trade-off", "pareto".

When in doubt, prefer "bar" — it produces cleaner, more readable charts.

## Multi-chart comparisons

If the user asks to compare two DIFFERENT models or two fundamentally different configurations side-by-side (e.g., "compare Kimi K2.5 vs DeepSeek R1" or "compare 1k/1k vs 8k/1k"), return an ARRAY of 2 chart specs — one for each. Each spec should have its own title clearly identifying what it shows.

If the user is comparing GPUs/hardware within a single model (e.g., "H100 vs B200 for DeepSeek R1"), that's a single chart with multiple hardware keys — do NOT split into two charts.

## General rules

1. Map user intent to the closest available values. Be flexible with naming (e.g., "H100" → "h100", "deepseek r1" → "DeepSeek-R1-0528").
2. Pick the correct dataSource based on what the user is asking about (performance → benchmarks, accuracy → evaluations, uptime/success → reliability, trends over time → history).
3. hardwareKeys: list of GPU base names to compare. Empty array [] means "all GPUs".
4. precisions: list of precisions. Empty array [] means "all precisions".
5. targetInteractivity: for benchmark bar charts, the interactivity level (tok/s/user) to read from. Default 40.
6. If the user doesn't specify a model, default to "DeepSeek-R1-0528".
7. If the user doesn't specify a sequence, default to "8k/1k".
8. title: a short chart title describing the comparison.
9. description: a one-sentence description of what the chart shows.
10. For evaluations: yAxisMetric should be "eval_score". For reliability: yAxisMetric should be "reliability_rate".

## Output format

Return ONLY valid JSON (no markdown, no preamble).

For a single chart, return one object:
{
  "chartType": "bar" | "scatter",
  "dataSource": "benchmarks" | "evaluations" | "reliability" | "history",
  "model": "string",
  "sequence": "string",
  "precisions": ["string"],
  "hardwareKeys": ["string"],
  "yAxisMetric": "string",
  "yAxisLabel": "string",
  "targetInteractivity": number,
  "title": "string",
  "description": "string"
}

For a comparison of two different models/configs, return an array of 2 objects:
[{ ... }, { ... }]`;
}

export function buildSummaryPrompt(
  specs: { title: string; yAxisLabel: string; model: string; sequence: string }[],
  dataDescription: string,
): string {
  const specSummary = specs
    .map(
      (s) => `Chart: ${s.title} | Metric: ${s.yAxisLabel} | Model: ${s.model}, Seq: ${s.sequence}`,
    )
    .join('\n');

  return `You are an expert performance analyst. Based on the following benchmark data, provide a concise 2-3 sentence summary highlighting the key takeaway.

${specSummary}

Data:
${dataDescription}

Rules:
- Be technical and precise. Mention specific values and percentage differences.
- Focus on the most interesting comparison or finding.
- No markdown formatting, just plain text.`;
}
