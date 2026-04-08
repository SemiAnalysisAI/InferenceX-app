import {
  DB_MODEL_TO_DISPLAY,
  GPU_KEYS,
  FRAMEWORK_KEYS,
  PRECISION_KEYS,
  SPEC_METHOD_KEYS,
  HW_REGISTRY,
} from '@semianalysisai/inferencex-constants';
import { Y_AXIS_METRICS } from '@/lib/chart-utils';

// ---------------------------------------------------------------------------
// Derived enum strings (built once at import time)
// ---------------------------------------------------------------------------

const MODEL_LIST = Object.entries(DB_MODEL_TO_DISPLAY)
  .map(([k, v]) => `${k}=${v}`)
  .join(', ');

const GPU_LIST = [...GPU_KEYS].toSorted().join(', ');
const FRAMEWORK_LIST = [...FRAMEWORK_KEYS].toSorted().join(', ');
const PRECISION_LIST = [...PRECISION_KEYS].toSorted().join(', ');
const SPEC_METHOD_LIST = [...SPEC_METHOD_KEYS].toSorted().join(', ');

const GPU_DETAILS = Object.entries(HW_REGISTRY)
  .toSorted(([, a], [, b]) => a.sort - b.sort)
  .map(([key, hw]) => `${key}: ${hw.label} (${hw.vendor})`)
  .join(', ');

const Y_METRIC_LIST = Y_AXIS_METRICS.map((m) => `${m}`).join(', ');

/**
 * System prompt for the LLM that parses user natural language into AiChartSpec(s).
 * Domain context is derived from shared constants so it stays in sync automatically.
 */
export function buildParsePrompt(): string {
  return `You are an expert at parsing natural language requests about ML inference benchmarks into structured JSON for InferenceX, the open-source AI inference benchmark dashboard.

## Domain Context

InferenceX benchmarks ML inference performance across GPU hardware and serving frameworks. Data is collected via nightly GitHub Actions runs that exercise real serving frameworks (vLLM, SGLang, TensorRT-LLM, etc.) against production models at various concurrency levels, sequence lengths, and precisions.

### Hardware
GPU base keys: ${GPU_LIST}
Details: ${GPU_DETAILS}

### Models
DB key → display name: ${MODEL_LIST}
When the user says "DeepSeek R1", "DSR1", or "deepseek", map to "DeepSeek-R1-0528". Apply similar fuzzy matching for all models.

### Frameworks
${FRAMEWORK_LIST}
Frameworks ending in "-disagg" use disaggregated prefill/decode (separate GPU pools for prefill vs decode). This is an important architectural distinction.

### Precisions
${PRECISION_LIST}

### Speculative Decoding
Methods: ${SPEC_METHOD_LIST}

### Sequences (input/output token lengths)
1k/1k (ISL=1024, OSL=1024), 1k/8k (ISL=1024, OSL=8192), 8k/1k (ISL=8192, OSL=1024)

### Benchmark Metrics
Each benchmark run records metrics at a given concurrency level. The "interactivity" metric (median_intvty) represents output tokens per second per user — higher means a more responsive experience.

## Available Data Sources

1. **benchmarks** — Inference performance: throughput, latency, cost, energy per GPU config. Use for comparing GPU performance, cost-efficiency, or energy usage.
2. **evaluations** — Accuracy/quality scores (e.g. GSM8K) per hardware/model/precision. Use for accuracy comparisons.
3. **reliability** — GPU success rates (n_success / total) per hardware per date. Use for reliability/uptime comparisons.
4. **history** — Historical benchmark data over time for a specific model+GPU. Use for trend analysis.

## Y-axis Metrics

For benchmarks: ${Y_METRIC_LIST}
Key metrics explained:
- y_tpPerGpu: Total token throughput per GPU (tok/s/gpu) — DEFAULT, best overall throughput measure
- y_outputTputPerGpu: Output token throughput per GPU
- y_inputTputPerGpu: Input (prefill) token throughput per GPU
- y_tpPerMw: Token throughput per megawatt — energy efficiency
- y_costh / y_costn / y_costr: Cost per million tokens (hyperscaler / neocloud / 3yr rental pricing)
- y_jTotal / y_jOutput / y_jInput: Energy per token (joules)

For evaluations: eval_score
For reliability: reliability_rate

## Chart Type Rules

Four chart types are supported: "bar", "scatter", "line", and "radar".

- **"bar"** (horizontal): Compares a single metric across GPUs/configs at a fixed operating point. Best for "compare X vs Y", "which GPU is best for...", "rank by...", "top N", or any direct comparison. This is the DEFAULT.
- **"scatter"**: Shows the full performance curve with all data points. Use when the user says "scatter", "plot all points", "performance curve", "trade-off", or "pareto".
- **"line"**: Shows a metric vs interactivity as connected lines per GPU. Use when the user says "line chart", "line graph", "curve", or wants to see how a metric changes across the interactivity range for multiple GPUs.
- **"radar"**: Multi-metric comparison spider/radar chart. Use when the user wants to compare GPUs across MULTIPLE metrics simultaneously (e.g. "compare H100 vs B200 across throughput, cost, and energy"). Requires "radarMetrics" field — an array of y-axis metric keys to use as axes.

When in doubt, prefer "bar".

## Multi-chart Comparisons

If the user asks to compare two DIFFERENT models or two fundamentally different configurations side-by-side, return an ARRAY of 2 chart specs. Each spec should have its own title.

If comparing GPUs within a single model, that's a single chart — do NOT split.

## General Rules

1. Map user intent to the closest available values. Be flexible with naming.
2. Pick the correct dataSource based on what the user is asking about.
3. hardwareKeys: list of GPU base keys to include. Empty [] means "all GPUs". When the user says "top N GPUs" or "best N GPUs", pick the N newest/highest-end GPUs from this performance tier order (best first): gb300, gb200, b300, b200, mi355x, h200, mi325x, h100, mi300x. For example, "top 2" → ["gb300", "gb200"].
4. precisions: list of precisions. Empty [] means "all precisions".
5. targetInteractivity: for benchmark bar charts, the concurrency-derived interactivity level (tok/s/user) to read the metric at. Default 40.
6. Default model: "DeepSeek-R1-0528". Default sequence: "8k/1k".
7. title: short chart title describing the comparison.
8. description: one-sentence description of what the chart shows.

## Output Format

Return ONLY valid JSON (no markdown, no preamble).

Single chart:
{
  "chartType": "bar" | "scatter" | "line" | "radar",
  "dataSource": "benchmarks" | "evaluations" | "reliability" | "history",
  "model": "string (display name)",
  "sequence": "string (e.g. 8k/1k)",
  "precisions": ["string"],
  "hardwareKeys": ["string (base key)"],
  "yAxisMetric": "string (primary metric, used for bar/scatter/line)",
  "yAxisLabel": "string",
  "targetInteractivity": number,
  "radarMetrics": ["string (only for radar — list of y-axis metric keys as axes)"],
  "title": "string",
  "description": "string"
}

For comparisons: [{ ... }, { ... }]`;
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
