import type { Metadata } from 'next';

import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { ZH_OG_LOCALE, zhAlternates, zhPath } from '@/lib/i18n';

export const LANDING_META_ZH = {
  title: '开源 AI 推理基准测试',
  description:
    '跨 GPU 与推理框架对比 AI 推理性能。基于 NVIDIA GB200、B200、AMD MI355X 等硬件的真实基准测试。免费、开源、持续更新。',
};

export const ZH_TAB_KEYS = [
  'inference',
  'evaluation',
  'historical',
  'calculator',
  'reliability',
  'gpu-specs',
  'gpu-metrics',
  'submissions',
  'ai-chart',
  'current-inferencex-image',
  'feedback',
] as const;

export type ZhTabKey = (typeof ZH_TAB_KEYS)[number];

export function isZhTab(tab: string): tab is ZhTabKey {
  return (ZH_TAB_KEYS as readonly string[]).includes(tab);
}

export const TAB_META_ZH: Record<ZhTabKey, { title: string; description: string }> = {
  inference: {
    title: 'AI 推理基准测试',
    description:
      '跨 GPU 与云服务商对比 AI 推理延迟、吞吐量与首 token 延迟（TTFT）。基于 NVIDIA GB200、H100、AMD MI355X 等硬件的真实基准测试。',
  },
  evaluation: {
    title: 'LLM 评估结果',
    description: 'LLM 评估得分与准确率基准测试。使用标准化评估指标对比各服务商的模型质量。',
  },
  historical: {
    title: '历史推理性能趋势',
    description:
      '跟踪 AI 推理性能随时间的变化。历史基准测试数据展示各 GPU 与服务商在延迟、吞吐量和成本上的改进。',
  },
  calculator: {
    title: '吞吐量与 TCO 计算器',
    description:
      '计算 AI 推理吞吐量与总拥有成本（TCO）。跨硬件配置对比 LLM 推理服务的 GPU 成本效益。',
  },
  reliability: {
    title: '服务商可靠性指标',
    description: 'AI 推理服务商可靠性与可用性跟踪。对比各 GPU 云服务商的错误率与可用性。',
  },
  'gpu-specs': {
    title: 'GPU 规格与对比',
    description:
      '面向 AI 推理的详细 GPU 规格。对比 NVIDIA、AMD 与 Intel GPU 的显存带宽、FLOPS、互连与拓扑。',
  },
  'gpu-metrics': {
    title: 'GPU 功耗与能效指标',
    description: 'AI 推理负载下的 GPU 功耗与能效指标。跨硬件对比每瓦 token 数。',
  },
  submissions: {
    title: '基准测试提交记录',
    description:
      '提交到 InferenceX 的全部基准测试配置。查看各 GPU 厂商的提交历史、活动趋势与数据点数量。',
  },
  'ai-chart': {
    title: 'AI 驱动的图表生成',
    description: '使用自然语言提示生成自定义推理基准测试图表。借助 AI 对比 GPU、成本与性能。',
  },
  'current-inferencex-image': {
    title: 'InferenceX 当前镜像',
    description:
      '各模型、GPU SKU 和配置的当前 InferenceX Docker 镜像标签。对比已部署镜像与最新 vLLM 和 SGLang 发布版本，标记过期标签。',
  },
  feedback: {
    title: '用户反馈',
    description: '内部工具：解密并查看用户提交的反馈。',
  },
};

/**
 * Server-rendered Chinese intro shown above the interactive dashboard on each
 * /zh tab page. The charts themselves render in English; this block gives
 * crawlers and readers genuine Chinese content describing the page.
 */
export const TAB_INTRO_ZH: Record<ZhTabKey, string> = {
  inference:
    '本页面展示 InferenceX 的 AI 推理基准测试结果：跨 GPU、推理框架与模型对比吞吐量（token/s/GPU）、交互性（token/s/用户）、首 token 延迟（TTFT）等指标。每个数据点都来自公开的 GitHub Actions 工作流，可复现、可审计。',
  evaluation:
    '本页面展示 LLM 评估（evaluation）结果：使用标准化评估集对比各模型与部署配置的准确率，验证推理优化不会损害模型质量。',
  historical:
    '本页面展示历史趋势图表：跟踪各 GPU、框架与模型的推理性能随时间的演进，量化软件栈优化带来的收益。',
  calculator:
    '本页面提供吞吐量与总拥有成本（TCO）计算器：基于真实基准测试数据，估算不同 GPU 配置下 LLM 推理服务的每百万 token 成本与性价比。',
  reliability:
    '本页面展示基准测试基础设施的可靠性指标：各 GPU 集群与服务商的运行成功率、错误率与可用性。',
  'gpu-specs':
    '本页面提供 GPU 规格对比：NVIDIA、AMD 等厂商加速器的显存容量、显存带宽、FLOPS、互连拓扑与功耗规格。',
  'gpu-metrics':
    '本页面展示 GPU 功耗与能效指标（PowerX）：推理负载下的实测功耗、每瓦 token 数与每兆瓦 token 产出。',
  submissions:
    '本页面列出提交到 InferenceX 的全部基准测试配置：按 GPU 厂商查看提交历史、活动趋势与数据点数量。',
  'ai-chart':
    '本页面提供 AI 驱动的图表生成工具：用自然语言描述您想查看的图表，系统会根据 InferenceX 基准测试数据自动生成可视化结果。',
  'current-inferencex-image':
    '本页面展示 InferenceX 当前使用的 Docker 镜像标签：按模型、GPU SKU 和配置列出已部署版本，并与上游 vLLM、SGLang 最新发布版本对比，方便排查过期镜像。',
  feedback:
    '本页面为内部反馈查看器：使用解密密钥在浏览器中解密并查阅用户提交的反馈内容，密钥不会离开此页面。',
};

/** Chinese labels for the dashboard tab bar (TabNav) on /zh pages. */
export const TAB_LABELS_ZH: Record<string, string> = {
  overview: '总览',
  inference: '推理性能',
  evaluation: '准确率评估',
  historical: '历史趋势',
  calculator: 'TCO 计算器',
  reliability: '可靠性',
  'gpu-specs': 'GPU 规格',
  'gpu-metrics': 'GPU 功耗',
  submissions: '提交记录',
  'ai-chart': 'AI 图表',
  'current-inferencex-image': '镜像',
  feedback: '反馈',
};

/** Chinese labels for the site header nav on /zh pages, keyed by English href. */
export const NAV_LABELS_ZH: Record<string, string> = {
  '/': '首页',
  '/inference': '仪表板',
  '/compare': 'GPU 对比',
  '/quotes': '支持者',
  '/datasets': '数据集',
  '/blog': '文章',
  '/about': '关于',
};

const TITLE_SUFFIX = `${SITE_NAME} by ${AUTHOR_NAME}`;

/** Generate Next.js Metadata for a /zh tab page (mirrors `tabMetadata`). */
export function tabMetadataZh(tab: ZhTabKey): Metadata {
  const meta = TAB_META_ZH[tab];
  // The English inference tab canonicalizes to the site root; mirror that.
  const enPath = tab === 'inference' ? '/' : `/${tab}`;
  const url = `${SITE_URL}${zhPath(enPath)}`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: zhAlternates(enPath),
    openGraph: {
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.description,
      url,
      locale: ZH_OG_LOCALE,
    },
    twitter: {
      title: `${meta.title} | ${TITLE_SUFFIX}`,
      description: meta.description,
    },
  };
}
