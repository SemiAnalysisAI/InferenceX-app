import type { Metadata } from 'next';

import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

export const LANDING_META = {
  title: 'Open Source AI Inference Benchmark',
  description:
    'Compare AI inference performance across GPUs and frameworks. Real benchmarks on NVIDIA GB200, B200, AMD MI355X, and more. Free, open-source, continuously updated.',
};

export const VALID_TABS = [
  'inference',
  'evaluation',
  'historical',
  'calculator',
  'reliability',
  'gpu-specs',
  'gpu-metrics',
  'submissions',
] as const;

export type TabKey = (typeof VALID_TABS)[number];

export const TAB_META: Record<TabKey, { title: string; description: string }> = {
  inference: {
    title: 'AI Inference Benchmarks',
    description:
      'Compare AI inference latency, throughput, and time-to-first-token across GPUs and providers. Real benchmarks on NVIDIA GB200, H100, AMD MI355X, and more.',
  },
  evaluation: {
    title: 'LLM Evaluation Results',
    description:
      'LLM evaluation scores and accuracy benchmarks. Compare model quality across providers with standardized evaluation metrics.',
  },
  historical: {
    title: 'Historical Inference Trends',
    description:
      'Track AI inference performance over time. Historical benchmark data showing GPU and provider improvements in latency, throughput, and cost.',
  },
  calculator: {
    title: 'Throughput & TCO Calculator',
    description:
      'Calculate AI inference throughput and total cost of ownership. Compare GPU cost-efficiency for LLM serving across hardware configurations.',
  },
  reliability: {
    title: 'Provider Reliability Metrics',
    description:
      'AI inference provider reliability and uptime tracking. Compare error rates and availability across GPU cloud providers.',
  },
  'gpu-specs': {
    title: 'GPU Specifications & Comparison',
    description:
      'Detailed GPU specifications for AI inference. Compare NVIDIA, AMD, and Intel GPUs — memory bandwidth, FLOPS, interconnects, and topology.',
  },
  'gpu-metrics': {
    title: 'GPU Power & Efficiency Metrics',
    description:
      'GPU power consumption and efficiency metrics during AI inference workloads. Compare tokens-per-watt across hardware.',
  },
  submissions: {
    title: 'Benchmark Submissions',
    description:
      'All benchmark configurations submitted to InferenceX. View submission history, activity trends, and datapoint volumes across GPU vendors.',
  },
};

const TITLE_SUFFIX = `${SITE_NAME} by ${AUTHOR_NAME}`;

export function isValidTab(value: string): value is TabKey {
  return (VALID_TABS as readonly string[]).includes(value);
}

export function getTabTitle(tab: string): string {
  const meta = TAB_META[tab as TabKey];
  return meta ? `${meta.title} | ${TITLE_SUFFIX}` : TITLE_SUFFIX;
}

/** Generate Next.js Metadata for a tab page. */
export function tabMetadata(tab: TabKey): Metadata {
  const meta = TAB_META[tab];
  const url = tab === 'inference' ? SITE_URL : `${SITE_URL}/${tab}`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: url },
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
