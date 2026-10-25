import {
  ArrowRight,
  BookOpen,
  Download,
  MessageSquareText,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import { isZhPathname, localePath } from '@/lib/i18n/i18n';
import { LANDING_BANNER_STORAGE_KEY, TPUV7_QWEN_3_5_AGENTX_URL } from '@/lib/nudges/landing-banner';

import { GitHubIcon } from '@/components/ui/github-icon';
import { GoogleIcon } from '@/components/ui/google-icon';
import { ModelLogo } from '@/components/ui/model-logo';
import { Model } from '@/lib/catalog/data-mappings';
import { STARRED_EVENT, STARRED_KEY } from '@/lib/github/star-storage';
import type { NudgeDefinition } from './types';

const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

export const GRADIENT_NUDGE_EVENT = 'inferencex:parallelism-label-enabled';

function isOnInferenceTab(): boolean {
  if (typeof window === 'undefined') return false;
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments[0] === 'zh') segments.shift();
  return (segments[0] ?? 'inference') === 'inference';
}

function localizedNudgeHref(enPath: string): string {
  if (typeof window === 'undefined') return enPath;
  return localePath(enPath, isZhPathname(window.location.pathname) ? 'zh' : 'en');
}

export const TPUV7_LAUNCH_MODAL_STORAGE_KEY =
  'inferencex-tpuv7-agentx-multiple-model-modal-dismissed';

export const TELEMETRY_TUTORIAL_STORAGE_KEY = 'inferencex-agentx-telemetry-tutorial-dismissed';

function telemetryTutorialHref(): string {
  return localizedNudgeHref('/agentx/telemetry');
}

