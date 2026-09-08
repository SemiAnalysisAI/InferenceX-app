import type { Metadata } from 'next';

import {
  AUTHOR_HANDLE,
  OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  TCO_SOURCE_URL,
} from '@semianalysisai/inferencex-constants';

import { enAlternates, type Locale, ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from './i18n';

/**
 * Whitepaper registry.
 *
 * Every whitepaper the site publishes is one typed entry here. The `/whitepaper`
 * index and the `/whitepaper/[slug]` landing pages (plus their `/zh` siblings)
 * render exclusively from this module, so the English and Chinese copies of a
 * paper always ship together and stay in lockstep with the PDF they summarize.
 *
 * Binary assets (the PDF, cover render, hardware render, and figure PNGs) live under
 * `packages/app/public/whitepaper/<slug>/` and are referenced by public path.
 */

export type WhitepaperKpiIcon = 'dollar' | 'trending' | 'percent';

export interface WhitepaperKpi {
  /** Headline number, e.g. `$32.6B`. */
  value: string;
  /** What the number is, e.g. `Revenue per GW-year`. */
  label: string;
  /** Operating condition the number holds under. */
  caption: string;
  /** Lucide glyph drawn in the tile corner. */
  icon: WhitepaperKpiIcon;
}

export interface WhitepaperComparisonItem {
  value: string;
  label: string;
}

/** One-line secondary scenario shown under the KPI tiles. */
export interface WhitepaperComparison {
  /** Scenario name, e.g. `Rented at $3.00/chip-hr (August 2026 3-year pricing)`. */
  lead: string;
  items: readonly WhitepaperComparisonItem[];
}

export interface WhitepaperAssumption {
  item: string;
  value: string;
}

export interface WhitepaperSource {
  label: string;
  href: string;
}

/** Locale copy for one figure card; assets live on `WhitepaperFigure`. */
export interface WhitepaperFigureCopy {
  /** Cost tier shown in the chart header, mirrors the estimator's `Cost Tier` value. */
  costTier: string;
  caption: string;
  alt: string;
}

/** Theme-switched plot PNGs plus the badge text of the estimator header they reproduce. */
export interface WhitepaperFigure {
  id: string;
  srcLight: string;
  srcDark: string;
  width: number;
  height: number;
  /** Estimator `TCO $/chip/hr` badge text, e.g. `MI355X: 1.5`. */
  tcoBadge: string;
}

/** Locale-independent values of the estimator chart header the figure cards reproduce. */
export interface WhitepaperChartMeta {
  /** Public path of the model mark drawn before the chart title. */
  modelLogoPath: string;
  utilization: string;
  licenseFee: string;
  source: string;
  tcoSourceTitle: string;
  tcoSourceHref: string;
  sellingPrices: {
    input: string;
    cached: string;
    output: string;
    source: string;
  };
}

export interface WhitepaperCopy {
  /** Eyebrow kicker above the title, e.g. `Whitepaper · Executive Summary`. */
  typeLabel: string;
  title: string;
  subtitle: string;
  /** Meta description for search and social cards. */
  description: string;
  /** Lead paragraph shared by the landing page and the PDF. */
  abstract: string;
  keyFindings: readonly string[];
  /** Three headline tiles under the hero. */
  kpis: readonly WhitepaperKpi[];
  comparison: WhitepaperComparison;
  /** Formula chain, one step per entry. */
  methodSteps: readonly string[];
  assumptions: readonly WhitepaperAssumption[];
  sources: readonly WhitepaperSource[];
  /** Author byline. Always the InferenceX team; never an individual. */
  authors: string;
  /** Estimator chart title shared by every figure card. */
  figureTitle: string;
  /** Same order as `Whitepaper.figures`. */
  figures: readonly WhitepaperFigureCopy[];
  coverAlt: string;
  chipAlt: string;
}

export interface Whitepaper {
  slug: string;
  /** ISO date (YYYY-MM-DD) the paper was published. */
  publishedDate: string;
  /** ISO date (YYYY-MM-DD) of the benchmark snapshot the numbers come from. */
  dataDate: string;
  pageCount: number;
  tags: readonly string[];
  /** Public path of the downloadable PDF under `public/`. */
  pdfPath: string;
  /** PDF cover render; also the sitemap and JSON-LD image. */
  coverImagePath: string;
  /** Alias of `coverImagePath` kept for the sitemap and JSON-LD builders. */
  heroImagePath: string;
  /** Transparent hardware render layered over the hero band. */
  chipImagePath: string;
  chipImageWidth: number;
  chipImageHeight: number;
  figures: readonly WhitepaperFigure[];
  chart: WhitepaperChartMeta;
  en: WhitepaperCopy;
  zh: WhitepaperCopy;
}

export const WHITEPAPER_AUTHORS = 'SemiAnalysis InferenceX Team';
export const WHITEPAPER_AUTHORS_ZH = 'SemiAnalysis InferenceX 团队';

const MI355X_KIMI_K3_SLUG = 'amd-mi355x-32b-revenue-per-gigawatt-kimi-k3';
const MI355X_ASSET_DIR = `/whitepaper/${MI355X_KIMI_K3_SLUG}`;
const MI355X_COVER_PATH = `${MI355X_ASSET_DIR}/cover.webp`;

export const WHITEPAPERS: readonly Whitepaper[] = [
  {
    slug: MI355X_KIMI_K3_SLUG,
    publishedDate: '2026-09-04',
    dataDate: '2026-09-04',
    pageCount: 2,
    tags: ['AMD', 'MI355X', 'Kimi K3', 'vLLM', 'AgentX', 'Economics'],
    pdfPath: `/whitepaper/${MI355X_KIMI_K3_SLUG}/pdf/SemiAnalysis-InferenceX-Executive-Summary_AMD-MI355X-Revenue-per-Gigawatt-Kimi-K3.pdf`,
    coverImagePath: MI355X_COVER_PATH,
    heroImagePath: MI355X_COVER_PATH,
    chipImagePath: `${MI355X_ASSET_DIR}/mi355x-transparent.png`,
    chipImageWidth: 1783,
    chipImageHeight: 1073,
    figures: [
      {
        id: 'figure-1',
        srcLight: `${MI355X_ASSET_DIR}/figure-1-owned-hyperscaler-light.png`,
        srcDark: `${MI355X_ASSET_DIR}/figure-1-owned-hyperscaler-dark.png`,
        width: 2100,
        height: 810,
        tcoBadge: 'MI355X: 1.5',
      },
      {
        id: 'figure-2',
        srcLight: `${MI355X_ASSET_DIR}/figure-2-rental-3yr-light.png`,
        srcDark: `${MI355X_ASSET_DIR}/figure-2-rental-3yr-dark.png`,
        width: 2100,
        height: 810,
        tcoBadge: 'MI355X: 3',
      },
    ],
    chart: {
      modelLogoPath: '/logos/kimi-color.svg',
      utilization: '60%',
      licenseFee: '30%',
      source: 'SemiAnalysis InferenceX™',
      tcoSourceTitle: 'SemiAnalysis Market August 2026 Pricing Surveys & AI Cloud TCO Model',
      tcoSourceHref: TCO_SOURCE_URL,
      sellingPrices: {
        input: '3',
        cached: '0.3',
        output: '15',
        source: 'OpenRouter',
      },
    },
    en: {
      typeLabel: 'Whitepaper · Executive Summary',
      title: 'AMD Instinct MI355X Kimi K3 Can Generate Up to $32B of Revenue per GigaWatt per Year',
      subtitle: 'Executive Summary - Agentic Inference Serving Economics Analysis',
      description:
        'One utility gigawatt of AMD MI355X capacity running Kimi K3 2.8T on vLLM generates up to $32.6B of token revenue per year at 45 tok/s/user and 60% utilization, measured by InferenceX AgentX. Two-page executive summary with method, assumptions, and a downloadable PDF.',
      abstract:
        "One utility gigawatt of MI355X capacity running Kimi K3 2.8T on vLLM generates up to $32.6 billion of token revenue per year at the 45 tok/s/user operating point InferenceX uses for agentic workloads. The figure comes from measured AgentX trace replays on an 8-GPU MI355X node (FP4 weights, MTP speculative decoding, TP8), priced at Kimi K3's OpenRouter rates ($3.00 input, $0.30 cached input, $15.00 output per million tokens) and sold at 60% utilization. Two cost profiles bracket the operator's outcome. Owning the fleet at hyperscaler volume costs $1.50 per GPU-hour all-in and leaves $16.5 billion of profit after a 30% model license fee, a 50.7% margin. Renting the same fleet at $3.00 per GPU-hour, the August 2026 price for a 3-year MI355X contract, leaves $10.3 billion, a 31.5% margin.",
      keyFindings: [
        '$32.6B of revenue per GW-year. 478,469 MI355X GPUs fit in one all-in utility gigawatt at 2.09 kW per GPU (chip plus its share of node, network, and cooling). Each GPU produces 6,115 tok/s at the P90 45 tok/s/user point, which prices at $12.97 per GPU-hour gross and $7.78 after the 60% utilization haircut.',
        'Compute is the smaller cost. At $1.50/GPU/hr the fleet costs $6.3B per year, less than the $9.8B paid to the model lab as a 30% license fee. Doubling the compute cost to $3.00/GPU/hr adds $6.3B of expense and cuts profit from $16.5B to $10.3B; the operator still keeps 31.5% of revenue.',
        'The 45 tok/s/user point is the middle of the measured curve, not its peak. The MI355X vLLM frontier spans P90 interactivity from 10 to 116 tok/s/user. Loosening the target to 30 tok/s/user raises revenue to $42.8B per GW-year; tightening it to 60 tok/s/user drops revenue to $17.3B and pushes the rental profile to break-even.',
        'Utilization break-even is low. The owned fleet covers compute at 16.5% utilization and the rented fleet at 33.0%. Every 10 points of utilization adds $5.4B of revenue and $3.8B of profit per GW-year under either cost profile.',
        'Prefix caching carries the workload. The agentic traces are 99.2% input tokens and the vLLM server hits its GPU prefix cache 93.7% of the time at this point, so the blended sale price is $0.59 per million tokens even though output tokens list at $15.',
      ],
      kpis: [
        {
          value: '$32.6B',
          label: 'Revenue per GW-year',
          caption: 'Kimi K3 at OpenRouter list price, 60% utilization',
          icon: 'dollar',
        },
        {
          value: '$16.5B',
          label: 'Profit per GW-year',
          caption: 'Owned at hyperscaler volume, $1.50/chip-hr ($3.95 per chip-hour)',
          icon: 'trending',
        },
        {
          value: '50.7%',
          label: 'Profit margin',
          caption: 'After compute expense and 30% model license fee',
          icon: 'percent',
        },
      ],
      comparison: {
        lead: 'Rented at $3.00/chip-hr (August 2026 3-year pricing)',
        items: [
          { value: '$10.3B', label: 'profit' },
          { value: '31.5%', label: 'margin' },
          { value: '$2.45', label: 'per chip-hour' },
        ],
      },
      methodSteps: [
        'GPU-hours per GW-year = 1,000,000 kW / 2.09 kW per GPU x 8,760 h = 4.19 billion GPU-hours.',
        'Revenue = $/GPU/hr gross x GPU-hours x utilization.',
        'Compute expense = cost tier $/GPU/hr x GPU-hours, paid whether or not the fleet is busy.',
        'Model license fee = revenue x 30%.',
        'Profit = revenue - compute expense - license fee.',
        '$/GPU/hr gross = tok/s/GPU x 3,600 x blended $/M tok, where the blended price weights input share (99.2%), cache hit rate (93.7%, cached input billed at $0.30) and output share (0.8%) at the interpolated point.',
        'Interpolation: upper-left Pareto frontier on (P90 interactivity, tok/s/GPU), monotone cubic Hermite spline (Steffen 1990), no extrapolation.',
      ],
      assumptions: [
        {
          item: 'Model',
          value: 'Kimi K3 2.8T (moonshotai/Kimi-K3), FP4 weights',
        },
        {
          item: 'Hardware',
          value: 'AMD Instinct MI355X, 8 GPUs, TP8, single node',
        },
        {
          item: 'Framework',
          value: 'vLLM, ROCm nightly image vllm/vllm-openai-rocm:nightly-7c5dc571',
        },
        { item: 'Speculative decoding', value: 'MTP' },
        { item: 'Workload', value: 'InferenceX AgentX agentic trace replay' },
        { item: 'Operating point', value: 'P90 interactivity 45 tok/s/user' },
        {
          item: 'Token prices',
          value:
            '$3.00 input, $0.30 cached input, $15.00 output per M tokens (OpenRouter, moonshotai/kimi-k3)',
        },
        { item: 'Utilization', value: '60% of benchmarked throughput sold' },
        { item: 'Model license fee', value: '30% of revenue' },
        {
          item: 'All-in power',
          value: '2.09 kW per GPU (SemiAnalysis AI Cloud TCO Model)',
        },
        {
          item: 'Cost profile A',
          value:
            '$1.50 per GPU-hour, owning at hyperscaler volume (SemiAnalysis AI Cloud TCO Model)',
        },
        {
          item: 'Cost profile B',
          value: '$3.00 per GPU-hour, August 2026 3-year MI355X rental pricing',
        },
        { item: 'Hours per year', value: '8,760' },
        { item: 'Data date', value: '2026-09-04' },
      ],
      sources: [
        {
          label: 'InferenceX profit estimator per gigawatt',
          href: 'https://inferencex.semianalysis.com/profit-estimator-per-gigawatt',
        },
        {
          label: 'InferenceX AgentX dashboard',
          href: 'https://inferencex.semianalysis.com/agentx',
        },
        {
          label: 'OpenRouter Kimi K3 pricing',
          href: 'https://openrouter.ai/moonshotai/kimi-k3',
        },
        {
          label: 'SemiAnalysis AI Cloud TCO Model',
          href: 'https://semianalysis.com/ai-cloud-tco-model/',
        },
      ],
      authors: WHITEPAPER_AUTHORS,
      figureTitle:
        'Kimi K3 2.8T Agentic Revenue & Profit Estimates per GigaWatt Per Year at P90 45 tok/s/user Interactivity',
      figures: [
        {
          costTier: 'Owning Hyperscaler',
          caption:
            'Figure 1. Revenue and profit per GW-year, owned at hyperscaler volume ($1.50 per chip-hour). The bar totals $32.6B of revenue; segments from bottom to top are compute expense ($6.3B), model license fee ($9.8B), and profit ($16.5B, 50.7% margin).',
          alt: 'Figure 1: stacked bar of revenue per GW-year for MI355X on Kimi K3 2.8T, owned at $1.50 per GPU-hour. $32.6B of revenue splits into $6.3B compute expense, $9.8B model license fee, and $16.5B profit at a 50.7% margin.',
        },
        {
          costTier: 'Custom User Values (3-year rental, August 2026)',
          caption:
            'Figure 2. Revenue and profit per GW-year, rented at $3.00 per chip-hour (August 2026 3-year pricing, entered as a custom $/GPU/hr). Revenue is unchanged at $32.6B; compute expense doubles to $12.6B and profit falls to $10.3B, a 31.5% margin.',
          alt: 'Figure 2: stacked bar of revenue per GW-year for MI355X on Kimi K3 2.8T, rented at $3.00 per GPU-hour. $32.6B of revenue splits into $12.6B compute expense, $9.8B model license fee, and $10.3B profit at a 31.5% margin.',
        },
      ],
      coverAlt: 'Cover of the executive summary PDF',
      chipAlt: 'AMD Instinct MI355X OAM accelerator board',
    },
    zh: {
      typeLabel: '白皮书 · 执行摘要',
      title: 'AMD Instinct MI355X Kimi K3 每 GigaWatt 每年最高可创造 320 亿美元收入',
      subtitle: '执行摘要 - 智能体推理服务经济性分析',
      description:
        '据 InferenceX AgentX 实测，1 GW 电网供电的 AMD MI355X 算力在 vLLM 上运行 Kimi K3 2.8T，在 45 tok/s/user、60% 利用率下每年最高可产生 326 亿美元 token 收入。两页执行摘要，包含方法、假设与 PDF 下载。',
      abstract:
        '在 InferenceX 用于智能体工作负载的 45 tok/s/user 运行点上，1 GW 电网供电的 MI355X 算力在 vLLM 上运行 Kimi K3 2.8T，每年最高可产生 326 亿美元的 token 收入。该数字来自单个 8 GPU MI355X 节点（FP4 权重、MTP 投机解码、TP8）上的 AgentX trace 回放实测，按 Kimi K3 在 OpenRouter 的价格计费（每百万 token 输入 $3.00、缓存输入 $0.30、输出 $15.00），并按 60% 利用率售出。两种成本情形界定了运营方的结果区间：以超大规模云厂商的采购规模自建集群，全口径成本为每 GPU 小时 $1.50，扣除 30% 模型授权费后剩余 165 亿美元利润，利润率 50.7%；以每 GPU 小时 $3.00（2026 年 8 月 MI355X 3 年期租约价格）租用同等规模集群，则剩余 103 亿美元，利润率 31.5%。',
      keyFindings: [
        '每 GW·年 326 亿美元收入。按每 GPU 2.09 kW 的全口径功耗计算（芯片本身加上节点、网络和散热的分摊），1 GW 电网供电可容纳 478,469 张 MI355X GPU。在 P90 45 tok/s/user 运行点，每张 GPU 产生 6,115 tok/s，折合每 GPU 小时 $12.97 的毛收入，按 60% 利用率折减后为 $7.78。',
        '算力不是最大的成本项。按 $1.50/GPU/hr 计算，集群每年成本 63 亿美元，低于以 30% 授权费支付给模型厂商的 98 亿美元。算力成本翻倍到 $3.00/GPU/hr 会增加 63 亿美元支出，利润从 165 亿美元降至 103 亿美元，运营方仍能保留 31.5% 的收入。',
        '45 tok/s/user 位于实测曲线的中段，并非峰值。MI355X 在 vLLM 上的前沿曲线覆盖 10 到 116 tok/s/user 的 P90 交互性区间。把目标放宽到 30 tok/s/user，收入升至每 GW·年 428 亿美元；收紧到 60 tok/s/user，收入降至 173 亿美元，租用情形接近盈亏平衡。',
        '利用率的盈亏平衡点很低。自建集群在 16.5% 利用率即可覆盖算力成本，租用集群为 33.0%。在两种成本情形下，利用率每提高 10 个百分点，每 GW·年收入增加 54 亿美元，利润增加 38 亿美元。',
        '前缀缓存支撑了整个工作负载。智能体 trace 中 99.2% 是输入 token，vLLM 服务端在该运行点的 GPU 前缀缓存命中率为 93.7%，因此尽管输出 token 标价 $15，混合售价仅为每百万 token $0.59。',
      ],
      kpis: [
        {
          value: '$32.6B',
          label: '每 GW·年收入',
          caption: 'Kimi K3 按 OpenRouter 标价计费，60% 利用率',
          icon: 'dollar',
        },
        {
          value: '$16.5B',
          label: '每 GW·年利润',
          caption: '按超大规模云厂商采购规模自建，$1.50/chip-hr（每芯片小时 $3.95）',
          icon: 'trending',
        },
        {
          value: '50.7%',
          label: '利润率',
          caption: '扣除算力支出和 30% 模型授权费之后',
          icon: 'percent',
        },
      ],
      comparison: {
        lead: '按 $3.00/chip-hr 租用（2026 年 8 月 3 年期租约价格）',
        items: [
          { value: '$10.3B', label: '利润' },
          { value: '31.5%', label: '利润率' },
          { value: '$2.45', label: '每芯片小时' },
        ],
      },
      methodSteps: [
        '每 GW·年 GPU 小时数 = 1,000,000 kW / 每 GPU 2.09 kW x 8,760 h = 41.9 亿 GPU 小时。',
        '收入 = 每 GPU 小时毛收入 ($/GPU/hr) x GPU 小时数 x 利用率。',
        '算力支出 = 成本档位 ($/GPU/hr) x GPU 小时数，无论集群是否繁忙都需支付。',
        '模型授权费 = 收入 x 30%。',
        '利润 = 收入 - 算力支出 - 授权费。',
        '每 GPU 小时毛收入 ($/GPU/hr) = tok/s/GPU x 3,600 x 混合 $/M tok；混合价格按插值点的输入占比（99.2%）、缓存命中率（93.7%，缓存输入按 $0.30 计费）和输出占比（0.8%）加权。',
        '插值方法：在 (P90 交互性, tok/s/GPU) 平面取左上 Pareto 前沿，使用单调三次 Hermite 样条（Steffen 1990），不做外推。',
      ],
      assumptions: [
        { item: '模型', value: 'Kimi K3 2.8T (moonshotai/Kimi-K3)，FP4 权重' },
        { item: '硬件', value: 'AMD Instinct MI355X，8 GPU，TP8，单节点' },
        {
          item: '框架',
          value: 'vLLM，ROCm nightly 镜像 vllm/vllm-openai-rocm:nightly-7c5dc571',
        },
        { item: '投机解码', value: 'MTP' },
        { item: '工作负载', value: 'InferenceX AgentX 智能体 trace 回放' },
        { item: '运行点', value: 'P90 交互性 45 tok/s/user' },
        {
          item: 'Token 价格',
          value:
            '每百万 token 输入 $3.00、缓存输入 $0.30、输出 $15.00（OpenRouter，moonshotai/kimi-k3）',
        },
        { item: '利用率', value: '售出基准测试吞吐量的 60%' },
        { item: '模型授权费', value: '收入的 30%' },
        {
          item: '全口径功耗',
          value: '每 GPU 2.09 kW（SemiAnalysis AI Cloud TCO Model）',
        },
        {
          item: '成本情形 A',
          value:
            '每 GPU 小时 $1.50，以超大规模云厂商采购规模自建（SemiAnalysis AI Cloud TCO Model）',
        },
        {
          item: '成本情形 B',
          value: '每 GPU 小时 $3.00，2026 年 8 月 MI355X 3 年期租约价格',
        },
        { item: '每年小时数', value: '8,760' },
        { item: '数据日期', value: '2026-09-04' },
      ],
      sources: [
        {
          label: 'InferenceX 每 GW 利润估算器',
          href: 'https://inferencex.semianalysis.com/zh/profit-estimator-per-gigawatt',
        },
        {
          label: 'InferenceX AgentX 仪表板',
          href: 'https://inferencex.semianalysis.com/zh/agentx',
        },
        {
          label: 'OpenRouter Kimi K3 定价',
          href: 'https://openrouter.ai/moonshotai/kimi-k3',
        },
        {
          label: 'SemiAnalysis AI Cloud TCO Model',
          href: 'https://semianalysis.com/ai-cloud-tco-model/',
        },
      ],
      authors: WHITEPAPER_AUTHORS_ZH,
      figureTitle: 'Kimi K3 2.8T 智能体 每吉瓦每年收入与利润估算（P90 交互性 45 tok/s/user）',
      figures: [
        {
          costTier: '自有（超大规模）',
          caption:
            '图 1. 按超大规模云厂商采购规模自建（每芯片小时 $1.50）时每 GW·年的收入与利润。柱子合计收入 326 亿美元；自下而上的分段依次为算力支出（63 亿美元）、模型授权费（98 亿美元）和利润（165 亿美元，利润率 50.7%）。',
          alt: '图 1：MI355X 运行 Kimi K3 2.8T、按每 GPU 小时 $1.50 自建时每 GW·年收入的堆叠柱状图。326 亿美元收入分为 63 亿美元算力支出、98 亿美元模型授权费和 165 亿美元利润，利润率 50.7%。',
        },
        {
          costTier: '自定义值（3 年租赁，2026 年 8 月）',
          caption:
            '图 2. 按每芯片小时 $3.00 租用（2026 年 8 月 3 年期租约价格，以自定义 $/GPU/hr 输入）时每 GW·年的收入与利润。收入仍为 326 亿美元；算力支出翻倍至 126 亿美元，利润降至 103 亿美元，利润率 31.5%。',
          alt: '图 2：MI355X 运行 Kimi K3 2.8T、按每 GPU 小时 $3.00 租用时每 GW·年收入的堆叠柱状图。326 亿美元收入分为 126 亿美元算力支出、98 亿美元模型授权费和 103 亿美元利润，利润率 31.5%。',
        },
      ],
      coverAlt: '执行摘要 PDF 封面',
      chipAlt: 'AMD Instinct MI355X OAM 加速卡',
    },
  },
];

/** Newest first. */
export function getAllWhitepapers(): readonly Whitepaper[] {
  return [...WHITEPAPERS].sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
}

export function getWhitepaper(slug: string): Whitepaper | undefined {
  return WHITEPAPERS.find((paper) => paper.slug === slug);
}

export function whitepaperCopy(paper: Whitepaper, locale: Locale): WhitepaperCopy {
  return locale === 'zh' ? paper.zh : paper.en;
}

export function whitepaperIndexPath(locale: Locale): string {
  return locale === 'zh' ? '/zh/whitepaper' : '/whitepaper';
}

export function whitepaperDetailPath(slug: string, locale: Locale): string {
  return `${whitepaperIndexPath(locale)}/${slug}`;
}

export function formatWhitepaperDate(isoDate: string, locale: Locale): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Page chrome strings shared by the index and detail pages. */
export const WHITEPAPER_COPY = {
  en: {
    indexTitle: 'Whitepapers',
    indexDescription: `Executive summaries from the ${SITE_NAME} team on inference serving economics, measured on the live AgentX benchmark and published as downloadable PDFs.`,
    indexIntro:
      'Short research papers on inference serving economics, measured on the live AgentX benchmark and published as downloadable PDFs.',
    indexEmpty: 'Coming soon.',
    backToIndex: 'Back to whitepapers',
    downloadPdf: 'Download PDF',
    readSummary: 'Read the page',
    openEstimator: 'Open the profit estimator per gigawatt',
    summary: 'Summary',
    keyFindings: 'Key findings',
    method: 'Method',
    assumptions: 'Assumptions',
    assumptionItem: 'Item',
    assumptionValue: 'Value',
    sources: 'Sources',
    closingHeading: 'Get the full executive summary',
    closingBody: 'The two-page PDF includes both figures, the assumptions table, and source links.',
    pages: (count: number) => `${count} pages`,
    dataAsOf: (date: string) => `Data as of ${date}`,
    indexEyebrow: 'InferenceX Research',
    tags: 'Tags',
    scrollHint: 'Scroll sideways to see the full chart.',
    keyNumbers: 'Key numbers',
    figures: 'Figures',
    onThisPage: 'On this page',
    pdfCardTitle: 'Executive summary',
    pdfCardMeta: (count: number) => `Executive summary · ${count} pages · PDF`,
    tcoBadgesLabel: 'TCO $/chip/hr:',
    sourceLabel: 'Source:',
    sellingPriceLabel: 'Selling Price per Million Tokens',
    sellingPrices: (input: string, cached: string, output: string, source: string) =>
      `Input $${input} · Cached Input $${cached} · Output $${output} (${source})`,
  },
  zh: {
    indexTitle: '白皮书',
    indexDescription: `${SITE_NAME} 团队发布的推理服务经济性执行摘要，基于 AgentX 基准测试的实测数据，提供 PDF 下载。`,
    indexIntro: '关于推理服务经济性的短篇研究报告，基于 AgentX 基准测试的实测数据，提供 PDF 下载。',
    indexEmpty: '即将上线。',
    backToIndex: '返回白皮书列表',
    downloadPdf: '下载 PDF',
    readSummary: '阅读摘要',
    openEstimator: '打开每 GW 利润估算器',
    summary: '摘要',
    keyFindings: '主要结论',
    method: '方法',
    assumptions: '假设条件',
    assumptionItem: '项目',
    assumptionValue: '取值',
    sources: '数据来源',
    closingHeading: '获取完整执行摘要',
    closingBody: '两页 PDF 包含两张图、假设条件表和数据来源链接。',
    pages: (count: number) => `共 ${count} 页`,
    dataAsOf: (date: string) => `数据截至 ${date}`,
    indexEyebrow: 'InferenceX 研究',
    tags: '标签',
    scrollHint: '左右滑动查看完整图表。',
    keyNumbers: '核心数字',
    figures: '图表',
    onThisPage: '本页目录',
    pdfCardTitle: '执行摘要',
    pdfCardMeta: (count: number) => `执行摘要 · 共 ${count} 页 · PDF`,
    tcoBadgesLabel: 'TCO $/chip/hr：',
    sourceLabel: '来源：',
    sellingPriceLabel: '每百万 token 售价',
    sellingPrices: (input: string, cached: string, output: string, source: string) =>
      `输入 $${input} · 缓存输入 $${cached} · 输出 $${output}（${source}）`,
  },
} as const;

export function whitepaperIndexMetadata(locale: Locale): Metadata {
  const t = WHITEPAPER_COPY[locale];
  const isZh = locale === 'zh';
  const enPath = '/whitepaper';
  const url = `${SITE_URL}${whitepaperIndexPath(locale)}`;
  return {
    title: t.indexTitle,
    description: t.indexDescription,
    alternates: isZh ? zhAlternates(enPath) : enAlternates(enPath),
    openGraph: {
      title: `${t.indexTitle} | ${SITE_NAME}`,
      description: t.indexDescription,
      url,
      type: 'website',
      locale: isZh ? ZH_OG_LOCALE : 'en_US',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: t.indexTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.indexTitle,
      description: t.indexDescription,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
      images: [OG_IMAGE],
    },
  };
}

export function whitepaperDetailMetadata(slug: string, locale: Locale): Metadata {
  const paper = getWhitepaper(slug);
  if (!paper) return {};
  const copy = whitepaperCopy(paper, locale);
  const isZh = locale === 'zh';
  const enPath = `/whitepaper/${paper.slug}`;
  const url = `${SITE_URL}${whitepaperDetailPath(paper.slug, locale)}`;
  return {
    // `absolute` keeps a short " | InferenceX" suffix instead of the long root
    // template so the headline survives SERP truncation (same as blog posts).
    title: { absolute: `${copy.title} | ${SITE_NAME}` },
    description: copy.description,
    keywords: [...paper.tags],
    authors: [{ name: copy.authors }],
    alternates: isZh ? zhAlternates(enPath) : enAlternates(enPath),
    openGraph: {
      title: `${copy.title} | ${SITE_NAME}`,
      description: copy.description,
      url,
      type: 'article',
      locale: isZh ? ZH_OG_LOCALE : 'en_US',
      publishedTime: `${paper.publishedDate}T00:00:00Z`,
      authors: [copy.authors],
      tags: [...paper.tags],
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: copy.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.title,
      description: copy.description,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
      images: [OG_IMAGE],
    },
  };
}

/** schema.org Report describing one whitepaper, with the PDF as an encoding. */
export function buildWhitepaperJsonLd(paper: Whitepaper, locale: Locale): object {
  const copy = whitepaperCopy(paper, locale);
  const url = `${SITE_URL}${whitepaperDetailPath(paper.slug, locale)}`;
  const organization = {
    '@type': 'Organization',
    name: WHITEPAPER_AUTHORS,
    url: SITE_URL,
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'Report',
    '@id': url,
    headline: copy.title,
    name: copy.title,
    alternativeHeadline: copy.subtitle,
    abstract: copy.abstract,
    description: copy.description,
    url,
    mainEntityOfPage: url,
    inLanguage: locale === 'zh' ? ZH_LANG_TAG : 'en',
    datePublished: paper.publishedDate,
    numberOfPages: paper.pageCount,
    keywords: paper.tags.join(', '),
    author: organization,
    publisher: organization,
    image: `${SITE_URL}${paper.heroImagePath}`,
    encoding: {
      '@type': 'MediaObject',
      encodingFormat: 'application/pdf',
      contentUrl: `${SITE_URL}${paper.pdfPath}`,
    },
    isAccessibleForFree: true,
  };
}

export function buildWhitepaperBreadcrumbJsonLd(paper: Whitepaper, locale: Locale): object {
  const copy = whitepaperCopy(paper, locale);
  const t = WHITEPAPER_COPY[locale];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t.indexTitle,
        item: `${SITE_URL}${whitepaperIndexPath(locale)}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: copy.title,
        item: `${SITE_URL}${whitepaperDetailPath(paper.slug, locale)}`,
      },
    ],
  };
}

export function buildWhitepaperIndexJsonLd(locale: Locale): object {
  const t = WHITEPAPER_COPY[locale];
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t.indexTitle,
    description: t.indexDescription,
    url: `${SITE_URL}${whitepaperIndexPath(locale)}`,
    inLanguage: locale === 'zh' ? ZH_LANG_TAG : 'en',
    publisher: {
      '@type': 'Organization',
      name: WHITEPAPER_AUTHORS,
      url: SITE_URL,
    },
    hasPart: getAllWhitepapers().map((paper) => ({
      '@type': 'Report',
      name: whitepaperCopy(paper, locale).title,
      url: `${SITE_URL}${whitepaperDetailPath(paper.slug, locale)}`,
      datePublished: paper.publishedDate,
    })),
  };
}
