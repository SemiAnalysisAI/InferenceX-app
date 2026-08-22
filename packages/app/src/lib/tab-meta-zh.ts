import type { Metadata } from 'next';

import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { ZH_OG_LOCALE, zhAlternates, zhPath } from '@/lib/i18n';
import {
  getDashboardRoute,
  isDashboardRouteKey,
  type DashboardRouteKey,
} from '@/lib/dashboard-routes';

export const LANDING_META_ZH = {
  title: '开源智能体推理基准测试',
  description:
    '比较不同芯片和推理框架在 AgentX 与固定序列场景下的推理性能。AgentX 是 InferenceX 面向长上下文、多轮编码的测试场景；NVIDIA 和 AMD 的公开运行结果会随配置变化更新。',
};

export const isZhTab = isDashboardRouteKey;

export const TAB_META_ZH: Record<DashboardRouteKey, { title: string; description: string }> = {
  inference: {
    title: '智能体推理基准测试',
    description:
      '跨芯片与推理框架，对比智能体推理和固定序列 AI 推理的延迟、吞吐量、成本与首 token 延迟（TTFT）。AgentX 提供长上下文多轮编码工作负载。',
  },
  evaluation: {
    title: 'LLM 评估结果',
    description: 'LLM 评估得分与准确率基准测试。使用标准化评估指标对比各服务商的模型质量。',
  },
  historical: {
    title: '历史推理性能趋势',
    description:
      '跟踪 AI 推理性能随时间的变化。历史基准测试数据展示各芯片与服务商在延迟、吞吐量和成本上的改进。',
  },
  calculator: {
    title: '吞吐量与 TCO 计算器',
    description:
      '计算 AI 推理吞吐量与总拥有成本（TCO）。跨硬件配置对比 LLM 推理服务的芯片成本效益。',
  },
  reliability: {
    title: '服务商可靠性指标',
    description: 'AI 推理服务商可靠性与可用性跟踪。对比各芯片云服务商的错误率与可用性。',
  },
  'gpu-specs': {
    title: '芯片规格与对比',
    description:
      '面向 AI 推理的详细芯片规格。对比 NVIDIA、AMD 与 Intel 芯片的显存带宽、FLOPS、互连与拓扑。',
  },
  'gpu-metrics': {
    title: '芯片功耗与能效指标',
    description: 'AI 推理负载下的芯片功耗与能效指标。跨硬件对比每瓦 token 数。',
  },
  collectivex: {
    title: 'CollectiveX 通信基准测试',
    description:
      '跨 NVIDIA 与 AMD 芯片平台对比专家并行（EP）通信性能，包括混合专家（MoE）分发（dispatch）、合并（combine）延迟与逻辑载荷速率。',
  },
  submissions: {
    title: '基准测试提交记录',
    description:
      '提交到 InferenceX 的全部基准测试配置。查看各芯片厂商的提交历史、活动趋势与数据点数量。',
  },
  'ai-chart': {
    title: 'AI 驱动的图表生成',
    description: '使用自然语言提示生成自定义推理基准测试图表。借助 AI 对比芯片、成本与性能。',
  },
  'current-inferencex-image': {
    title: 'InferenceX 当前镜像',
    description:
      '各模型、芯片 SKU 和配置的当前 InferenceX Docker 镜像标签。对比已部署镜像与最新 vLLM 和 SGLang 发布版本，标记过期标签。',
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
export const TAB_INTRO_ZH: Record<DashboardRouteKey, string> = {
  inference:
    '本页面展示 InferenceX 的智能体推理与固定序列 AI 推理基准测试结果：跨芯片、推理框架与模型对比吞吐量（token/s/chip）、交互性（token/s/用户）、首 token 延迟（TTFT）等指标。智能体推理数据来自 AgentX；该场景对公开智能体编码轨迹衍生出的长上下文、多轮、含 subagent 工作负载进行回放。每个数据点都来自公开的 GitHub Actions 工作流，可复现、可审计。',
  evaluation:
    '本页面展示 LLM 评估（evaluation）结果：使用标准化评估集对比各模型与部署配置的准确率，验证推理优化不会损害模型质量。',
  historical:
    '本页面展示历史趋势图表：跟踪各芯片、框架与模型的推理性能随时间的演进，量化软件栈优化带来的收益。',
  calculator:
    '本页面提供吞吐量与总拥有成本（TCO）计算器：基于真实基准测试数据，估算不同芯片配置下 LLM 推理服务的每百万 token 成本与性价比。',
  reliability:
    '本页面展示基准测试基础设施的可靠性指标：各芯片集群与服务商的运行成功率、错误率与可用性。',
  'gpu-specs':
    '本页面提供芯片规格对比：NVIDIA、AMD 等厂商加速器的显存容量、显存带宽、FLOPS、互连拓扑与功耗规格。',
  'gpu-metrics':
    '本页面展示芯片功耗与能效指标（PowerX）：推理负载下的实测功耗、每瓦 token 数与每兆瓦 token 产出。',
  collectivex:
    '本页面展示 CollectiveX 专家并行（EP）通信基准测试结果：在统一工作负载、正确性校验与采样协议下，对比 DeepEP、MoRI、UCCL 及 NCCL/RCCL 参考实现的分发（dispatch）、合并（combine）与完整往返延迟。跨芯片速率均按逻辑载荷计算；只有发布器确认完整且稳定的官方队列才会生成排名与推荐。',
  submissions:
    '本页面列出提交到 InferenceX 的全部基准测试配置：按芯片厂商查看提交历史、活动趋势与数据点数量。',
  'ai-chart':
    '本页面提供 AI 驱动的图表生成工具：用自然语言描述您想查看的图表，系统会根据 InferenceX 基准测试数据自动生成可视化结果。',
  'current-inferencex-image':
    '本页面展示 InferenceX 当前使用的 Docker 镜像标签：按模型、芯片 SKU 和配置列出已部署版本，并与上游 vLLM、SGLang 最新发布版本对比，方便排查过期镜像。',
  feedback:
    '本页面为内部反馈查看器：使用解密密钥在浏览器中解密并查阅用户提交的反馈内容，密钥不会离开此页面。',
};

/** Chinese labels for the dashboard tab bar (TabNav) on /zh pages. */
export const TAB_LABELS_ZH: Record<DashboardRouteKey, string> = {
  inference: '推理性能',
  evaluation: '准确率评估',
  historical: '历史趋势',
  calculator: 'TCO 计算器',
  reliability: '可靠性',
  'gpu-specs': '芯片规格',
  'gpu-metrics': '芯片功耗',
  collectivex: 'CollectiveX 通信',
  submissions: '提交记录',
  'ai-chart': 'AI 图表',
  'current-inferencex-image': '镜像',
  feedback: '反馈',
};

export type HeaderNavHref =
  | '/'
  | '/agentx'
  | '/overview'
  | '/inference'
  | '/inference/agentic'
  | '/compare'
  | '/about';

/** Chinese labels for the site header nav, keyed by its exact English href set. */
export const NAV_LABELS_ZH: Record<HeaderNavHref, string> = {
  '/': '首页',
  '/overview': '总览',
  '/inference': '仪表板',
  '/inference/agentic': '遥测数据',
  '/compare': '性能对比',
  '/agentx': 'AgentX',
  '/about': '关于',
};

const TITLE_SUFFIX = `${SITE_NAME} by ${AUTHOR_NAME}`;

/** Generate Next.js Metadata for a /zh tab page (mirrors `tabMetadata`). */
export function tabMetadataZh(tab: DashboardRouteKey): Metadata {
  const meta = TAB_META_ZH[tab];
  const enPath = getDashboardRoute(tab).canonicalPath;
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
