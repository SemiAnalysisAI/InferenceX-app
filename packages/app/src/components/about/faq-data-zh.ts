import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import { GENERATED_FAQ_DATA, type FaqItem } from '@/components/about/faq';

/* ---------- FAQ content (Simplified Chinese) ---------- */

export const FAQ_ITEMS_ZH: readonly FaqItem[] = [
  {
    id: 'faq-what-is-inferencex',
    question: '什么是 InferenceX？',
    answer:
      'InferenceX（原名 InferenceMAX）持续衡量各类芯片和软件栈的智能体推理与固定序列推理性能。AgentX 是其长上下文多轮编码场景。配置发生变化时，基准测试会重新运行。',
  },
  {
    id: 'faq-who-builds-inferencex',
    question: 'InferenceX 由谁开发？',
    answer: `InferenceX 由独立半导体与 AI 研究机构 SemiAnalysis 构建，受到 ${GENERATED_FAQ_DATA.supporterOrgs.join('、')} 的支持与信赖。基准测试代码、数据和仪表板均在 GitHub 上开源。`,
  },
  {
    id: 'faq-chips',
    question: 'InferenceX 测试了哪些芯片？',
    answer: '新加速器可用后，我们会持续将其纳入基准测试。',
    list: GENERATED_FAQ_DATA.gpuGroups,
  },
  {
    id: 'faq-models',
    question: '测试了哪些 AI 模型？',
    answer:
      '各模型会在相应的固定序列配置（1k/1k、1k/8k、8k/1k tokens）和多个并发级别下接受测试；如果已有对应数据，还会运行 AgentX 长上下文多轮智能体编码场景。',
    list: GENERATED_FAQ_DATA.modelNames,
  },
  {
    id: 'faq-frameworks-configurations',
    question: '测试了哪些推理框架和配置？',
    answer: '',
    list: [
      `框架：${GENERATED_FAQ_DATA.frameworkNames.join(', ')}`,
      `精度：${GENERATED_FAQ_DATA.precisionNames.join(', ')}`,
      '运行时：CUDA、ROCm',
      '分离式推理（Disaggregated serving，独立的 prefill/decode 芯片池）',
      '多 token 预测（MTP）',
      '面向 MoE 模型的宽专家并行（Wide Expert Parallelism）',
    ],
  },
  {
    id: 'faq-metrics',
    question: 'InferenceX 测量哪些指标？',
    answer: '',
    list: [
      '交互性（tok/s/user）',
      '每芯片 token 吞吐量（tok/s/chip）',
      '每芯片输入和输出吞吐量',
      '每兆瓦 token 吞吐量（tok/s/MW）',
      'P99 首 token 延迟（TTFT）',
      'AgentX 场景的端到端延迟、token 间延迟（ITL）、输出吞吐量、prefix cache 行为以及会话与 subagent 执行情况',
      '每百万 token 成本（总计、输入、输出）——涵盖超大规模云、NeoCloud 和裸机租赁定价',
      '每 token 能耗（焦耳，总计、输入、输出）',
      '用户自定义成本和功耗计算',
    ],
  },
  {
    id: 'faq-normalized-interactivity',
    question: '端到端归一化交互性与交互性有何区别？',
    answer:
      '交互性衡量生成开始后 token 的流式输出速度，近似为 token 间延迟（ITL）的倒数。端到端归一化交互性衡量整个请求期间的有效 token 速率，其中包含首 token 延迟（TTFT）：输出 token 数 / 端到端延迟，近似为 1 /（ITL + TTFT / 输出 token 数）。两者的单位均为 tok/s/user。TTFT 越长，归一化指标越低，短回答受到的影响尤其明显。这里的“归一化”是指按输出长度归一，并非 0–1 分数，也不是相对于其他系统的比较值。',
  },
  {
    id: 'faq-benchmark-frequency',
    question: '基准测试多久运行一次？',
    answer:
      '基准测试最初按每日计划运行，但随着硬件/框架/模型组合数量的增长，这种方式已不再可行。现在，当配置发生变化（例如新软件发布、驱动更新或模型添加）时重新运行。仪表板中保留了历史数据。',
  },
  {
    id: 'faq-open-source',
    question: 'InferenceX 是开源的吗？',
    answer: '是的。代码、数据和仪表板均为开源。',
    link: {
      text: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      href: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
    },
  },
  {
    id: 'faq-benchmark-differences',
    question: 'InferenceX 与其他 AI 基准测试有何不同？',
    answer:
      'InferenceX 在真实硬件上运行固定序列工作负载和 AgentX 长上下文多轮编码场景。测试配置保存在代码仓库中，每项结果都链接到对应的 GitHub Actions 运行记录。',
  },
  {
    id: 'faq-reproducibility',
    question: '结果如何实现可复现？',
    answer:
      '仪表板上的每个数据点都由公开的 GitHub Actions 工作流生成。测试配置（模型、框架、精度、并行度、序列长度和并发数）保存在代码仓库中，并在对应的目标硬件上运行。日志、指标和芯片追踪数据等产物会上传到运行记录页面。每个图表的提示框都提供链接，可直接打开生成该数据点的 GitHub Actions 运行记录。',
  },
  {
    id: 'faq-raw-logs',
    question: '在哪里可以查看原始基准测试日志？',
    answer:
      '点击图表中的任意数据点即可打开提示框。其中的“GitHub Actions 运行记录”链接会直接跳转到生成该数据点的工作流运行。您可以在那里查看完整的任务日志、框架和驱动版本、命令行参数，并下载原始产物，包括请求延迟、token 计数和芯片功耗遥测数据。',
  },
  {
    id: 'faq-rerun-benchmark',
    question: '我可以自己重新运行基准测试吗？',
    answer:
      '可以。基准测试脚本位于代码仓库的 /benchmarks 目录中，可以独立运行。如果您拥有相同的硬件，可以 fork 仓库并直接运行脚本，也可以触发相同的 GitHub Actions 工作流来复现结果。',
  },
  {
    id: 'faq-old-runs',
    question: '历史运行记录是否保留？',
    answer:
      '是的。GitHub Actions 保留工作流运行日志和产物 90 天。为了更长期的可审计性，我们还会每周发布完整基准测试数据库的快照作为公开的 GitHub Release，任何人都可以下载历史数据集并复现或重新分析仪表板中的任何图表。',
  },
  {
    id: 'faq-data-use',
    question: '我可以使用 InferenceX 的数据进行自己的分析吗？',
    answer:
      '可以。所有数据均可自由获取。仪表板支持按芯片、模型、框架和日期范围筛选，您也可以直接从任何图表导出原始 CSV 数据。',
  },
];
