import {
  GPU_KEYS,
  GPU_VENDORS,
  DB_MODEL_TO_DISPLAY,
  PRECISION_KEYS,
  GITHUB_OWNER,
  GITHUB_REPO,
} from '@semianalysisai/inferencex-constants';
import { FRAMEWORK_LABELS } from '@/lib/constants';
import { CAROUSEL_ORGS, CAROUSEL_LABELS } from '@/components/quotes/quotes-data';

export interface FaqLink {
  text: string;
  href: string;
}

export interface FaqItem {
  question: string;
  /** Intro text shown before any list. */
  answer: string;
  /** Optional link rendered inline after the answer text. */
  link?: FaqLink;
  /** Optional bullet list rendered below the answer text. */
  list?: string[];
}

/* ---------- Dynamic lists from constants ---------- */

const gpusByVendor = [...GPU_KEYS].reduce<Record<string, string[]>>((acc, key) => {
  const vendor = GPU_VENDORS[key] ?? 'Other';
  (acc[vendor] ??= []).push(key.toUpperCase());
  return acc;
}, {});
const modelNames = Object.values(DB_MODEL_TO_DISPLAY);

const frameworkNames = [...new Set(Object.values(FRAMEWORK_LABELS))].map((n) =>
  n.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/, ''),
);

const supporterOrgs = CAROUSEL_ORGS.map((org) => CAROUSEL_LABELS[org] ?? org);

/* ---------- FAQ content ---------- */

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What is InferenceX?',
    answer:
      'InferenceX (formerly InferenceMAX) is an open-source, vendor-neutral benchmark that continuously measures AI inference performance across GPUs and software stacks. Benchmarks re-run whenever a configuration changes, so results stay current as models and frameworks evolve.',
  },
  {
    question: 'Who is behind InferenceX?',
    answer: `InferenceX is built by SemiAnalysis, an independent semiconductor and AI research firm. It is supported and trusted by ${supporterOrgs.join(', ')}. The benchmark code, data, and dashboard are all open-source on GitHub.`,
  },
  {
    question: 'Which GPUs does InferenceX benchmark?',
    answer: 'New accelerators are added as they become available.',
    list: Object.entries(gpusByVendor).map(([vendor, gpus]) => `${vendor}: ${gpus.join(', ')}`),
  },
  {
    question: 'Which AI models are tested?',
    answer:
      'Each model is tested across multiple sequence length configurations (1k/1k, 1k/8k, 8k/1k tokens) and concurrency levels.',
    list: modelNames,
  },
  {
    question: 'Which inference frameworks and configurations are tested?',
    answer: '',
    list: [
      `Frameworks: ${frameworkNames.join(', ')}`,
      `Precisions: ${[...PRECISION_KEYS].map((p) => p.toUpperCase()).join(', ')}`,
      'Runtimes: CUDA, ROCm',
      'Disaggregated serving (separate prefill/decode GPU pools)',
      'Multi-token prediction (MTP)',
      'Wide expert parallelism for MoE models',
    ],
  },
  {
    question: 'What metrics does InferenceX measure?',
    answer: '',
    list: [
      'Interactivity (tok/s/user)',
      'Token throughput per GPU (tok/s/gpu)',
      'Input and output throughput per GPU',
      'Token throughput per MW (tok/s/MW)',
      'P99 time to first token (TTFT)',
      'Cost per million tokens (total, input, output) across hyperscaler, neocloud, and rental pricing',
      'Joules per token (total, input, output)',
      'Custom user-defined cost and power calculations',
    ],
  },
  {
    question: 'How often are benchmarks run?',
    answer:
      'Benchmarks originally ran on a nightly schedule, but the number of hardware/framework/model combinations grew too large for that to be practical. Now they re-run when a configuration changes, e.g. a new software release, driver update, or model addition. Historical data is available in the dashboard.',
  },
  {
    question: 'Is InferenceX open source?',
    answer: 'Yes. Code, data, and dashboard are all open-source.',
    link: {
      text: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      href: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
    },
  },
  {
    question: 'How is InferenceX different from other AI benchmarks?',
    answer:
      'Most AI benchmarks are static, point-in-time measurements where participants submit purpose-built images that do not reflect real-world serving performance. InferenceX runs continuously on real hardware with fully reproducible configurations. Every recipe is in the repo, benchmark logs are visible on GitHub Actions, and all results are auditable end-to-end.',
  },
  {
    question: 'Can I use InferenceX data for my own analysis?',
    answer:
      'Yes. All data is freely available. The dashboard lets you filter by GPU, model, framework, and date range, and you can export raw CSV data directly from any chart.',
  },
];
