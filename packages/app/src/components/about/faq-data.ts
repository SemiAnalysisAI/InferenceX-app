import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import { GENERATED_FAQ_DATA, type FaqItem } from '@/components/about/faq';

/* ---------- FAQ content ---------- */

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: 'faq-what-is-inferencex',
    question: 'What is InferenceX?',
    answer:
      'InferenceX (formerly InferenceMAX) continuously measures agentic and fixed-sequence inference performance across chips and software stacks. AgentX is its long-context, multi-turn coding scenario. Runs repeat whenever a configuration changes.',
  },
  {
    id: 'faq-who-builds-inferencex',
    question: 'Who is behind InferenceX?',
    answer: `InferenceX is built by SemiAnalysis, an independent semiconductor and AI research firm. It is supported and trusted by ${GENERATED_FAQ_DATA.supporterOrgs.join(', ')}. The benchmark code, data, and dashboard are all open-source on GitHub.`,
  },
  {
    id: 'faq-chips',
    question: 'Which chips does InferenceX benchmark?',
    answer: 'New accelerators are added as they become available.',
    list: GENERATED_FAQ_DATA.gpuGroups,
  },
  {
    id: 'faq-models',
    question: 'Which AI models are tested?',
    answer:
      'Models are tested across the fixed-sequence configurations available for them (1k/1k, 1k/8k, and 8k/1k tokens) and multiple concurrency levels. Supported models with corresponding data also include AgentX long-context, multi-turn agentic coding runs.',
    list: GENERATED_FAQ_DATA.modelNames,
  },
  {
    id: 'faq-frameworks-configurations',
    question: 'Which inference frameworks and configurations are tested?',
    answer: '',
    list: [
      `Frameworks: ${GENERATED_FAQ_DATA.frameworkNames.join(', ')}`,
      `Precisions: ${GENERATED_FAQ_DATA.precisionNames.join(', ')}`,
      'Runtimes: CUDA, ROCm',
      'Disaggregated serving (separate prefill/decode chip pools)',
      'Multi-token prediction (MTP)',
      'Wide expert parallelism for MoE models',
    ],
  },
  {
    id: 'faq-metrics',
    question: 'What metrics does InferenceX measure?',
    answer: '',
    list: [
      'Interactivity (tok/s/user)',
      'Token throughput per chip (tok/s/chip)',
      'Input and output throughput per chip',
      'Token throughput per MW (tok/s/MW)',
      'P99 time to first token (TTFT)',
      'For AgentX: end-to-end latency, ITL, output throughput, prefix-cache behavior, and session/subagent execution',
      'Cost per million tokens (total, input, output) across hyperscaler, neocloud, and rental pricing',
      'Joules per token (total, input, output)',
      'Custom user-defined cost and power calculations',
    ],
  },
  {
    id: 'faq-normalized-interactivity',
    question: 'What is the difference between E2E Normalized Interactivity and Interactivity?',
    answer:
      'Interactivity measures how quickly tokens stream after generation begins: approximately 1 / inter-token latency (ITL). E2E Normalized Interactivity measures the effective token rate over the whole request, including time to first token (TTFT): output tokens / end-to-end latency, or approximately 1 / (ITL + TTFT / output tokens). Both use tok/s/user. The normalized value penalizes slow TTFT, especially for short responses. Here, "normalized" means normalized by output length; it is not a 0–1 score or a comparison with another system.',
  },
  {
    id: 'faq-benchmark-frequency',
    question: 'How often are benchmarks run?',
    answer:
      'Benchmarks originally ran on a nightly schedule, but the number of hardware/framework/model combinations grew too large for that to be practical. Now they re-run when a configuration changes, e.g. a new software release, driver update, or model addition. Historical data is available in the dashboard.',
  },
  {
    id: 'faq-open-source',
    question: 'Is InferenceX open source?',
    answer: 'Yes. Code, data, and dashboard are all open-source.',
    link: {
      text: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      href: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
    },
  },
  {
    id: 'faq-benchmark-differences',
    question: 'How is InferenceX different from other AI benchmarks?',
    answer:
      'InferenceX runs fixed-sequence workloads and the AgentX long-context, multi-turn coding scenario on real hardware. Test recipes are in the repository, and each result links to its GitHub Actions run.',
  },
  {
    id: 'faq-reproducibility',
    question: 'How are results reproducible?',
    answer:
      'Every data point on the dashboard is produced by a public GitHub Actions workflow run. The recipe (model, framework, precision, parallelism, sequence length, concurrency) is committed to the repo, the run executes on the actual target hardware, and the resulting artifacts (logs, metrics, chip traces) are uploaded to the run page. Anyone can click through from a tooltip in any chart to the exact GitHub Actions run that produced that point.',
  },
  {
    id: 'faq-raw-logs',
    question: 'Where can I see the raw benchmark logs?',
    answer:
      'Click any data point on a chart to open its tooltip. The "GitHub Actions Run" link goes directly to the workflow run that produced it. From there you can inspect the full job logs, the exact framework and driver versions, command line arguments, and download the raw artifacts including request latencies, token counts, and chip power telemetry.',
  },
  {
    id: 'faq-rerun-benchmark',
    question: 'Can I rerun a benchmark myself?',
    answer:
      'Yes. The benchmark recipes live in the /benchmarks directory of the repo as standalone shell scripts. If you have access to the same hardware, you can fork the repo and run the script directly, or trigger the same GitHub Actions workflow to reproduce a result.',
  },
  {
    id: 'faq-old-runs',
    question: 'Are old runs preserved?',
    answer:
      'Yes. GitHub Actions retains workflow run logs and artifacts for 90 days. For longer auditability, we also publish a weekly snapshot of the full benchmark database as a public GitHub Release, so anyone can download the historical dataset and reproduce or reanalyze any chart in the dashboard.',
  },
  {
    id: 'faq-data-use',
    question: 'Can I use InferenceX data for my own analysis?',
    answer:
      'Yes. All data is freely available. The dashboard lets you filter by chip, model, framework, and date range, and you can export raw CSV data directly from any chart.',
  },
];
