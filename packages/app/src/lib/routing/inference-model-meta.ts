import type { InferenceModelSlug } from '@/lib/routing/inference-model-slug';

export interface InferenceModelMeta {
  title: string;
  description: string;
}

const MAX_DESCRIPTION_LENGTH = 155;
const MAX_DESCRIPTION_LENGTH_ZH = 120;

function nameWithDetail(entry: InferenceModelSlug): string {
  return entry.label === entry.seoName ? entry.seoName : `${entry.seoName} (${entry.label})`;
}

const describe = (name: string) =>
  `Compare ${name} latency, throughput, cost and TTFT across chips and serving frameworks, ` +
  'from public, reproducible GitHub Actions runs.';

export function inferenceModelMeta(entry: InferenceModelSlug): InferenceModelMeta {
  const detailed = describe(nameWithDetail(entry));
  return {
    title: `${entry.seoName} Inference Benchmarks`,
    description: detailed.length <= MAX_DESCRIPTION_LENGTH ? detailed : describe(entry.seoName),
  };
}

const describeZh = (name: string) =>
  `跨芯片与推理框架，对比 ${name} 推理的延迟、吞吐量、` +
  '成本与首 token 延迟（TTFT）。每个数据点都来自公开的 GitHub Actions 运行，可复现、可审计。';

export function inferenceModelMetaZh(entry: InferenceModelSlug): InferenceModelMeta {
  const detailed = describeZh(nameWithDetail(entry));
  return {
    title: `${entry.seoName} 推理基准测试`,
    description:
      detailed.length <= MAX_DESCRIPTION_LENGTH_ZH ? detailed : describeZh(entry.seoName),
  };
}
