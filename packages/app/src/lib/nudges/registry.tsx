import {
  ArrowRight,
  BookOpen,
  Download,
  MessageSquareText,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import { MOBILE_VIEWPORT_QUERY } from '@/hooks/useMediaQuery';
import { isZhPathname, localePath } from '@/lib/i18n/i18n';
import {
  LANDING_BANNER_ANALYTICS_EVENTS,
  LANDING_BANNER_EXPERIMENT,
  LANDING_BANNER_STORAGE_KEY,
  TRAINIUM3_GLM_5_2_AGENTX_URL,
} from '@/lib/nudges/landing-banner';
import { GRADIENT_NUDGE_EVENT, NUDGE_SLOTS } from '@/lib/nudges/inline-slot';

import { GitHubIcon } from '@/components/ui/github-icon';
import { AmazonIcon } from '@/components/ui/amazon-icon';
import { ModelLogo } from '@/components/ui/model-logo';
import { Model } from '@/lib/catalog/data-mappings';
import { STARRED_EVENT, STARRED_KEY } from '@/lib/github/star-storage';
import type { NudgeDefinition } from './types';
import { AGENTX_ROUTE, dashboardRouteForPathname } from '@/lib/routing/dashboard-routes';

const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

function isOnInferenceTab(): boolean {
  if (typeof window === 'undefined') return false;
  return dashboardRouteForPathname(window.location.pathname)?.key === 'inference';
}

/**
 * True on a phone-width PowerX page, where a bottom toast would cover the date and
 * run controls under the chart. Dashboard toasts stay off there; from md up, and on
 * every other tab, they show as usual.
 */
export function isPhoneWidthPowerX(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments[0] === 'zh') segments.shift();
  return segments[0] === 'pwx' && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
}

const notPhoneWidthPowerX = () => !isPhoneWidthPowerX();

function localizedNudgeHref(enPath: string): string {
  if (typeof window === 'undefined') return enPath;
  return localePath(enPath, isZhPathname(window.location.pathname) ? 'zh' : 'en');
}

export const LAUNCH_MODAL_STORAGE_KEY = 'inferencex-trainium3-agentx-modal-dismissed';

export const TELEMETRY_TUTORIAL_STORAGE_KEY = 'inferencex-agentx-telemetry-tutorial-dismissed';

function telemetryTutorialHref(): string {
  return localizedNudgeHref(`${AGENTX_ROUTE.path}/telemetry`);
}

