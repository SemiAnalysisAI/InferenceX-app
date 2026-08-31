import {
  ArrowRight,
  BookOpen,
  Download,
  MousePointerClick,
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
import { isZhPathname, localePath } from '@/lib/i18n';
import {
  AGENTIC_COACH_MARK_STORAGE_KEY,
  AGENTIC_POINT_ACTION_SELECTOR,
  SCATTER_RENDERED_EVENT,
  getAgenticPointAnchorMutationRoot,
  getAgenticPointAnchorRect,
  resolveAgenticPointAnchor,
} from '@/lib/nudges/agentic-point-coach-mark';
import { LANDING_BANNER_STORAGE_KEY } from '@/lib/nudges/landing-banner';

// Keep the ~210-line FeedbackForm out of the landing/dashboard initial JS.
const FeedbackForm = dynamic(
  () => import('@/components/feedback-modal').then((m) => m.FeedbackForm),
  { ssr: false },
);
import { GitHubIcon } from '@/components/ui/github-icon';
import { STARRED_EVENT, STARRED_KEY } from '@/lib/star-storage';
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

/** Resolve an internal nudge destination in the locale active at click time. */
function localizedNudgeHref(enPath: string): string {
  if (typeof window === 'undefined') return enPath;
  return localePath(enPath, isZhPathname(window.location.pathname) ? 'zh' : 'en');
}

export const TELEMETRY_TUTORIAL_STORAGE_KEY = 'inferencex-agentx-telemetry-tutorial-dismissed';

function telemetryTutorialHref(): string {
  return localizedNudgeHref('/agentx/telemetry');
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
  // Agentic chart coach mark
  // -------------------------------------------------------------------------
  {
    id: 'agentic-point-detail',
    type: 'coach-mark',
    // Three ways in, all retried until an anchor exists (see `isEligible`'s
    // `requireAnchor`): a short timer for a chart that is already painted,
    // every subsequent chart render for the usual async-data case, and scroll
    // — on a laptop viewport the chart starts below the fold, so the first two
    // fire while there is still nothing on screen to point at. The resolver
    // rejects an off-screen chart with a single rect read, keeping the scroll
    // path cheap, and the engine drops these listeners once the tip is up.
    trigger: [
      { type: 'timer', delayMs: 1200 },
      { type: 'event', event: SCATTER_RENDERED_EVENT, delayMs: 700 },
      { type: 'dom-event', event: 'scroll' },
    ],
    dismissal: { type: 'permanent' },
    storageKey: AGENTIC_COACH_MARK_STORAGE_KEY,
    // Highest dashboard priority: it is the only nudge tied to a specific
    // element, so it should claim its slot the moment that element exists.
    // (It has its own slot, so this only orders it against future coach marks.)
    priority: 45,
    scope: 'dashboard',
    content: {
      icon: MousePointerClick,
      iconClassName: 'text-brand',
      title: 'Every point has a story',
      titleZh: '每个数据点背后都有细节',
      description:
        'Click any point to view server metrics and logs — cache hit rates, queue depth, and the full request timeline for that run.',
      descriptionZh:
        '点击任意数据点即可查看服务端指标与日志——cache 命中率、队列深度，以及该次运行的完整请求时间线。',
      testId: 'agentic-point-coach-mark',
      anchor: {
        resolve: resolveAgenticPointAnchor,
        getRect: getAgenticPointAnchorRect,
        getMutationRoot: getAgenticPointAnchorMutationRoot,
        actionSelector: AGENTIC_POINT_ACTION_SELECTOR,
      },
    },
    analytics: {
      shown: 'inference_agentic_point_coach_mark_shown',
      dismissed: 'inference_agentic_point_coach_mark_dismissed',
      action: 'inference_agentic_point_coach_mark_point_clicked',
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
      renderContent: ({ dismiss, titleId, descriptionId }) => (
        <FeedbackForm onDismiss={dismiss} titleId={titleId} descriptionId={descriptionId} />
      ),
    },
    analytics: {
      shown: 'feedback_modal_shown',
      dismissed: 'feedback_modal_dismissed',
    },
  },

  // -------------------------------------------------------------------------
  // Landing banner
  //
  // Note: the landing scope deliberately has no GitHub star nudge. The footer
  // grid already carries the persistent star CTA (footer-star-cta) and the
  // header carries another, so a fixed bottom card here duplicated the control
  // and covered the footer. The engagement-triggered star-nudge toast on the
  // dashboard scope is the only overlay star prompt.
  // -------------------------------------------------------------------------
  {
    id: 'openai-rubin-comparison-banner',
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
      title: "OpenAI's Latest In House Chip verus Rubin NVL72",
      titleZh: 'OpenAI 最新自研芯片对比 Rubin NVL72',
      description:
        'Compare Jalapeño (Teacup) with Vera Rubin (July) NVL72 on DeepSeek R1 at 8K / 1K.',
      descriptionZh:
        '对比 Jalapeño (Teacup) 与 Vera Rubin (July) NVL72 在 DeepSeek R1 8K / 1K 工作负载下的表现。',
      testId: 'launch-banner',
      badge: 'New',
      badgeZh: '最新',
      href: '/inference?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerMw',
      linkLabel: 'View results',
      linkLabelZh: '查看结果',
      onLinkClick: () => {
        window.location.href = localizedNudgeHref(
          '/inference?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerMw',
        );
      },
    },
    analytics: {
      shown: 'inference_rubin_comparison_banner_shown',
      dismissed: 'inference_rubin_comparison_banner_dismissed',
      action: 'inference_rubin_comparison_banner_clicked',
      properties: {
        banner_id: 'openai-rubin-comparison',
        scenario: '8k/1k',
        model: 'DeepSeek-R1-0528',
        metric: 'y_outputTputPerMw',
      },
    },
  },

  // -------------------------------------------------------------------------
  // Agentic point-detail modal
  // -------------------------------------------------------------------------
  {
    id: 'agentx-telemetry-tutorial',
    type: 'modal',
    // The detail page is chart-dense and its data arrives asynchronously;
    // waiting lets the charts paint before the card slides in.
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
      // Deliberately NOT centered: a backdrop here would cover the charts the
      // tutorial is describing. A bottom-right card leaves the page usable.
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
