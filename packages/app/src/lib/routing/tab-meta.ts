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
      'Measured GPU power, energy per output token and power timelines for every InferenceX benchmark point, with modeled server and facility overhead.',
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
  'profit-estimator-per-gigawatt': {
    title: 'Inference Profit Estimator per GigaWatt',
    description:
      'Estimate what one gigawatt-year of AI inference earns per chip, split into compute expense (TCO), model license fee and operator profit.',
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
    title: 'H3 Video Benchmark',
    description: 'Inspect original H3 video, audio, measurements and CI provenance.',
  },
  feedback: {
    title: 'User Feedback',
    description: 'Internal: decrypt and review user-submitted feedback.',
  },
};

export const TAB_INTRO: Record<DashboardRouteKey, string> = {
  powerx:
    'PowerX shows measured GPU power, energy per output token and power timelines for every InferenceX benchmark point. GPU power is measured; the rest of the server and facility PUE are modeled.',
  inference:
    'InferenceX agentic and fixed-sequence AI inference benchmarks compare throughput (tok/s/chip), interactivity (tok/s/user), time to first token (TTFT) and cost across chips, serving frameworks and models. Agentic results come from AgentX, which replays long-context, multi-turn coding-agent traces with subagents. Every data point comes from a public GitHub Actions workflow, so it is reproducible and auditable.',
  evaluation:
    'LLM evaluation results compare accuracy across models and deployment configs on standardized eval sets, checking that inference optimizations do not degrade model quality.',
  historical:
    'Historical trends track how AI inference performance has changed over time for each chip, framework and model, quantifying the gains from software stack optimizations.',
  calculator:
    'The throughput and total cost of ownership (TCO) calculator uses measured benchmark data to estimate cost per million tokens and performance per dollar for LLM serving on each chip config.',
  fleet:
    'Fleet lifecycle economics sizes a fixed fleet against a facility power budget and projects revenue, cost, margin and payback from the model release date, using software config improvements measured in historical benchmarks.',
  'first-token':
    'First-token limits find, for each chip vendor, the cheapest measured config per million tokens under time-to-first-token (TTFT) caps such as 2 s, 5 s and 10 s at a chosen minimum interactivity. Every bar is a real run with no interpolation, traceable to its GitHub Actions run.',
  'cache-reuse':
    'Prefix cache reuse splits prompt tokens at each concurrency level into chip HBM cache hits, host-tier cache hits and recomputed tokens, with an optional trace upper bound. All values are runtime cache counters traceable to their GitHub Actions run.',
  'profit-estimator':
    'The inference profit estimator computes revenue per chip-hour for each chip at a chosen interactivity and utilization, stacked into compute expense (TCO $/chip/hr), the model lab license fee and operator profit.',
  'profit-estimator-per-gigawatt':
    'The per-gigawatt profit estimator computes yearly revenue for each chip within a gigawatt all-in power budget at a chosen interactivity and utilization, stacked into compute expense (TCO), the model lab license fee and operator profit.',
  reliability:
    'Reliability metrics for the benchmark infrastructure show run success rates, error rates and availability for each chip cluster and provider.',
  'gpu-specs':
    'Chip specifications compare memory capacity, memory bandwidth, FLOPS, interconnect topology and power for NVIDIA, AMD and other AI accelerators.',
  operatorx:
    'OperatorX shows measured GEMM, attention and routed MoE TFLOPS per GPU, latency and full test coverage.',
  'agentic-workload-explorer':
    'The agentic workload explorer is a frozen snapshot of anonymized coding-agent traces captured by ProxyTrace. It shows session structure, input and output tokens, prefix cache hits, time to first token (TTFT) and tool call distribution. The snapshot no longer updates, so every time window ends at the snapshot cutoff.',
  collectivex:
    'CollectiveX compares expert-parallel (EP) communication dispatch, combine and round-trip latency across DeepEP, MoRI, UCCL and NCCL/RCCL reference implementations under a shared workload, correctness checks and sampling protocol.',
  submissions:
    'Every benchmark configuration submitted to InferenceX, with submission history, activity trends and datapoint volume by chip vendor.',
  'ai-chart':
    'AI-powered chart generation turns a natural-language description into a chart built from InferenceX benchmark data.',
  'current-inferencex-image':
    'The Docker image tags InferenceX currently runs, listed per model, chip SKU and config and compared against the latest upstream vLLM and SGLang releases to spot outdated images.',
  video:
    'Reads H3 CI artifacts in the browser to show run status, measurements and comparison verdicts. Comparison thresholds stay uncalibrated until backend labels are calibrated.',
  feedback:
    'Internal feedback viewer. Decrypts and shows user-submitted feedback in the browser with a key that never leaves this page.',
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
    intro: (seoName: string) => string;
  }
> = {
  historical: {
    title: (seoName) => `${seoName} Historical Inference Trends`,
    description: (seoName) =>
      `Track ${seoName} inference performance over time: latency, throughput and cost gains per chip and provider from historical benchmark data.`,
    intro: (seoName) =>
      `Historical trends for ${seoName} track how inference performance has changed over time on each chip and framework, quantifying the gains from software stack optimizations.`,
  },
  calculator: {
    title: (seoName) => `${seoName} Throughput & TCO Calculator`,
    description: (seoName) =>
      `Calculate ${seoName} inference throughput and total cost of ownership, and compare chip cost-efficiency across hardware configurations.`,
    intro: (seoName) =>
      `The ${seoName} throughput and total cost of ownership (TCO) calculator uses measured benchmark data to estimate cost per million tokens and performance per dollar for serving ${seoName} on each chip config.`,
  },
  'profit-estimator': {
    title: (seoName) => `${seoName} Inference Profit Estimator`,
    description: (seoName) =>
      `Estimate what one chip-hour of ${seoName} agentic inference earns, split into compute (TCO $/chip/hr), model license fee and operator profit.`,
    intro: (seoName) =>
      `Estimate revenue per chip-hour for ${seoName} agentic inference on each chip, split into compute expense (TCO $/chip/hr), model license fee and operator profit, with adjustable interactivity, utilization, license fee and token price.`,
  },
  'profit-estimator-per-gigawatt': {
    title: (seoName) => `${seoName} Profit Estimator per GigaWatt`,
    description: (seoName) =>
      `Estimate what one gigawatt-year of ${seoName} agentic inference earns per chip, split into compute expense (TCO), license fee and operator profit.`,
    intro: (seoName) =>
      `Estimate yearly revenue for ${seoName} agentic inference on each chip within a gigawatt all-in power budget, split into compute expense (TCO), model license fee and operator profit, with adjustable interactivity, utilization, license fee and token price.`,
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
