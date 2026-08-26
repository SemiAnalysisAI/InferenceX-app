/**
 * Chip pages — static, indexable SEO surfaces at /chips, /chips/[slug] and
 * /chips/[a]-vs-[b].
 *
 * Content strategy: every page is fully static (no DB) and joins two existing
 * sources of truth so numbers can never drift from the rest of the site:
 *
 * - `GPU_SPECS` (src/lib/gpu-specs.ts) — memory, bandwidth, dense TFLOP/s,
 *   interconnect and topology details shown on the Chip Specs tab.
 * - `HW_REGISTRY` (@semianalysisai/inferencex-constants) — TDP, all-in power
 *   and the $/chip/hr tiers used by the TCO calculator and per-dollar pages.
 *
 * FAQ answers and versus-page copy are generated from those structures at
 * render time; only the overview prose is hand-authored. The Simplified
 * Chinese siblings live in `chip-pages-zh.ts` and MUST be updated in the same
 * PR as this file (see AGENTS.md "Chinese Website Pages").
 */
import { HW_REGISTRY, type HwEntry } from '@semianalysisai/inferencex-constants';

import { GPU_SPECS, type GpuSpec } from '@/lib/gpu-specs';

export interface ChipFaqItem {
  question: string;
  answer: string;
}

export interface ChipPageEntry {
  /** URL slug under /chips/ */
  slug: string;
  /** Key into HW_REGISTRY (TDP, all-in power, $/hr tiers) */
  hwKey: string;
  /** `name` of the matching GPU_SPECS row */
  specName: string;
  /** Full display title, e.g. "NVIDIA B200" */
  title: string;
  /** Short label used in tables and versus copy, e.g. "B200" */
  label: string;
  /** Meta-description base; supporters line is appended by the page. */
  summary: string;
  /** Hand-authored overview paragraphs (keyword-bearing prose). */
  overview: readonly string[];
  /** How InferenceX benchmarks this chip. */
  benchmarkContext: string;
  /** Meta keywords; searcher-phrased, includes "GPU" variants. */
  keywords: readonly string[];
  /** Blog posts under content/blog that feature this chip. */
  relatedBlogSlugs: readonly string[];
  /** Glossary entries that explain the concepts named in the prose. */
  relatedGlossarySlugs: readonly string[];
  /** Other chip pages worth crosslinking. */
  relatedChipSlugs: readonly string[];
}

const INFERENCEMAX = 'inferencemax-open-source-inference-benchmarking';
const INFERENCEX_V2 = 'inferencex-v2-nvidia-blackwell-vs-amd-vs-hopper';

