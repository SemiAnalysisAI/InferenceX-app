import {
  ArrowRight,
  Download,
  MessageSquareText,
  Palette,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';

import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import { GitHubIcon } from '@/components/ui/github-icon';
import { STARRED_EVENT, STARRED_KEY, saveStarred } from '@/lib/star-storage';
import type { NudgeDefinition } from './types';

const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

/**
 * Event name dispatched by ScatterGraph when parallelism labels are enabled.
 * Exported so the dispatch site can import a stable constant.
 */
export const GRADIENT_NUDGE_EVENT = 'inferencex:parallelism-label-enabled';

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
      description:
        'Each data point is produced by a public GitHub Actions run. Click any point on a chart to jump to the exact run, logs, and artifacts.',
      action: {
        label: 'See how',
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
      description: 'Help the project grow so we can add more benchmarks! Star us on GitHub.',
      action: {
        label: 'Star on GitHub',
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
      description:
        'Use the download button on any chart to export as PNG or CSV — no need to copy from tooltips.',
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
      description:
        'Gradient labels color-code data points by parallelism level, making it easier to spot performance patterns at a glance.',
      action: {
        label: 'Enable Gradient Labels',
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
      description:
        'Click Prompts on any row to compare each prompt, the expected answer, and what the model actually responded.',
      testId: 'eval-samples-nudge',
    },
    analytics: {
      shown: 'evaluation_samples_nudge_shown',
      dismissed: 'evaluation_samples_nudge_dismissed',
    },
  },

  // -------------------------------------------------------------------------
  // Landing modals
  // -------------------------------------------------------------------------
  {
    id: 'dsv4-launch-modal',
    type: 'modal',
    trigger: { type: 'immediate' },
    dismissal: { type: 'permanent' },
    storageKey: 'inferencex-dsv4-modal-dismissed',
    priority: 50,
    scope: 'landing',
    content: {
      icon: Sparkles,
      iconClassName: 'text-brand',
      title: 'DeepSeek V4 Pro is live',
      description:
        'Day-zero benchmarks for DeepSeek V4 Pro are now available across the latest NVIDIA and AMD GPUs. Results are experimental — see how the new model performs across hardware.',
      testId: 'dsv4-launch-modal',
      containerClassName: 'border-brand/40',
      badge: 'New',
      dismissLabel: 'Maybe Later',
      primaryAction: {
        label: 'Explore',
        icon: <ArrowRight className="size-4" />,
        onClick: () => {
          window.location.href = '/inference?preset=dsv4-launch';
        },
      },
    },
    analytics: {
      shown: 'dsv4_modal_shown',
      dismissed: 'dsv4_modal_dismissed',
      action: 'dsv4_modal_explored',
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
      description:
        'Star InferenceX on GitHub to get notified when we publish new benchmark data. We update GPU performance comparisons regularly — starring is the easiest way to stay in the loop and help the project grow.',
      testId: 'github-star-modal',
      dismissLabel: 'Maybe Later',
      primaryAction: {
        label: 'Star on GitHub',
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
    id: 'dsv4-launch-banner',
    type: 'banner',
    trigger: { type: 'immediate' },
    dismissal: { type: 'permanent' },
    storageKey: 'inferencex-dsv4-banner-dismissed-v2',
    priority: 60,
    scope: 'landing',
    content: {
      icon: Sparkles,
      iconClassName: 'text-brand',
      title: 'DeepSeek V4 Pro benchmarks are live',
      description: 'First inference numbers across NVIDIA and AMD GPUs, click to explore.',
      testId: 'launch-banner',
      badge: 'New',
      href: '/inference?preset=dsv4-launch',
      onLinkClick: () => {
        window.location.href = '/inference?preset=dsv4-launch';
      },
    },
    analytics: {
      shown: 'launch_banner_shown',
      dismissed: 'launch_banner_dismissed',
      action: 'launch_banner_clicked',
      properties: { banner_id: 'dsv4-launch', preset_id: 'dsv4-launch' },
    },
  },
];
