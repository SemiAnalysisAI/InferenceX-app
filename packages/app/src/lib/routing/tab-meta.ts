import type { Metadata } from 'next';

import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import {
  getDashboardRoute,
  isDashboardRouteKey,
  type DashboardRouteKey,
} from '@/lib/routing/dashboard-routes';
import { languageAlternates } from '@/lib/i18n/i18n';
import {
  defaultRouteModel,
  modelRoutePath,
  type ModelRoute,
  type ModelRouteTab,
} from '@/lib/routing/model-routes';
import { socialMetadata } from '@/lib/seo/social-metadata';

export const LANDING_META = {
  title: 'AI Accelerator System Benchmark',
  brand: 'AcceleratorX by SemiAnalysis',
  description:
    'Compare AgentX long-context, multi-turn coding inference with fixed-sequence benchmarks across chips and frameworks, from public NVIDIA and AMD runs.',
};

export const TAB_META: Record<DashboardRouteKey, { title: string; description: string }> = {
  powerx: {
    title: 'PowerX: Measured GPU Power and Energy per Token',
    description:
      'Measured GPU power, energy per token and power timelines for every InferenceX benchmark point, with modeled server and facility overhead.',
  },
  inference: {
    title: 'Agentic Inference Benchmarks',
    description:
      'Compare AI inference latency, throughput, cost and time to first token across chips and serving frameworks, for agentic and fixed-sequence workloads.',
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
      'Size an AI inference fleet to a facility power budget, then track revenue, cost and margin over its life as measured software configs improve.',
  },
  'first-token': {
    title: 'First-Token Limits',
    description:
      'Cheapest measured AI inference config per chip vendor under each time-to-first-token cap, at a minimum interactivity. Measured rows only, no interpolation.',
  },
  'cache-reuse': {
    title: 'Prefix Cache Reuse',
    description:
      'Where AI inference prompt tokens come from as concurrency rises: HBM cache hits, host-tier hits or recompute. Measured cache counters per model and chip.',
  },
  'profit-estimator': {
    title: 'Inference Profit Estimator',
    description:
      'Estimate what one chip-hour of AI inference earns, split into compute expense (TCO $/chip/hr), model license fee and operator profit.',
  },
  'profit-estimator-per-million-dollars': {
    title: 'Inference Profit Estimator per $1M Spend',
    description:
      'Estimate what $1M a year of AI inference compute earns per hour on each chip, split into compute expense (TCO), model license fee and operator profit.',
  },
  'profit-estimator-per-gigawatt': {
    title: 'Inference Profit Estimator per GigaWatt',
    description:
      'Estimate what one gigawatt-year of AI inference earns per chip, split into compute expense (TCO), model license fee and operator profit.',
  },
  'gpu-specs': {
    title: 'Chip Specifications & Comparison',
    description:
      'Detailed chip specifications for AI inference. Compare NVIDIA, AMD, and Intel chips — memory bandwidth, FLOPS, interconnects, and topology.',
  },
  operatorx: {
    title: 'OperatorX GEMM, Attention and MoE Benchmarks',
    description:
      'Measured GEMM, attention and routed MoE TFLOPS per GPU and latency from OperatorX, with shape, precision, backend, and run coverage.',
  },
  collectivex: {
    title: 'CollectiveX Communication Benchmarks',
    description:
      'Experimental cross-vendor expert-parallel communication benchmarks. Compare MoE dispatch and combine latency across NVIDIA and AMD chip platforms.',
  },
  'agentic-workload-explorer': {
    title: 'Agentic Workload Explorer',
    description:
      'A frozen, anonymized snapshot of real coding-agent traffic captured by ProxyTrace: sessions, token flow, prefix-cache reuse, latency, tool use and cost.',
  },
  'ai-chart': {
    title: 'AI-Powered Chart Generation',
    description:
      'Generate custom inference benchmark charts using natural language prompts. Compare chips, costs, and performance with AI assistance.',
  },
  submissions: {
    title: 'Benchmark Submissions',
    description:
      'All benchmark configurations submitted to InferenceX. View submission history, activity trends, and datapoint volumes across chip vendors.',
  },
  'current-inferencex-image': {
    title: 'Current InferenceX Image',
    description:
      'Current InferenceX Docker image tags per model, chip SKU and config, compared against the latest vLLM and SGLang releases to flag outdated tags.',
  },
  video: {
    title: 'VideoGenX Results',
    description:
      'Compare matched generation clips, latency, throughput, GPU-board energy and both GPU cost bases with retained CI evidence.',
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

export const MODEL_TAB_META: Record<
  ModelRouteTab,
  {
    title: (seoName: string) => string;
    description: (seoName: string) => string;
  }
> = {
  historical: {
    title: (seoName) => `${seoName} Historical Inference Trends`,
    description: (seoName) =>
      `Track ${seoName} inference performance over time: latency, throughput and cost gains per chip and provider from historical benchmark data.`,
  },
  calculator: {
    title: (seoName) => `${seoName} Throughput & TCO Calculator`,
    description: (seoName) =>
      `Calculate ${seoName} inference throughput and total cost of ownership, and compare chip cost-efficiency across hardware configurations.`,
  },
  'profit-estimator': {
    title: (seoName) => `${seoName} Inference Profit Estimator`,
    description: (seoName) =>
      `Estimate what one chip-hour of ${seoName} agentic inference earns, split into compute (TCO $/chip/hr), model license fee and operator profit.`,
  },
  'profit-estimator-per-million-dollars': {
    title: (seoName) => `${seoName} Profit Estimator per $1M Spend`,
    description: (seoName) =>
      `Estimate what $1M a year spent on ${seoName} agentic inference earns per hour, split into compute (TCO), license fee and operator profit.`,
  },
  'profit-estimator-per-gigawatt': {
    title: (seoName) => `${seoName} Profit Estimator per GigaWatt`,
    description: (seoName) =>
      `Estimate what one gigawatt-year of ${seoName} agentic inference earns per chip, split into compute expense (TCO), license fee and operator profit.`,
  },
};

export function modelTabCanonicalPath(tab: ModelRouteTab, route: ModelRoute): string {
  return route.model === defaultRouteModel(tab)
    ? getDashboardRoute(tab).canonicalPath
    : modelRoutePath(tab, route.slug);
}

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
    ...socialMetadata({ title: `${title} | ${SITE_NAME}`, description, url, locale: 'en' }),
  };
}

export function tabMetadata(tab: DashboardRouteKey): Metadata {
  const meta = TAB_META[tab];
  const route = getDashboardRoute(tab);
  const enPath = route.canonicalPath;
  const url = `${SITE_URL}${enPath}`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: url,
      ...(route.localeMirrored && { languages: languageAlternates(enPath) }),
    },
    ...socialMetadata({
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.description,
      url,
      locale: 'en',
    }),
  };
}