const entries = [
  {
    slug: 'h100',
    hwKey: 'h100',
    specName: 'H100 SXM',
    title: 'NVIDIA H100 SXM',
    label: 'H100',
    summary:
      'NVIDIA H100 specs, cloud pricing and live LLM inference benchmarks: 80 GB HBM3, 3.35 TB/s bandwidth, FP8 tensor cores, NVLink 4.0, measured daily on vLLM, SGLang and TensorRT-LLM.',
    overview: [
      'The NVIDIA H100 SXM is the Hopper-generation datacenter accelerator that powered the first wave of large-scale LLM deployment. Each chip pairs 80 GB of HBM3 at 3.35 TB/s with fourth-generation tensor cores that reach 1,979 dense FP8 TFLOP/s, connected in 8-chip nodes over NVLink 4.0 at 450 GB/s per chip.',
      'H100 remains the baseline other accelerators are judged against: it has the deepest software support of any AI chip, wide cloud availability, and the lowest hourly rates of the NVIDIA lineup. It lacks FP4 tensor cores, so newer Blackwell parts pull ahead on quantized serving workloads where NVFP4 applies.',
    ],
    benchmarkContext:
      'InferenceX runs H100 continuously on vLLM, SGLang and TensorRT-LLM across fixed-sequence serving and long-context agentic traces, publishing throughput-versus-interactivity Pareto frontiers, cost per million tokens and energy per token alongside every newer chip so the upgrade math stays visible.',
    keywords: [
      'NVIDIA H100',
      'H100 GPU',
      'H100 specs',
      'H100 price per hour',
      'H100 cloud pricing',
      'H100 inference benchmark',
      'H100 FP8 TFLOPS',
      'H100 memory bandwidth',
      'Hopper GPU',
      'H100 vs B200',
    ],
    relatedBlogSlugs: [
      INFERENCEMAX,
      'qwen3-5-397b-agentx-b300-fp4-vs-h100',
      'b200-minimax-m2-5-vllm-nvfp4-vs-h100-fp8-perf-per-dollar',
    ],
    relatedGlossarySlugs: ['fp8', 'high-bandwidth-memory', 'nvlink', 'tensor-parallelism'],
    relatedChipSlugs: ['h200', 'b200', 'mi300x'],
  },
  {
    slug: 'h200',
    hwKey: 'h200',
    specName: 'H200 SXM',
    title: 'NVIDIA H200 SXM',
    label: 'H200',
    summary:
      'NVIDIA H200 specs, cloud pricing and live LLM inference benchmarks: 141 GB HBM3e, 4.8 TB/s bandwidth, FP8 tensor cores and NVLink 4.0, measured daily against Blackwell and AMD Instinct.',
    overview: [
      'The NVIDIA H200 SXM is the memory-upgraded Hopper part: the same 1,979 dense FP8 TFLOP/s as H100, but with 141 GB of HBM3e at 4.8 TB/s. The 76% larger memory pool and 43% higher bandwidth matter most for long-context serving and large KV caches, where H100 runs out of headroom first.',
      'For memory-bound decode workloads the H200 delivers materially better tokens per second per chip than H100 at a similar hourly rate, which is why it stayed the volume Hopper SKU once Blackwell arrived. Like H100 it has no FP4 support, so FP8 and INT4 weight-only quantization are its serving precisions.',
    ],
    benchmarkContext:
      'InferenceX benchmarks H200 daily on vLLM, SGLang and TensorRT-LLM, and its compare pages line H200 FP8 results up against B200 NVFP4 and AMD MI325X so the Hopper-to-Blackwell and NVIDIA-to-AMD tradeoffs are measured rather than asserted.',
    keywords: [
      'NVIDIA H200',
      'H200 GPU',
      'H200 specs',
      'H200 price per hour',
      'H200 inference benchmark',
      'H200 memory bandwidth',
      'H200 vs H100',
      'H200 vs B200',
      'HBM3e GPU',
      'Hopper H200 cloud pricing',
    ],
    relatedBlogSlugs: [
      'b200-glm5-nvfp4-vs-h200-fp8-3-6x-perf-per-dollar',
      'b200-nvfp4-vs-h200-int4-kimi-k2-vllm-perf-per-dollar',
      INFERENCEX_V2,
    ],
    relatedGlossarySlugs: ['high-bandwidth-memory', 'memory-bandwidth', 'kv-cache', 'fp8'],
    relatedChipSlugs: ['h100', 'b200', 'mi325x'],
  },
  {
    slug: 'b200',
    hwKey: 'b200',
    specName: 'B200 SXM',
    title: 'NVIDIA B200',
    label: 'B200',
    summary:
      'NVIDIA B200 specs, cloud pricing and live LLM inference benchmarks: 180 GB HBM3e, 8 TB/s bandwidth, 9,000 dense FP4 TFLOP/s and NVLink 5.0, measured daily on vLLM, SGLang and TensorRT-LLM.',
    overview: [
      'The NVIDIA B200 is the volume Blackwell datacenter chip: 180 GB of usable HBM3e at 8 TB/s, NVLink 5.0 at 900 GB/s per chip, and tensor cores that double Hopper throughput per clock while adding FP4. At 9,000 dense FP4 TFLOP/s and 4,500 FP8, a single B200 more than doubles H100 compute in half the memory-bandwidth-bound regimes that dominate LLM decode.',
      'B200 is where NVFP4 serving became mainstream: frontier open models ship FP4 checkpoints that keep accuracy within noise of FP8 while nearly doubling throughput per chip. Its 1,000 W TDP and roughly 1.7 kW all-in power draw price it well above Hopper per hour, so performance per dollar, not peak TFLOP/s, decides the upgrade.',
    ],
    benchmarkContext:
      'B200 is one of the most heavily benchmarked chips on InferenceX: daily fixed-sequence sweeps and AgentX agentic-coding traces on vLLM, SGLang, TensorRT-LLM and Dynamo disaggregated serving, with per-dollar and precision compare pages tracking NVFP4 versus FP8 on every covered model.',
    keywords: [
      'NVIDIA B200',
      'B200 GPU',
      'B200 specs',
      'B200 price per hour',
      'B200 cloud pricing',
      'B200 inference benchmark',
      'B200 NVFP4',
      'B200 vs H100',
      'B200 vs MI355X',
      'Blackwell GPU specs',
    ],
    relatedBlogSlugs: [
      'b200-glm5-nvfp4-vs-h200-fp8-3-6x-perf-per-dollar',
      'sglang-0-5-6-b200-deepseek-r1-fp4-up-to-1-8x',
      'deepseek-v4-pro-agentx-b200-vs-b300-kv-working-set',
    ],
    relatedGlossarySlugs: ['nvfp4', 'fp4', 'nvlink', 'quantization'],
    relatedChipSlugs: ['b300', 'gb200-nvl72', 'h100', 'mi355x'],
  },
  {
    slug: 'b300',
    hwKey: 'b300',
    specName: 'B300 SXM',
    title: 'NVIDIA B300',
    label: 'B300',
    summary:
      'NVIDIA B300 (Blackwell Ultra) specs, cloud pricing and live LLM inference benchmarks: 268 GB usable HBM3e, 13,500 dense FP4 TFLOP/s, 800 Gbit/s scale-out, measured daily against B200, GB300 NVL72 and MI355X.',
    overview: [
      'The NVIDIA B300 is the Blackwell Ultra SXM part: 268 GB of usable HBM3e at 8 TB/s and 13,500 dense FP4 TFLOP/s, a 1.5x FP4 uplift over B200 while FP8 and BF16 stay at B200 levels. The 49% larger memory pool is the bigger serving story, holding larger KV working sets and bigger models per 8-chip node.',
      'B300 also doubles scale-out networking to 800 Gbit/s per chip via ConnectX-8, which matters for disaggregated prefill/decode and wide expert parallelism. It slots between B200 and the rack-scale GB300 NVL72: same NVLink 5.0 world size of 8, but Ultra-class memory and FP4 compute.',
    ],
    benchmarkContext:
      'InferenceX runs B300 on the same daily cadence as B200 across vLLM, SGLang and TensorRT-LLM, including AgentX long-context agentic traces where its 268 GB of HBM3e keeps KV working sets resident that force smaller chips to preempt or offload.',
    keywords: [
      'NVIDIA B300',
      'B300 GPU',
      'B300 specs',
      'Blackwell Ultra',
      'B300 price per hour',
      'B300 inference benchmark',
      'B300 FP4 TFLOPS',
      'B300 vs B200',
      'B300 memory',
      'B300 vs MI355X',
    ],
    relatedBlogSlugs: [
      'deepseek-v4-pro-agentx-b200-vs-b300-kv-working-set',
      'minimax-m3-agentx-b300-trtllm-tp2-vs-the-field',
      'qwen3-5-397b-agentx-b300-fp4-vs-h100',
    ],
    relatedGlossarySlugs: ['fp4', 'kv-cache', 'disaggregated-inference', 'scale-up-vs-scale-out'],
    relatedChipSlugs: ['b200', 'gb300-nvl72', 'mi355x'],
  },
  {
    slug: 'gb200-nvl72',
    hwKey: 'gb200',
    specName: 'GB200 NVL72',
    title: 'NVIDIA GB200 NVL72',
    label: 'GB200 NVL72',
    summary:
      'NVIDIA GB200 NVL72 specs, rack pricing and live LLM inference benchmarks: 72 Blackwell chips in one NVLink domain, 186 GB HBM3e per chip, 900 GB/s scale-up, measured daily on disaggregated vLLM, SGLang and Dynamo TRT-LLM.',
    overview: [
      'The NVIDIA GB200 NVL72 is a rack-scale system: 72 Blackwell chips and 36 Grace CPUs joined by fifth-generation NVLink into a single 72-chip domain with 900 GB/s of unidirectional bandwidth per chip. There is no scale-out network inside the rack because the rack itself is the compute unit, with roughly 13.4 TB of pooled HBM3e.',
      'That one-hop, all-to-all fabric is why GB200 NVL72 dominates wide-expert-parallel serving of large MoE models: expert layers can be spread across dozens of chips without crossing InfiniBand or Ethernet. Disaggregated prefill/decode stacks such as Dynamo and SGLang PD map naturally onto the domain.',
    ],
    benchmarkContext:
      'InferenceX benchmarks GB200 NVL72 with multi-node disaggregated configurations, including wide-EP vLLM, SGLang and Dynamo TRT-LLM runs on frontier MoE models, and normalizes results as throughput per chip so rack-scale numbers stay comparable with 8-chip HGX nodes.',
    keywords: [
      'NVIDIA GB200 NVL72',
      'GB200 NVL72 specs',
      'GB200 price',
      'GB200 NVL72 benchmark',
      'NVL72 rack',
      'GB200 vs B200',
      'NVLink 72 GPU domain',
      'GB200 inference performance',
      'rack-scale AI system',
      'GB200 NVL72 power consumption',
    ],
    relatedBlogSlugs: [
      'gb200-nvl72-kimi-k2-5-vllm-wide-ep-3x-vs-b200',
      'gb200-nvl72-vs-b200-disagg-deepseek-r1-fp4-dynamo-trt',
      'vera-rubin-nvl72-vs-gb200-nvl72-inference',
    ],
    relatedGlossarySlugs: [
      'wide-expert-parallelism',
      'disaggregated-inference',
      'nvlink',
      'scale-up-vs-scale-out',
    ],
    relatedChipSlugs: ['gb300-nvl72', 'b200', 'b300'],
  },
  {
    slug: 'gb300-nvl72',
    hwKey: 'gb300',
    specName: 'GB300 NVL72',
    title: 'NVIDIA GB300 NVL72',
    label: 'GB300 NVL72',
    summary:
      'NVIDIA GB300 NVL72 specs, rack pricing and live LLM inference benchmarks: 72 Blackwell Ultra chips, 278 GB HBM3e each (20 TB per rack), 15,000 dense FP4 TFLOP/s per chip, measured daily on disaggregated serving stacks.',
    overview: [
      'The NVIDIA GB300 NVL72 is the Blackwell Ultra rack: 72 chips with 278 GB of usable HBM3e each, roughly 20 TB of pooled memory per rack, and 15,000 dense FP4 TFLOP/s per chip on the same 72-way NVLink 5.0 domain as GB200 NVL72. FP8 and BF16 throughput carry over from GB200; the Ultra uplift is FP4 and memory.',
      'The extra memory per chip compounds at rack scale: bigger frontier MoE models, longer contexts and larger KV working sets fit without spilling, and each chip runs a higher 1,400 W TDP to feed the larger stacks. GB300 NVL72 is the current top of the NVIDIA inference lineup ahead of Vera Rubin.',
    ],
    benchmarkContext:
      'InferenceX runs GB300 NVL72 on frontier MoE models with disaggregated and wide-EP configurations, and its AgentX agentic-coding lane uses the rack as the reference ceiling that AMD MI355X ATOM results and smaller NVIDIA nodes are measured against.',
    keywords: [
      'NVIDIA GB300 NVL72',
      'GB300 NVL72 specs',
      'GB300 price',
      'GB300 NVL72 benchmark',
      'Blackwell Ultra rack',
      'GB300 vs GB200',
      'GB300 memory per GPU',
      'GB300 FP4 TFLOPS',
      'GB300 inference performance',
      'GB300 NVL72 power',
    ],
    relatedBlogSlugs: [
      'gb300-nvl72-vs-gb200-nvl72-dsv4-pro-vllm-fp4',
      'deepseek-v4-pro-agentx-gb200-vs-gb300-disagg',
      'kimi-k3-agentx-mi355x-atom-vs-gb300-nvl72',
    ],
    relatedGlossarySlugs: ['fp4', 'wide-expert-parallelism', 'kv-cache', 'disaggregated-inference'],
    relatedChipSlugs: ['gb200-nvl72', 'b300', 'mi355x'],
  },
  {
    slug: 'mi300x',
    hwKey: 'mi300x',
    specName: 'MI300X',
    title: 'AMD Instinct MI300X',
    label: 'MI300X',
    summary:
      'AMD Instinct MI300X specs, cloud pricing and live LLM inference benchmarks: 192 GB HBM3, 5.3 TB/s bandwidth, 2,615 dense FP8 TFLOP/s, full-mesh Infinity Fabric, measured daily on vLLM and SGLang with ROCm.',
    overview: [
      'The AMD Instinct MI300X is the CDNA 3 accelerator that made AMD a serious LLM inference vendor: 192 GB of HBM3 at 5.3 TB/s, more than double H100 memory, with 2,615 dense FP8 TFLOP/s. Eight chips connect in a full-mesh Infinity Fabric node with no switches, 448 GB/s of scale-up bandwidth per chip.',
      'The memory advantage lets MI300X serve models in fewer chips or hold larger KV caches per replica, and its hourly pricing sits well below comparable NVIDIA parts. Software is the historical caveat: ROCm builds of vLLM and SGLang have closed much of the gap, and the public benchmark record tracks exactly how far.',
    ],
    benchmarkContext:
      'MI300X was one of the original InferenceMAX chips and still runs in the continuous sweep on ROCm vLLM and SGLang, giving one of the longest public software-progress curves of any accelerator: the same chip, measured for months, as kernels and schedulers improved.',
    keywords: [
      'AMD MI300X',
      'MI300X specs',
      'MI300X price per hour',
      'MI300X inference benchmark',
      'MI300X vs H100',
      'AMD Instinct GPU',
      'CDNA 3',
      'ROCm inference',
      'MI300X memory',
      'MI300X vLLM performance',
    ],
    relatedBlogSlugs: [INFERENCEMAX, INFERENCEX_V2, 'mi355x-kimi-k2-5-vllm-aiter-7x-speedup'],
    relatedGlossarySlugs: ['rocm', 'high-bandwidth-memory', 'vllm', 'sglang'],
    relatedChipSlugs: ['mi325x', 'mi355x', 'h100'],
  },
  {
    slug: 'mi325x',
    hwKey: 'mi325x',
    specName: 'MI325X',
    title: 'AMD Instinct MI325X',
    label: 'MI325X',
    summary:
      'AMD Instinct MI325X specs, cloud pricing and live LLM inference benchmarks: 256 GB HBM3e, 6 TB/s bandwidth, 2,615 dense FP8 TFLOP/s, full-mesh Infinity Fabric, measured daily on ROCm vLLM and SGLang.',
    overview: [
      'The AMD Instinct MI325X is the memory-bumped CDNA 3 part: the same 2,615 dense FP8 TFLOP/s as MI300X but with 256 GB of HBM3e at 6 TB/s, the largest memory pool of its generation. An 8-chip full-mesh node carries over 2 TB of HBM, enough to serve very large models without leaving the node.',
      'MI325X competes on capacity economics against H200: more memory per chip and lower hourly rates, traded against the NVIDIA software ecosystem. For memory-bound decode and long-context serving its bandwidth-per-dollar is among the best of the pre-CDNA 4 field.',
    ],
    benchmarkContext:
      'InferenceX benchmarks MI325X on ROCm vLLM and SGLang across the shared model set, with compare pages pairing it against H200 and MI355X so both the NVIDIA-versus-AMD and generation-over-generation deltas stay continuously measured.',
    keywords: [
      'AMD MI325X',
      'MI325X specs',
      'MI325X price per hour',
      'MI325X inference benchmark',
      'MI325X vs H200',
      'MI325X memory',
      'AMD Instinct MI325X',
      'CDNA 3 GPU',
      'ROCm benchmark',
      'MI325X vs MI300X',
    ],
    relatedBlogSlugs: [INFERENCEX_V2, INFERENCEMAX, 'mi355x-qwen3-5-sglang-v0-5-12-up-to-17x'],
    relatedGlossarySlugs: ['memory-bandwidth', 'kv-cache', 'rocm', 'expert-parallelism'],
    relatedChipSlugs: ['mi300x', 'mi355x', 'h200'],
  },
  {
    slug: 'mi355x',
    hwKey: 'mi355x',
    specName: 'MI355X',
    title: 'AMD Instinct MI355X',
    label: 'MI355X',
    summary:
      'AMD Instinct MI355X specs, cloud pricing and live LLM inference benchmarks: 288 GB HBM3e, 8 TB/s bandwidth, 10,066 dense FP4 TFLOP/s, the first AMD chip with FP4, measured daily on ROCm vLLM, SGLang and ATOM.',
    overview: [
      'The AMD Instinct MI355X is the CDNA 4 flagship and the first AMD accelerator with FP4 tensor throughput: 10,066 dense FP4 and 5,033 FP8 TFLOP/s with 288 GB of HBM3e at 8 TB/s, the largest single-chip memory in the field. Eight chips form a full-mesh node over fifth-generation Infinity Fabric at 538 GB/s per chip.',
      'MI355X matches B200-class bandwidth and exceeds its memory while pricing meaningfully lower per hour, making it the sharpest performance-per-dollar challenge AMD has mounted. Its 1,400 W TDP and the maturity of ROCm serving stacks are the tradeoffs the live data quantifies.',
    ],
    benchmarkContext:
      'MI355X is the most intensively tracked AMD chip on InferenceX: daily vLLM, SGLang and ATOM runs, AgentX agentic-coding traces against GB300 NVL72 and B300, and some of the fastest published software-progress curves, including order-of-magnitude gains within weeks of a model release.',
    keywords: [
      'AMD MI355X',
      'MI355X specs',
      'MI355X price per hour',
      'MI355X inference benchmark',
      'MI355X vs B200',
      'MI355X FP4',
      'CDNA 4 GPU',
      'MI355X memory bandwidth',
      'MI355X vLLM SGLang',
      'AMD FP4 GPU',
    ],
    relatedBlogSlugs: [
      'mi355x-deepseek-v4-pro-sglang-110x-in-26-days',
      'mi355x-glm5-fp8-sglang-40-cheaper-than-b200',
      'deepseek-v4-pro-agentx-mi355x-vs-b200-august',
    ],
    relatedGlossarySlugs: ['fp4', 'rocm', 'memory-bandwidth', 'pareto-frontier'],
    relatedChipSlugs: ['mi325x', 'b200', 'b300', 'gb300-nvl72'],
  },
] as const satisfies readonly ChipPageEntry[];

