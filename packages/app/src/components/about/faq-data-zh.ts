import {
  GPU_KEYS,
  GPU_VENDORS,
  DB_MODEL_TO_DISPLAY,
  PRECISION_KEYS,
  GITHUB_OWNER,
  GITHUB_REPO,
  FRAMEWORK_LABELS,
} from '@semianalysisai/inferencex-constants';
import { CAROUSEL_ORGS, CAROUSEL_LABELS } from '@/components/quotes/quotes-data';

import type { FaqItem } from './faq-data';

/* ---------- Dynamic lists from constants ---------- */

const gpusByVendor = [...GPU_KEYS].reduce<Record<string, string[]>>((acc, key) => {
  const vendor = GPU_VENDORS[key] ?? 'Other';
  (acc[vendor] ??= []).push(key.toUpperCase());
  return acc;
}, {});

const modelNames = Object.values({
  ...DB_MODEL_TO_DISPLAY,
  'kimik2.6': 'Kimi-K2.6',
  'kimik2.7-code': 'Kimi-K2.7-Code',
  'minimaxm2.7': 'MiniMax-M2.7',
  'glm5.1': 'GLM-5.1',
});

const frameworkNames = [...new Set(Object.values(FRAMEWORK_LABELS))].map((n) =>
  n.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u, ''),
);

const supporterOrgs = CAROUSEL_ORGS.map((org) => CAROUSEL_LABELS[org] ?? org);

/* ---------- FAQ content (Simplified Chinese) ---------- */

export const FAQ_ITEMS_ZH: FaqItem[] = [
  {
    question: '什么是 InferenceX？',
    answer:
      'InferenceX（原名 InferenceMAX）是一个开源、厂商中立的基准测试（benchmark）平台，持续衡量各类 GPU 和软件栈的 AI 推理性能。每当配置发生变化时，基准测试会重新运行，确保结果始终跟随模型和框架的演进保持最新。',
  },
  {
    question: 'InferenceX 由谁开发？',
    answer: `InferenceX 由独立半导体与 AI 研究机构 SemiAnalysis 构建，受到 ${supporterOrgs.join('、')} 的支持与信赖。基准测试代码、数据和仪表板均在 GitHub 上开源。`,
  },
  {
    question: 'InferenceX 测试了哪些 GPU？',
    answer: '我们会在新加速器可用时持续添加。',
    list: Object.entries(gpusByVendor).map(([vendor, gpus]) => `${vendor}: ${gpus.join(', ')}`),
  },
  {
    question: '测试了哪些 AI 模型？',
    answer: '每个模型均在多种序列长度配置（1k/1k、1k/8k、8k/1k tokens）和并发级别下进行测试。',
    list: modelNames,
  },
  {
    question: '测试了哪些推理框架和配置？',
    answer: '',
    list: [
      `框架：${frameworkNames.join(', ')}`,
      `精度：${[...PRECISION_KEYS].map((p) => p.toUpperCase()).join(', ')}`,
      '运行时：CUDA、ROCm',
      '分离式推理（Disaggregated serving，独立的 prefill/decode GPU 池）',
      '多 token 预测（MTP）',
      '面向 MoE 模型的宽专家并行（Wide Expert Parallelism）',
    ],
  },
  {
    question: 'InferenceX 测量哪些指标？',
    answer: '',
    list: [
      '交互性（tok/s/user）',
      '每 GPU token 吞吐量（tok/s/gpu）',
      '每 GPU 输入和输出吞吐量',
      '每兆瓦 token 吞吐量（tok/s/MW）',
      'P99 首 token 延迟（TTFT）',
      '每百万 token 成本（总计、输入、输出）——涵盖超大规模云、NeoCoud 和裸机租赁定价',
      '每 token 能耗（焦耳，总计、输入、输出）',
      '用户自定义成本和功耗计算',
    ],
  },
  {
    question: '基准测试多久运行一次？',
    answer:
      '基准测试最初按每日计划运行，但随着硬件/框架/模型组合数量的增长，这种方式已不再可行。现在，当配置发生变化（例如新软件发布、驱动更新或模型添加）时重新运行。仪表板中保留了历史数据。',
  },
  {
    question: 'InferenceX 是开源的吗？',
    answer: '是的。代码、数据和仪表板均为开源。',
    link: {
      text: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      href: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
    },
  },
  {
    question: 'InferenceX 与其他 AI 基准测试有何不同？',
    answer:
      '大多数 AI 基准测试是静态的、单时间点测量，参与者提交的是专为基准测试定制的镜像，无法反映真实的线上推理性能。InferenceX 在真实硬件上持续运行，采用完全可复现的配置。所有测试脚本均提交至代码仓库，基准测试日志在 GitHub Actions 上公开可见，结果端到端可审计。',
  },
  {
    question: '结果如何实现可复现？',
    answer:
      '仪表板上的每一个数据点均由公开的 GitHub Actions 工作流运行产生。测试配方（模型、框架、精度、并行度、序列长度、并发数）已提交至仓库，在目标硬件上实际执行，产物（日志、指标、GPU 追踪数据）上传至运行页面。用户可从任何图表的 tooltip 直接点击链接，跳转到生成该数据点的 GitHub Actions 运行。',
  },
  {
    question: '在哪里可以查看原始基准测试日志？',
    answer:
      '在图表上点击任意数据点即可打开 tooltip。其中的"GitHub Actions Run"链接将直接跳转到生成该数据点的工作流运行。在那里您可以查看完整的任务日志、框架和驱动版本、命令行参数，以及下载原始产物（包括请求延迟、token 计数和 GPU 功耗遥测数据）。',
  },
  {
    question: '我可以自己重新运行基准测试吗？',
    answer:
      '可以。基准测试配方位于代码仓库的 /benchmarks 目录中，以独立的 shell 脚本形式存在。如果您拥有相同的硬件，可以 fork 仓库并直接运行脚本，或触发相同的 GitHub Actions 工作流来复现结果。',
  },
  {
    question: '历史运行记录是否保留？',
    answer:
      '是的。GitHub Actions 保留工作流运行日志和产物 90 天。为了更长期的可审计性，我们还会每周发布完整基准测试数据库的快照作为公开的 GitHub Release，任何人都可以下载历史数据集并复现或重新分析仪表板中的任何图表。',
  },
  {
    question: '我可以使用 InferenceX 的数据进行自己的分析吗？',
    answer:
      '可以。所有数据均可自由获取。仪表板支持按 GPU、模型、框架和日期范围筛选，您也可以直接从任何图表导出原始 CSV 数据。',
  },
];