export const NUDGE_REGISTRY: NudgeDefinition[] = [
  {
    id: 'reproducibility',
    type: 'toast',
    trigger: { type: 'timer', delayMs: 1500 },
    dismissal: { type: 'session' },
    storageKey: 'inferencex-reproducibility-nudge-shown',
    priority: 10,
    scope: 'dashboard',
    content: {
      icon: ShieldCheck,
      iconClassName: 'text-brand',
      title: 'Every result is reproducible',
      titleZh: '每项结果均可复现',
      description:
        'Each data point is produced by a public GitHub Actions run. Click any point on a chart to jump to the exact run, logs, and artifacts.',
      descriptionZh:
        '每个数据点都由公开的 GitHub Actions 运行产生。点击图表上的任意数据点即可跳转到对应的运行记录、日志和产物。',
      action: {
        label: 'See how',
        labelZh: '了解详情',
        onClick: () => {
          window.location.href = localizedNudgeHref('/about#reproducibility');
        },
      },
      testId: 'reproducibility-nudge',
    },
    analytics: {
      shown: 'reproducibility_nudge_shown',
      dismissed: 'reproducibility_nudge_dismissed',
      action: 'reproducibility_nudge_see_how_clicked',
    },
  },
  {
    id: 'star-nudge',
    type: 'toast',
    trigger: [
      { type: 'event', event: 'inferencex:tab-change', threshold: 2 },
      { type: 'event', event: 'inferencex:action', delayMs: 1500 },
    ],
    dismissal: { type: 'session' },
    storageKey: 'inferencex-star-nudge-shown',
    permanentSuppressKey: STARRED_KEY,
    permanentSuppressEvent: STARRED_EVENT,
    priority: 20,
    scope: 'dashboard',
    content: {
      icon: Star,
      iconClassName: 'text-yellow-500 fill-yellow-500',
      title: 'Finding us useful?',
      titleZh: '觉得有用吗？',
      description: 'Help the project grow so we can add more benchmarks! Star us on GitHub.',
      descriptionZh: '帮助项目成长，让我们可以添加更多基准测试！在 GitHub 上为我们加星。',
      action: {
        label: 'Star on GitHub',
        labelZh: '在 GitHub 上加星',
        icon: <GitHubIcon />,
        onClick: () => {
          window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer');
        },
      },
      testId: 'star-nudge',
    },
    analytics: {
      shown: 'star_nudge_shown',
      dismissed: 'star_nudge_dismissed',
      action: 'star_nudge_starred',
    },
  },
  {
    id: 'export',
    type: 'toast',
    trigger: {
      type: 'dom-event',
      event: 'copy',
      selector: '[data-chart-tooltip]',
      threshold: 2,
    },
    dismissal: { type: 'session' },
    storageKey: 'inferencex-export-nudge-shown',
    priority: 15,
    scope: 'dashboard',
    content: {
      icon: Download,
      iconClassName: 'text-blue-500',
      title: 'Need the data?',
      titleZh: '需要数据？',
      description:
        'Use the download button on any chart to export as PNG or CSV — no need to copy from tooltips.',
      descriptionZh: '使用任意图表上的下载按钮导出 PNG 或 CSV——无需从提示框中复制。',
      testId: 'export-nudge',
    },
    analytics: {
      shown: 'export_nudge_shown',
      dismissed: 'export_nudge_dismissed',
    },
  },
  {
    id: 'gradient-label',
    type: 'toast',
    trigger: { type: 'event', event: 'inferencex:parallelism-label-enabled' },
    dismissal: { type: 'session' },
    storageKey: 'inferencex-gradient-nudge-shown',
    priority: 25,
    scope: 'dashboard',
    content: {
      icon: Palette,
      iconClassName: 'text-purple-500',
      title: 'Try Gradient Labels',
      titleZh: '试试渐变标签',
      description:
        'Gradient labels color-code data points by parallelism level, making it easier to spot performance patterns at a glance.',
      descriptionZh: '渐变标签按并行度对数据点进行颜色编码，让您一目了然地发现性能模式。',
      action: {
        label: 'Enable Gradient Labels',
        labelZh: '启用渐变标签',
        onClick: (eventDetail?: unknown) => {
          const detail = eventDetail as { enableGradient?: () => void } | undefined;
          detail?.enableGradient?.();
        },
      },
      testId: 'gradient-label-nudge',
    },
    analytics: {
      shown: 'gradient_nudge_shown',
      dismissed: 'gradient_nudge_dismissed',
      action: 'gradient_nudge_accepted',
    },
  },

  {
    id: 'filter-hint',
    type: 'toast',
    trigger: [
      { type: 'timer', delayMs: 2500 },
      { type: 'event', event: 'inferencex:tab-change', delayMs: 800 },
    ],
    dismissal: { type: 'permanent' },
    storageKey: 'inferencex-filter-hint-nudge-dismissed',
    conditions: [{ check: isOnInferenceTab, listenEvent: 'inferencex:tab-change' }],
    priority: 12,
    scope: 'dashboard',
    content: {
      icon: SlidersHorizontal,
      iconClassName: 'text-brand',
      title: 'Too much on the chart?',
      titleZh: '图表太拥挤？',
      description:
        'Use the legend filters on the right to focus — toggle NVIDIA vs AMD vendors, disaggregated vs aggregated (disagg/agg) serving, precision (FP8/FP4), and more to compare just what you care about.',
      descriptionZh:
        '使用右侧图例筛选器聚焦对比——切换 NVIDIA 与 AMD 厂商、分离式与聚合式 (disagg/agg) 服务模式、精度 (FP8/FP4) 等，只查看您关心的内容。',
      testId: 'filter-hint-nudge',
    },
    analytics: {
      shown: 'filter_hint_nudge_shown',
      dismissed: 'filter_hint_nudge_dismissed',
    },
  },

  {
    id: 'eval-samples',
    type: 'toast',
    trigger: { type: 'timer', delayMs: 1500 },
    dismissal: {
      type: 'timed',
      durationMs: 7 * 24 * 60 * 60 * 1000,
      cooldownStartsOnShow: true,
    },
    storageKey: 'inferencex-eval-samples-nudge-dismissed',
    permanentSuppressEvent: 'inferencex:eval-samples-opened',
    priority: 30,
    scope: 'evaluation',
    content: {
      icon: MessageSquareText,
      iconClassName: 'text-brand',
      title: "See the model's actual answers",
      titleZh: '查看模型的实际回答',
      description:
        'Click Prompts on any row to compare each prompt, the expected answer, and what the model actually responded.',
      descriptionZh: '点击任意行的"提示词"按钮，对比每条提示、预期答案和模型的实际回复。',
      testId: 'eval-samples-nudge',
    },
    analytics: {
      shown: 'evaluation_samples_nudge_shown',
      dismissed: 'evaluation_samples_nudge_dismissed',
    },
  },

  {
    id: 'tpuv7-agentx-launch-modal',
    type: 'modal',
    trigger: { type: 'immediate' },
    dismissal: { type: 'timed', durationMs: 3 * 24 * 60 * 60 * 1000 },
    storageKey: TPUV7_LAUNCH_MODAL_STORAGE_KEY,
    priority: 50,
    scope: 'landing',
    content: {
      icon: GoogleIcon,
      title: 'TPUv7 prelimary results across multiple models',
      titleZh: 'TPUv7 多模型初步结果',
      description: 'AgentX Preview Submissions',
      descriptionZh: 'AgentX 预览版提交结果',
      testId: 'launch-modal',
      containerClassName: 'border-brand/40',
      centered: true,
      badge: 'New',
      badgeZh: '最新',
      hideDismissButton: true,
      primaryAction: {
        label: 'Qwen3.5',
        labelZh: 'Qwen3.5',
        icon: <ModelLogo model={Model.Qwen3_5} />,
        onClick: () => {
          window.location.href = localizedNudgeHref(TPUV7_QWEN_3_5_AGENTX_URL);
        },
      },
      secondaryAction: {
        label: 'Kimi K3',
        labelZh: 'Kimi K3',
        icon: <ModelLogo model={Model.Kimi_K3} />,
        onClick: () => {
          window.location.href = localizedNudgeHref('/inference/kimi-k3');
        },
      },
    },
    analytics: {
      shown: 'inference_tpuv7_agentx_modal_shown',
      dismissed: 'inference_tpuv7_agentx_modal_dismissed',
      action: 'inference_tpuv7_agentx_modal_clicked',
    },
  },
  {
    id: 'tpuv7-qwen-3-5-agentx-banner',
    type: 'banner',
    trigger: { type: 'immediate' },
    dismissal: { type: 'permanent' },
    storageKey: LANDING_BANNER_STORAGE_KEY,
    priority: 60,
    scope: 'landing',
    renderOnInitialLoad: true,
    content: {
      icon: Sparkles,
      iconClassName: 'text-brand',
      title: 'Google TPUv7 joins AgentX',
      titleZh: 'Google TPUv7 加入 AgentX',
      description: 'TPUv7 Kimi K3 2.8T prelimary Submisison: Competitive Results',
      descriptionZh: 'TPUv7 Kimi K3 2.8T 初步提交：成绩具有竞争力',
      testId: 'launch-banner',
      badge: 'New',
      badgeZh: '最新',
      href: TPUV7_QWEN_3_5_AGENTX_URL,
      linkLabel: 'View results',
      linkLabelZh: '查看结果',
      onLinkClick: () => {
        window.location.href = localizedNudgeHref(TPUV7_QWEN_3_5_AGENTX_URL);
      },
    },
    analytics: {
      shown: 'inference_tpuv7_qwen_3_5_agentx_banner_shown',
      dismissed: 'inference_tpuv7_qwen_3_5_agentx_banner_dismissed',
      action: 'inference_tpuv7_qwen_3_5_agentx_banner_clicked',
      properties: {
        banner_id: 'tpuv7-qwen-3-5-agentx',
        destination: 'inference',
      },
    },
  },

  {
    id: 'agentx-telemetry-tutorial',
    type: 'modal',
    trigger: { type: 'timer', delayMs: 2500 },
    dismissal: { type: 'permanent' },
    storageKey: TELEMETRY_TUTORIAL_STORAGE_KEY,
    priority: 40,
    scope: 'agentic-detail',
    content: {
      icon: BookOpen,
      iconClassName: 'text-brand',
      title: 'New to these charts?',
      titleZh: '第一次看这些图表？',
      description:
        'The telemetry tutorial explains every chart on this page — the sequence-length distributions, the cache and queue series, the request timeline, and the per-conversation flamegraph.',
      descriptionZh:
        '遥测数据教程会讲解本页的每一张图表——序列长度分布、cache 与队列相关曲线、请求时间线，以及单会话火焰图。',
      testId: 'telemetry-tutorial-modal',
      containerClassName: 'border-brand/40',
      dismissLabel: 'Not now',
      dismissLabelZh: '暂不需要',
      primaryAction: {
        label: 'Read the tutorial',
        labelZh: '阅读教程',
        icon: <ArrowRight className="size-4" />,
        onClick: () => {
          window.location.href = telemetryTutorialHref();
        },
      },
    },
    analytics: {
      shown: 'agentx_telemetry_modal_shown',
      dismissed: 'agentx_telemetry_modal_dismissed',
      action: 'agentx_telemetry_modal_opened',
    },
  },
];