export type ChipSlug = (typeof entries)[number]['slug'];

/** Curated versus pairs. Order = page narrative order (a is the newer/leading chip). */
export const CHIP_VS_PAIRS = [
  { a: 'b200', b: 'h100' },
  { a: 'b200', b: 'h200' },
  { a: 'b300', b: 'b200' },
  { a: 'gb200-nvl72', b: 'b200' },
  { a: 'gb300-nvl72', b: 'gb200-nvl72' },
  { a: 'gb300-nvl72', b: 'b300' },
  { a: 'mi355x', b: 'mi325x' },
  { a: 'mi325x', b: 'mi300x' },
  { a: 'mi300x', b: 'h100' },
  { a: 'mi355x', b: 'b200' },
  { a: 'mi355x', b: 'b300' },
  { a: 'mi325x', b: 'h200' },
] as const satisfies readonly { a: ChipSlug; b: ChipSlug }[];

export function getAllChipPages(): readonly ChipPageEntry[] {
  return entries;
}

export function getChipPage(slug: string): ChipPageEntry | undefined {
  return entries.find((entry) => entry.slug === slug);
}

export function getChipSpec(entry: ChipPageEntry): GpuSpec {
  const spec = GPU_SPECS.find((row) => row.name === entry.specName);
  if (!spec) throw new Error(`No GPU_SPECS row named ${entry.specName}`);
  return spec;
}

