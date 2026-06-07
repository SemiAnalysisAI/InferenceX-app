/**
 * Internationalization for the `/compare` and `/compare-per-dollar` routes.
 *
 * The dashboard has no i18n framework — these two route families (plus their
 * `[slug]` detail pages) ship a Chinese-language variant served under a `/zh`
 * URL prefix. The English pages live at `/compare*`, the Chinese ones at
 * `/zh/compare*`, and both render the same React components with a `lang` prop.
 *
 * This module holds:
 *   - the `Lang` union + URL path helpers, and
 *   - a dictionary of the *simple* (markup-free) user-facing strings for both
 *     languages.
 *
 * Markup-rich sentences (paragraphs that interleave <strong>/<Link> with
 * dynamic GPU/model names, where Chinese word order differs from English) are
 * NOT in this dictionary — those are rendered with an inline `lang === 'zh'`
 * JSX branch in the page components so each language reads naturally. The
 * narrative prose pools and JSON-LD strings live in `@/lib/compare-ssr`.
 *
 * The English entries are copied verbatim from the original hard-coded pages so
 * the English output is byte-identical before and after the i18n refactor.
 */

export type Lang = 'en' | 'zh';
export type CompareVariant = 'full' | 'per-dollar';

/** Root segment for a variant (no locale prefix). */
function variantSegment(variant: CompareVariant): string {
  return variant === 'per-dollar' ? '/compare-per-dollar' : '/compare';
}

/** Locale-aware base path for a compare route, e.g. `/zh/compare-per-dollar`.
 *  Used for canonical URLs, redirect targets, and cross-links so a Chinese
 *  page always links to other Chinese pages. */
export function compareBasePath(lang: Lang, variant: CompareVariant): string {
  const seg = variantSegment(variant);
  return lang === 'zh' ? `/zh${seg}` : seg;
}

/** Locale-aware path to a detail slug, e.g. `/zh/compare/deepseek-r1-h100-vs-h200`. */
export function compareSlugPath(lang: Lang, variant: CompareVariant, slug: string): string {
  return `${compareBasePath(lang, variant)}/${slug}`;
}

interface VariantStrings {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: (total: string, models: string) => string;
  modelSubtext: (count: number, label: string) => string;
  vendor: { cross: string; nvidia: string; amd: string };
}

interface DetailStrings {
  /** SEO title; receives the full "Model — A vs B" label. */
  metaTitle: (fullLabel: string) => string;
  metaDescription: (modelLabel: string, gpuLabel: string) => string;
  eyebrow: (modelLabel: string) => string;
  emptyState: string;
  /** Caveat appended to the last narrative paragraph. */
  caveat: (sequence: string, precision: string) => string;
}

export interface CompareDict {
  /** Index (master) pages. */
  index: {
    full: VariantStrings & { perDollarCta: string };
    perDollar: VariantStrings;
  };
  /** Vendor group headings — brand names + "vs", identical across languages. */
  vendorHeadings: { cross: string; nvidia: string; amd: string };
  detail: {
    full: DetailStrings & {
      mainChartLink: string;
      crossLink: string;
    };
    perDollar: DetailStrings & {
      h1Suffix: string;
      mainChartLink: string;
      crossLink: string;
      pricingPrefix: string;
      pricingSource: string;
      tcoSourceName: string;
      figcaption: (aLabel: string, bLabel: string) => string;
    };
  };
  table: {
    help: string;
    metricColumn: string;
    interactivity: string;
    /** Maps the metric's stable English key → localized display label. */
    metricLabel: Record<string, string>;
    /** Per-dollar display override for "Cost ($/M tok)". */
    perDollarCostLabel: string;
  };
}

