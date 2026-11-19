import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { zhAlternates, zhPath } from '@/lib/i18n/i18n';
import type { ModelRoute, ModelRouteTab } from '@/lib/routing/model-routes';
import {
  AGENTX_ROUTE,
  getDashboardRoute,
  isDashboardRouteKey,
  type DashboardRoute,
  type DashboardRouteKey,
} from '@/lib/routing/dashboard-routes';
import { socialMetadata } from '@/lib/seo/social-metadata';

export const LANDING_META_ZH = {
  title: 'AI 加速器系统基准测试',
  description:
    '比较不同芯片和推理框架在 AgentX 与固定序列场景下的推理性能。AgentX 是 InferenceX 面向长上下文、多轮编码的测试场景；NVIDIA 和 AMD 的公开运行结果会随配置变化更新。',
};

export const isZhTab = isDashboardRouteKey;

export const TAB_META_ZH: Record<DashboardRouteKey, { title: string; description: string }> = {
  powerx: {
    title: 'PowerX：实测 GPU 功耗与每 Token 能耗',
    description:
      '查看每个 InferenceX 基准测试点的实测 GPU 功耗、每 Token 能耗和功耗时间线，以及模型估算的服务器与数据中心开销。',
  },
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
  fleet: {
    title: '集群生命周期经济性',
    description:
      '测算固定 AI 推理集群在整个生命周期内的经济性：按设施功率预算确定集群规模，并跟踪实测软件配置随时间改进带来的收入、成本与利润变化。',
  },
  'first-token': {
    title: '首 token 延迟约束',
    description:
      '在给定最低交互性下，按各档首 token 延迟（TTFT）上限，找出各芯片厂商成本最低的实测 AI 推理配置。仅使用实测数据，不做插值，适用于任意模型与工作负载。',
  },
  'cache-reuse': {
    title: '前缀缓存复用',
    description:
      '查看 AI 推理配置在并发数上升时 prompt token 的来源：HBM 缓存命中、主机层缓存命中，还是重新计算。数据取自运行时实测的缓存计数，覆盖全部模型与芯片。',
  },
  'profit-estimator': {
    title: '推理利润估算器',
    description:
      '估算每款芯片每小时的 AI 推理收益：在选定交互性与利用率下的收入，拆分为算力支出（TCO $/chip/hr）、模型许可费与运营方利润。',
  },
  'profit-estimator-per-gigawatt': {
    title: '每吉瓦推理利润估算器',
    description:
      '估算每款芯片一个吉瓦年的 AI 推理收益：在选定交互性与利用率下的收入，拆分为算力支出（TCO）、模型许可费与运营方利润。',
  },
  'gpu-specs': {
    title: '芯片规格与对比',
    description:
      '面向 AI 推理的详细芯片规格。对比 NVIDIA、AMD 与 Intel 芯片的显存带宽、FLOPS、互连与拓扑。',
  },
  operatorx: {
    title: 'OperatorX GEMM、Attention 和 MoE 基准测试',
    description:
      '查看 OperatorX 实测 GEMM、attention 和路由 MoE 的单卡 TFLOPS 与延迟，按形状、精度和后端筛选，并检查运行覆盖情况。',
  },
  'agentic-workload-explorer': {
    title: 'Agentic Workload Explorer 智能体负载探索',
    description:
      '浏览 ProxyTrace 采集的真实 coding agent 流量冻结匿名快照：会话、token 流向、前缀缓存复用、延迟、工具调用与成本。',
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
  video: {
    title: 'VideoGenX 生成结果',
    description: '比较匹配的视频、延迟、吞吐量、GPU 板卡能耗和两种 GPU 成本口径，并保留 CI 证据。',
  },
  feedback: {
    title: '用户反馈',
    description: '内部工具：解密并查看用户提交的反馈。',
  },
};

export const TAB_LABELS_ZH: Record<DashboardRouteKey, string> = {
  powerx: 'PowerX 功耗',
  inference: '推理性能',
  evaluation: '准确率评估',
  historical: '历史趋势',
  calculator: 'TCO 计算器',
  fleet: '集群生命周期',
  'first-token': '首 token 延迟约束',
  'cache-reuse': '前缀缓存复用',
  'profit-estimator': '利润估算',
  'profit-estimator-per-gigawatt': '每吉瓦利润估算',
  'gpu-specs': '芯片规格',
  operatorx: 'OperatorX 算子',
  collectivex: 'CollectiveX 通信',
  'agentic-workload-explorer': '智能体负载',
  submissions: '提交记录',
  'ai-chart': 'AI 图表',
  'current-inferencex-image': '镜像',
  video: 'VideoGenX 视频',
  feedback: '反馈',
};

export type HeaderNavHref =
  | '/'
  | typeof AGENTX_ROUTE.path
  | '/overview'
  | Extract<DashboardRoute, { key: 'inference' }>['path']
  | '/ubx'
  | '/about';

export const NAV_LABELS_ZH: Record<HeaderNavHref, string> = {
  '/': '首页',
  '/overview': '总览',
  [getDashboardRoute('inference').path]: '仪表板',
  '/ubx': 'uBenchX',
  [AGENTX_ROUTE.path]: 'AgentX',
  '/about': '关于',
};

export const MODEL_TAB_META_ZH: Record<
  ModelRouteTab,
  {
    title: (seoName: string) => string;
    description: (seoName: string) => string;
  }
> = {
  historical: {
    title: (seoName) => `${seoName} 历史推理性能趋势`,
    description: (seoName) =>
      `跟踪 ${seoName} 推理性能随时间的变化。历史基准测试数据展示各芯片与服务商运行 ${seoName} 时在延迟、吞吐量和成本上的改进。`,
  },
  calculator: {
    title: (seoName) => `${seoName} 吞吐量与 TCO 计算器`,
    description: (seoName) =>
      `计算 ${seoName} 推理的吞吐量与总拥有成本（TCO）。跨硬件配置对比 ${seoName} 推理服务的芯片成本效益。`,
  },
  'profit-estimator': {
    title: (seoName) => `${seoName} 推理利润估算器`,
    description: (seoName) =>
      `估算每款芯片每小时运行 ${seoName} 智能体推理的收益：在选定交互性与利用率下的收入，拆分为算力支出（TCO $/chip/hr）、模型许可费与运营方利润。`,
  },
  'profit-estimator-per-gigawatt': {
    title: (seoName) => `${seoName} 每吉瓦推理利润估算器`,
    description: (seoName) =>
      `估算每款芯片一个吉瓦年运行 ${seoName} 智能体推理的收益：在选定交互性与利用率下的收入，拆分为算力支出（TCO）、模型许可费与运营方利润。`,
  },
};

export function modelTabMetadataZh(
  tab: ModelRouteTab,
  route: ModelRoute,
  canonicalEnPath: string,
): Metadata {
  const meta = MODEL_TAB_META_ZH[tab];
  const title = meta.title(route.seoName);
  const description = meta.description(route.seoName);
  const url = `${SITE_URL}${zhPath(canonicalEnPath)}`;
  return {
    title,
    description,
    alternates: zhAlternates(canonicalEnPath),
    ...socialMetadata({ title: `${title} | ${SITE_NAME}`, description, url, locale: 'zh' }),
  };
}

export function tabMetadataZh(tab: DashboardRouteKey): Metadata {
  const meta = TAB_META_ZH[tab];
  const enPath = getDashboardRoute(tab).canonicalPath;
  const url = `${SITE_URL}${zhPath(enPath)}`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: zhAlternates(enPath),
    ...socialMetadata({
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.description,
      url,
      locale: 'zh',
    }),
  };
}
