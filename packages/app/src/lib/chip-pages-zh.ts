/**
 * Simplified Chinese content for the /zh/chips page family.
 *
 * 1:1 sibling of `chip-pages.ts` (see AGENTS.md "Chinese Website Pages" —
 * every English change there must be mirrored here in the same PR). Numbers
 * are generated from the same registries, so only prose is translated.
 */
import {
  buildChipVsHighlights,
  type ChipFaqItem,
  type ChipPageEntry,
  type ChipVsHighlight,
  type ChipVsPage,
  getAllChipPages,
  getChipHw,
  getChipPage,
  getChipSpec,
  leadingNumber,
} from './chip-pages';

export interface ChipPageTranslation {
  /** Chinese meta-description base. */
  summary: string;
  /** Translated overview paragraphs (same count as English). */
  overview: readonly string[];
  benchmarkContext: string;
  /** Chinese-searcher keywords (SKUs stay in English). */
  keywords: readonly string[];
}

const translations: Readonly<Record<string, ChipPageTranslation>> = {
  h100: {
    summary:
      'NVIDIA H100 规格、云端价格与实时 LLM 推理基准测试：80 GB HBM3、3.35 TB/s 内存带宽、FP8 Tensor Core、NVLink 4.0，每日在 vLLM、SGLang 与 TensorRT-LLM 上持续测量。',
    overview: [
      'NVIDIA H100 SXM 是 Hopper 一代的数据中心加速器，支撑了第一波大规模 LLM 部署。每颗芯片配备 80 GB HBM3（带宽 3.35 TB/s）和第四代 Tensor Core，稠密 FP8 算力达 1,979 TFLOP/s；8 颗芯片通过 NVLink 4.0 组成节点，单芯片互联带宽 450 GB/s。',
      'H100 仍是衡量其他加速器的基准线：它拥有所有 AI 芯片中最成熟的软件生态、最广泛的云端供应，以及 NVIDIA 产品线中最低的小时租价。它没有 FP4 Tensor Core，因此在适用 NVFP4 的量化推理场景中会落后于更新的 Blackwell 产品。',
    ],
    benchmarkContext:
      'InferenceX 在 vLLM、SGLang 和 TensorRT-LLM 上对 H100 进行持续测试，覆盖固定序列服务与长上下文 agentic trace，发布吞吐量-交互性 Pareto 前沿、每百万 token 成本和每 token 能耗，并与每一代新芯片并列展示，让升级收益始终有数可查。',
    keywords: [
      'NVIDIA H100',
      'H100 规格',
      'H100 每小时价格',
      'H100 推理基准测试',
      'H100 FP8 算力',
      'H100 内存带宽',
      'Hopper 芯片',
      'H100 对比 B200',
    ],
  },
  h200: {
    summary:
      'NVIDIA H200 规格、云端价格与实时 LLM 推理基准测试：141 GB HBM3e、4.8 TB/s 内存带宽、FP8 Tensor Core 与 NVLink 4.0，每日与 Blackwell 及 AMD Instinct 对比测量。',
    overview: [
      'NVIDIA H200 SXM 是 Hopper 的大内存版本：稠密 FP8 算力与 H100 相同（1,979 TFLOP/s），但配备 141 GB HBM3e，带宽 4.8 TB/s。大 76% 的显存和高 43% 的带宽对长上下文服务和大 KV cache 最为关键，而这恰恰是 H100 最先遇到瓶颈的场景。',
      '在内存受限的 decode 工作负载中，H200 以相近的小时租价提供明显高于 H100 的单芯片 token 吞吐量，这也是 Blackwell 上市后它仍是 Hopper 出货主力的原因。与 H100 一样，它不支持 FP4，推理精度以 FP8 和 INT4 仅权重量化为主。',
    ],
    benchmarkContext:
      'InferenceX 每日在 vLLM、SGLang 和 TensorRT-LLM 上对 H200 进行基准测试，对比页面将 H200 FP8 与 B200 NVFP4、AMD MI325X 并列呈现，让 Hopper 到 Blackwell、NVIDIA 到 AMD 的取舍以实测数据为准。',
    keywords: [
      'NVIDIA H200',
      'H200 规格',
      'H200 每小时价格',
      'H200 推理基准测试',
      'H200 内存带宽',
      'H200 对比 H100',
      'H200 对比 B200',
      'HBM3e 芯片',
    ],
  },
  b200: {
    summary:
      'NVIDIA B200 规格、云端价格与实时 LLM 推理基准测试：180 GB HBM3e、8 TB/s 带宽、9,000 稠密 FP4 TFLOP/s 与 NVLink 5.0，每日在 vLLM、SGLang 与 TensorRT-LLM 上持续测量。',
    overview: [
      'NVIDIA B200 是 Blackwell 一代的主力数据中心芯片：180 GB 可用 HBM3e（带宽 8 TB/s）、单芯片 900 GB/s 的 NVLink 5.0，Tensor Core 每时钟吞吐量翻倍于 Hopper 并新增 FP4。稠密算力 9,000 FP4 / 4,500 FP8 TFLOP/s，在主导 LLM decode 的内存带宽受限场景中，单颗 B200 的表现超过两颗 H100。',
      'NVFP4 推理正是在 B200 上成为主流：前沿开源模型发布 FP4 checkpoint，精度与 FP8 相差无几，单芯片吞吐量却接近翻倍。它的单芯片 TDP 为 1,000 W，综合功耗约为 1.7 kW，因此小时租价远高于 Hopper；是否值得升级，取决于每美元性能而非峰值算力。',
    ],
    benchmarkContext:
      'B200 是 InferenceX 上测试最密集的芯片之一：每日在 vLLM、SGLang、TensorRT-LLM 和 Dynamo 分离式推理上运行固定序列扫描与 AgentX agentic 编码 trace，每美元性能与精度对比页面持续追踪每个模型上 NVFP4 与 FP8 的差距。',
    keywords: [
      'NVIDIA B200',
      'B200 规格',
      'B200 每小时价格',
      'B200 推理基准测试',
      'B200 NVFP4',
      'B200 对比 H100',
      'B200 对比 MI355X',
      'Blackwell 芯片规格',
    ],
  },
  b300: {
    summary:
      'NVIDIA B300（Blackwell Ultra）规格、云端价格与实时 LLM 推理基准测试：268 GB 可用 HBM3e、13,500 稠密 FP4 TFLOP/s、800 Gbit/s scale-out 网络，每日与 B200、GB300 NVL72 和 MI355X 对比测量。',
    overview: [
      'NVIDIA B300 是 Blackwell Ultra 的 SXM 型号，配备 268 GB 可用 HBM3e，带宽为 8 TB/s。稠密 FP4 算力达 13,500 TFLOP/s，是 B200 的 1.5 倍；FP8 和 BF16 算力则与 B200 相同。对推理更重要的是显存容量增加了 49%，让同样由 8 颗芯片组成的节点能够容纳更大的 KV 工作集和模型。',
      'B300 还通过 ConnectX-8 将单芯片 scale-out 带宽翻倍至 800 Gbit/s，这对 prefill/decode 分离和 wide expert parallelism 尤为重要。它定位于 B200 与机柜级 GB300 NVL72 之间：NVLink 5.0 域规模同为 8，但拥有 Ultra 级的显存和 FP4 算力。',
    ],
    benchmarkContext:
      'InferenceX 以与 B200 相同的每日节奏在 vLLM、SGLang 和 TensorRT-LLM 上测试 B300，包括 AgentX 长上下文 agentic trace：268 GB HBM3e 能让 KV 工作集常驻显存，而较小的芯片则被迫抢占或 offload。',
    keywords: [
      'NVIDIA B300',
      'B300 规格',
      'Blackwell Ultra',
      'B300 每小时价格',
      'B300 推理基准测试',
      'B300 FP4 算力',
      'B300 对比 B200',
      'B300 显存',
    ],
  },
  'gb200-nvl72': {
    summary:
      'NVIDIA GB200 NVL72 规格、整机柜价格与实时 LLM 推理基准测试：72 颗 Blackwell 芯片组成单一 NVLink 域，单芯片 186 GB HBM3e、900 GB/s scale-up 带宽，每日在分离式 vLLM、SGLang 与 Dynamo TRT-LLM 上测量。',
    overview: [
      'NVIDIA GB200 NVL72 是机柜级系统：72 颗 Blackwell 芯片与 36 颗 Grace CPU 通过第五代 NVLink 组成单一 72 芯片域，单芯片单向带宽 900 GB/s。机柜内部没有 scale-out 网络，因为机柜本身就是计算单元，汇聚约 13.4 TB HBM3e。',
      '这种一跳全互联的 fabric 正是 GB200 NVL72 在大型 MoE 模型 wide expert parallelism 推理中占优的原因：专家层可以分布到数十颗芯片上而无需经过 InfiniBand 或以太网。Dynamo、SGLang PD 等 prefill/decode 分离方案能自然映射到这个域上。',
    ],
    benchmarkContext:
      'InferenceX 以多节点分离式配置测试 GB200 NVL72，包括前沿 MoE 模型上的 wide-EP vLLM、SGLang 与 Dynamo TRT-LLM 运行，并将结果归一化为单芯片吞吐量，使机柜级数据可与 8 芯片 HGX 节点直接对比。',
    keywords: [
      'NVIDIA GB200 NVL72',
      'GB200 NVL72 规格',
      'GB200 价格',
      'GB200 NVL72 基准测试',
      'NVL72 机柜',
      'GB200 对比 B200',
      '机柜级 AI 系统',
      'GB200 NVL72 功耗',
    ],
  },
  'gb300-nvl72': {
    summary:
      'NVIDIA GB300 NVL72 规格、整机柜价格与实时 LLM 推理基准测试：72 颗 Blackwell Ultra 芯片，单芯片 278 GB HBM3e（整柜约 20 TB）、15,000 稠密 FP4 TFLOP/s，每日在分离式推理方案上测量。',
    overview: [
      'NVIDIA GB300 NVL72 是 Blackwell Ultra 机柜：72 颗芯片各配 278 GB 可用 HBM3e，整柜约 20 TB 显存，单芯片稠密 FP4 算力 15,000 TFLOP/s，NVLink 5.0 域与 GB200 NVL72 相同为 72 路。FP8 与 BF16 吞吐量沿用 GB200，Ultra 的提升集中在 FP4 和显存。',
      '单芯片显存的增加在机柜尺度上被进一步放大：更大的前沿 MoE 模型、更长的上下文和更大的 KV 工作集都能常驻而不外溢；相应地每颗芯片 TDP 提高到 1,400 W 以支撑更大的 HBM 堆栈。在 Vera Rubin 之前，GB300 NVL72 是 NVIDIA 推理产品线的当前顶点。',
    ],
    benchmarkContext:
      'InferenceX 在前沿 MoE 模型上以分离式与 wide-EP 配置测试 GB300 NVL72；AgentX agentic 编码基准将这个机柜作为参考上限，用来衡量 AMD MI355X ATOM 结果与更小的 NVIDIA 节点。',
    keywords: [
      'NVIDIA GB300 NVL72',
      'GB300 NVL72 规格',
      'GB300 价格',
      'GB300 NVL72 基准测试',
      'Blackwell Ultra 机柜',
      'GB300 对比 GB200',
      'GB300 FP4 算力',
      'GB300 NVL72 功耗',
    ],
  },
  mi300x: {
    summary:
      'AMD Instinct MI300X 规格、云端价格与实时 LLM 推理基准测试：192 GB HBM3、5.3 TB/s 带宽、2,615 稠密 FP8 TFLOP/s、全互联 Infinity Fabric，每日在 ROCm 版 vLLM 与 SGLang 上测量。',
    overview: [
      'AMD Instinct MI300X 是让 AMD 真正跻身 LLM 推理市场的 CDNA 3 加速器：192 GB HBM3（带宽 5.3 TB/s），显存超过 H100 的两倍，稠密 FP8 算力 2,615 TFLOP/s。8 颗芯片通过 Infinity Fabric 全互联组网，无需交换机，单芯片 scale-up 带宽 448 GB/s。',
      '显存优势让 MI300X 能用更少的芯片部署模型，或在每个副本中容纳更大的 KV cache，小时租价也明显低于同级 NVIDIA 产品。软件是历史上的短板：ROCm 版 vLLM 和 SGLang 已大幅缩小差距，而差距究竟缩小了多少，公开基准测试记录里一目了然。',
    ],
    benchmarkContext:
      'MI300X 是最早加入 InferenceMAX 的芯片之一，至今仍在 ROCm vLLM 与 SGLang 的持续扫描中运行，留下了所有加速器中最长的公开软件进步曲线之一：同一颗芯片，随着 kernel 与调度器的改进被连续测量了数月。',
    keywords: [
      'AMD MI300X',
      'MI300X 规格',
      'MI300X 每小时价格',
      'MI300X 推理基准测试',
      'MI300X 对比 H100',
      'AMD Instinct 芯片',
      'CDNA 3',
      'ROCm 推理',
    ],
  },
  mi325x: {
    summary:
      'AMD Instinct MI325X 规格、云端价格与实时 LLM 推理基准测试：256 GB HBM3e、6 TB/s 带宽、2,615 稠密 FP8 TFLOP/s、全互联 Infinity Fabric，每日在 ROCm 版 vLLM 与 SGLang 上测量。',
    overview: [
      'AMD Instinct MI325X 是 CDNA 3 的大内存版本：稠密 FP8 算力与 MI300X 相同（2,615 TFLOP/s），但配备 256 GB HBM3e，带宽 6 TB/s，是同代产品中最大的显存。一个 8 芯片全互联节点拥有超过 2 TB HBM，足以在节点内部署超大模型。',
      '与 H200 相比，MI325X 的优势是单芯片显存更大、小时租价更低，但选择时也需要权衡 NVIDIA 软件生态的优势。对于内存受限的 decode 和长上下文推理，MI325X 的每美元带宽在 CDNA 4 之前的产品中位居前列。',
    ],
    benchmarkContext:
      'InferenceX 在 ROCm vLLM 与 SGLang 上以共享模型集测试 MI325X，对比页面将它与 H200、MI355X 并列，使 NVIDIA 与 AMD 之间、代际之间的差距都处于持续测量之下。',
    keywords: [
      'AMD MI325X',
      'MI325X 规格',
      'MI325X 每小时价格',
      'MI325X 推理基准测试',
      'MI325X 对比 H200',
      'MI325X 显存',
      'CDNA 3 芯片',
      'MI325X 对比 MI300X',
    ],
  },
  mi355x: {
    summary:
      'AMD Instinct MI355X 规格、云端价格与实时 LLM 推理基准测试：288 GB HBM3e、8 TB/s 带宽、10,066 稠密 FP4 TFLOP/s，AMD 首款支持 FP4 的芯片，每日在 ROCm 版 vLLM、SGLang 与 ATOM 上测量。',
    overview: [
      'AMD Instinct MI355X 是 CDNA 4 旗舰，也是 AMD 首款具备 FP4 Tensor 吞吐能力的加速器：稠密算力 10,066 FP4 / 5,033 FP8 TFLOP/s，配备 288 GB HBM3e（带宽 8 TB/s），单芯片显存为当前业界最大。8 颗芯片通过第五代 Infinity Fabric 全互联组网，单芯片带宽 538 GB/s。',
      'MI355X 在带宽上对齐 B200 级别、显存反超，而小时租价明显更低，是 AMD 迄今在每美元性能上发起的最有力挑战。1,400 W 的 TDP 和 ROCm 推理软件栈的成熟度则是实时数据持续量化的两项代价。',
    ],
    benchmarkContext:
      'MI355X 是 InferenceX 上追踪最密集的 AMD 芯片：每日运行 vLLM、SGLang 与 ATOM，AgentX agentic 编码 trace 与 GB300 NVL72、B300 直接对垒，并留下了最快的公开软件进步曲线之一，包括模型发布数周内的数量级提升。',
    keywords: [
      'AMD MI355X',
      'MI355X 规格',
      'MI355X 每小时价格',
      'MI355X 推理基准测试',
      'MI355X 对比 B200',
      'MI355X FP4',
      'CDNA 4 芯片',
      'MI355X 内存带宽',
    ],
  },
};