const EN: CompareDict = {
  index: {
    full: {
      metaTitle: 'GPU Comparisons',
      metaDescription:
        'Browse head-to-head GPU inference benchmark comparisons across every model and hardware pair we test. Latency, throughput, and cost for DeepSeek V4 Pro 1.6T, DeepSeek R1, Kimi K2.5/K2.6 1T, GLM 5/5.1, Qwen 3.5 397B-A17B, and more.',
      h1: 'GPU Comparisons',
      lede: (total, models) =>
        `${total} head-to-head inference benchmark comparisons across ${models}. Each page includes interactive charts for latency, throughput, and cost metrics, plus an interpolated comparison table.`,
      modelSubtext: (count, label) =>
        `${count} GPU pair${count === 1 ? '' : 's'} with benchmark data on ${label}.`,
      vendor: {
        cross: 'Cross-vendor comparisons across architecture generations.',
        nvidia: 'Hopper and Blackwell generation comparisons.',
        amd: 'CDNA 3 and CDNA 4 generation comparisons.',
      },
      perDollarCta: 'Compare GPU performance per dollar',
    },
    perDollar: {
      metaTitle: 'GPU Performance per Dollar',
      metaDescription:
        'GPU performance per dollar — head-to-head cost per million tokens across every model and hardware pair we benchmark. Performance normalized by owning-hyperscaler TCO for DeepSeek V4 Pro 1.6T, DeepSeek R1, Kimi K2.5/K2.6 1T, GLM 5/5.1, Qwen 3.5 397B-A17B, and more. Pick the cheapest SKU for your workload.',
      h1: 'GPU Performance per Dollar',
      lede: (total, models) =>
        `${total} head-to-head cost-per-million-tokens comparisons across ${models}. Performance normalized by owning-hyperscaler TCO — each page renders the cost-per-token chart and an interpolated dollars-per-million comparison table so you can pick the cheaper SKU at any target interactivity level.`,
      modelSubtext: (count, label) =>
        `${count} GPU pair${count === 1 ? '' : 's'} with cost-per-token benchmark data on ${label}.`,
      vendor: {
        cross: 'Cross-vendor cost-per-token comparisons across architecture generations.',
        nvidia: 'Hopper and Blackwell generation cost-per-token comparisons.',
        amd: 'CDNA 3 and CDNA 4 generation cost-per-token comparisons.',
      },
    },
  },
  vendorHeadings: {
    cross: 'NVIDIA vs AMD',
    nvidia: 'NVIDIA vs NVIDIA',
    amd: 'AMD vs AMD',
  },
  detail: {
    full: {
      metaTitle: (fullLabel) => `${fullLabel} Inference Benchmark`,
      metaDescription: (modelLabel, gpuLabel) =>
        `Head-to-head GPU inference benchmark comparison for ${modelLabel}: ${gpuLabel}. Latency, throughput, and cost across LLM workloads.`,
      eyebrow: (modelLabel) => `${modelLabel} · GPU comparison`,
      emptyState:
        'No interpolated comparison data available for the default model. Use the chart controls below to select a model with benchmark data for both GPUs.',
      caveat: (sequence, precision) =>
        `(Numbers reflect the default ${sequence} · ${precision} selection for this URL — table and chart below update if you change sequence, precision, or model in the controls.)`,
      mainChartLink: 'the main inference chart',
      crossLink: 'View performance-per-dollar view →',
    },
    perDollar: {
      metaTitle: (fullLabel) => `${fullLabel} — Performance per Dollar`,
      metaDescription: (modelLabel, gpuLabel) =>
        `${modelLabel} cost per million tokens on ${gpuLabel}. Performance normalized by owning-hyperscaler TCO — see which GPU delivers more inference dollars-per-token at every interactivity level.`,
      eyebrow: (modelLabel) => `${modelLabel} · Performance per Dollar`,
      emptyState:
        'No interpolated cost-per-token data available for the default model on this GPU pair. Use the chart controls below to select a model and precision with benchmark data for both GPUs.',
      caveat: (sequence, precision) =>
        `(Numbers reflect the default ${sequence} · ${precision} selection for this URL — table and chart below update if you change sequence, precision, or model in the controls.)`,
      h1Suffix: 'Performance per Dollar',
      mainChartLink: 'the main inference chart',
      crossLink: 'View full latency + throughput comparison →',
      pricingPrefix: 'GPU pricing (owning hyperscaler):',
      pricingSource: 'Source:',
      tcoSourceName: 'SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model',
      figcaption: (aLabel, bLabel) =>
        `${aLabel} versus ${bLabel} cost per million tokens for this comparison's canonical default workload. Lower cost indicates better performance per dollar.`,
    },
  },
  table: {
    help: 'Interpolated from real benchmark data. Edit target interactivity values below to compare at different operating points.',
    metricColumn: 'Metric',
    interactivity: 'Interactivity (tok/s/user)',
    metricLabel: {
      'Throughput (tok/s/gpu)': 'Throughput (tok/s/gpu)',
      'Cost ($/M tok)': 'Cost ($/M tok)',
      'tok/s/MW': 'tok/s/MW',
      Concurrency: 'Concurrency',
    },
    perDollarCostLabel: 'Dollar per Million Tokens',
  },
};

