import type { InferenceModelSlug } from '@/lib/routing/inference-model-slug';

export interface InferenceModelMeta {
  title: string;
  description: string;
}

function nameWithDetail(entry: InferenceModelSlug): string {
  return entry.label === entry.seoName ? entry.seoName : `${entry.seoName} (${entry.label})`;
}

export function inferenceModelMeta(entry: InferenceModelSlug): InferenceModelMeta {
  return {
    title: `${entry.seoName} Inference Benchmarks`,
    description:
      `Compare ${nameWithDetail(entry)} latency, throughput, cost, and ` +
      'time-to-first-token across chips and serving frameworks. Every datapoint is ' +
      'produced by a public, reproducible GitHub Actions run.',
  };
}

export function inferenceModelMetaZh(entry: InferenceModelSlug): InferenceModelMeta {
  return {
    title: `${entry.seoName} 推理基准测试`,
    description:
      `跨芯片与推理框架，对比 ${nameWithDetail(entry)} 推理的延迟、吞吐量、` +
      '成本与首 token 延迟（TTFT）。每个数据点都来自公开的 GitHub Actions 运行，可复现、可审计。',
  };
}