export function getChipHw(entry: ChipPageEntry): HwEntry {
  const hw = HW_REGISTRY[entry.hwKey];
  if (!hw) throw new Error(`No HW_REGISTRY entry for ${entry.hwKey}`);
  return hw;
}

export function chipVsSlug(a: ChipSlug, b: ChipSlug): string {
  return `${a}-vs-${b}`;
}

export interface ChipVsPage {
  slug: string;
  a: ChipPageEntry;
  b: ChipPageEntry;
}

export function getAllChipVsPages(): readonly ChipVsPage[] {
  return CHIP_VS_PAIRS.map(({ a, b }) => {
    const pageA = getChipPage(a);
    const pageB = getChipPage(b);
    if (!pageA || !pageB) throw new Error(`Versus pair references unknown chip: ${a} vs ${b}`);
    return { slug: chipVsSlug(a, b), a: pageA, b: pageB };
  });
}

export function getChipVsPage(slug: string): ChipVsPage | undefined {
  return getAllChipVsPages().find((page) => page.slug === slug);
}

/** Every slug served by /chips/[slug] (chip pages first, then versus pages). */
export function getAllChipRouteSlugs(): readonly string[] {
  return [...entries.map((entry) => entry.slug), ...getAllChipVsPages().map((page) => page.slug)];
}