export function getZhChipTranslation(slug: string): ChipPageTranslation | undefined {
  return translations[slug];
}

export function getAllZhChipSlugs(): readonly string[] {
  return Object.keys(translations);
}

/** Localized labels for the data-derived versus highlight rows. */
export const CHIP_VS_HIGHLIGHT_LABELS_ZH: Readonly<Record<ChipVsHighlight['key'], string>> = {
  memory: '单芯片显存',
  memoryBandwidth: '内存带宽',
  fp8: '稠密 FP8 算力',
  fp4: '稠密 FP4 算力',
  tdp: 'TDP',
  costNeocloud: '小时租价（neocloud 档）',
  scaleUpWorldSize: 'Scale-up 域规模',
};

const NOT_SUPPORTED_ZH = '不支持';
const CHIP_COUNT_PATTERN = /^(?<count>\d+) chips$/u;

/** Localize the generated English cell values ("Not supported", "72 chips") for zh rendering. */
export function localizeVsHighlightValueZh(value: string): string {
  if (value === 'Not supported') return NOT_SUPPORTED_ZH;
  const chipCount = CHIP_COUNT_PATTERN.exec(value)?.groups?.count;
  if (chipCount) return `${chipCount} 芯片`;
  return value;
}

/** Chinese FAQ, generated from the same registries as the English one. */
export function buildZhChipFaq(entry: ChipPageEntry): readonly ChipFaqItem[] {
  const spec = getChipSpec(entry);
  const hw = getChipHw(entry);
  const domainGb = Math.round(leadingNumber(spec.memory) * spec.scaleUpWorldSize).toLocaleString(
    'en-US',
  );
  return [
    {
      question: `${entry.label} 云端租用每小时多少钱？`,
      answer: `按 SemiAnalysis AI Cloud TCO 模型，${entry.label} 在超大规模云约 $${hw.costh.toFixed(2)}/小时，neocloud 档约 $${hw.costn.toFixed(2)}/小时，零售档约 $${hw.costr.toFixed(2)}/小时。InferenceX 的每美元性能页面即使用这些费率将实测吞吐量换算为每百万 token 成本。`,
    },
    {
      question: `${entry.label} 有多少显存？`,
      answer: `${entry.label} 单芯片提供 ${spec.memory} 可用 ${spec.memoryType}，内存带宽 ${spec.memoryBandwidth}；一个 ${spec.scaleUpWorldSize} 芯片的 ${spec.scaleUpTech} 域合计约 ${domainGb} GB。`,
    },
    {
      question: `${entry.label} 的功耗是多少？`,
      answer: `${entry.label} 的单芯片 TDP 为 ${hw.tdp.toLocaleString('en-US')} W。计入主机 CPU、网卡和散热的分摊功耗后，每颗芯片对应的总功耗约为 ${hw.power} kW。InferenceX 按这一口径计算每 token 能耗。`,
    },
    {
      question: `${entry.label} 支持 FP4 吗？`,
      answer: spec.fp4
        ? `支持。${entry.label} 稠密 FP4 算力达 ${spec.fp4.toLocaleString('en-US')} TFLOP/s（FP8 为 ${spec.fp8.toLocaleString('en-US')}），InferenceX 的精度对比页面持续追踪 FP4 与 FP8 的推理精度和吞吐量差异。`
        : `不支持。${entry.label} 最高支持 FP8，稠密算力 ${spec.fp8.toLocaleString('en-US')} TFLOP/s；FP4 推理需要更新一代的芯片。`,
    },
    {
      question: `${entry.label} 的 LLM 推理速度有多快？`,
      answer: `这取决于模型、推理引擎、精度和交互性目标，因此 InferenceX 为 ${entry.label} 发布持续更新的吞吐量-交互性 Pareto 前沿，而非单一数字。实时仪表板和对比页面展示每个覆盖模型上的最新结果。`,
    },
  ];
}

