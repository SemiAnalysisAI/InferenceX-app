import {
  ArrowRight,
  Download,
  MessageSquareText,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import dynamic from 'next/dynamic';

import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import { FEEDBACK_SUBMITTED_EVENT } from '@/components/feedback-modal';
import { LANDING_BANNER_STORAGE_KEY } from '@/lib/nudges/landing-banner';

// Keep the ~210-line FeedbackForm out of the landing/dashboard initial JS.
const FeedbackForm = dynamic(
  () => import('@/components/feedback-modal').then((m) => m.FeedbackForm),
  { ssr: false },
);
import { GitHubIcon } from '@/components/ui/github-icon';
import { STARRED_EVENT, STARRED_KEY, saveStarred } from '@/lib/star-storage';
import type { NudgeDefinition } from './types';

const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

/**
 * Event name dispatched by ScatterGraph when parallelism labels are enabled.
 * Exported so the dispatch site can import a stable constant.
 */
export const GRADIENT_NUDGE_EVENT = 'inferencex:parallelism-label-enabled';

/**
 * The inference chart lives at `/`, `/inference`, and their `/zh` siblings.
 * Used to scope the filter-hint nudge so it only fires on the inference tab.
 */
function isOnInferenceTab(): boolean {
  if (typeof window === 'undefined') return false;
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments[0] === 'zh') segments.shift();
  return (segments[0] ?? 'inference') === 'inference';
}

// ---------------------------------------------------------------------------
// Registry — every engagement nudge in one place
// ---------------------------------------------------------------------------