/** Parse "186 GB" / "8 TB/s" / "3.35 TB/s" style values to a number in the given unit. */
export function leadingNumber(value: string): number {
  const match = /^(?<num>[\d.]+)/u.exec(value.trim());
  if (!match?.groups?.num) throw new Error(`Cannot parse numeric prefix from "${value}"`);
  return Number(match.groups.num);
}

const formatRatio = (x: number, y: number): string => `${(x / y).toFixed(2).replace(/0$/u, '')}x`;

export interface ChipVsHighlight {
  /** Stable key so the zh sibling can localize the label. */
  key: 'memory' | 'memoryBandwidth' | 'fp8' | 'fp4' | 'tdp' | 'costNeocloud' | 'scaleUpWorldSize';
  aValue: string;
  bValue: string;
  /** a over b, e.g. "1.5x" — omitted when either side lacks the number. */
  ratio?: string;
}

/** Data-derived comparison rows shared by the EN and ZH versus pages. */
export function buildChipVsHighlights(page: ChipVsPage): readonly ChipVsHighlight[] {
  const specA = getChipSpec(page.a);
  const specB = getChipSpec(page.b);
  const hwA = getChipHw(page.a);
  const hwB = getChipHw(page.b);

  return [
    {
      key: 'memory',
      aValue: `${specA.memory} ${specA.memoryType}`,
      bValue: `${specB.memory} ${specB.memoryType}`,
      ratio: formatRatio(leadingNumber(specA.memory), leadingNumber(specB.memory)),
    },
    {
      key: 'memoryBandwidth',
      aValue: specA.memoryBandwidth,
      bValue: specB.memoryBandwidth,
      ratio: formatRatio(
        leadingNumber(specA.memoryBandwidth),
        leadingNumber(specB.memoryBandwidth),
      ),
    },
    {
      key: 'fp8',
      aValue: `${specA.fp8.toLocaleString('en-US')} TFLOP/s`,
      bValue: `${specB.fp8.toLocaleString('en-US')} TFLOP/s`,
      ratio: formatRatio(specA.fp8, specB.fp8),
    },
    {
      key: 'fp4',
      aValue: specA.fp4 ? `${specA.fp4.toLocaleString('en-US')} TFLOP/s` : 'Not supported',
      bValue: specB.fp4 ? `${specB.fp4.toLocaleString('en-US')} TFLOP/s` : 'Not supported',
      ...(specA.fp4 && specB.fp4 ? { ratio: formatRatio(specA.fp4, specB.fp4) } : {}),
    },
    {
      key: 'tdp',
      aValue: `${hwA.tdp.toLocaleString('en-US')} W`,
      bValue: `${hwB.tdp.toLocaleString('en-US')} W`,
      ratio: formatRatio(hwA.tdp, hwB.tdp),
    },
    {
      key: 'costNeocloud',
      aValue: `$${hwA.costn.toFixed(2)}/hr`,
      bValue: `$${hwB.costn.toFixed(2)}/hr`,
      ratio: formatRatio(hwA.costn, hwB.costn),
    },
    {
      key: 'scaleUpWorldSize',
      aValue: `${specA.scaleUpWorldSize} chips`,
      bValue: `${specB.scaleUpWorldSize} chips`,
      ratio: formatRatio(specA.scaleUpWorldSize, specB.scaleUpWorldSize),
    },
  ];
}

