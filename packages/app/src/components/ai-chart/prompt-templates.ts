/**
 * System prompt for the LLM that parses user natural language into an AiChartSpec.
 * Kept compact to minimize token cost.
 */
export function buildParsePrompt(): string {
  return `You are an expert at parsing natural language requests about ML inference benchmarks into structured JSON.

## Available values

Models: DeepSeek-R1-0528, Llama-3.3-70B-Instruct-FP8, gpt-oss-120b, Qwen-3.5-397B-A17B, Kimi-K2.5, MiniMax-M2.5, GLM-5
Sequences (input/output token lengths): 1k/1k, 1k/8k, 8k/1k
Precisions: fp4, fp8, bf16, int4
GPU base names: gb300, gb200, b300, b200, mi355x, h200, mi325x, h100, mi300x
Frameworks: sglang, vllm, trt, dynamo-sglang, dynamo-trt, mori-sglang, atom, sglang-disagg

Y-axis metrics (key → label):
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

## Rules

1. Map user intent to the closest available values. Be flexible with naming (e.g., "H100" → "h100", "deepseek r1" → "DeepSeek-R1-0528", "sglang" → "sglang").
2. hardwareKeys: list of GPU base names the user wants to compare. Empty array [] means "all GPUs".
3. precisions: list of precisions. Empty array [] means "all precisions".
4. chartType: "bar" for comparing specific values across GPUs/configs, "scatter" for plotting all data points (interactivity vs metric).
5. targetInteractivity: for bar charts, the interactivity level (tok/s/user) to read from. Default 40.
6. If the user doesn't specify a model, default to "DeepSeek-R1-0528".
7. If the user doesn't specify a sequence, default to "8k/1k".
8. title: a short chart title describing the comparison.
9. description: a one-sentence description of what the chart shows.

## Output format

Return ONLY valid JSON matching this schema (no markdown, no preamble):
{
  "chartType": "bar" | "scatter",
  "model": "string",
  "sequence": "string",
  "precisions": ["string"],
  "hardwareKeys": ["string"],
  "yAxisMetric": "string",
  "yAxisLabel": "string",
  "targetInteractivity": number,
  "title": "string",
  "description": "string"
}`;
}

export function buildSummaryPrompt(
  spec: { title: string; yAxisLabel: string; model: string; sequence: string },
  dataDescription: string,
): string {
  return `You are an expert performance analyst. Based on the following benchmark data, provide a concise 2-3 sentence summary highlighting the key takeaway.

Chart: ${spec.title}
Metric: ${spec.yAxisLabel}
Model: ${spec.model}, Sequence: ${spec.sequence}

Data:
${dataDescription}

Rules:
- Be technical and precise. Mention specific values and percentage differences.
- Focus on the most interesting comparison or finding.
- No markdown formatting, just plain text.`;
}
