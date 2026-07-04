export const SITE_NAME = 'InferenceX';
export const SITE_URL = 'https://inferencex.semianalysis.com';
export const AUTHOR_NAME = 'SemiAnalysis';
export const AUTHOR_URL = 'https://semianalysis.com';
export const AUTHOR_HANDLE = '@SemiAnalysis_';
export const SITE_TITLE = `${SITE_NAME} by ${AUTHOR_NAME} — AI Inference Benchmark`;
export const DESCRIPTION =
  'InferenceX is the open-source AI inference benchmark that matches the rapid pace of modern AI development. Powered by one of the largest open-source GPU CI/CD fleets with NVIDIA GB200, AMD MI355X & many more.';
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
export const SITE_TITLE_ZH = `${SITE_NAME} by ${AUTHOR_NAME} — AI 推理基准测试`;
export const DESCRIPTION_ZH =
  'InferenceX 是紧跟现代 AI 发展节奏的开源 AI 推理基准测试，由规模领先的开源 GPU CI/CD 集群持续驱动，涵盖 NVIDIA GB200、AMD MI355X 等众多硬件。';
export const SUPPORTERS_LINE_ZH = '获得 OpenAI、Microsoft 与 PyTorch 基金会的支持。';
