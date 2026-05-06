import {
  ArrowRight,
  Download,
  MessageSquareText,
  Palette,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { createElement } from 'react';

import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import { isDismissed, type NudgeEntry } from '@/lib/nudges';
import { STARRED_EVENT, STARRED_KEY, saveStarred } from '@/lib/star-storage';

const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const LANDING_ROUTE = /^\/?$/;
const DASHBOARD_ROUTE =
  /^\/(inference|evaluation|historical|calculator|reliability|gpu-specs|gpu-metrics|ai-chart|submissions)(\/|$)/;
const EVALUATION_ROUTE = /^\/evaluation(\/|$)/;

const DSV4_LAUNCH_PRESET_HREF = '/inference?preset=dsv4-launch';

export function userHasStarredRepo(): boolean {
  try {
    return localStorage.getItem(STARRED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Registry of every engagement nudge on the site. Each entry declares its
 * trigger, audience, persistence, and analytics id in one place — the framework
 * (`NudgeRoot` + `Nudge`) handles the rest.
 *
 * Adding a new nudge: append an entry here, no other code changes required.
 */
export const NUDGE_REGISTRY: NudgeEntry[] = [
  // ---------------------------------------------------------------------
  // Banners
  // ---------------------------------------------------------------------
  {
    id: 'launch-banner-dsv4',
    kind: 'banner',
    trigger: { kind: 'mount' },
    persistence: { kind: 'forever' },
    routes: [LANDING_ROUTE],
    render: () => ({
      icon: createElement(Sparkles, { className: 'size-4 animate-pulse' }),
      title: 'DeepSeek V4 Pro benchmarks are live',
      badge: 'New',
      description: 'First inference numbers across NVIDIA and AMD GPUs, click to explore.',
      primaryAction: {
        label: 'Explore',
        href: DSV4_LAUNCH_PRESET_HREF,
        // Hard navigation so the `?preset=` param is in the URL when
        // InferenceContext first mounts and reads window.location.search.
      },
    }),
  },

  // ---------------------------------------------------------------------
  // Modals (priority gates exclusivity — higher number wins)
  // ---------------------------------------------------------------------
  {
    id: 'dsv4-launch-modal',
    kind: 'modal',
    trigger: { kind: 'mount' },
    persistence: { kind: 'forever' },
    priority: 100,
    routes: [LANDING_ROUTE],
    render: () => ({
      icon: createElement(Sparkles, { className: 'size-5 text-brand' }),
      title: 'DeepSeek V4 Pro is live',
      badge: 'New',
      description:
        'Day-zero benchmarks for DeepSeek V4 Pro are now available across the latest NVIDIA and AMD GPUs. Results are experimental — see how the new model performs across hardware.',
      primaryAction: {
        label: 'Explore',
        icon: createElement(ArrowRight, { className: 'size-4' }),
        href: DSV4_LAUNCH_PRESET_HREF,
      },
    }),
  },
  {
    id: 'github-star-modal',
    kind: 'modal',
    trigger: { kind: 'mount' },
    persistence: { kind: 'cooldown', durationMs: ONE_WEEK_MS },
    priority: 50,
    routes: [LANDING_ROUTE],
    // Defer to the launch modal until that one resolves.
    condition: () => !shouldShowDsv4Modal() && !userHasStarredRepo(),
    externalDismissEvents: [STARRED_EVENT],
    render: () => ({
      icon: createElement(Star, { className: 'size-5 text-yellow-500 fill-yellow-500' }),
      title: 'Star InferenceX on GitHub',
      description:
        'Star InferenceX on GitHub to get notified when we publish new benchmark data. We update GPU performance comparisons regularly — starring is the easiest way to stay in the loop and help the project grow.',
      primaryAction: {
        label: 'Star on GitHub',
        href: GITHUB_REPO_URL,
        target: '_blank',
        onClick: () => saveStarred(),
      },
    }),
  },

  // ---------------------------------------------------------------------
  // Toasts (engagement)
  // ---------------------------------------------------------------------
  {
    id: 'reproducibility-nudge',
    kind: 'toast',
    trigger: { kind: 'mount-delay', delayMs: 1500 },
    persistence: { kind: 'session' },
    routes: [DASHBOARD_ROUTE],
    render: () => ({
      icon: createElement(ShieldCheck, { className: 'text-brand' }),
      title: 'Every result is reproducible',
      description:
        'Each data point is produced by a public GitHub Actions run. Click any point on a chart to jump to the exact run, logs, and artifacts.',
      primaryAction: {
        label: 'See how',
        href: '/about#reproducibility',
        inApp: true,
      },
    }),
  },
  {
    id: 'star-nudge',
    kind: 'toast',
    trigger: {
      kind: 'event',
      events: [
        { name: 'inferencex:tab-change', threshold: 2 },
        { name: 'inferencex:action', threshold: 1 },
      ],
      afterDelayMs: 1500,
    },
    persistence: { kind: 'session' },
    condition: () => !userHasStarredRepo(),
    externalDismissEvents: [STARRED_EVENT],
    render: () => ({
      icon: createElement(Star, { className: 'text-yellow-500 fill-yellow-500' }),
      title: 'Finding us useful?',
      description: 'Help the project grow so we can add more benchmarks! Star us on GitHub.',
      primaryAction: {
        label: 'Star on GitHub',
        icon: createElement(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            viewBox: '0 0 16 16',
            fill: 'currentColor',
            className: 'size-3.5',
          },
          createElement('path', {
            d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z',
          }),
        ),
        href: GITHUB_REPO_URL,
        target: '_blank',
        onClick: () => saveStarred(),
      },
    }),
  },
  {
    id: 'export-nudge',
    kind: 'toast',
    trigger: {
      kind: 'event',
      events: [
        {
          name: 'copy',
          threshold: 2,
          target: 'document',
          selector: '[data-chart-tooltip]',
        },
      ],
    },
    persistence: { kind: 'session' },
    routes: [DASHBOARD_ROUTE],
    render: () => ({
      icon: createElement(Download, { className: 'text-blue-500' }),
      title: 'Need the data?',
      description:
        'Use the download button on any chart to export as PNG or CSV — no need to copy from tooltips.',
    }),
  },
  {
    id: 'gradient-label-nudge',
    kind: 'toast',
    trigger: {
      kind: 'event',
      events: [{ name: 'inferencex:parallelism-label-enabled', threshold: 1 }],
    },
    persistence: { kind: 'session' },
    render: (ctx) => {
      const detail = ctx.triggerDetail as { enableGradient?: () => void } | undefined;
      return {
        icon: createElement(Palette, { className: 'text-purple-500' }),
        title: 'Try Gradient Labels',
        description:
          'Gradient labels color-code data points by parallelism level, making it easier to spot performance patterns at a glance.',
        primaryAction: {
          label: 'Enable Gradient Labels',
          onClick: () => detail?.enableGradient?.(),
        },
      };
    },
  },
  {
    id: 'eval-samples-nudge',
    kind: 'toast',
    trigger: { kind: 'mount-delay', delayMs: 1500 },
    persistence: { kind: 'cooldown', durationMs: ONE_WEEK_MS },
    // Page-scoped toasts outrank the always-on toasts so users land on the
    // page-relevant nudge first (mirrors the original DashboardShell vs.
    // EvaluationPage mount order).
    priority: 10,
    routes: [EVALUATION_ROUTE],
    externalDismissEvents: ['inferencex:eval-samples-opened'],
    render: () => ({
      icon: createElement(MessageSquareText, { className: 'text-brand' }),
      title: "See the model's actual answers",
      description:
        'Click Prompts on any row to compare each prompt, the expected answer, and what the model actually responded.',
    }),
  },
];

/**
 * Helper used by the github-star-modal `condition` predicate so the modal
 * defers to the time-sensitive launch modal until the user resolves it.
 */
function shouldShowDsv4Modal(): boolean {
  const dsv4 = NUDGE_REGISTRY.find((n) => n.id === 'dsv4-launch-modal');
  if (!dsv4) return false;
  return !isDismissed(dsv4.id, dsv4.persistence);
}
