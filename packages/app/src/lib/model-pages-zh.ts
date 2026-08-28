import type { Locale } from '@/lib/i18n';

import { getModelPage, type ModelPage } from './model-pages';

export interface ModelPageZhTranslation {
  description: string;
  releaseDate: string;
}

export const MODEL_PAGE_ZH = {
  'deepseek-r1': {
    description:
      'DeepSeek 的 MoE 推理模型，总参数量 671B、每个 token 激活 37B，采用多头潜在注意力（MLA），并以 MIT 许可证发布。',
    releaseDate: '2025 年 5 月 28 日',
  },
  'deepseek-v4': {
    description:
      'DeepSeek 旗舰 MoE 模型，总参数量 1.6T、每个 token 激活 49B，采用 CSA+HCA 混合稀疏注意力，支持 1M token 上下文，并以 MIT 许可证开放权重。',
    releaseDate: '2026 年 4 月 24 日（预览版）；2026 年 8 月 13 日（V4-Pro-0813 正式版）',
  },
  'glm-5-1': {
    description:
      'Z.ai 的 MoE 模型系列，总参数量 744B、每个 token 激活 40B 参数，采用 DeepSeek 稀疏注意力（DSA），使用 28.5T token 训练，并以 MIT 许可证发布。',
    releaseDate: '2026 年 2 月 11 日（GLM-5）；2026 年 4 月 7 日（GLM-5.1）',
  },
  'glm-5-2': {
    description:
      'Z.ai 的 744B 级 MoE 模型系列，借助 IndexShare 将稀疏注意力扩展至 1M token 上下文；GLM-5.3 还加入了一轮大规模智能体后训练。',
    releaseDate: '2026 年 6 月 16 日（GLM-5.2）；2026 年 8 月 14 日（GLM-5.3）',
  },
  'gptoss-120b': {
    description:
      'OpenAI 的开放权重 MoE 模型，总参数量 117B、每个 token 激活 5.1B，交替采用稠密注意力和滑动窗口注意力，并原生使用 MXFP4 量化，以 Apache 2.0 许可证发布。',
    releaseDate: '2025 年 8 月 5 日',
  },
  'kimi-k26': {
    description:
      'Moonshot AI 的 MoE 模型系列，总参数量 1T、每个 token 激活 32B，采用类似 DeepSeek-V3 的 MLA 主干，原生支持 INT4 量化和 256K token 上下文。',
    releaseDate:
      '2026 年 1 月 27 日（K2.5）；2026 年 4 月 20 日（K2.6）；2026 年 6 月 12 日（K2.7-Code）',
  },
  'kimi-k3': {
    description:
      'Moonshot AI 的旗舰 MoE 模型，总参数量 2.8T、每个 token 激活 104B，基于 Kimi Delta Attention 与 Gated MLA 构建，原生支持视觉输入和 1M token 上下文。',
    releaseDate: '2026 年 7 月 16 日（最迟于 2026 年 7 月 27 日开放权重）',
  },
  'llama-3-3-70b': {
    description:
      'Meta 推出的 70B 稠密 Transformer，经过指令微调，采用 GQA，支持 128K token 上下文，并以 Llama 3.3 Community License 发布。',
    releaseDate: '2024 年 12 月 6 日',
  },
  'minimax-m27': {
    description:
      'MiniMax 的 MoE 模型系列，总参数量 229B、每个 token 激活约 10B，采用 GQA 和 FP8 分块量化，并支持 192K token 上下文。',
    releaseDate: '2026 年 2 月 12 日（M2.5）；2026 年 3 月 18 日（M2.7）',
  },
  'minimax-m3': {
    description:
      'MiniMax 的多模态 MoE 模型，总参数量约 428B、每个 token 激活约 23B，采用 GQA，支持 1M token 上下文，并包含 7 个多 token 预测模块。',
    releaseDate: '2026 年 6 月 1 日',
  },
  'qwen-3-5': {
    description:
      'Alibaba 的 MoE 模型，总参数量 397B、每个 token 激活 17B 参数，采用按 3:1 比例堆叠的 Gated DeltaNet 与 Gated Attention 混合架构，原生支持 262K token 上下文，权重以 Apache 2.0 许可证发布。',
    releaseDate: '2026 年 2 月',
  },
  'qwen-3-8-flash-next': {
    description:
      'Alibaba 对 Qwen4 架构的开放权重预览：总参数量 176B，其中主模型 125B、n-gram 嵌入表 51B，每个 token 激活 6B，并采用 Qwen 稀疏注意力、门控残差与 Gated DeltaNet 混合层。',
    releaseDate: '2026 年 8 月',
  },
} as const satisfies Record<string, ModelPageZhTranslation>;

export function getLocalizedModelPage(slug: string, locale: Locale): ModelPage | null {
  const page = getModelPage(slug);
  if (!page || locale === 'en') return page;

  const translation = MODEL_PAGE_ZH[slug as keyof typeof MODEL_PAGE_ZH];
  if (!translation) return null;
  return {
    ...page,
    meta: {
      ...page.meta,
      description: translation.description,
      releaseDate: translation.releaseDate,
    },
  };
}
