/**
 * @file inference-model-meta.ts
 * @description SEO copy for the `/inference/<model>` and `/zh/inference/<model>`
 * pages, shared by both page files so the English and Chinese descriptions
 * cannot drift structurally. Prose style mirrors `TAB_META.inference` /
 * `TAB_META_ZH.inference` with the model name substituted in.
 */
import type { InferenceModelSlug } from '@/lib/inference-model-slug';

export interface InferenceModelMeta {
  title: string;
  description: string;
}

/** `label` adds detail beyond `seoName` (e.g. parameter count) for most
 * models, but for some they are identical — skip the parenthetical then so
 * the description doesn't read "DeepSeek R1 (DeepSeek R1)". */
function nameWithDetail(entry: InferenceModelSlug): string {
  return entry.label === entry.seoName ? entry.seoName : `${entry.seoName} (${entry.label})`;
}

export function inferenceModelMeta(entry: InferenceModelSlug): InferenceModelMeta {
  return {
    // Lead with the model name — that's the phrase people search
    // ("kimi k3 inference benchmark") and it must survive Google's ~60-char
    // SERP truncation.
    title: `${entry.seoName} Inference Benchmarks`,
    description:
      `Compare ${nameWithDetail(entry)} latency, throughput, cost, and ` +
      'time-to-first-token across chips and serving frameworks. Every datapoint is ' +
      'produced by a public, reproducible GitHub Actions run.',
  };
}

export function inferenceModelMetaZh(entry: InferenceModelSlug): InferenceModelMeta {
  // Model names, SKUs, and product names stay in English per the translation
  // quality bar; the surrounding prose follows TAB_META_ZH.inference.
  return {
    title: `${entry.seoName} 推理基准测试`,
    description:
      `跨芯片与推理框架，对比 ${nameWithDetail(entry)} 推理的延迟、吞吐量、` +
      '成本与首 token 延迟（TTFT）。每个数据点都来自公开的 GitHub Actions 运行，可复现、可审计。',
  };
}