const ZH: CompareDict = {
  index: {
    full: {
      metaTitle: 'GPU 对比',
      metaDescription:
        '浏览我们测试的每个模型与硬件组合的 GPU 推理基准对比。涵盖 DeepSeek V4 Pro 1.6T、DeepSeek R1、Kimi K2.5/K2.6 1T、GLM 5/5.1、Qwen 3.5 397B-A17B 等模型的延迟、吞吐量与成本。',
      h1: 'GPU 对比',
      lede: (total, models) =>
        `${models} 等模型上的 ${total} 组 GPU 推理基准对比。每个页面都包含延迟、吞吐量与成本指标的交互式图表，以及一张插值对比表。`,
      modelSubtext: (_count, label) => `在 ${label} 上有基准数据的 ${_count} 组 GPU 对比。`,
      vendor: {
        cross: '跨厂商、跨架构世代的对比。',
        nvidia: 'Hopper 与 Blackwell 世代的对比。',
        amd: 'CDNA 3 与 CDNA 4 世代的对比。',
      },
      perDollarCta: '对比 GPU 每美元性能',
    },
    perDollar: {
      metaTitle: 'GPU 每美元性能',
      metaDescription:
        'GPU 每美元性能——我们基准测试的每个模型与硬件组合的每百万 token 成本对比。性能按自建超大规模数据中心 TCO 归一化，涵盖 DeepSeek V4 Pro 1.6T、DeepSeek R1、Kimi K2.5/K2.6 1T、GLM 5/5.1、Qwen 3.5 397B-A17B 等模型。为你的工作负载挑选最便宜的 SKU。',
      h1: 'GPU 每美元性能',
      lede: (total, models) =>
        `${models} 等模型上的 ${total} 组每百万 token 成本对比。性能按自建超大规模数据中心 TCO 归一化——每个页面都会渲染每 token 成本图表与一张插值的每百万 token 美元成本对比表，让你在任意目标交互速率下挑选更便宜的 SKU。`,
      modelSubtext: (_count, label) =>
        `在 ${label} 上有每 token 成本基准数据的 ${_count} 组 GPU 对比。`,
      vendor: {
        cross: '跨厂商、跨架构世代的每 token 成本对比。',
        nvidia: 'Hopper 与 Blackwell 世代的每 token 成本对比。',
        amd: 'CDNA 3 与 CDNA 4 世代的每 token 成本对比。',
      },
    },
  },
  vendorHeadings: {
    cross: 'NVIDIA vs AMD',
    nvidia: 'NVIDIA vs NVIDIA',
    amd: 'AMD vs AMD',
  },
  detail: {
    full: {
      metaTitle: (fullLabel) => `${fullLabel} 推理基准测试`,
      metaDescription: (modelLabel, gpuLabel) =>
        `${modelLabel} 的 GPU 推理基准对比：${gpuLabel}。涵盖各类 LLM 工作负载的延迟、吞吐量与成本。`,
      eyebrow: (modelLabel) => `${modelLabel} · GPU 对比`,
      emptyState:
        '当前默认模型暂无插值对比数据。请使用下方的图表控件，选择一个两块 GPU 都有基准数据的模型。',
      caveat: (sequence, precision) =>
        `（数值基于此 URL 的默认 ${sequence} · ${precision} 选择——如果你在下方控件中更改序列、精度或模型，下方的表格和图表会随之更新。）`,
      mainChartLink: '主推理图表',
      crossLink: '查看每美元性能视图 →',
    },
    perDollar: {
      metaTitle: (fullLabel) => `${fullLabel} —— 每美元性能`,
      metaDescription: (modelLabel, gpuLabel) =>
        `${modelLabel} 在 ${gpuLabel} 上的每百万 token 成本。性能按自建超大规模数据中心 TCO 归一化——看哪块 GPU 在每个交互速率下都能以更低的成本产出更多 token。`,
      eyebrow: (modelLabel) => `${modelLabel} · 每美元性能`,
      emptyState:
        '此 GPU 组合在当前默认模型上暂无每 token 成本的插值数据。请使用下方的图表控件，选择一个两块 GPU 都有基准数据的模型与精度。',
      caveat: (sequence, precision) =>
        `（数值基于此 URL 的默认 ${sequence} · ${precision} 选择——如果你在下方控件中更改序列、精度或模型，下方的表格和图表会随之更新。）`,
      h1Suffix: '每美元性能',
      mainChartLink: '主推理图表',
      crossLink: '查看完整的延迟 + 吞吐量对比 →',
      pricingPrefix: 'GPU 定价（自建超大规模数据中心）：',
      pricingSource: '来源：',
      tcoSourceName: 'SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model',
      figcaption: (aLabel, bLabel) =>
        `${aLabel} 与 ${bLabel} 在本次对比的默认工作负载下的每百万 token 成本。成本越低，每美元性能越好。`,
    },
  },
  table: {
    help: '根据真实基准数据插值得出。编辑下方的目标交互速率，可在不同工作点进行对比。',
    metricColumn: '指标',
    interactivity: '交互速率 (tok/s/user)',
    metricLabel: {
      'Throughput (tok/s/gpu)': '吞吐量 (tok/s/gpu)',
      'Cost ($/M tok)': '成本 ($/M tok)',
      'tok/s/MW': 'tok/s/MW',
      Concurrency: '并发数',
    },
    perDollarCostLabel: '每百万 Token 美元成本',
  },
};

const DICTS: Record<Lang, CompareDict> = { en: EN, zh: ZH };

export function compareDict(lang: Lang): CompareDict {
  return DICTS[lang] ?? EN;
}