export const NUDGE_REGISTRY: NudgeDefinition[] = [
  {
    id: 'reproducibility',
    type: 'toast',
    trigger: { type: 'timer', delayMs: 1500 },
    dismissal: { type: 'permanent' },
    storageKey: 'inferencex-reproducibility-nudge-dismissed',
    conditions: [{ check: notPhoneWidthPowerX }],
    priority: 10,
    scope: 'dashboard',
    content: {
      icon: ShieldCheck,
      title: 'Every Result Is Reproducible',
      titleZh: '每项结果均可复现',
      description:
        'Each data point is produced by a public GitHub Actions run. Click any point on a chart to open its details, then follow the link to the exact run, logs, and artifacts.',
      descriptionZh:
        '每个数据点都由公开的 GitHub Actions 运行产生。点击图表上的任意数据点可打开详情，再通过其中的链接查看对应的运行记录、日志和产物。',
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
    conditions: [{ check: notPhoneWidthPowerX }],
    priority: 20,
    scope: 'dashboard',
    content: {
      icon: Star,
      title: 'Finding Us Useful?',
      titleZh: '觉得有用吗？',
      description: 'Help the project grow so we can add more benchmarks. Star us on GitHub.',
      descriptionZh: '帮助项目成长，让我们可以添加更多基准测试。在 GitHub 上为我们加星。',
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
    conditions: [{ check: notPhoneWidthPowerX }],
    priority: 15,
    scope: 'dashboard',
    content: {
      icon: Download,
      title: 'Need the Data?',
      titleZh: '需要数据？',
      description:
        'Use the download button on any chart to export PNG or CSV instead of copying from tooltips.',
      descriptionZh: '使用任意图表上的下载按钮导出 PNG 或 CSV，无需从提示框中复制。',
      testId: 'export-nudge',
    },
    analytics: {
      shown: 'export_nudge_shown',
      dismissed: 'export_nudge_dismissed',
    },
  },
  {
    id: 'gradient-label',
    type: 'inline',
    trigger: { type: 'event', event: GRADIENT_NUDGE_EVENT },
    dismissal: { type: 'session' },
    storageKey: 'inferencex-gradient-nudge-shown',
    priority: 25,
    scope: 'dashboard',
    content: {
      icon: Palette,
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
      slot: NUDGE_SLOTS.inferenceLegend,
    },
    analytics: {
      shown: 'gradient_nudge_shown',
      dismissed: 'gradient_nudge_dismissed',
      action: 'gradient_nudge_accepted',
    },
  },

  {
    id: 'filter-hint',
    type: 'inline',
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
      title: 'Too Much on the Chart?',
      titleZh: '图表太拥挤？',
      description:
        'Filter the legend below by vendor (NVIDIA or AMD), disaggregated or aggregated serving (disagg/agg), precision (FP8/FP4) and more to compare only what you care about.',
      descriptionZh:
        '使用下方图例按厂商 (NVIDIA 或 AMD)、分离式或聚合式服务 (disagg/agg)、精度 (FP8/FP4) 等筛选，只对比您关心的内容。',
      testId: 'filter-hint-nudge',
      slot: NUDGE_SLOTS.inferenceLegend,
    },
    analytics: {
      shown: 'filter_hint_nudge_shown',
      dismissed: 'filter_hint_nudge_dismissed',
    },
  },

  {
    id: 'eval-samples',
    type: 'inline',
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
      title: "See the Model's Actual Answers",
      titleZh: '查看模型的实际回答',
      description:
        'Click the Prompts icon at the end of any row to compare each prompt, the expected answer, and what the model actually responded.',
      descriptionZh: '点击任意行末尾的提示词图标，对比每条提示、预期答案和模型的实际回复。',
      testId: 'eval-samples-nudge',
      slot: NUDGE_SLOTS.evaluationTable,
    },
    analytics: {
      shown: 'evaluation_samples_nudge_shown',
      dismissed: 'evaluation_samples_nudge_dismissed',
    },
  },

  {
    id: 'trainium3-agentx-launch-modal',
    type: 'modal',
    trigger: { type: 'idle' },
    dismissal: { type: 'timed', durationMs: 3 * 24 * 60 * 60 * 1000 },
    storageKey: LAUNCH_MODAL_STORAGE_KEY,
    priority: 50,
    scope: 'landing',
    content: {
      icon: AmazonIcon,
      title: 'Amazon Trainium3 Preliminary Results',
      titleZh: 'Amazon Trainium3 初步结果',
      description: 'GLM 5.2 AgentX Preview Submission',
      descriptionZh: 'GLM 5.2 AgentX 预览版提交结果',
      testId: 'launch-modal',
      centered: true,
      badge: 'New',
      badgeZh: '最新',
      hideDismissButton: true,
      primaryAction: {
        label: 'GLM 5.2',
        labelZh: 'GLM 5.2',
        icon: <ModelLogo model={Model.GLM_5_2} />,
        onClick: () => {
          window.location.href = localizedNudgeHref(TRAINIUM3_GLM_5_2_AGENTX_URL);
        },
      },
    },
    analytics: {
      shown: 'inference_trainium3_agentx_modal_shown',
      dismissed: 'inference_trainium3_agentx_modal_dismissed',
      action: 'inference_trainium3_agentx_modal_clicked',
    },
  },
  {
    id: 'trainium3-glm-5-2-banner',
    type: 'banner',
    trigger: { type: 'immediate' },
    dismissal: { type: 'permanent' },
    storageKey: LANDING_BANNER_STORAGE_KEY,
    priority: 60,
    scope: 'landing',
    renderOnInitialLoad: true,
    variant: 'ubenchx',
    content: {
      icon: AmazonIcon,
      title: 'Amazon Trainium3 Results',
      titleZh: 'Amazon Trainium3 结果',
      description: 'GLM 5.2 AgentX Preview Results',
      descriptionZh: 'GLM 5.2 AgentX 预览结果',
      testId: 'launch-banner',
      badge: 'New',
      badgeZh: '最新',
      href: TRAINIUM3_GLM_5_2_AGENTX_URL,
      linkLabel: 'View results',
      linkLabelZh: '查看结果',
      onLinkClick: () => {
        window.location.href = localizedNudgeHref(TRAINIUM3_GLM_5_2_AGENTX_URL);
      },
    },
    analytics: {
      ...LANDING_BANNER_ANALYTICS_EVENTS,
      properties: {
        banner_id: 'trainium3-glm-5-2',
        destination: 'trainium3-glm-5-2',
        experiment: LANDING_BANNER_EXPERIMENT,
        variant: 'ubenchx',
      },
    },
  },
  {
    id: 'trainium3-glm-5-2-banner-b',
    type: 'banner',
    trigger: { type: 'immediate' },
    dismissal: { type: 'permanent' },
    storageKey: LANDING_BANNER_STORAGE_KEY,
    priority: 60,
    scope: 'landing',
    renderOnInitialLoad: true,
    variant: 'operatorx',
    content: {
      icon: AmazonIcon,
      title: 'Amazon Trainium3 Results',
      titleZh: 'Amazon Trainium3 结果',
      description: 'GLM 5.2 AgentX Preview Results',
      descriptionZh: 'GLM 5.2 AgentX 预览结果',
      testId: 'launch-banner',
      badge: 'New',
      badgeZh: '最新',
      href: TRAINIUM3_GLM_5_2_AGENTX_URL,
      linkLabel: 'View results',
      linkLabelZh: '查看结果',
      onLinkClick: () => {
        window.location.href = localizedNudgeHref(TRAINIUM3_GLM_5_2_AGENTX_URL);
      },
    },
    analytics: {
      ...LANDING_BANNER_ANALYTICS_EVENTS,
      properties: {
        banner_id: 'trainium3-glm-5-2',
        destination: 'trainium3-glm-5-2',
        experiment: LANDING_BANNER_EXPERIMENT,
        variant: 'operatorx',
      },
    },
  },

  {
    id: 'agentx-telemetry-tutorial',
    type: 'modal',
    // After the first scroll, when the browser has stopped picking LCP candidates, so the
    // card's paragraph never becomes this page's largest (and latest) contentful paint.
    trigger: { type: 'dom-event', event: 'scroll', delayMs: 2500 },
    dismissal: { type: 'permanent' },
    storageKey: TELEMETRY_TUTORIAL_STORAGE_KEY,
    priority: 40,
    scope: 'agentic-detail',
    content: {
      icon: BookOpen,
      title: 'New to These Charts?',
      titleZh: '第一次看这些图表？',
      description:
        'The telemetry tutorial explains every chart on this page: the sequence-length distributions, the cache and queue series, the request timeline and the per-conversation flamegraph.',
      descriptionZh:
        '遥测数据教程会讲解本页的每一张图表，包括序列长度分布、cache 与队列相关曲线、请求时间线以及单会话火焰图。',
      testId: 'telemetry-tutorial-modal',
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