/** Chinese FAQ for a versus page. */
export function buildZhChipVsFaq(page: ChipVsPage): readonly ChipFaqItem[] {
  const highlights = buildChipVsHighlights(page);
  const memory = highlights.find((h) => h.key === 'memory');
  const cost = highlights.find((h) => h.key === 'costNeocloud');
  const fp8 = highlights.find((h) => h.key === 'fp8');
  return [
    {
      question: `${page.a.label} 和 ${page.b.label} 谁的显存更大？`,
      answer: `${page.a.label} 单芯片为 ${memory?.aValue}，${page.b.label} 为 ${memory?.bValue}，容量比约 ${memory?.ratio}。`,
    },
    {
      question: `${page.a.label} 和 ${page.b.label} 的价格怎么比？`,
      answer: `按 SemiAnalysis TCO 模型 neocloud 档费率，${page.a.label} 约 ${cost?.aValue}，${page.b.label} 约 ${cost?.bValue}。单看小时租价容易误导：每美元性能对比页面会用实测吞吐量除以这些费率。`,
    },
    {
      question: `${page.a.label} 的 LLM 推理速度比 ${page.b.label} 快吗？`,
      answer: `纸面上 ${page.a.label} 的稠密 FP8 算力是 ${page.b.label} 的 ${fp8?.ratio}，但实际交付的 token 吞吐量取决于模型、推理引擎、精度和交互性目标。InferenceX 每日在完全相同的工作负载上测量这两款芯片，最新结果请见实时对比页面。`,
    },
  ];
}

/** Parity guard used by tests: every English chip page must have a zh translation. */
export function assertZhChipParity(): void {
  for (const entry of getAllChipPages()) {
    const translation = translations[entry.slug];
    if (!translation) throw new Error(`Missing zh translation for chip page ${entry.slug}`);
    if (translation.overview.length !== entry.overview.length) {
      throw new Error(`zh overview paragraph count mismatch for ${entry.slug}`);
    }
  }
  for (const slug of Object.keys(translations)) {
    if (!getChipPage(slug)) throw new Error(`zh translation for unknown chip page ${slug}`);
  }
}
