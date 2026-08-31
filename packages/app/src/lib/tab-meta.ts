import type { Metadata } from 'next';

import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import {
  getDashboardRoute,
  isDashboardRouteKey,
  type DashboardRouteKey,
} from '@/lib/dashboard-routes';
import { languageAlternates } from '@/lib/i18n';
import {
  DEFAULT_ROUTE_MODEL,
  modelRoutePath,
  type ModelRoute,
  type ModelRouteTab,
} from '@/lib/model-routes';

export const LANDING_META = {
  title: 'Open-Source Agentic Inference Benchmark',
  description:
    "Compare AgentX, InferenceX's long-context, multi-turn coding scenario, with fixed-sequence AI inference across chips and frameworks. Public NVIDIA and AMD runs update when configurations change.",
};

/**
 * Short English tab labels, shared by the dashboard tab nav and the command
 * palette. Chinese siblings live in `TAB_LABELS_ZH` (tab-meta-zh.ts).
 */
export const TAB_LABELS_EN: Record<DashboardRouteKey, string> = {
  inference: 'Inference Performance',
  evaluation: 'Accuracy Evals',
  historical: 'Historical Trends',
  calculator: 'TCO Calculator',
  fleet: 'Fleet Lifecycle',
  reliability: 'Reliability',
  'gpu-specs': 'Chip Specs',
  submissions: 'Submissions',
  collectivex: 'CollectiveX',
  'ai-chart': 'AI Chart',
  'gpu-metrics': 'PowerX',
  'current-inferencex-image': 'Images',
  feedback: 'Feedback',
};

export const TAB_META: Record<DashboardRouteKey, { title: string; description: string }> = {
  inference: {
    title: 'Agentic Inference Benchmarks',
    description:
      'Compare latency, throughput, cost, and time-to-first-token for agentic and fixed-sequence AI inference across chips and serving frameworks. AgentX supplies the long-context, multi-turn coding workload.',
  },
  evaluation: {
    title: 'LLM Evaluation Results',
    description:
      'LLM evaluation scores and accuracy benchmarks. Compare model quality across providers with standardized evaluation metrics.',
  },
  historical: {
    title: 'Historical Inference Trends',
    description:
      'Track AI inference performance over time. Historical benchmark data showing chip and provider improvements in latency, throughput, and cost.',
  },
  calculator: {
    title: 'Throughput & TCO Calculator',
    description:
      'Calculate AI inference throughput and total cost of ownership. Compare chip cost-efficiency for LLM serving across hardware configurations.',
  },
  fleet: {
    title: 'Fleet Lifecycle Economics',
    description:
      'Project a fixed AI inference fleet across its life: size it against a facility power budget, then track revenue, cost, and margin as measured software configs improve over time.',
  },
  reliability: {
    title: 'Provider Reliability Metrics',
    description:
      'AI inference provider reliability and uptime tracking. Compare error rates and availability across chip cloud providers.',
  },
  'gpu-specs': {
    title: 'Chip Specifications & Comparison',
    description:
      'Detailed chip specifications for AI inference. Compare NVIDIA, AMD, and Intel chips — memory bandwidth, FLOPS, interconnects, and topology.',
  },
  collectivex: {
    title: 'CollectiveX Communication Benchmarks',
    description:
      'Experimental cross-vendor expert-parallel communication benchmarks. Compare MoE dispatch and combine latency across NVIDIA and AMD chip platforms.',
  },
  'ai-chart': {
    title: 'AI-Powered Chart Generation',
    description:
      'Generate custom inference benchmark charts using natural language prompts. Compare chips, costs, and performance with AI assistance.',
  },
  'gpu-metrics': {
    title: 'Chip Power & Efficiency Metrics',
    description:
      'Chip power consumption and efficiency metrics during AI inference workloads. Compare tokens-per-watt across hardware.',
  },
  submissions: {
    title: 'Benchmark Submissions',
    description:
      'All benchmark configurations submitted to InferenceX. View submission history, activity trends, and datapoint volumes across chip vendors.',
  },
  'current-inferencex-image': {
    title: 'Current InferenceX Image',
    description:
      'Current InferenceX Docker image tags per model, chip SKU, and configuration. Compares deployed images against latest vLLM and SGLang releases to flag outdated tags.',
  },
  feedback: {
    title: 'User Feedback',
    description: 'Internal: decrypt and review user-submitted feedback.',
  },
};

const TITLE_SUFFIX = `${SITE_NAME} by ${AUTHOR_NAME}`;

export const isValidTab = isDashboardRouteKey;

export function getTabTitle(tab: string): string {
  const meta = isDashboardRouteKey(tab) ? TAB_META[tab] : undefined;
  return meta ? `${meta.title} | ${TITLE_SUFFIX}` : TITLE_SUFFIX;
}

/** Model-specific copy for the per-model tab routes (/calculator/<slug>,
 *  /historical/<slug>). Same shape as TAB_META but parameterized on the
 *  model's SEO name. */
export const MODEL_TAB_META: Record<
  ModelRouteTab,
  { title: (seoName: string) => string; description: (seoName: string) => string }
> = {
  historical: {
    title: (seoName) => `${seoName} Historical Inference Trends`,
    description: (seoName) =>
      `Track ${seoName} inference performance over time. Historical benchmark data showing chip and provider improvements in latency, throughput, and cost for ${seoName}.`,
  },
  calculator: {
    title: (seoName) => `${seoName} Throughput & TCO Calculator`,
    description: (seoName) =>
      `Calculate ${seoName} inference throughput and total cost of ownership. Compare chip cost-efficiency for serving ${seoName} across hardware configurations.`,
  },
};

/**
 * English path a per-model tab page canonicalizes to. The default model's
 * page shows exactly what the bare tab route shows, so it canonicalizes to
 * the bare path instead of competing with it; every other model is
 * self-canonical.
 */
export function modelTabCanonicalPath(tab: ModelRouteTab, route: ModelRoute): string {
  return route.model === DEFAULT_ROUTE_MODEL
    ? getDashboardRoute(tab).canonicalPath
    : modelRoutePath(tab, route.slug);
}

/** Generate Next.js Metadata for a per-model tab page. */
export function modelTabMetadata(tab: ModelRouteTab, route: ModelRoute): Metadata {
  const meta = MODEL_TAB_META[tab];
  const title = meta.title(route.seoName);
  const description = meta.description(route.seoName);
  const enPath = modelTabCanonicalPath(tab, route);
  const url = `${SITE_URL}${enPath}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: languageAlternates(enPath),
    },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
    },
    twitter: {
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

/** Generate Next.js Metadata for a tab page. */
export function tabMetadata(tab: DashboardRouteKey): Metadata {
  const meta = TAB_META[tab];
  const route = getDashboardRoute(tab);
  const enPath = route.canonicalPath;
  const url = enPath === '/' ? SITE_URL : `${SITE_URL}${enPath}`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: url,
      // hreflang to the Chinese sibling page, for tabs mirrored under /zh.
      ...(route.localeMirrored && { languages: languageAlternates(enPath) }),
    },
    openGraph: {
      title: `${meta.title} | InferenceX`,
      description: meta.description,
      url,
    },
    twitter: {
      title: `${meta.title} | InferenceX`,
      description: meta.description,
    },
  };
}
