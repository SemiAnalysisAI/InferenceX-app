export const SITE_NAME = 'InferenceX';
export const SITE_URL = 'https://inferencex.semianalysis.com';
export const AUTHOR_NAME = 'SemiAnalysis';
export const AUTHOR_URL = 'https://semianalysis.com';
export const AUTHOR_HANDLE = '@SemiAnalysis_';
export const SITE_TITLE = `${SITE_NAME} by ${AUTHOR_NAME} — AgentX & AI Inference Benchmark`;
export const DESCRIPTION =
  'InferenceX is the open-source, vendor-neutral AI inference benchmark for AgentX long-context, multi-turn agentic coding and fixed-sequence serving workloads. Compare reproducible latency, throughput, cost, and efficiency results across NVIDIA, AMD, and other accelerators.';
/**
 * Social-proof line woven into page meta descriptions to lift search CTR. The
 * named supporters mirror the published /quotes supporters page so the copy
 * stays accurate (see packages/app/src/app/quotes/page.tsx). Vendors being
 * benchmarked (NVIDIA, AMD) are deliberately omitted here to preserve the
 * "independent, vendor-neutral" framing.
 */
export const SUPPORTERS_LINE = 'Supported by OpenAI, Microsoft & the PyTorch Foundation.';
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

/**
 * Simplified Chinese equivalents for the /zh page tree. Brand and product
 * names (InferenceX, SemiAnalysis, GPU SKUs) stay in English per the
 * translation quality bar in AGENTS.md.
 */
export const SITE_TITLE_ZH = `${SITE_NAME} by ${AUTHOR_NAME} — AgentX 智能体与 AI 推理基准测试`;
export const DESCRIPTION_ZH =
  'InferenceX 是开源、厂商中立的 AI 推理基准测试，覆盖 AgentX 长上下文多轮智能体编码与固定序列服务工作负载。基于可复现的公开运行，跨 NVIDIA、AMD 等加速器对比延迟、吞吐量、成本与能效。';
export const SUPPORTERS_LINE_ZH = '获得 OpenAI、Microsoft 与 PyTorch 基金会的支持。';