/** English FAQ, generated from the spec/pricing registries so it cannot drift. */
export function buildChipFaq(entry: ChipPageEntry): readonly ChipFaqItem[] {
  const spec = getChipSpec(entry);
  const hw = getChipHw(entry);
  return [
    {
      question: `How much does ${entry.label} cost per hour in the cloud?`,
      answer:
        `The SemiAnalysis AI Cloud TCO model rates ${entry.label} at about $${hw.costh.toFixed(2)}/hr at hyperscalers, ` +
        `$${hw.costn.toFixed(2)}/hr at neoclouds and $${hw.costr.toFixed(2)}/hr at the retail tier. ` +
        `InferenceX performance-per-dollar pages use these rates to turn measured throughput into $/M tokens.`,
    },
    {
      question: `How much memory does ${entry.label} have?`,
      answer:
        `${entry.label} has ${spec.memory} of usable ${spec.memoryType} per chip with ${spec.memoryBandwidth} of memory bandwidth. ` +
        `A ${spec.scaleUpWorldSize}-chip ${spec.scaleUpTech} domain pools ${Math.round(leadingNumber(spec.memory) * spec.scaleUpWorldSize).toLocaleString('en-US')} GB.`,
    },
    {
      question: `What is the power consumption of ${entry.label}?`,
      answer:
        `${entry.label} has a ${hw.tdp.toLocaleString('en-US')} W TDP per chip, and about ${hw.power} kW all-in per chip ` +
        `once the host CPU, NICs and cooling share are included. InferenceX uses the all-in figure for energy-per-token math.`,
    },
    {
      question: `Does ${entry.label} support FP4?`,
      answer: spec.fp4
        ? `Yes. ${entry.label} reaches ${spec.fp4.toLocaleString('en-US')} dense FP4 TFLOP/s (${spec.fp8.toLocaleString('en-US')} at FP8), and InferenceX tracks FP4-versus-FP8 serving accuracy and throughput on its precision compare pages.`
        : `No. ${entry.label} tops out at FP8 with ${spec.fp8.toLocaleString('en-US')} dense TFLOP/s; FP4 serving requires a newer chip generation.`,
    },
    {
      question: `How fast is ${entry.label} for LLM inference?`,
      answer:
        `It depends on the model, framework, precision and interactivity target, so InferenceX publishes continuously refreshed ` +
        `throughput-versus-interactivity Pareto frontiers for ${entry.label} instead of a single number. The live dashboard and ` +
        `compare pages show current results on every covered model.`,
    },
  ];
}