export const NUDGE_REGISTRY: NudgeDefinition[] = [
  // -------------------------------------------------------------------------
  // Dashboard toasts
  // -------------------------------------------------------------------------
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
          window.location.href = '/about#reproducibility';
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
      descriptionZh: '渐变标签按并发级别对数据点进行颜色编码，让您一目了然地发现性能模式。',
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
    // Show shortly after landing on the inference tab, and re-attempt on tab
    // switches so users who arrive via another tab still see it once.
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

  // -------------------------------------------------------------------------
  // Evaluation toast
  // -------------------------------------------------------------------------
  {
    id: 'eval-samples',
    type: 'toast',
    trigger: { type: 'timer', delayMs: 1500 },
    // Re-show every week so returning users see it again. Cadence runs from
    // first show (or last suppress event), not from dismissal — matches the
    // pre-refactor `EvalSamplesNudge` behavior.
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

  // -------------------------------------------------------------------------
  // Dashboard modals
  // -------------------------------------------------------------------------
  {
    id: 'feedback-modal',
    type: 'modal',
    trigger: { type: 'immediate' },
    dismissal: {
      type: 'timed',
      durationMs: 3 * 24 * 60 * 60 * 1000,
      cooldownStartsOnShow: true,
    },
    storageKey: 'inferencex-feedback-modal-snoozed',
    permanentSuppressKey: 'inferencex-feedback-modal-submitted',
    permanentSuppressEvent: FEEDBACK_SUBMITTED_EVENT,
    priority: 5,
    scope: 'dashboard',
    content: {
      icon: MessageSquareText,
      iconClassName: 'text-brand',
      title: 'Help us improve InferenceX',
      titleZh: '帮助我们改进 InferenceX',
      description: "We'd love to hear what's working and what isn't.",
      descriptionZh: '我们非常希望了解哪些方面做得好，哪些方面需要改进。',
      testId: 'feedback-modal',
      centered: true,
      renderContent: ({ dismiss }) => <FeedbackForm onDismiss={dismiss} />,
    },
    analytics: {
      shown: 'feedback_modal_shown',
      dismissed: 'feedback_modal_dismissed',
    },
  },

  // -------------------------------------------------------------------------
  // Landing modals
  // -------------------------------------------------------------------------
  {
    id: 'minimax-m3-launch-modal',
    type: 'modal',
    trigger: { type: 'immediate' },
    dismissal: { type: 'permanent' },
    storageKey: 'inferencex-minimax-m3-modal-dismissed',
    priority: 50,
    scope: 'landing',
    content: {
      icon: Sparkles,
      iconClassName: 'text-brand',
      title: 'MiniMax M3 is live',
      titleZh: 'MiniMax M3 已上线',
      description:
        'Day-zero benchmarks for MiniMax M3 are now available across the latest NVIDIA and AMD GPUs. Results are experimental — see how the new model performs across hardware.',
      descriptionZh:
        'MiniMax M3 的首日基准测试数据现已覆盖最新的 NVIDIA 和 AMD GPU。结果为实验性数据——来看看新模型在不同硬件上的表现。',
      testId: 'launch-modal',
      containerClassName: 'border-brand/40',
      badge: 'New',
      badgeZh: '最新',
      dismissLabel: 'Maybe Later',
      dismissLabelZh: '稍后再看',
      primaryAction: {
        label: 'Explore',
        labelZh: '开始探索',
        icon: <ArrowRight className="size-4" />,
        onClick: () => {
          window.location.href = '/inference?preset=minimax-m3-launch';
        },
      },
    },
    analytics: {
      shown: 'minimax_m3_modal_shown',
      dismissed: 'minimax_m3_modal_dismissed',
      action: 'minimax_m3_modal_explored',
    },
  },
  {
    id: 'github-star-modal',
    type: 'modal',
    trigger: { type: 'immediate' },
    dismissal: { type: 'timed', durationMs: 7 * 24 * 60 * 60 * 1000 },
    storageKey: 'inferencex-star-modal-dismissed',
    permanentSuppressKey: STARRED_KEY,
    permanentSuppressEvent: STARRED_EVENT,
    priority: 40,
    scope: 'landing',
    content: {
      icon: Star,
      iconClassName: 'text-yellow-500 fill-yellow-500',
      title: 'Star InferenceX on GitHub',
      titleZh: '在 GitHub 上为 InferenceX 加星',
      description:
        'Star InferenceX on GitHub to get notified when we publish new benchmark data. We update GPU performance comparisons regularly — starring is the easiest way to stay in the loop and help the project grow.',
      descriptionZh:
        '在 GitHub 上为 InferenceX 加星，以便在我们发布新基准测试数据时收到通知。我们定期更新 GPU 性能对比——加星是保持关注并帮助项目成长的最简单方式。',
      testId: 'github-star-modal',
      dismissLabel: 'Maybe Later',
      dismissLabelZh: '稍后再看',
      primaryAction: {
        label: 'Star on GitHub',
        labelZh: '在 GitHub 上加星',
        icon: <GitHubIcon className="size-4" />,
        onClick: () => {
          window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer');
          saveStarred();
        },
      },
      actionClassName: 'star-button-glow',
    },
    analytics: {
      shown: 'star_modal_shown',
      dismissed: 'star_modal_dismissed',
      action: 'star_modal_starred',
    },
  },

  // -------------------------------------------------------------------------
  // Landing banner
  // -------------------------------------------------------------------------
  {
    id: 'minimax-m3-launch-banner',
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
      title: 'MiniMax M3 benchmarks are live',
      titleZh: 'MiniMax M3 基准测试已上线',
      description: 'First inference numbers across NVIDIA and AMD GPUs, click to explore.',
      descriptionZh: 'NVIDIA 和 AMD GPU 的首批推理数据，点击探索。',
      testId: 'launch-banner',
      badge: 'New',
      badgeZh: '最新',
      href: '/inference?preset=minimax-m3-launch',
      onLinkClick: () => {
        window.location.href = '/inference?preset=minimax-m3-launch';
      },
    },
    analytics: {
      shown: 'launch_banner_shown',
      dismissed: 'launch_banner_dismissed',
      action: 'launch_banner_clicked',
      properties: { banner_id: 'minimax-m3-launch', preset_id: 'minimax-m3-launch' },
    },
  },
];