/** English FAQ for a versus page, generated from the same registries. */
export function buildChipVsFaq(page: ChipVsPage): readonly ChipFaqItem[] {
  const highlights = buildChipVsHighlights(page);
  const memory = highlights.find((h) => h.key === 'memory');
  const cost = highlights.find((h) => h.key === 'costNeocloud');
  const fp8 = highlights.find((h) => h.key === 'fp8');
  return [
    {
      question: `Which has more memory, ${page.a.label} or ${page.b.label}?`,
      answer: `${page.a.label} offers ${memory?.aValue} per chip versus ${memory?.bValue} on ${page.b.label} (${memory?.ratio} the capacity).`,
    },
    {
      question: `How do ${page.a.label} and ${page.b.label} prices compare?`,
      answer:
        `At the neocloud tier the SemiAnalysis TCO model rates ${page.a.label} at ${cost?.aValue} versus ${cost?.bValue} for ${page.b.label}. ` +
        `Hourly price alone is misleading; the per-dollar compare pages divide measured throughput by these rates.`,
    },
    {
      question: `Is ${page.a.label} faster than ${page.b.label} for LLM inference?`,
      answer:
        `On paper ${page.a.label} has ${fp8?.ratio} the dense FP8 compute of ${page.b.label}, but delivered tokens per second depend on the model, ` +
        `framework, precision and interactivity target. InferenceX measures both chips daily on identical workloads; see the live compare pages for current results.`,
    },
  ];
}

/** English labels for the data-derived versus highlight rows. */
export const CHIP_VS_HIGHLIGHT_LABELS_EN: Readonly<Record<ChipVsHighlight['key'], string>> = {
  memory: 'Memory per chip',
  memoryBandwidth: 'Memory bandwidth',
  fp8: 'Dense FP8 compute',
  fp4: 'Dense FP4 compute',
  tdp: 'TDP',
  costNeocloud: 'Hourly rate (neocloud tier)',
  scaleUpWorldSize: 'Scale-up world size',
};
