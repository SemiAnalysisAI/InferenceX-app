/**
 * Guides: static, indexable SEO surfaces at /guides and /guides/[slug].
 *
 * Where the glossary answers "what is X", guides answer decision and
 * planning questions: "which GPU", "which engine", "how much does it cost",
 * "how many chips do I need". Every page is fully static (no DB) and grounds
 * its numbers in the same sources of truth as the rest of the site:
 *
 * - `HW_REGISTRY` (@semianalysisai/inferencex-constants): TDP, all-in power
 *   and the $/chip/hr tiers used by the TCO calculator and per-dollar pages.
 * - `GPU_SPECS` (src/lib/gpu-specs.ts): memory, bandwidth and TFLOP/s shown
 *   on the Chip Specs tab.
 *
 * Prose is hand-authored and keyword-bearing; live benchmark claims defer to
 * the dashboard and blog articles rather than hard-coding numbers that would
 * drift. The Simplified Chinese siblings live in `guides-zh.ts` and MUST be
 * updated in the same PR as this file (see AGENTS.md "Chinese Website Pages").
 */

export const GUIDE_CATEGORIES = [
  'Hardware selection',
  'Cost and economics',
  'Serving engines',
  'Capacity planning',
  'Benchmarking methodology',
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

export interface GuideSection {
  heading: string;
  paragraphs: readonly string[];
}

export interface GuideFaqItem {
  question: string;
  answer: string;
}

export interface GuideEntry {
  /** URL slug under /guides/ */
  slug: string;
  /** H1 and SEO title, phrased the way searchers type the question. */
  title: string;
  category: GuideCategory;
  /** Meta description; keep it under 200 characters. */
  description: string;
  /** Direct answer paragraph rendered first, sized for featured snippets. */
  quickAnswer: string;
  /** Body sections with keyword-bearing prose. */
  sections: readonly GuideSection[];
  /** FAQ items rendered on the page and emitted as FAQPage JSON-LD. */
  faq: readonly GuideFaqItem[];
  /** Meta keywords; searcher-phrased. */
  keywords: readonly string[];
  /** Other guides worth crosslinking. */
  relatedGuideSlugs: readonly string[];
  /** Chip pages under /chips referenced by this guide. */
  relatedChipSlugs: readonly string[];
  /** Glossary entries that define the concepts named in the prose. */
  relatedGlossarySlugs: readonly string[];
  /** Blog posts under content/blog that back this guide’s claims. */
  articleSlugs: readonly string[];
}

const INFERENCEMAX = 'inferencemax-open-source-inference-benchmarking';
const INFERENCEX_V2 = 'inferencex-v2-nvidia-blackwell-vs-amd-vs-hopper';
const DEEPSEEK_V4 = 'deepseekv4-16t-day-0-to-day-43-performance';
const GB200_R1 = 'gb200-nvl72-vs-b200-disagg-deepseek-r1-fp4-dynamo-trt';
const GB300_DSV4 = 'gb300-nvl72-vs-gb200-nvl72-dsv4-pro-vllm-fp4';
const GB200_KIMI = 'gb200-nvl72-kimi-k2-5-vllm-wide-ep-3x-vs-b200';
const MI355X_KIMI = 'mi355x-kimi-k2-5-vllm-aiter-7x-speedup';
const MI355X_DSV4 = 'mi355x-deepseek-v4-pro-sglang-110x-in-26-days';
const MI355X_GLM5 = 'mi355x-glm5-fp8-sglang-40-cheaper-than-b200';
const MI355X_QWEN = 'mi355x-qwen3-5-sglang-v0-5-12-up-to-17x';
const B200_GLM5 = 'b200-glm5-nvfp4-vs-h200-fp8-3-6x-perf-per-dollar';
const B200_MINIMAX = 'b200-minimax-m2-5-vllm-nvfp4-vs-h100-fp8-perf-per-dollar';
const B200_KIMI = 'b200-nvfp4-vs-h200-int4-kimi-k2-vllm-perf-per-dollar';
const SGLANG_056 = 'sglang-0-5-6-b200-deepseek-r1-fp4-up-to-1-8x';
const VR_RUBIN = 'vera-rubin-nvl72-vs-gb200-nvl72-inference';
const TILERT = 'ultra-high-interactivity-on-nvidia';
const AGENT_BENCHMARK = 'agentic-benchmark-agent-benchmark-guide';
const AGENTIC_WORKLOADS = 'brief-overview-of-agentic-workloads';
const AGENTX_V3 = 'agentx-inferencexv3-does-cuda-moat';
const AGENTX_DSV4_MI355X_B200 = 'deepseek-v4-pro-agentx-mi355x-vs-b200-august';
const AGENTX_DSV4_B200_B300 = 'deepseek-v4-pro-agentx-b200-vs-b300-kv-working-set';
const AGENTX_DSV4_GB200_GB300 = 'deepseek-v4-pro-agentx-gb200-vs-gb300-disagg';
const AGENTX_K3_ATOM = 'kimi-k3-agentx-mi355x-atom-vs-gb300-nvl72';
const AGENTX_M3_RACK = 'minimax-m3-agentx-b200-b300-vs-rack-scale';
const AGENTX_QWEN_B300 = 'qwen3-5-397b-agentx-b300-fp4-vs-h100';
const AGENTX_GLM_SGLANG = 'glm-5-3-agentx-nvidia-vs-amd-sglang-150-toks';

const entries = [
  {
    slug: 'best-gpu-for-llm-inference',
    title: 'Best GPU for LLM Inference in 2026',
    category: 'Hardware selection',
    description:
      'Which GPU is best for LLM inference in 2026? H100, H200, B200, B300, GB200 NVL72, MI325X and MI355X compared on memory, compute, cloud price and measured throughput.',
    quickAnswer:
      'There is no single best GPU for LLM inference: the answer depends on the model you serve, the interactivity you promise users, and the hourly rate you pay. In continuously measured InferenceX benchmarks, NVIDIA Blackwell parts (B200, B300, GB200 NVL72) lead on absolute throughput with NVFP4, AMD MI355X is frequently the cost-per-token leader on FP8 MoE serving, and Hopper (H100, H200) remains the value baseline for smaller models.',
    sections: [
      {
        heading: 'What actually separates inference GPUs',
        paragraphs: [
          'Three hardware numbers explain most LLM inference results: memory capacity, memory bandwidth, and low-precision tensor compute. An H100 offers 80 GB of HBM3 at 3.35 TB/s, an H200 raises that to 141 GB at 4.8 TB/s, a B200 reaches 180 GB at 8 TB/s with FP4 tensor cores, and AMD’s MI355X leads single-chip capacity at 288 GB of HBM3e, also at 8 TB/s. Decode-heavy serving is usually memory-bandwidth-bound, so bandwidth per dollar predicts token throughput better than peak TFLOP/s.',
          'The fourth number is the interconnect. Large mixture-of-experts models are served across many chips, so scale-up domain size matters: an 8-GPU HGX node limits tensor and expert parallelism to 8 ranks, while a GB200 NVL72 rack presents 72 GPUs in one NVLink domain and unlocks wide expert parallelism that single nodes cannot express.',
        ],
      },
      {
        heading: 'How the current chips rank in measured serving',
        paragraphs: [
          'InferenceX benchmarks every current datacenter GPU daily on identical model, engine and sequence configurations. On frontier MoE models such as DeepSeek V4 and Kimi K2.5, Blackwell chips running NVFP4 hold the highest throughput per chip, and rack-scale GB200 NVL72 with wide expert parallelism has measured about 3x B200 per-GPU throughput on Kimi K2.5. AMD’s MI355X is consistently competitive on FP8 serving and has measured roughly 40% cheaper per token than B200 on GLM 5 at matched interactivity.',
          'Hopper is far from obsolete: H200’s 141 GB makes it a strong per-dollar choice for mid-size dense and MoE models, and H100 remains the cheapest widely available NVIDIA baseline at roughly $1.17 to $1.78 per GPU-hour depending on the cloud tier. Rankings shift with every software release, which is why point-in-time reviews age badly and continuous benchmarks matter.',
        ],
      },
      {
        heading: 'Choosing by workload',
        paragraphs: [
          'For high-interactivity chat and agentic coding on frontier MoE models, prioritize FP4-capable chips with large scale-up domains: GB200/GB300 NVL72, B300, or MI355X with a strong FP8 recipe. For throughput-oriented batch and offline inference, cost per million tokens decides, and MI355X, MI325X and discounted H200 capacity frequently win. For models under about 120B parameters, single-node H100/H200 or even RTX PRO 6000 configurations can be the cheapest viable choice.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is the H100 still worth using for LLM inference in 2026?',
        answer:
          'Yes, for the right workloads. H100 lacks FP4 and tops out at 80 GB per chip, so it struggles on frontier MoE serving, but at hyperscaler rates near $1.17 per hour it remains a cost-effective baseline for dense models and smaller MoE models where its software maturity shows.',
      },
      {
        question: 'Which GPU has the most memory for LLM inference?',
        answer:
          'Among widely deployed single chips, AMD MI355X leads with 288 GB of HBM3e, ahead of GB300 NVL72 superchips at 278 GB per GPU and B300 at 268 GB. More per-chip memory means fewer chips per model replica and a larger KV cache for long-context serving.',
      },
      {
        question: 'Do benchmark rankings between these GPUs actually change over time?',
        answer:
          'Constantly. Serving software improves in weeks, not years: InferenceX measured MI355X DeepSeek V4 throughput improving 110x in 26 days of SGLang development, and SGLang 0.5.6 lifted B200 DeepSeek R1 FP4 throughput up to 1.8x. Any static ranking is stale within a quarter.',
      },
      {
        question: 'Should I pick a GPU by TFLOP/s?',
        answer:
          'No. Peak TFLOP/s is a marketing ceiling, not a serving prediction. Decode is usually bound by memory bandwidth and KV-cache behavior, and real recipes are limited by kernels, parallelism strategy and scheduler quality. Measured throughput at your target interactivity is the number to compare.',
      },
    ],
    keywords: [
      'best GPU for LLM inference',
      'best GPU for AI inference 2026',
      'LLM inference GPU comparison',
      'best GPU for running LLMs',
      'H100 vs B200 vs MI355X',
      'best datacenter GPU for AI',
      'GPU for LLM serving',
      'AI inference hardware guide',
    ],
    relatedGuideSlugs: [
      'cheapest-gpu-for-llm-inference',
      'amd-vs-nvidia-llm-inference',
      'gpu-memory-requirements-for-llms',
      'rack-scale-vs-single-node-inference',
    ],
    relatedChipSlugs: ['h100', 'h200', 'b200', 'b300', 'gb200-nvl72', 'mi355x'],
    relatedGlossarySlugs: [
      'throughput',
      'memory-bandwidth',
      'high-bandwidth-memory',
      'performance-per-dollar',
    ],
    articleSlugs: [INFERENCEX_V2, MI355X_GLM5, GB200_KIMI, SGLANG_056],
  },
  {
    slug: 'cheapest-gpu-for-llm-inference',
    title: 'Cheapest GPU for LLM Inference: Cost per Token Compared',
    category: 'Cost and economics',
    description:
      'The cheapest GPU for LLM inference is the one with the lowest cost per million tokens at your latency target, not the lowest hourly price. How H100, H200, B200, MI300X and MI355X compare.',
    quickAnswer:
      'The cheapest GPU for LLM inference is the one with the lowest cost per million tokens at your target interactivity, not the one with the lowest hourly rate. AMD MI300X rents from about $0.95 to $1.30 per GPU-hour and H100 from about $1.17, but newer chips like MI355X and B200 often produce so many more tokens per hour that they cost less per token despite higher rents.',
    sections: [
      {
        heading: 'Hourly price is the wrong number to minimize',
        paragraphs: [
          'GPU rental prices span a wide range: on neocloud tiers tracked by the SemiAnalysis AI Cloud TCO Model, MI300X rents near $1.16 per GPU-hour, H100 near $1.55, H200 near $1.59, MI325X near $1.32, B200 near $2.07, MI355X near $2.09 and GB300 NVL72 near $2.79. Dividing rate by measured tokens per second gives cost per million tokens, and that ranking looks very different from the rent ranking.',
          'A chip that costs 35% more per hour but serves 2x the tokens per second at the same interactivity is dramatically cheaper per token. This is exactly what InferenceX per-dollar comparisons measure: B200 running GLM 5 in NVFP4 delivered up to 3.6x the performance per dollar of H200 in FP8, despite the higher hourly rate.',
        ],
      },
      {
        heading: 'Where each budget chip wins',
        paragraphs: [
          'MI300X and MI325X are the value plays for models that fit their 192 GB and 256 GB capacities, especially throughput-oriented workloads where interactivity floors are loose. H100 is the cheapest broadly available NVIDIA part and does well on dense models under 120B parameters. H200 adds 76% more memory for a few cents more per hour and is often the cheapest way to serve mid-size MoE models with large KV caches.',
          'At the frontier, cheap per token usually means new silicon: MI355X GLM 5 FP8 serving measured about 40% cheaper than B200 at matched interactivity, while B200 NVFP4 recipes beat every Hopper configuration per dollar on models with good FP4 quality. The cheapest chip for you depends on which model and latency you actually need.',
        ],
      },
      {
        heading: 'How to run the comparison yourself',
        paragraphs: [
          'Pick your model, target interactivity in tokens per second per user, and a realistic hourly rate tier. Then read tokens per GPU per second off the InferenceX Pareto frontier at that interactivity, and compute rate divided by throughput. The dashboard’s per-dollar pages and the tco-feed API do this arithmetic continuously so the answer stays current as software improves.',
        ],
      },
    ],
    faq: [
      {
        question: 'What is the cheapest GPU to rent for AI inference?',
        answer:
          'By hourly rate, AMD MI300X is typically cheapest among datacenter GPUs at roughly $0.95 to $1.30 per GPU-hour, with H100 close behind. By cost per token on current frontier models, MI355X and B200 class chips usually win despite renting for around $2 per hour.',
      },
      {
        question: 'Is a cheaper, older GPU ever the right choice?',
        answer:
          'Often. If your model fits comfortably and your users tolerate moderate interactivity, H100 or MI300X capacity at discount rates can beat newer chips per token. The crossover appears on large MoE models and tight latency targets, where new chips’ bandwidth and FP4 compute dominate.',
      },
      {
        question: 'How much cheaper is inference at low interactivity?',
        answer:
          'Substantially. Cost per million tokens falls steeply as you relax the per-user speed target because batching improves utilization. The same chip can differ by several multiples in cost per token between a 100 tokens per second target and a 20 tokens per second target.',
      },
      {
        question: 'Do these prices include power and networking?',
        answer:
          'The hourly tiers used across InferenceX come from the SemiAnalysis AI Cloud TCO Model and reflect all-in rental economics at hyperscaler, neocloud and retail tiers. When you self-host, power, cooling, networking and utilization risk shift onto you, which the TCO guide covers in detail.',
      },
    ],
    keywords: [
      'cheapest GPU for LLM inference',
      'cheapest GPU for AI',
      'lowest cost per token GPU',
      'GPU cost per million tokens',
      'cheap LLM serving hardware',
      'MI300X price per hour',
      'H100 vs MI300X cost',
      'budget AI inference GPU',
    ],
    relatedGuideSlugs: [
      'llm-inference-cost-per-million-tokens',
      'gpu-cloud-pricing-comparison',
      'best-gpu-for-llm-inference',
      'ai-gpu-total-cost-of-ownership',
    ],
    relatedChipSlugs: ['mi300x', 'mi325x', 'h100', 'h200', 'b200', 'mi355x'],
    relatedGlossarySlugs: [
      'cost-per-million-tokens',
      'performance-per-dollar',
      'tokens-per-dollar',
      'pareto-frontier',
    ],
    articleSlugs: [B200_GLM5, MI355X_GLM5, B200_KIMI, B200_MINIMAX],
  },
  {
    slug: 'amd-vs-nvidia-llm-inference',
    title: 'AMD vs NVIDIA for LLM Inference in 2026',
    category: 'Hardware selection',
    description:
      'AMD Instinct vs NVIDIA GPUs for LLM inference: MI355X vs B200 measured daily on vLLM and SGLang. Where each vendor wins on throughput, cost per token and software maturity.',
    quickAnswer:
      'In 2026 the AMD vs NVIDIA question is workload-specific, not ideological. Daily InferenceX measurements show AMD MI355X winning on cost per token for several FP8 MoE recipes, roughly 40% cheaper than B200 on GLM 5, while NVIDIA Blackwell leads absolute throughput with NVFP4 and rack-scale NVL72 systems. AMD software now closes gaps in weeks, but NVIDIA still holds the edge on day-0 model support and ultra-low-latency serving.',
    sections: [
      {
        heading: 'The hardware is closer than the reputation',
        paragraphs: [
          'On paper, AMD’s MI355X matches or beats NVIDIA’s B200 in several dimensions: 288 GB of HBM3e versus 180 GB, the same 8 TB/s of bandwidth, and comparable FP8 and FP4 TFLOP/s ratings. MI325X similarly out-spec’d H200 on memory. The spec sheet has not been AMD’s problem for two generations.',
          'NVIDIA’s structural advantages are elsewhere: NVLink scale-up domains of 72 GPUs in GB200/GB300 NVL72 racks versus 8-GPU scale-up on current Instinct nodes, an FP4 software path that is production-quality across engines, and TensorRT-LLM plus Dynamo for disaggregated, latency-optimized serving.',
        ],
      },
      {
        heading: 'What continuous measurement actually shows',
        paragraphs: [
          'InferenceX runs identical model and sequence configurations on both vendors every day, and the picture is genuinely mixed. MI355X with SGLang FP8 has measured about 40% cheaper per token than B200 on GLM 5, and AITER kernel work delivered a 7x speedup on Kimi K2.5 with vLLM. DeepSeek V4 throughput on MI355X improved 110x in 26 days, which shows both how fast ROCm moves and how rough day-0 support can be.',
          'NVIDIA counters at the top: GB200 NVL72 wide expert parallelism measured about 3x B200 per-GPU throughput on Kimi K2.5, and NVFP4 recipes on B200/B300 lead per-dollar comparisons wherever FP4 quality holds. On agentic AgentX workloads the CUDA software stack’s scheduler maturity still shows at high interactivity.',
        ],
      },
      {
        heading: 'How to decide for your deployment',
        paragraphs: [
          'Choose AMD when your target models have mature ROCm recipes, your latency floor is moderate, and cost per token dominates: the discount per token is real and recurring. Choose NVIDIA when you need day-0 model support, sub-second time-to-first-token at high concurrency, FP4 serving, or rack-scale expert parallelism for trillion-parameter MoE models. Many fleets now split by workload, and continuous benchmarks make that split auditable.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is AMD actually viable for production LLM inference now?',
        answer:
          'Yes. MI300X, MI325X and MI355X serve production traffic behind major APIs today, and vLLM and SGLang treat ROCm as a first-class target. The practical caveats are day-0 model support, which still lags NVIDIA by days to weeks, and ultra-low-latency recipes where CUDA kernels remain ahead.',
      },
      {
        question: 'Does CUDA still create a moat for inference?',
        answer:
          'A narrowing one. InferenceX’s AgentX cross-vendor series exists to test exactly this: on several MoE models AMD reaches parity or wins per dollar within weeks of release, but NVIDIA retains an edge on the newest models, the tightest latency targets, and rack-scale serving where NVLink domains matter.',
      },
      {
        question: 'Which is better for MoE models like DeepSeek or Kimi?',
        answer:
          'Both vendors serve them well, differently. MI355X’s 288 GB per chip means fewer ranks per replica and strong FP8 economics. NVIDIA’s NVL72 racks enable wide expert parallelism across 72 GPUs, which measured about 3x per-GPU throughput on Kimi K2.5 versus 8-GPU B200 nodes.',
      },
    ],
    keywords: [
      'AMD vs NVIDIA LLM inference',
      'MI355X vs B200',
      'AMD Instinct vs NVIDIA AI',
      'ROCm vs CUDA inference',
      'AMD GPU for LLM serving',
      'MI300X vs H100 inference',
      'AMD vs NVIDIA benchmarks 2026',
      'AI GPU vendor comparison',
    ],
    relatedGuideSlugs: [
      'best-gpu-for-llm-inference',
      'cheapest-gpu-for-llm-inference',
      'rack-scale-vs-single-node-inference',
      'how-to-choose-an-llm-serving-engine',
    ],
    relatedChipSlugs: ['mi355x', 'b200', 'mi325x', 'h200', 'gb200-nvl72', 'mi300x'],
    relatedGlossarySlugs: ['rocm', 'cuda', 'aiter', 'wide-expert-parallelism'],
    articleSlugs: [AGENTX_V3, MI355X_GLM5, MI355X_KIMI, MI355X_QWEN, AGENTX_DSV4_MI355X_B200],
  },
  {
    slug: 'rack-scale-vs-single-node-inference',
    title: 'Rack-Scale vs Single-Node LLM Inference: When NVL72 Pays Off',
    category: 'Hardware selection',
    description:
      'GB200/GB300 NVL72 racks vs 8-GPU HGX nodes for LLM serving: when a 72-GPU NVLink domain earns its premium, and when single nodes remain the better buy.',
    quickAnswer:
      'Rack-scale systems like GB200 and GB300 NVL72 pay off when the model and workload can exploit a 72-GPU NVLink domain: trillion-parameter MoE models served with wide expert parallelism and disaggregated prefill. InferenceX measured GB200 NVL72 delivering about 3x B200 per-GPU throughput on Kimi K2.5 that way. For dense or mid-size models that fit in 8 GPUs, single HGX or Instinct nodes usually remain cheaper per token.',
    sections: [
      {
        heading: 'What a 72-GPU scale-up domain changes',
        paragraphs: [
          'An HGX B200 node connects 8 GPUs over NVLink; traffic beyond the node crosses slower scale-out networking. An NVL72 rack presents 72 GPUs as one NVLink domain, so expert parallelism, tensor parallelism and KV transfer for disaggregated serving all run at NVLink bandwidth across the whole rack. For MoE models with hundreds of experts, that means each GPU can host fewer experts and serve them at higher utilization, the pattern called wide expert parallelism.',
          'The rack premium is real: GB200 NVL72 rents near $2.26 per GPU-hour and GB300 NVL72 near $2.79 on neocloud tiers, versus about $2.07 for B200 nodes. The question is whether rack-enabled recipes produce enough extra tokens per GPU to beat that spread.',
        ],
      },
      {
        heading: 'Measured rack-scale wins and losses',
        paragraphs: [
          'On Kimi K2.5, vLLM wide expert parallelism on GB200 NVL72 measured about 3x the per-GPU throughput of 8-GPU B200 serving, comfortably clearing the price premium. Disaggregated DeepSeek R1 FP4 serving with Dynamo and TensorRT-LLM shows similar rack advantages at high interactivity, and GB300 extends the gap with more memory (278 GB per GPU) and FP4 compute for KV-heavy agentic traffic.',
          'The advantage collapses when the workload cannot use the domain. Models that fit in one node gain little, and AgentX comparisons of MiniMax M3 found B200/B300 node serving highly competitive with rack-scale systems on that workload shape. A rack you cannot fill with the right traffic is just an expensive node cluster.',
        ],
      },
      {
        heading: 'Decision checklist',
        paragraphs: [
          'Choose rack-scale when serving trillion-parameter-class MoE models at scale, when your latency targets require disaggregated prefill and decode, or when KV working sets demand pooled memory across many GPUs. Choose single nodes when models fit in 8 GPUs, when procurement flexibility and multi-vendor leverage matter, or when your traffic is too small to keep 72 GPUs utilized. Utilization risk is the hidden cost of racks: idle NVL72 capacity burns money faster than idle nodes.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is GB200 NVL72 worth it over B200 nodes?',
        answer:
          'For frontier MoE serving, often yes: measured wide-EP recipes have delivered about 3x per-GPU throughput on Kimi K2.5, far more than the roughly 10% hourly premium. For models that fit in a single node, usually no, because the rack’s defining feature goes unused.',
      },
      {
        question: 'What is wide expert parallelism and why does it need a rack?',
        answer:
          'Wide expert parallelism spreads a MoE model’s experts across many more GPUs than a node can hold, so each GPU stores fewer experts and batches their tokens more efficiently. The all-to-all traffic between ranks only stays fast inside a large NVLink scale-up domain like NVL72.',
      },
      {
        question: 'Does AMD have a rack-scale answer?',
        answer:
          'AMD’s current Instinct deployments scale up to 8 GPUs per node, with rack-scale Helios-generation systems announced for the MI400 era. Today, MI355X competes by putting 288 GB on every chip, which reduces how many ranks a large model needs in the first place.',
      },
    ],
    keywords: [
      'GB200 NVL72 vs B200',
      'rack-scale inference',
      'NVL72 benchmark',
      'wide expert parallelism',
      'disaggregated inference hardware',
      'GB300 NVL72 performance',
      'scale-up domain LLM serving',
      '72 GPU NVLink rack',
    ],
    relatedGuideSlugs: [
      'best-gpu-for-llm-inference',
      'how-many-gpus-to-run-deepseek',
      'amd-vs-nvidia-llm-inference',
      'long-context-llm-serving',
    ],
    relatedChipSlugs: ['gb200-nvl72', 'gb300-nvl72', 'b200', 'b300', 'mi355x'],
    relatedGlossarySlugs: [
      'nvl72',
      'wide-expert-parallelism',
      'scale-up-vs-scale-out',
      'disaggregated-inference',
      'nvlink',
    ],
    articleSlugs: [GB200_KIMI, GB200_R1, GB300_DSV4, AGENTX_M3_RACK, VR_RUBIN],
  },
  {
    slug: 'gpu-memory-requirements-for-llms',
    title: 'GPU Memory Requirements for LLMs: How Much VRAM Do You Need?',
    category: 'Capacity planning',
    description:
      'How much GPU memory you need to serve an LLM: weight math by precision, KV cache sizing, and which chips fit DeepSeek V4, Kimi K2.5, GLM 5 and 70B-class models.',
    quickAnswer:
      'Estimate LLM serving memory as weights plus KV cache plus overhead. Weights need roughly one byte per parameter in FP8 and half that in FP4, so a 70B model wants about 70 GB in FP8 before KV cache, and a 1.6T-parameter MoE like DeepSeek V4 needs around a terabyte spread across a multi-GPU replica even in low precision. Production deployments then add tens to hundreds of gigabytes of KV cache for long-context traffic.',
    sections: [
      {
        heading: 'The weight math by precision',
        paragraphs: [
          'Model weights dominate the floor: bytes equal parameter count times bytes per parameter, roughly 2 for BF16, 1 for FP8 and INT8, and 0.5 for FP4 and INT4. A dense 70B model therefore needs about 140 GB in BF16, 70 GB in FP8 or 35 GB in FP4, plus engine overhead. MoE models count total parameters for storage even though only a fraction activate per token: DeepSeek V4 Pro stores 1.6T parameters while activating 49B.',
          'This is why per-chip capacity defines deployment shape. With 288 GB, an 8x MI355X node holds over 2.3 TB and fits frontier MoE models in FP8 or FP4 on one node; 80 GB H100s need several nodes or aggressive quantization for the same model.',
        ],
      },
      {
        heading: 'KV cache is the growing half of the budget',
        paragraphs: [
          'Every token in every active context stores keys and values per layer, so KV cache scales with concurrency times context length. Long-context and agentic workloads with hundred-thousand-token sessions can push KV working sets past the weight footprint, which is exactly the pressure InferenceX’s AgentX scenario measures. Architectures fight back with grouped and latent attention: DeepSeek V4’s hybrid sparse attention needs only about 10% of the KV cache of its predecessor at 1M-token context.',
          'Plan KV headroom, not just weight fit: a model that technically loads but leaves no room for cache will serve tiny batches at terrible cost per token, or evict prefixes and lose cache hit rate.',
        ],
      },
      {
        heading: 'Quick sizing table by model class',
        paragraphs: [
          'As rules of thumb at FP8 with production KV headroom: 7B to 13B models fit one 24 to 48 GB accelerator; 70B-class dense models want 2x H100/H200 or one high-memory chip; 120B-class MoE models like gpt-oss-120b fit a single H200 or MI325X; 400B-class MoE models want 4 to 8 modern GPUs; and trillion-parameter MoE flagships like DeepSeek V4 or Kimi K3 need a full 8-GPU high-memory node minimum, with rack-scale domains preferred for wide expert parallelism.',
        ],
      },
    ],
    faq: [
      {
        question: 'How much VRAM do I need to run a 70B model?',
        answer:
          'About 140 GB in BF16, 70 GB in FP8, or 35 GB in FP4 for weights alone, plus KV cache and engine overhead. Production FP8 serving typically uses two 80 GB GPUs or one 141 GB-plus chip like H200, MI325X or MI355X so the KV cache has room to batch.',
      },
      {
        question: 'How much memory does DeepSeek V4 need to serve?',
        answer:
          'DeepSeek V4 Pro stores 1.6T parameters, so weights alone run near 800 GB in FP4 and 1.6 TB in FP8. Real deployments use 8-GPU high-memory nodes as a floor, and NVL72 racks or multi-node expert parallelism for production traffic with long contexts.',
      },
      {
        question: 'Do MoE models need less GPU memory than dense models?',
        answer:
          'No, they need less compute per token, not less storage. All experts must sit in memory even though few activate per token. MoE models actually raise memory pressure per FLOP, which is why high-capacity chips and expert parallelism across large scale-up domains matter so much.',
      },
      {
        question: 'What happens if I skimp on KV cache headroom?',
        answer:
          'Batch size collapses, prefix caches evict, and throughput falls even though the model fits. Engines then offload KV to host memory or recompute prefixes, both of which cost latency. Sizing for weights alone is the most common capacity-planning mistake in LLM serving.',
      },
    ],
    keywords: [
      'GPU memory requirements LLM',
      'how much VRAM to run LLM',
      'VRAM needed for 70B model',
      'LLM memory calculator',
      'DeepSeek V4 hardware requirements',
      'KV cache memory sizing',
      'model weights memory FP8',
      'GPU capacity planning AI',
    ],
    relatedGuideSlugs: [
      'kv-cache-memory-requirements',
      'how-many-gpus-to-run-deepseek',
      'long-context-llm-serving',
      'fp8-vs-fp4-llm-inference',
    ],
    relatedChipSlugs: ['mi355x', 'h200', 'b300', 'gb300-nvl72', 'h100'],
    relatedGlossarySlugs: [
      'kv-cache',
      'quantization',
      'mixture-of-experts',
      'high-bandwidth-memory',
      'multi-head-latent-attention',
    ],
    articleSlugs: [DEEPSEEK_V4, AGENTX_DSV4_B200_B300, INFERENCEX_V2],
  },
  {
    slug: 'best-hardware-for-agentic-coding',
    title: 'Best Hardware for Agentic Coding Inference',
    category: 'Hardware selection',
    description:
      'Which GPUs serve coding agents best? AgentX measurements of long-context, multi-turn agent traffic on B200, B300, GB300 NVL72 and MI355X, and what the workload rewards.',
    quickAnswer:
      'Agentic coding traffic rewards different hardware traits than chat: huge KV working sets from hundred-thousand-token sessions, prefix cache reuse across turns, and bursty concurrency from parallel subagents. In AgentX measurements, high-memory FP4 chips lead: GB300 NVL72 and B300 set the pace at high interactivity, while MI355X’s 288 GB per chip makes it the strongest per-dollar challenger on several models.',
    sections: [
      {
        heading: 'Why agent traffic breaks chat-era assumptions',
        paragraphs: [
          'A coding agent session alternates model requests with tool calls, accumulates context across dozens of turns, and often fans out into parallel subagents. Later requests carry most of the earlier session, so serving performance hinges on prefix caching and on how much KV cache the hardware can keep resident. Fixed 1024x1024 benchmarks measure none of this, which is why InferenceX built AgentX from anonymized coding-agent traces.',
          'The KV working set is the defining pressure: AgentX comparisons of B200 versus B300 on DeepSeek V4 show the 268 GB chip pulling ahead precisely when the session mix pushes KV past what 180 GB can hold without eviction.',
        ],
      },
      {
        heading: 'What AgentX measures across vendors',
        paragraphs: [
          'On DeepSeek V4, Kimi K3, GLM 5.3, Qwen 3.5 and MiniMax M3, the AgentX series has measured rack-scale GB300 NVL72 and node-scale B300 leading at high interactivity, with disaggregated GB200/GB300 recipes strongest for time-to-first-token under load. AMD’s MI355X with the Atom engine and SGLang has posted competitive and sometimes winning cost per session on Kimi K3 and GLM 5.3, sustaining around 150 tokens per second per user on the latter.',
          'Interactivity matters more for agents than for chat: a coding agent that streams at 30 tokens per second feels slow across a 50-turn session, so operators tend to buy the high-interactivity end of the Pareto frontier, where FP4 compute and NVLink domains earn their premium.',
        ],
      },
      {
        heading: 'Configuration guidance',
        paragraphs: [
          'Provision for KV first: prefer 268 to 288 GB chips (B300, MI355X, GB300 per-GPU) or pooled rack memory, enable prefix caching and KV-aware routing, and measure prefix cache hit rate in production. Size concurrency for subagent bursts rather than average sessions. And re-benchmark monthly: agentic recipes are young, and engine releases move these rankings faster than hardware refreshes do.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do coding agents really need different GPUs than chatbots?',
        answer:
          'The chips are the same, the priorities differ. Agent sessions multiply context length and reuse, so memory capacity and prefix-cache behavior dominate, while chat serving is more forgiving of small KV budgets. A chip ranking from fixed-sequence benchmarks can reorder under agent traffic.',
      },
      {
        question: 'What interactivity should I target for a coding agent?',
        answer:
          'Most operators target 50 to 150 tokens per second per user for interactive coding agents, several times chat norms, because users wait on multi-turn loops. AgentX publishes throughput at matched interactivity so you can price that choice per session rather than guess.',
      },
      {
        question: 'Is rack-scale hardware necessary for agent serving?',
        answer:
          'Not necessary, but it helps at the frontier: pooled NVL72 memory absorbs KV working sets that single nodes evict, and disaggregation keeps time-to-first-token low during subagent bursts. High-memory single nodes, B300 or MI355X class, remain very competitive per dollar on most models.',
      },
    ],
    keywords: [
      'best hardware for AI agents',
      'agentic coding inference',
      'GPU for coding agents',
      'AgentX benchmark',
      'long context agent serving',
      'KV cache agent workloads',
      'B300 vs MI355X agentic',
      'coding agent infrastructure',
    ],
    relatedGuideSlugs: [
      'long-context-llm-serving',
      'kv-cache-memory-requirements',
      'llm-throughput-vs-latency',
      'rack-scale-vs-single-node-inference',
    ],
    relatedChipSlugs: ['b300', 'gb300-nvl72', 'mi355x', 'b200', 'gb200-nvl72'],
    relatedGlossarySlugs: [
      'agentic-inference',
      'agentx',
      'prefix-caching',
      'kv-cache',
      'interactivity',
    ],
    articleSlugs: [
      AGENTIC_WORKLOADS,
      AGENT_BENCHMARK,
      AGENTX_DSV4_B200_B300,
      AGENTX_K3_ATOM,
      AGENTX_GLM_SGLANG,
    ],
  },
  {
    slug: 'llm-inference-cost-per-million-tokens',
    title: 'LLM Inference Cost per Million Tokens, Explained',
    category: 'Cost and economics',
    description:
      'What LLM inference really costs per million tokens: the formula from GPU hourly rate and measured throughput, why interactivity moves the number, and current hardware examples.',
    quickAnswer:
      'Cost per million tokens equals the GPU hourly rate divided by tokens generated per GPU-hour, times one million. A chip renting at $2 per hour that sustains 5,000 output tokens per second per GPU costs about $0.11 per million output tokens; drop to 500 tokens per second at a strict latency target and the same chip costs $1.11. Throughput at your interactivity target, not the rental rate, is the lever that matters.',
    sections: [
      {
        heading: 'The formula and a worked example',
        paragraphs: [
          'Take dollars per GPU-hour, divide by tokens per second per GPU times 3,600 seconds, multiply by one million. At neocloud rates, B200 rents near $2.07 per GPU-hour: at 10,000 tokens per second per GPU that is $0.058 per million tokens, at 1,000 tokens per second it is $0.58. The two ends of that range are the same chip serving the same model at different interactivity targets.',
          'This is why every InferenceX cost figure is quoted at a stated interactivity: cost per million tokens without a latency condition is a meaningless number, and vendors quoting only their best-case batch throughput exploit exactly that ambiguity.',
        ],
      },
      {
        heading: 'What moves the number in practice',
        paragraphs: [
          'Four levers dominate. Interactivity: relaxing per-user tokens per second lets the scheduler batch more requests and can cut cost several-fold. Precision: FP4 recipes nearly double effective compute on Blackwell and MI355X class chips, and measured NVFP4 serving beat FP8 Hopper by up to 3.6x per dollar on GLM 5. Software: engine releases routinely lift throughput double digits, and MI355X DeepSeek V4 serving improved 110x in 26 days. Sequence shape: long inputs shift work to prefill and change the economics entirely.',
          'Input tokens, cached tokens and output tokens also cost differently: prefill is compute-bound and cheap per token, decode is bandwidth-bound and expensive, and prefix-cache hits cost almost nothing. Production blends of the three explain how API providers price input, cached and output tokens differently.',
        ],
      },
      {
        heading: 'Benchmarked cost versus API prices',
        paragraphs: [
          'Self-hosted cost per million tokens at realistic utilization is the floor under every API price. InferenceX’s per-dollar pages and tco-feed API publish that floor continuously across chips, models and engines at fixed interactivity tiers, so you can judge whether an API markup is buying real efficiency, latency you could not achieve yourself, or margin.',
        ],
      },
    ],
    faq: [
      {
        question: 'How much does it cost to generate a million tokens with an open model?',
        answer:
          'On current hardware at moderate interactivity, frontier MoE models measure from a few cents to a few dollars per million output tokens depending on chip, engine, precision and latency target. The dashboard’s per-dollar pages publish live figures at fixed interactivity tiers.',
      },
      {
        question: 'Why do my costs differ from published benchmark numbers?',
        answer:
          'Usually utilization and traffic shape. Benchmarks report saturated serving at a stated interactivity; production fleets run below saturation, pay for idle capacity, and serve messier sequence mixes. Multiply benchmark cost by the inverse of your expected utilization for a realistic budget.',
      },
      {
        question: 'Are input tokens cheaper than output tokens?',
        answer:
          'Yes, structurally. Input tokens run through compute-dense prefill in parallel, while every output token requires a full decode pass bound by memory bandwidth. That is why API pricing separates the two, and why cached input tokens, which skip prefill work, are cheapest of all.',
      },
      {
        question: 'Does quantization always reduce cost per token?',
        answer:
          'It reduces cost whenever quality holds: FP4 halves weight traffic and roughly doubles tensor throughput on chips that support it. The catch is model-specific accuracy, which is why InferenceX pairs per-dollar comparisons with evaluation scores rather than assuming quantized equals equal.',
      },
    ],
    keywords: [
      'LLM inference cost per million tokens',
      'cost per million tokens',
      'LLM serving cost calculator',
      'token generation cost GPU',
      'inference cost formula',
      'cost per token LLM',
      'self-hosted LLM cost',
      'GPU tokens per dollar',
    ],
    relatedGuideSlugs: [
      'cheapest-gpu-for-llm-inference',
      'self-hosting-llm-vs-api',
      'ai-gpu-total-cost-of-ownership',
      'llm-throughput-vs-latency',
    ],
    relatedChipSlugs: ['b200', 'h200', 'mi355x', 'h100'],
    relatedGlossarySlugs: [
      'cost-per-million-tokens',
      'interactivity',
      'prefill',
      'decode',
      'prefix-cache-hit-rate',
    ],
    articleSlugs: [B200_GLM5, MI355X_DSV4, INFERENCEMAX],
  },
  {
    slug: 'gpu-cloud-pricing-comparison',
    title: 'GPU Cloud Pricing in 2026: H100 to GB300 Hourly Rates Compared',
    category: 'Cost and economics',
    description:
      'What GPUs cost per hour in 2026 across hyperscaler, neocloud and retail tiers: H100, H200, B200, B300, GB200/GB300 NVL72, MI300X, MI325X and MI355X rates compared.',
    quickAnswer:
      'In 2026, datacenter GPU rentals tracked by the SemiAnalysis AI Cloud TCO Model span roughly $0.95 to $3.30 per GPU-hour: H100 runs about $1.17 to $1.78 across tiers, H200 $1.22 to $2.05, B200 $1.73 to $2.60, B300 $2.26 to $3.00, GB200 NVL72 $1.86 to $2.60, GB300 NVL72 $2.31 to $3.30, while AMD’s MI300X ($0.95 to $1.30), MI325X ($1.10 to $1.60) and MI355X ($1.50 to $2.10) undercut comparable NVIDIA parts.',
    sections: [
      {
        heading: 'The three pricing tiers',
        paragraphs: [
          'GPU rental splits into three tiers. Hyperscaler rates reflect committed, at-scale contracts on the big clouds and sit lowest: near $1.17 for H100 and $1.73 for B200. Neocloud rates from GPU-specialist providers run about 15 to 30% higher on shorter commitments: $1.55 for H100, $2.07 for B200, $2.09 for MI355X. Retail on-demand rates are the ceiling, reaching $2.60 for B200 and $3.30 for GB300 NVL72.',
          'These tiers are the denominators behind every InferenceX cost-per-token and performance-per-dollar figure, so comparisons stay honest across vendors: each chip is priced at the tier a real buyer would pay, not at a marketing number.',
        ],
      },
      {
        heading: 'Reading the spread between chips',
        paragraphs: [
          'Newer silicon rents at a premium that is usually smaller than its throughput advantage: B200 costs about a third more than H100 per hour but multiples more capable on frontier MoE serving, which is why per-token economics favor new chips despite sticker shock. AMD prices aggressively per hour, and since MI355X frequently matches B200-class throughput on FP8 recipes, its discount compounds into measured per-token savings around 40% on some models.',
          'Rack-scale carries its own logic: GB200 NVL72 rents close to B200 nodes per GPU, so any rack-enabled throughput gain, and wide-EP has measured about 3x on Kimi K2.5, lands directly as cost-per-token savings. GB300’s higher rate prices in its 278 GB per GPU and FP4 uplift.',
        ],
      },
      {
        heading: 'Rate versus what you actually pay per token',
        paragraphs: [
          'Hourly rate is only the numerator. Divide by measured tokens per GPU-hour at your interactivity target to get the number that belongs in your budget. A dollar-an-hour chip serving a model badly is more expensive than a three-dollar chip serving it well, and the per-dollar dashboards exist to make that arithmetic continuous rather than a quarterly spreadsheet exercise.',
        ],
      },
    ],
    faq: [
      {
        question: 'How much does an H100 cost per hour in 2026?',
        answer:
          'Roughly $1.17 per GPU-hour on hyperscaler contracts, $1.55 at neoclouds, and up to about $1.78 on-demand retail. Rates continue to drift down as Blackwell and MI350-class supply grows and Hopper fleets age into their value phase.',
      },
      {
        question: 'What does a GB200 NVL72 rack cost to rent?',
        answer:
          'Per GPU, roughly $1.86 to $2.60 per hour depending on tier, so a full 72-GPU rack runs about $134 to $187 per hour. Rack rentals usually come with longer commitments because providers cannot resell partial racks easily.',
      },
      {
        question: 'Why are AMD GPUs cheaper per hour than NVIDIA?',
        answer:
          'Supply, demand and ecosystem risk pricing. AMD prices to win deployments while its software matures, and clouds pass that through. Since current Instinct chips often match NVIDIA per-chip throughput on mature recipes, the hourly discount frequently survives into cost per token.',
      },
      {
        question: 'Should I optimize for the cheapest hourly rate?',
        answer:
          'No, optimize cost per million tokens at your latency target. Cheap hours on a chip that serves your model slowly are expensive tokens. The rate tables here are inputs to that calculation, which the per-dollar comparison pages run continuously against live benchmarks.',
      },
    ],
    keywords: [
      'GPU cloud pricing 2026',
      'H100 price per hour',
      'B200 rental price',
      'GPU hourly rates comparison',
      'MI355X price per hour',
      'GB200 NVL72 rental cost',
      'cloud GPU cost comparison',
      'AI GPU rental prices',
    ],
    relatedGuideSlugs: [
      'cheapest-gpu-for-llm-inference',
      'ai-gpu-total-cost-of-ownership',
      'llm-inference-cost-per-million-tokens',
      'self-hosting-llm-vs-api',
    ],
    relatedChipSlugs: ['h100', 'h200', 'b200', 'b300', 'gb200-nvl72', 'gb300-nvl72', 'mi355x'],
    relatedGlossarySlugs: [
      'total-cost-of-ownership',
      'performance-per-dollar',
      'cost-per-million-tokens',
    ],
    articleSlugs: [INFERENCEX_V2, B200_GLM5, MI355X_GLM5],
  },
  {
    slug: 'self-hosting-llm-vs-api',
    title: 'Self-Hosting an LLM vs Using an API: Where the Break-Even Sits',
    category: 'Cost and economics',
    description:
      'When self-hosting an open-weights LLM beats paying per token for an API: the utilization math, the hidden costs, and how benchmarked cost per million tokens sets the floor.',
    quickAnswer:
      'Self-hosting an open-weights model beats API pricing when your traffic keeps rented or owned GPUs busy. Benchmarked serving costs put the self-hosted floor at cents to a few dollars per million tokens at good utilization, often several times below API list prices, but the discount evaporates below roughly 30 to 50% utilization once idle hours, engineering time and worse latency engineering are priced in.',
    sections: [
      {
        heading: 'The utilization math that decides it',
        paragraphs: [
          'A self-hosted fleet costs the same per hour whether it serves traffic or idles, while APIs bill only for tokens. Start from benchmarked cost per million tokens at saturation, then divide by your expected utilization: a $0.20 per million floor becomes $0.80 at 25% utilization. Bursty, spiky or off-hours-heavy traffic pushes real utilization far below what capacity planning decks assume.',
          'APIs amortize this for you by multiplexing thousands of tenants, which is why small and irregular workloads almost never win by self-hosting, and why steady high-volume workloads almost always do.',
        ],
      },
      {
        heading: 'Costs beyond the GPU-hour',
        paragraphs: [
          'Add serving engineering (engine upgrades, recipe tuning, incident response), evaluation work to validate quantization choices, capacity buffers for failover, and the latency engineering that APIs bundle: disaggregated prefill, prefix-cache routing and speculative decoding are your job now. Teams that track it honestly typically add 20 to 50% over raw compute for a production-grade self-hosted stack.',
          'The counterweight is control: open weights let you pin model versions, tune precision per workload, keep data in your boundary, and ride serving-software improvements that continuously cut your floor. Those improvements are large and fast, with engine releases delivering double-digit throughput gains and occasionally order-of-magnitude jumps on new hardware.',
        ],
      },
      {
        heading: 'A practical decision path',
        paragraphs: [
          'Estimate steady-state tokens per day, split by input, cached and output. Price the API path at posted rates. Price self-hosting from live benchmarked cost per million tokens for your model at your interactivity, divided by honest utilization, plus an operations overhead factor. Most teams find a break-even between tens and hundreds of millions of tokens per day, with latency control and data governance tipping borderline cases toward self-hosting.',
        ],
      },
    ],
    faq: [
      {
        question: 'At what volume does self-hosting an LLM pay off?',
        answer:
          'Typically when sustained traffic reaches tens to hundreds of millions of tokens per day for a frontier-class MoE model, or lower for small models on cheap GPUs. The precise line depends on your interactivity target and achievable utilization, both measurable against live benchmark floors.',
      },
      {
        question: 'How much cheaper is self-hosting per token?',
        answer:
          'At high utilization, benchmarked self-hosted floors often run 2 to 10x below API list prices for the same open model. At poor utilization the advantage inverts. The comparison only means something at matched latency, which is what iso-interactivity benchmark curves are for.',
      },
      {
        question: 'What do APIs give me that self-hosting cannot?',
        answer:
          'Elastic burst capacity, zero idle cost, and someone else’s serving engineers. Frontier proprietary models are API-only besides. Self-hosting wins on unit economics at scale, data control, version pinning and the freedom to tune precision and engines per workload.',
      },
    ],
    keywords: [
      'self-hosting LLM vs API',
      'self-hosted LLM cost',
      'LLM API vs own GPU',
      'open source LLM hosting cost',
      'break-even LLM self-hosting',
      'API vs self-hosted inference',
      'LLM deployment cost comparison',
      'open weights model serving',
    ],
    relatedGuideSlugs: [
      'llm-inference-cost-per-million-tokens',
      'gpu-cloud-pricing-comparison',
      'cheapest-gpu-for-llm-inference',
      'how-to-choose-an-llm-serving-engine',
    ],
    relatedChipSlugs: ['h200', 'b200', 'mi355x'],
    relatedGlossarySlugs: [
      'cost-per-million-tokens',
      'total-cost-of-ownership',
      'iso-interactivity',
      'recipe',
    ],
    articleSlugs: [INFERENCEMAX, MI355X_DSV4, B200_MINIMAX],
  },
  {
    slug: 'llm-inference-power-consumption',
    title: 'LLM Inference Power Consumption: Watts, Joules and Tokens per Megawatt',
    category: 'Cost and economics',
    description:
      'How much power LLM inference draws: GPU TDP vs all-in watts, measured energy per token, and why tokens per megawatt is becoming the binding constraint on AI buildouts.',
    quickAnswer:
      'A modern inference GPU draws 700 to 1,400 watts of TDP, but the all-in figure with host, networking and cooling runs 1.4 to 2.1 kilowatts per GPU: an 8-GPU MI355X or GB300-class node is a 15 to 17 kilowatt appliance. What matters economically is energy per token, and measured efficiency now decides how many tokens a power-limited datacenter can sell per megawatt.',
    sections: [
      {
        heading: 'From TDP to all-in power',
        paragraphs: [
          'Chip TDPs climb every generation: H100 and H200 at 700 W, B200 at 1,000 W, B300 and GB300-class at 1,200 to 1,400 W, MI355X at 1,400 W. The SemiAnalysis AI Cloud TCO Model tracks all-in power per GPU, adding the host share, NICs and fans: 1.37 kW for H100, 1.71 kW for B200, 1.9 kW for B300, 2.12 kW for GB300 and 2.09 kW for MI355X. Facility overhead multiplies this again by PUE.',
          'Rising per-chip watts are not waste by themselves: if a 2x power increase buys 4x tokens, energy per token halved. That is the ratio to watch, and it requires measured serving throughput, not spec sheets.',
        ],
      },
      {
        heading: 'Energy per token and tokens per megawatt',
        paragraphs: [
          'InferenceX publishes energy per token and tokens per megawatt alongside throughput because power is increasingly the scarce input: operators buy megawatts and convert them to tokens. At the same interactivity, chips differ by large factors on this metric, and low-precision recipes improve it directly since FP4 moves half the bits of FP8 per token served.',
          'Workload shape moves energy per token as much as silicon: batch-heavy serving amortizes static power across many concurrent tokens, while low-latency, low-concurrency serving strands watts. A fleet tuned for tight interactivity pays for it in joules, not just dollars.',
        ],
      },
      {
        heading: 'What this means for planning',
        paragraphs: [
          'For deployment planning, budget kilowatts per node from all-in figures, not TDP, then compare hardware by measured tokens per megawatt at your latency target. For siting and capacity decisions, energy per token converts model traffic forecasts into megawatt requirements directly, and improvements in serving software raise fleet capacity without a single construction permit.',
        ],
      },
    ],
    faq: [
      {
        question: 'How much power does one LLM inference GPU use?',
        answer:
          'Between 700 and 1,400 watts of chip TDP depending on generation, but 1.4 to 2.1 kilowatts all-in once the host share, networking and cooling are counted. Facility PUE adds another 10 to 30% on top of the IT load.',
      },
      {
        question: 'How much energy does generating a token cost?',
        answer:
          'It varies by orders of magnitude with chip, model, precision and interactivity, which is why InferenceX measures joules per token per configuration rather than quoting one number. Efficient FP4 MoE serving at moderate interactivity sits at the low end; strict-latency dense serving at the high end.',
      },
      {
        question: 'Is newer hardware more power-efficient for inference?',
        answer:
          'Per token, dramatically yes, despite higher wattage. Blackwell and CDNA 4 chips draw up to twice Hopper-era power but serve several times the tokens on frontier models, so joules per token falls each generation. The gain only materializes with software that exploits the new silicon.',
      },
    ],
    keywords: [
      'LLM inference power consumption',
      'GPU power usage AI',
      'energy per token',
      'tokens per megawatt',
      'AI datacenter power',
      'GPU TDP comparison',
      'inference energy efficiency',
      'AI power requirements',
    ],
    relatedGuideSlugs: [
      'ai-gpu-total-cost-of-ownership',
      'gpu-cloud-pricing-comparison',
      'best-gpu-for-llm-inference',
      'llm-inference-cost-per-million-tokens',
    ],
    relatedChipSlugs: ['b200', 'b300', 'mi355x', 'gb300-nvl72', 'h100'],
    relatedGlossarySlugs: ['tokens-per-megawatt', 'energy-per-token', 'total-cost-of-ownership'],
    articleSlugs: [INFERENCEX_V2, INFERENCEMAX],
  },
  {
    slug: 'ai-gpu-total-cost-of-ownership',
    title: 'AI GPU Total Cost of Ownership: From $/Hour to $/Million Tokens',
    category: 'Cost and economics',
    description:
      'How AI GPU TCO really works: capex, power, networking and utilization folded into $/GPU-hour, then converted through measured throughput into cost per million tokens.',
    quickAnswer:
      'AI GPU total cost of ownership folds capital cost, power, networking, facilities and utilization risk into an hourly rate, then measured throughput converts that rate into cost per million tokens. The SemiAnalysis AI Cloud TCO Model expresses this as $/GPU-hour tiers, about $1.17 to $1.78 for H100 and $1.73 to $2.60 for B200 across buyer types, and InferenceX joins those tiers to live benchmarks so TCO lands in tokens, not abstractions.',
    sections: [
      {
        heading: 'What goes into a GPU-hour',
        paragraphs: [
          'The hourly cost of a GPU is mostly amortized capital: the accelerator itself, its share of the server, networking gear and datacenter fit-out, spread over a useful life of four to six years. Then come operating costs: electricity at all-in wattage (1.4 to 2.1 kW per modern GPU), cooling via PUE, bandwidth, and staff. Finally utilization: a fleet busy 60% of the time costs 1.67x per productive hour what a fully utilized fleet does.',
          'Cloud rental tiers compress all of this into one observable number, which is why InferenceX prices every chip at hyperscaler, neocloud and retail $/GPU-hour tiers rather than re-deriving capex assumptions per reader.',
        ],
      },
      {
        heading: 'From hourly cost to tokens',
        paragraphs: [
          'TCO only becomes decision-grade when divided by output: dollars per GPU-hour over tokens per GPU-hour at your target interactivity. That denominator moves constantly, and it is where most TCO spreadsheets go stale: serving software lifted MI355X DeepSeek V4 throughput 110x in 26 days, and a spreadsheet built the week before missed a two-order-of-magnitude denominator change.',
          'The same conversion exposes quantization and parallelism as TCO decisions, not just engineering ones: an NVFP4 recipe that beats FP8 Hopper by 3.6x per dollar rewrites the fleet plan without any hardware purchase.',
        ],
      },
      {
        heading: 'Using the TCO models with live benchmarks',
        paragraphs: [
          'The Accelerator & HBM Model and the AI Cloud TCO Model supply the cost side: component pricing, power, and $/GPU-hour by buyer tier. InferenceX supplies the output side: continuously measured tokens per second per GPU at fixed interactivity tiers, exportable via the tco-feed API for spreadsheet Power Query. Joining the two gives cost per million tokens that updates itself as software and prices move.',
        ],
      },
    ],
    faq: [
      {
        question: 'What is the biggest driver of AI inference TCO?',
        answer:
          'Utilization and software efficiency, not the sticker price of the GPU. Idle hours multiply every other cost, and serving-software gains routinely move tokens per GPU-hour more in a quarter than hardware pricing moves in a year.',
      },
      {
        question: 'How long do inference GPUs stay economically useful?',
        answer:
          'Longer than training GPUs. Inference tolerates older parts by serving smaller models or looser latency tiers, so Hopper-class chips remain productive years after losing the frontier. The fleet lifecycle analysis on this site models exactly that cascade of chips through workload tiers.',
      },
      {
        question: 'Should I buy GPUs or rent them?',
        answer:
          'Rent until your sustained utilization and planning horizon justify ownership. Buying at high utilization beats neocloud rates, but it concentrates technology risk: a better chip or a 10x software gain on rented capacity arrives without a write-off. Hourly tiers make the comparison explicit.',
      },
    ],
    keywords: [
      'AI GPU TCO',
      'GPU total cost of ownership',
      'AI infrastructure cost model',
      'GPU capex opex',
      'cost per GPU hour',
      'AI datacenter economics',
      'inference TCO calculator',
      'GPU fleet economics',
    ],
    relatedGuideSlugs: [
      'gpu-cloud-pricing-comparison',
      'llm-inference-cost-per-million-tokens',
      'llm-inference-power-consumption',
      'self-hosting-llm-vs-api',
    ],
    relatedChipSlugs: ['h100', 'b200', 'gb200-nvl72', 'mi355x'],
    relatedGlossarySlugs: [
      'total-cost-of-ownership',
      'cost-per-million-tokens',
      'tokens-per-dollar',
      'performance-per-dollar',
    ],
    articleSlugs: [INFERENCEMAX, MI355X_DSV4, B200_GLM5],
  },
  {
    slug: 'vllm-vs-sglang',
    title: 'vLLM vs SGLang: Which LLM Serving Engine Is Faster?',
    category: 'Serving engines',
    description:
      'vLLM vs SGLang measured daily on identical models and GPUs: where each engine wins on throughput, prefix caching, MoE support and AMD performance, with live benchmark data.',
    quickAnswer:
      'Neither vLLM nor SGLang is universally faster: InferenceX measures both daily on identical models, GPUs and sequence configurations, and leadership flips by model family, hardware and release. SGLang’s RadixAttention gives it an edge on prefix-heavy and structured workloads and it has led several MoE recipes on AMD, while vLLM counters with the broadest hardware and model coverage and strong wide expert parallelism results on NVL72 racks.',
    sections: [
      {
        heading: 'Two engines, two design centers',
        paragraphs: [
          'vLLM popularized PagedAttention and continuous batching and has become the default serving engine of the open ecosystem: it supports the most models, the most hardware backends, and ships production features like disaggregated serving and wide expert parallelism used in InferenceX’s GB200 NVL72 Kimi recipes. Its breadth makes it the safest first choice and the most common baseline.',
          'SGLang grew from structured-generation research and centers on RadixAttention, a radix-tree prefix cache that makes shared-prefix workloads, multi-turn sessions, and agentic traffic extremely efficient. It has been a velocity story on AMD in particular: SGLang recipes drove MI355X DeepSeek V4 serving up 110x in 26 days and delivered GLM 5 serving about 40% cheaper per token than B200.',
        ],
      },
      {
        heading: 'What the daily measurements show',
        paragraphs: [
          'On NVIDIA Blackwell, SGLang 0.5.6 lifted B200 DeepSeek R1 FP4 throughput up to 1.8x over its previous release, while vLLM NVFP4 recipes on B200 and GB200 have led per-dollar comparisons on GLM 5, MiniMax and Kimi. On MI355X, SGLang frequently posts the strongest MoE numbers with AITER kernels, with vLLM close and improving. On AgentX agentic workloads, both engines serve competitively, with rankings that shift release to release.',
          'The honest summary from continuous measurement: engine choice moves throughput tens of percent at a given moment, but engine version moves it more. Pinning an old version of either engine costs more performance than picking the "wrong" engine.',
        ],
      },
      {
        heading: 'How to choose between them',
        paragraphs: [
          'Choose vLLM when you need the widest model and feature coverage, day-0 support, or rack-scale wide-EP and disaggregation recipes. Choose SGLang when your traffic is prefix-heavy, agentic or structured, or when its current recipe measurably leads on your target model and hardware. Better yet, treat the choice as reversible: both expose OpenAI-compatible APIs, so the switching cost is a config change, and the dashboard tells you when the lead flips.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is SGLang faster than vLLM?',
        answer:
          'Sometimes, by model and hardware. SGLang has led recent MoE recipes on AMD MI355X and posted a 1.8x jump on B200 DeepSeek R1 FP4 with release 0.5.6, while vLLM leads elsewhere, notably wide-EP rack serving. Check the live comparison for your specific model and GPU.',
      },
      {
        question: 'Do vLLM and SGLang produce the same output quality?',
        answer:
          'Serving engines execute the same weights, so quality differences come from precision recipes and sampling defaults rather than the engine itself. InferenceX runs evaluation scores alongside throughput so quantization or kernel shortcuts that hurt quality are visible, not assumed away.',
      },
      {
        question: 'Which engine is better for agentic workloads?',
        answer:
          'Both serve agents well; SGLang’s RadixAttention is purpose-built for the shared-prefix, multi-turn shape of agent sessions, while vLLM’s prefix caching and scheduler have closed much of that gap. AgentX publishes cross-engine agentic measurements so the answer stays empirical.',
      },
      {
        question: 'Can I switch engines after deploying?',
        answer:
          'Yes, cheaply. Both expose OpenAI-compatible endpoints and load the same checkpoints, so switching is mostly re-validating latency, throughput and output quality on your traffic. Fleets increasingly run both and route by model or workload.',
      },
    ],
    keywords: [
      'vLLM vs SGLang',
      'SGLang vs vLLM benchmark',
      'vLLM vs SGLang performance',
      'best LLM serving engine',
      'vLLM SGLang comparison 2026',
      'RadixAttention vs PagedAttention',
      'LLM inference engine benchmark',
      'vLLM vs SGLang AMD',
    ],
    relatedGuideSlugs: [
      'how-to-choose-an-llm-serving-engine',
      'vllm-vs-tensorrt-llm',
      'sglang-vs-tensorrt-llm',
      'amd-vs-nvidia-llm-inference',
    ],
    relatedChipSlugs: ['b200', 'mi355x', 'gb200-nvl72', 'h200'],
    relatedGlossarySlugs: [
      'vllm',
      'sglang',
      'prefix-caching',
      'batching',
      'wide-expert-parallelism',
    ],
    articleSlugs: [SGLANG_056, MI355X_DSV4, MI355X_GLM5, GB200_KIMI, AGENTX_QWEN_B300],
  },
  {
    slug: 'vllm-vs-tensorrt-llm',
    title: 'vLLM vs TensorRT-LLM: Flexibility vs Peak NVIDIA Performance',
    category: 'Serving engines',
    description:
      'vLLM vs TensorRT-LLM compared on live benchmarks: when NVIDIA’s tuned engine wins on Blackwell, when vLLM’s breadth and velocity win, and how Dynamo changes the picture.',
    quickAnswer:
      'TensorRT-LLM is NVIDIA’s performance-first engine and frequently sets the pace on NVIDIA hardware, especially latency-critical and disaggregated serving with Dynamo, while vLLM is the open ecosystem default that runs everywhere, supports models first, and often matches or beats TensorRT-LLM throughput on the same GPUs. InferenceX measures both continuously; the lead is model- and release-specific, not a constant.',
    sections: [
      {
        heading: 'Different goals, different strengths',
        paragraphs: [
          'TensorRT-LLM compiles models into aggressively optimized NVIDIA-only executables, with hand-tuned kernels, FP4 and FP8 quantization toolchains, and deep integration with Dynamo for disaggregated prefill and decode. When NVIDIA prioritizes a model, the result is often the fastest recipe on Blackwell, particularly at strict latency targets: InferenceX’s ultra-high-interactivity work and GB200 disaggregated DeepSeek R1 FP4 serving both build on it.',
          'vLLM optimizes for the whole ecosystem instead: new models usually land there first, it runs on NVIDIA, AMD and other backends, and its scheduler, PagedAttention and wide-EP implementations are strong enough that it regularly leads per-dollar comparisons on B200 and GB200, as it has on GLM 5 NVFP4 and Kimi K2.5 wide-EP recipes.',
        ],
      },
      {
        heading: 'What the measurements say',
        paragraphs: [
          'On identical B200 and B300 hardware, leadership alternates: TensorRT-LLM TP2 recipes led MiniMax M3 AgentX serving, Dynamo disaggregation defines the high-interactivity frontier on GB200 racks, while vLLM NVFP4 has led GLM 5 and MiniMax per-dollar results and holds the flagship wide-EP rack recipes. The gap between engines at any moment is usually smaller than the gain from each engine’s next release.',
          'Operational differences persist though: TensorRT-LLM requires per-model engine builds and NVIDIA-specific tuning, while vLLM deploys from checkpoints in minutes. Teams pay TensorRT-LLM’s integration cost when its peak performance or latency behavior justifies it, typically on high-volume flagship deployments.',
        ],
      },
      {
        heading: 'Choosing for your stack',
        paragraphs: [
          'Default to vLLM for breadth, velocity and multi-vendor freedom, and adopt TensorRT-LLM selectively where measurements show it winning on your model at your latency target, especially disaggregated or ultra-low-latency NVIDIA deployments. Because both speak OpenAI-compatible APIs, running TensorRT-LLM for one or two flagship models and vLLM for the long tail is a common and sensible fleet pattern.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is TensorRT-LLM faster than vLLM on NVIDIA GPUs?',
        answer:
          'Often at strict latency targets and on models NVIDIA has tuned heavily, but not universally: vLLM NVFP4 recipes have measured better per-dollar results on several Blackwell deployments. The live compare pages show the current leader per model, GPU and interactivity.',
      },
      {
        question: 'Does TensorRT-LLM work on AMD GPUs?',
        answer:
          'No, it is NVIDIA-only. Cross-vendor fleets standardize on vLLM or SGLang, or route NVIDIA flagship traffic to TensorRT-LLM while serving AMD capacity with the open engines. That split is exactly what cross-vendor benchmarks help calibrate.',
      },
      {
        question: 'What is NVIDIA Dynamo and how does it relate?',
        answer:
          'Dynamo is NVIDIA’s datacenter-scale serving layer that orchestrates disaggregated prefill and decode, KV-aware routing and multi-node scheduling, typically with TensorRT-LLM workers underneath. InferenceX’s GB200 NVL72 disaggregated DeepSeek R1 results use exactly that stack.',
      },
    ],
    keywords: [
      'vLLM vs TensorRT-LLM',
      'TensorRT-LLM benchmark',
      'TensorRT-LLM vs vLLM performance',
      'NVIDIA inference engine',
      'Dynamo TensorRT-LLM',
      'fastest LLM engine NVIDIA',
      'vLLM TensorRT comparison 2026',
      'LLM serving engine NVIDIA GPU',
    ],
    relatedGuideSlugs: [
      'vllm-vs-sglang',
      'sglang-vs-tensorrt-llm',
      'how-to-choose-an-llm-serving-engine',
      'llm-throughput-vs-latency',
    ],
    relatedChipSlugs: ['b200', 'b300', 'gb200-nvl72', 'h200'],
    relatedGlossarySlugs: ['tensorrt-llm', 'vllm', 'nvidia-dynamo', 'disaggregated-inference'],
    articleSlugs: [GB200_R1, TILERT, B200_GLM5, AGENTX_M3_RACK],
  },
  {
    slug: 'sglang-vs-tensorrt-llm',
    title: 'SGLang vs TensorRT-LLM: Open Velocity vs NVIDIA Tuning',
    category: 'Serving engines',
    description:
      'SGLang vs TensorRT-LLM on live benchmarks: prefix caching and cross-vendor speed versus NVIDIA-tuned kernels and disaggregation, measured daily on identical configurations.',
    quickAnswer:
      'SGLang and TensorRT-LLM excel at opposite ends of the serving spectrum: SGLang brings RadixAttention prefix caching, rapid open development and first-class AMD support, while TensorRT-LLM brings NVIDIA-tuned kernels, FP4 toolchains and Dynamo disaggregation. On NVIDIA Blackwell the two trade wins by model and release; on AMD hardware SGLang runs unopposed since TensorRT-LLM is NVIDIA-only.',
    sections: [
      {
        heading: 'Where each engine comes from',
        paragraphs: [
          'SGLang is an open-source engine built around RadixAttention, which caches and reuses shared prompt prefixes in a radix tree: multi-turn sessions, agentic traffic and batch workloads with common templates benefit enormously. Its development velocity is a defining feature, with releases like 0.5.6 lifting B200 DeepSeek R1 FP4 throughput up to 1.8x, and its AMD backend has repeatedly set MI355X records, including GLM 5 serving about 40% cheaper per token than B200.',
          'TensorRT-LLM is NVIDIA’s in-house engine: models compile into tuned executables using the best available kernels, quantization recipes and communication patterns for each NVIDIA architecture, and it pairs with Dynamo for disaggregated multi-node serving. Its ceiling on NVIDIA silicon is the highest, at the cost of build complexity and single-vendor scope.',
        ],
      },
      {
        heading: 'Benchmark picture on shared hardware',
        paragraphs: [
          'On B200 and B300, InferenceX measurements alternate: TensorRT-LLM TP2 led MiniMax M3 agentic serving and anchors ultra-high-interactivity recipes, while SGLang holds leading DeepSeek R1 and V4 numbers at throughput-oriented targets. Because both engines improve monthly, the durable observation is directional: TensorRT-LLM tends to win the latency-critical end of the Pareto frontier, SGLang the prefix-heavy and throughput end.',
          'On MI300X, MI325X and MI355X, SGLang with AITER kernels is a primary recipe and TensorRT-LLM does not participate, so cross-vendor buyers comparing best-on-AMD versus best-on-NVIDIA are often comparing SGLang to TensorRT-LLM without choosing either explicitly.',
        ],
      },
      {
        heading: 'Practical selection',
        paragraphs: [
          'Pick SGLang for agentic and multi-turn traffic, AMD or mixed fleets, and fast adoption of new open models. Pick TensorRT-LLM for NVIDIA-only fleets chasing peak tokens per GPU at strict latency, or Dynamo-based disaggregated architectures. Many operators deploy SGLang broadly and reserve TensorRT-LLM for the two or three flagship models whose volume justifies per-model engine builds.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is SGLang competitive with TensorRT-LLM on NVIDIA hardware?',
        answer:
          'Yes, and sometimes ahead: SGLang has held leading B200 DeepSeek FP4 results at throughput-oriented interactivity, while TensorRT-LLM leads at the strict-latency end. The daily compare pages show the current winner for each model, GPU and target.',
      },
      {
        question: 'Why does prefix caching matter so much for agents?',
        answer:
          'Agent sessions resend most of their growing context every turn. RadixAttention-style prefix caching turns those repeated tokens into cache hits that skip prefill compute entirely, cutting both time-to-first-token and cost per session. Its benefit scales with session length and turn count.',
      },
      {
        question: 'Which engine should an AMD deployment use?',
        answer:
          'SGLang and vLLM are the production choices on Instinct GPUs, with SGLang currently holding several flagship MoE records on MI355X. TensorRT-LLM is not an option on AMD, so the SGLang versus TensorRT-LLM question only arises on NVIDIA capacity.',
      },
    ],
    keywords: [
      'SGLang vs TensorRT-LLM',
      'TensorRT-LLM vs SGLang benchmark',
      'SGLang performance NVIDIA',
      'SGLang AMD MI355X',
      'RadixAttention prefix caching',
      'LLM engine comparison 2026',
      'fastest inference engine',
      'SGLang TensorRT comparison',
    ],
    relatedGuideSlugs: [
      'vllm-vs-sglang',
      'vllm-vs-tensorrt-llm',
      'how-to-choose-an-llm-serving-engine',
      'best-hardware-for-agentic-coding',
    ],
    relatedChipSlugs: ['b200', 'mi355x', 'b300', 'gb200-nvl72'],
    relatedGlossarySlugs: ['sglang', 'tensorrt-llm', 'prefix-caching', 'aiter', 'pareto-frontier'],
    articleSlugs: [SGLANG_056, MI355X_GLM5, AGENTX_M3_RACK, MI355X_DSV4],
  },
  {
    slug: 'how-to-choose-an-llm-serving-engine',
    title: 'How to Choose an LLM Serving Engine in 2026',
    category: 'Serving engines',
    description:
      'A decision framework for picking vLLM, SGLang, TensorRT-LLM or Atom: hardware coverage, model support, workload shape, latency targets and measured performance.',
    quickAnswer:
      'Choose an LLM serving engine by elimination: hardware narrows the field (TensorRT-LLM is NVIDIA-only, Atom targets AMD), model support narrows it further on release week, then workload shape and measured performance at your interactivity target decide. In 2026 the practical menu is vLLM for breadth, SGLang for prefix-heavy and AMD-forward deployments, TensorRT-LLM for peak NVIDIA serving, and Atom on AMD rack-class systems.',
    sections: [
      {
        heading: 'The 2026 engine landscape',
        paragraphs: [
          'Four engines cover nearly all production open-model serving. vLLM is the ecosystem default: broadest model coverage, multi-vendor backends, wide expert parallelism and disaggregation. SGLang pairs RadixAttention prefix caching with exceptional release velocity and first-class ROCm support. TensorRT-LLM compiles NVIDIA-tuned executables and anchors Dynamo disaggregated serving. Atom is the AMD-ecosystem engine that InferenceX measures on MI355X flagship recipes, including Kimi K3 and GLM 5.3 AgentX serving against GB300 NVL72.',
          'All four expose OpenAI-compatible APIs, which makes engine choice far less binding than hardware choice: a config change, not a migration.',
        ],
      },
      {
        heading: 'A concrete decision sequence',
        paragraphs: [
          'First, hardware: AMD fleets choose among vLLM, SGLang and Atom; NVIDIA fleets add TensorRT-LLM; mixed fleets need at least one cross-vendor engine. Second, model timing: on release week, serve whatever engine has a validated recipe, usually vLLM or SGLang first. Third, workload: prefix-heavy agentic traffic favors RadixAttention-class caching; strict-latency chat favors TensorRT-LLM and disaggregation; batch throughput favors whichever engine tops the loose-interactivity end of the Pareto frontier.',
          'Fourth, measure: engine rankings flip with releases, so the choice should be reviewed against continuous benchmarks, not remembered from a blog post. InferenceX runs every engine on identical model, hardware and sequence configurations daily precisely so this review costs minutes.',
        ],
      },
      {
        heading: 'Fleet patterns that work',
        paragraphs: [
          'Mature operators rarely run one engine. A common pattern: vLLM as the default for the model long tail, SGLang or Atom on AMD capacity and agent traffic, TensorRT-LLM on flagship NVIDIA deployments whose volume justifies per-model tuning. Version discipline matters more than engine loyalty, since staying two releases behind on any engine typically costs more throughput than switching engines would gain.',
        ],
      },
    ],
    faq: [
      {
        question: 'What is the most widely used LLM serving engine?',
        answer:
          'vLLM, by deployment count and model coverage. It is the default recipe for most open-weights releases and runs on every major accelerator. Whether it is fastest for your specific model, hardware and latency target is a separate, measurable question.',
      },
      {
        question: 'What is Atom and when should I consider it?',
        answer:
          'Atom is a serving engine in the AMD ecosystem that InferenceX benchmarks on MI355X flagship MoE recipes, where it has posted competitive agentic results against NVIDIA rack-scale systems on Kimi K3 and GLM 5.3. Consider it for AMD deployments chasing peak MoE serving.',
      },
      {
        question: 'How often should I re-evaluate my engine choice?',
        answer:
          'Quarterly at minimum, and at every major engine release for your flagship models. Measured history shows single releases moving throughput 1.8x and multi-week kernel efforts moving it far more, so an annual bake-off leaves large amounts of performance unclaimed.',
      },
      {
        question: 'Do engines differ in output quality?',
        answer:
          'The weights are identical, so differences come from precision recipes, sampling defaults and kernel approximations. Pair any engine comparison with evaluation scores, as the dashboard does, so a throughput win that costs accuracy is visible before production.',
      },
    ],
    keywords: [
      'LLM serving engine comparison',
      'choose inference engine',
      'vLLM vs SGLang vs TensorRT-LLM',
      'best LLM inference framework 2026',
      'LLM deployment stack',
      'inference engine decision guide',
      'Atom serving engine AMD',
      'production LLM serving',
    ],
    relatedGuideSlugs: [
      'vllm-vs-sglang',
      'vllm-vs-tensorrt-llm',
      'sglang-vs-tensorrt-llm',
      'self-hosting-llm-vs-api',
    ],
    relatedChipSlugs: ['b200', 'mi355x', 'gb300-nvl72', 'h200'],
    relatedGlossarySlugs: ['inference-engine', 'vllm', 'sglang', 'tensorrt-llm', 'atom', 'recipe'],
    articleSlugs: [AGENTX_V3, AGENTX_K3_ATOM, SGLANG_056, GB200_KIMI],
  },
  {
    slug: 'fp8-vs-fp4-llm-inference',
    title: 'FP8 vs FP4 for LLM Inference: Speed, Quality and Hardware Support',
    category: 'Serving engines',
    description:
      'FP8 vs FP4 quantization for LLM serving: measured throughput and per-dollar gains on Blackwell and MI355X, quality trade-offs, and which precision to pick per model.',
    quickAnswer:
      'FP4 roughly doubles tensor throughput and halves weight memory traffic versus FP8, and on FP4-capable chips (B200, B300, GB200/GB300, MI355X) it has measured up to 3.6x better performance per dollar than FP8 on older hardware. FP8 remains the safe default: quality is nearly indistinguishable from BF16 for most models, while FP4 quality is model-specific and demands formats like NVFP4 or MXFP4 plus evaluation before production.',
    sections: [
      {
        heading: 'What the formats actually change',
        paragraphs: [
          'Precision sets how many bits move and multiply. FP8 stores weights and activations in 8 bits and is mature across Hopper, Blackwell and CDNA 3/4; it typically matches BF16 quality within noise on well-calibrated models. FP4 formats like NVFP4 and MXFP4 use 4-bit elements with block scaling: half the memory traffic of FP8 and up to double the tensor throughput on chips with native FP4 units, 9,000 to 15,000 dense TFLOP/s on B200 through GB300, and 10,066 on MI355X.',
          'Decode is memory-bound, so halving weight bytes directly lifts token rates even before the compute advantage counts. Frontier models increasingly ship FP4-ready: DeepSeek V4 distributes MoE expert weights in FP4 natively.',
        ],
      },
      {
        heading: 'Measured gains and quality reality',
        paragraphs: [
          'The economics are dramatic when quality holds: B200 GLM 5 NVFP4 measured up to 3.6x the performance per dollar of H200 FP8, MiniMax and Kimi NVFP4 recipes beat Hopper FP8 and INT4 equivalents, and SGLang FP4 releases have lifted DeepSeek R1 throughput 1.8x in one version. That is why the frontier of every per-dollar comparison on FP4-capable silicon is an FP4 recipe.',
          'Quality is the gating question, and it is model-specific: some checkpoints lose nothing measurable in NVFP4 while others degrade on reasoning-heavy evaluations. InferenceX publishes evaluation scores alongside throughput for exactly this reason, and its compare-precision pages hold model, hardware and engine constant while varying only precision so the trade is visible.',
        ],
      },
      {
        heading: 'Choosing per deployment',
        paragraphs: [
          'Serve FP8 when your hardware lacks FP4 units, when a model’s FP4 evaluations show regressions, or when you cannot afford evaluation cycles. Move to FP4 when your chips support it natively, your model’s scores hold, and cost or latency pressure is real, since the gain is effectively free capacity. KV-cache quantization is a separate, complementary lever: FP8 KV is now routine, and it compounds with either weight precision.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does FP4 quantization hurt model quality?',
        answer:
          'Sometimes, and it is model-specific. Modern block-scaled formats like NVFP4 keep many frontier models within evaluation noise of FP8, but some models regress on reasoning tasks. Validate on your evaluation suite, or read the published per-precision scores before switching.',
      },
      {
        question: 'How much faster is FP4 than FP8 in practice?',
        answer:
          'Up to about 2x throughput at matched interactivity on FP4-native chips, and more in per-dollar terms when FP4 lets a newer chip replace older FP8 capacity: measured GLM 5 NVFP4 on B200 reached 3.6x the per-dollar performance of H200 FP8.',
      },
      {
        question: 'Which GPUs support FP4 inference?',
        answer:
          'NVIDIA Blackwell parts (B200, B300, GB200 and GB300 NVL72, RTX PRO 6000) and AMD’s MI355X have native FP4 tensor cores. Hopper (H100, H200) and CDNA 3 (MI300X, MI325X) do not, which caps them at FP8 or INT4 weight-only schemes.',
      },
      {
        question: 'What is the difference between NVFP4 and MXFP4?',
        answer:
          'Both are block-scaled 4-bit formats: MXFP4 is the OCP microscaling standard with power-of-two scales per 32-element block, while NVFP4 is NVIDIA’s variant using FP8 scales over 16-element blocks, generally preserving accuracy better at the same bit width.',
      },
    ],
    keywords: [
      'FP8 vs FP4',
      'FP4 quantization LLM',
      'NVFP4 benchmark',
      'FP4 inference quality',
      'FP8 quantization accuracy',
      'MXFP4 vs NVFP4',
      'low precision LLM serving',
      'Blackwell FP4 performance',
    ],
    relatedGuideSlugs: [
      'best-gpu-for-llm-inference',
      'llm-inference-cost-per-million-tokens',
      'gpu-memory-requirements-for-llms',
      'how-to-choose-an-llm-serving-engine',
    ],
    relatedChipSlugs: ['b200', 'b300', 'gb300-nvl72', 'mi355x', 'h200'],
    relatedGlossarySlugs: ['fp8', 'fp4', 'nvfp4', 'mxfp4', 'quantization', 'kv-cache-quantization'],
    articleSlugs: [B200_GLM5, B200_KIMI, SGLANG_056, DEEPSEEK_V4],
  },
  {
    slug: 'speculative-decoding-in-production',
    title: 'Speculative Decoding in Production: When It Actually Helps',
    category: 'Serving engines',
    description:
      'When speculative decoding speeds up LLM serving and when it backfires: acceptance length, batch-size interactions, MTP and EAGLE variants, and measured results.',
    quickAnswer:
      'Speculative decoding drafts several tokens cheaply and verifies them in one pass of the full model, multiplying per-user token speed when drafts are accepted. It shines at low concurrency and strict latency targets, routinely lifting interactivity 1.5 to 3x, but its advantage shrinks or inverts at high batch sizes where verification compute competes with other users’ requests. Whether it helps is a measurable property of your traffic, not a setting to enable blindly.',
    sections: [
      {
        heading: 'How it works and what decides the win',
        paragraphs: [
          'A draft mechanism, a small model, an extra prediction head like multi-token prediction, or a tree method like EAGLE, proposes the next several tokens; the target model verifies them in parallel and keeps the longest accepted prefix. The economics reduce to acceptance length: how many drafted tokens survive verification on average. Long acceptance on predictable text multiplies decode speed; short acceptance wastes draft and verification work.',
          'Frontier models increasingly ship draft mechanisms natively: DeepSeek V4’s production checkpoint attaches a speculative module, and MTP layers are standard in several MoE flagships, which is why engines now treat speculation as a first-class recipe component rather than an add-on.',
        ],
      },
      {
        heading: 'The batch-size catch',
        paragraphs: [
          'Speculation converts spare compute into latency: at batch size one, verification rides free on underutilized tensor cores. At serving saturation there is no spare compute, so drafted tokens displace other requests’ work and total throughput can fall even while single-user speed rises. This is why InferenceX’s compare-spec-decode pages measure speculation on and off across full concurrency sweeps at matched configurations, rather than quoting a single speedup number.',
          'The practical envelope: interactive traffic at low-to-moderate concurrency, coding and structured output with predictable continuations, and latency-tiered fleets that route premium users to speculative recipes all benefit; saturated batch serving usually should leave speculation off.',
        ],
      },
      {
        heading: 'Deployment guidance',
        paragraphs: [
          'Prefer model-native draft mechanisms (MTP, EAGLE-class heads) over generic small-model drafting: acceptance lengths run materially higher when the draft head was trained with the target model. Monitor acceptance length in production, since it drifts with traffic domain. And revisit the setting per model generation: speculation quality is a property of the checkpoint, and each release changes the math.',
        ],
      },
    ],
    faq: [
      {
        question: 'How much speedup does speculative decoding give?',
        answer:
          'Typically 1.5 to 3x on per-user token speed at low concurrency, dropping toward parity as batch size grows. The realized number depends on acceptance length for your traffic, which is why measured on/off comparisons at matched concurrency beat quoted maximums.',
      },
      {
        question: 'Does speculative decoding change model outputs?',
        answer:
          'No. Verification accepts only tokens the target model would have produced under the same sampling scheme, so outputs are distributionally identical. The technique spends extra compute to produce the same text faster, which is what makes it safe to toggle per traffic tier.',
      },
      {
        question: 'What is the difference between MTP and EAGLE?',
        answer:
          'Multi-token prediction adds trained heads to the target model that draft upcoming tokens; EAGLE-class methods run a lightweight autoregressive draft on hidden states with tree-structured proposals. Both self-draft rather than use a separate model, and modern engines support each.',
      },
    ],
    keywords: [
      'speculative decoding',
      'speculative decoding speedup',
      'multi-token prediction inference',
      'EAGLE speculative decoding',
      'draft model LLM',
      'acceptance length',
      'faster LLM decoding',
      'speculative decoding batch size',
    ],
    relatedGuideSlugs: [
      'llm-throughput-vs-latency',
      'how-to-choose-an-llm-serving-engine',
      'what-is-a-good-tokens-per-second',
      'fp8-vs-fp4-llm-inference',
    ],
    relatedChipSlugs: ['b200', 'gb200-nvl72', 'h200'],
    relatedGlossarySlugs: [
      'speculative-decoding',
      'multi-token-prediction',
      'eagle',
      'acceptance-length',
      'interactivity',
    ],
    articleSlugs: [DEEPSEEK_V4, TILERT, INFERENCEX_V2],
  },
  {
    slug: 'how-many-gpus-to-run-deepseek',
    title: 'How Many GPUs Do You Need to Run DeepSeek V4?',
    category: 'Capacity planning',
    description:
      'GPU counts for serving DeepSeek V4 and R1: weight memory math for the 1.6T-parameter MoE, minimum viable nodes, and what production traffic actually requires.',
    quickAnswer:
      'DeepSeek V4 Pro stores 1.6 trillion parameters, so weights alone occupy roughly 800 GB in FP4 and 1.6 TB in FP8. The practical minimum is a single 8-GPU high-memory node, 8x MI355X (2.3 TB) or 8x B300 (2.1 TB), running FP4 or mixed precision, while 8x H200 (1.1 TB) requires aggressive quantization. Production serving with real KV-cache headroom typically uses multiple nodes or an NVL72 rack with wide expert parallelism.',
    sections: [
      {
        heading: 'The memory arithmetic',
        paragraphs: [
          'Start from storage: 1.6T parameters need about one byte each in FP8 and half in FP4, and DeepSeek ships V4 with FP4 expert weights and FP8 elsewhere, putting the checkpoint near a terabyte before runtime overhead. Divide by per-GPU memory to get minimum ranks: 288 GB MI355X chips clear it in 4 to 8, 180 GB B200s want 8 or more, and 80 GB H100s need 16-plus ranks spanning nodes, which is rarely economic.',
          'Weights are only the floor. DeepSeek V4’s 1M-token context multiplies KV pressure even with its efficient hybrid attention, which cuts KV to about 10% of its predecessor; agentic sessions still accumulate working sets of tens to hundreds of gigabytes across a replica at production concurrency.',
        ],
      },
      {
        heading: 'Deployment shapes that are actually used',
        paragraphs: [
          'InferenceX serves DeepSeek V4 and R1 in three measured shapes. Single high-memory nodes: 8x MI355X or 8x B300 run FP4/FP8 recipes with room for KV, the minimum production-credible replica. Multi-node expert parallelism: 2 to 4 nodes of B200 or H200 spread experts wider at scale-out network cost. Rack-scale: GB200/GB300 NVL72 with wide-EP and disaggregated prefill, which the measurements show winning at high interactivity and large KV working sets.',
          'The right count is workload-dependent: throughput-oriented batch traffic saturates single nodes efficiently, while agentic traffic with hundred-thousand-token sessions rewards the pooled memory and NVLink domain of racks, as the AgentX GB200 versus GB300 disaggregation results show.',
        ],
      },
      {
        heading: 'Sizing for your traffic, not the minimum',
        paragraphs: [
          'Compute replicas from demand, not just fit: divide your peak tokens per second by measured per-GPU throughput at your interactivity target, then round up to whole replicas. A deployment that merely fits weights will serve tiny batches at poor cost per token. The live dashboard publishes per-GPU throughput for every measured DeepSeek configuration, which turns this sizing into arithmetic instead of guesswork.',
        ],
      },
    ],
    faq: [
      {
        question: 'Can you run DeepSeek V4 on a single GPU?',
        answer:
          'No. At 1.6T parameters the checkpoint is roughly 800 GB even in FP4, several times any single GPU’s memory. The smallest sensible deployment is an 8-GPU high-memory node; heavily distilled or smaller V4 variants like V4 Flash are the single-node-friendly options.',
      },
      {
        question: 'What is the cheapest way to serve DeepSeek V4?',
        answer:
          'Watch the per-dollar pages, since the answer moves: MI355X FP8/FP4 recipes on SGLang improved 110x in 26 days after release, and B200 NVFP4 and GB200 wide-EP recipes lead at other interactivity targets. Cheapest depends on your latency tier and utilization.',
      },
      {
        question: 'How many GPUs for DeepSeek R1?',
        answer:
          'R1’s 671B parameters need about 671 GB in FP8 or half that in FP4: one 8-GPU node of H200, B200, MI325X or MI355X class hardware serves it comfortably, and measured disaggregated GB200 NVL72 recipes define its high-interactivity frontier.',
      },
      {
        question: 'Do I need NVL72 racks for DeepSeek?',
        answer:
          'Need, no; benefit, often. Racks earn their premium when wide expert parallelism and pooled KV memory raise per-GPU throughput enough, which measurements confirm at high interactivity and long-context agentic traffic. At moderate targets, high-memory single nodes are the value play.',
      },
    ],
    keywords: [
      'how many GPUs to run DeepSeek',
      'DeepSeek V4 hardware requirements',
      'DeepSeek 671B GPU requirements',
      'DeepSeek V4 deployment',
      'GPUs needed for DeepSeek R1',
      'DeepSeek inference hardware',
      'serve DeepSeek self-hosted',
      'DeepSeek GPU memory',
    ],
    relatedGuideSlugs: [
      'gpu-memory-requirements-for-llms',
      'rack-scale-vs-single-node-inference',
      'kv-cache-memory-requirements',
      'cheapest-gpu-for-llm-inference',
    ],
    relatedChipSlugs: ['mi355x', 'b300', 'h200', 'gb200-nvl72', 'gb300-nvl72'],
    relatedGlossarySlugs: [
      'mixture-of-experts',
      'expert-parallelism',
      'wide-expert-parallelism',
      'kv-cache',
      'quantization',
    ],
    articleSlugs: [DEEPSEEK_V4, MI355X_DSV4, GB200_R1, AGENTX_DSV4_GB200_GB300],
  },
  {
    slug: 'kv-cache-memory-requirements',
    title: 'KV Cache Memory Requirements: Sizing GPU Memory for Real Traffic',
    category: 'Capacity planning',
    description:
      'How to size KV cache memory for LLM serving: the per-token formula, what GQA, MLA and sparse attention change, and why agentic traffic multiplies the requirement.',
    quickAnswer:
      'KV cache memory equals two times layers times KV heads times head dimension times bytes per element, per token, summed over every token in every active context. For classic dense models that reaches around 1 to 2 MB per token; modern architectures with GQA, latent or sparse attention cut it by 10 to 100x. Multiply per-token cost by concurrency times average context length, then add headroom, because KV, not weights, is what runs out first under long-context and agentic traffic.',
    sections: [
      {
        heading: 'The formula and what shrinks it',
        paragraphs: [
          'Each generated or cached token stores a key and value vector per attention layer: 2 x layers x kv_heads x head_dim x bytes. Architecture moves this enormously: grouped-query attention divides KV heads by the group factor, multi-head latent attention compresses KV into a small latent per token, sliding-window and hybrid linear attention bound how many tokens persist at all, and DeepSeek V4’s compressed sparse attention reaches about 10% of its predecessor’s KV at 1M-token context.',
          'Precision is the other lever: FP8 KV halves BF16, and INT4 KV quantization halves it again where quality allows. Engines now treat KV precision as a recipe parameter, and it compounds with every architectural saving.',
        ],
      },
      {
        heading: 'From per-token cost to fleet requirement',
        paragraphs: [
          'Serving capacity is per-token cost times tokens resident: concurrency times average live context, plus prefix caches worth keeping. A modest chat service, 200 concurrent users at 8K context, holds under two million tokens; an agentic coding service, 200 sessions averaging 200K tokens with subagent branches, holds forty million-plus and re-reads them every turn. That two-order-of-magnitude spread is why agent-era capacity planning starts from KV, and why AgentX measures KV working-set pressure explicitly.',
          'When the working set exceeds HBM, engines evict prefixes (losing cache hits and re-paying prefill), offload KV to host memory over PCIe or NVLink C2C, or shrink batches. All three show up as cost per token, which is how KV shortfalls hide in economics rather than error logs.',
        ],
      },
      {
        heading: 'Sizing guidance',
        paragraphs: [
          'Budget KV explicitly per replica: model weights plus engine overhead, and no less than 20 to 40% of remaining HBM for KV on interactive fleets, more for agentic traffic. Prefer chips whose free-after-weights memory matches your context profile, 141 to 288 GB parts changed long-context economics for exactly this reason. Then monitor prefix-cache hit rate and eviction in production: those two counters tell you whether the budget held.',
        ],
      },
    ],
    faq: [
      {
        question: 'How much KV cache does a 128K-token context use?',
        answer:
          'From tens of gigabytes on classic dense architectures at 1 to 2 MB per token, down to about a gigabyte on aggressive MLA or sparse-attention models. The architecture-specific per-token figure matters more than any rule of thumb, so compute it from the model config.',
      },
      {
        question: 'Is KV cache the reason long-context serving is expensive?',
        answer:
          'Largely, yes. Long contexts inflate resident KV linearly and re-read it every decoded token, consuming both memory and bandwidth. Architectural compression (GQA, MLA, sparse attention) and prefix caching are why million-token contexts became servable at all.',
      },
      {
        question: 'Should I quantize the KV cache?',
        answer:
          'FP8 KV is now a routine default with negligible quality impact on most models, effectively doubling context capacity versus BF16. INT4 KV buys another doubling but deserves evaluation on your model and tasks, since quality sensitivity varies by architecture and workload.',
      },
      {
        question: 'What happens when KV cache fills up?',
        answer:
          'The engine evicts cached prefixes, offloads KV to slower memory tiers, or shrinks effective batch size. Users see it as slower time-to-first-token and higher tail latency; operators see it as rising cost per token. Persistent eviction is the signal to add memory or replicas.',
      },
    ],
    keywords: [
      'KV cache memory requirements',
      'KV cache size calculation',
      'KV cache formula LLM',
      'GPU memory KV cache',
      'long context memory usage',
      'KV cache quantization',
      'MLA KV cache savings',
      'LLM context memory sizing',
    ],
    relatedGuideSlugs: [
      'gpu-memory-requirements-for-llms',
      'long-context-llm-serving',
      'best-hardware-for-agentic-coding',
      'how-many-gpus-to-run-deepseek',
    ],
    relatedChipSlugs: ['h200', 'b300', 'mi355x', 'gb300-nvl72'],
    relatedGlossarySlugs: [
      'kv-cache',
      'kv-cache-quantization',
      'kv-cache-offload',
      'multi-head-latent-attention',
      'prefix-caching',
    ],
    articleSlugs: [DEEPSEEK_V4, AGENTX_DSV4_B200_B300, AGENTIC_WORKLOADS],
  },
  {
    slug: 'long-context-llm-serving',
    title: 'Long-Context LLM Serving: Hardware and Engines for 100K to 1M Tokens',
    category: 'Capacity planning',
    description:
      'Serving 100K to 1M-token contexts: what long context does to prefill, KV cache and cost, and which hardware and engine choices keep it economical.',
    quickAnswer:
      'Long-context serving is a different workload: prefill grows superlinearly until sparse attention tames it, KV cache balloons from megabytes to gigabytes per session, and cost per request decouples from tokens generated. Economical 100K-to-1M-token serving combines KV-efficient architectures, prefix caching, high-memory chips like H200, B300 or MI355X, and increasingly disaggregated prefill so long prompts stop stalling interactive decode.',
    sections: [
      {
        heading: 'What breaks at 100K-plus tokens',
        paragraphs: [
          'Three pressures arrive together. Prefill compute: attention over long inputs is expensive, so time-to-first-token stretches from milliseconds toward minutes unless the architecture is sparse or the prompt is cached. KV residency: each session’s cache grows with context and is re-read every decoded token, taxing both capacity and bandwidth. Scheduling: one million-token prefill can stall a whole batch of interactive decodes, which is the problem chunked prefill and disaggregation exist to solve.',
          'Model architecture is the first-order response: hybrid and compressed attention designs, sliding windows, and latent KV give modern flagships 10 to 100x lighter long-context footprints than their predecessors, DeepSeek V4 needing about 27% of prior FLOPs and 10% of prior KV at 1M tokens.',
        ],
      },
      {
        heading: 'Hardware and engine choices that matter',
        paragraphs: [
          'Memory capacity per chip is the binding spec: after weights, the free HBM on 141 GB H200s, 268 GB B300s and 288 GB MI355Xs is what holds sessions resident, and the AgentX B200 versus B300 comparison shows the bigger-memory part winning precisely as the KV working set grows. Rack-scale NVL72 pools memory across 72 GPUs and adds NVLink-speed KV transfer for disaggregated serving, the measured winner at high interactivity on long-context agentic traffic.',
          'On engines: prefix caching is non-negotiable for multi-turn long contexts, chunked prefill keeps interactivity stable while long prompts process, KV offload extends capacity into host memory at latency cost, and disaggregated prefill/decode separates the two phases onto suited hardware. All four are recipe parameters the benchmarks vary explicitly.',
        ],
      },
      {
        heading: 'Economics of the long tail',
        paragraphs: [
          'Price long-context traffic by tokens processed, not tokens generated: a 500K-token input that produces a 500-token answer is a prefill workload, and its cost lives in compute and cache decisions made before the first output token. Cached-input pricing exists because prefix hits skip that work entirely; uncached long prompts are among the most expensive requests in production, and capacity plans should treat them as their own traffic class.',
        ],
      },
    ],
    faq: [
      {
        question: 'Which GPUs are best for long-context serving?',
        answer:
          'High free-memory-after-weights parts: H200 for mid-size models, B300 and MI355X for frontier MoE, and GB300 NVL72 when pooled rack memory and disaggregation pay. Bandwidth matters alongside capacity, since resident KV is re-read every decoded token.',
      },
      {
        question: 'Why is time-to-first-token so slow with long prompts?',
        answer:
          'The whole prompt must run through prefill before any output. Without prefix-cache hits, a hundred-thousand-token prompt is billions of attention operations, so TTFT stretches into seconds. Chunked prefill, cached prefixes and disaggregated prefill hardware are the standard mitigations.',
      },
      {
        question: 'Does 1M-token context actually work in production?',
        answer:
          'On architectures designed for it, yes: models like DeepSeek V4 ship native 1M context with sparse attention that keeps FLOPs and KV manageable, and engines serve it with chunked prefill and offload. The economics still reward keeping typical sessions far below the maximum.',
      },
    ],
    keywords: [
      'long context LLM serving',
      '1M token context inference',
      'long context hardware requirements',
      '100K context LLM',
      'long prompt latency',
      'disaggregated prefill',
      'long context cost',
      'million token context GPU',
    ],
    relatedGuideSlugs: [
      'kv-cache-memory-requirements',
      'best-hardware-for-agentic-coding',
      'gpu-memory-requirements-for-llms',
      'rack-scale-vs-single-node-inference',
    ],
    relatedChipSlugs: ['h200', 'b300', 'mi355x', 'gb300-nvl72'],
    relatedGlossarySlugs: [
      'chunked-prefill',
      'prefix-caching',
      'kv-cache-offload',
      'sparse-attention',
      'time-to-first-token',
    ],
    articleSlugs: [DEEPSEEK_V4, AGENTX_DSV4_B200_B300, AGENTX_DSV4_GB200_GB300, AGENTIC_WORKLOADS],
  },
  {
    slug: 'llm-throughput-vs-latency',
    title: 'LLM Throughput vs Latency: Choosing an Interactivity Target',
    category: 'Capacity planning',
    description:
      'The throughput-latency trade-off that governs LLM serving economics: how interactivity targets set cost per token, and how to pick a target per product.',
    quickAnswer:
      'Every LLM deployment sits on a throughput-latency frontier: batch more requests together and each GPU produces more total tokens per second, but each user receives theirs slower. Choosing an interactivity target, tokens per second per user, is therefore a pricing decision: the same hardware can differ several-fold in cost per token between a 20 and a 100 tokens-per-second target. Pick the slowest interactivity your product genuinely needs, then compare hardware only at that target.',
    sections: [
      {
        heading: 'Why the trade-off exists',
        paragraphs: [
          'Decode is memory-bandwidth-bound: each step re-reads weights and KV for every request in the batch. Large batches amortize those reads across many users, raising total throughput while stretching each user’s time between tokens. The resulting curve of per-GPU throughput versus per-user interactivity is the Pareto frontier that InferenceX publishes for every model, chip and engine configuration, and no single point on it is "the" performance of the system.',
          'This is also why single-number benchmark claims mislead: a chip quoted at maximum batch throughput and a chip quoted at low-latency operation are being measured at different points on their curves. Iso-interactivity comparison, same user experience on both sides, is the only fair frame.',
        ],
      },
      {
        heading: 'Picking a target per product',
        paragraphs: [
          'Interactive chat reads well at 20 to 50 tokens per second per user, faster than most humans read. Coding agents and reasoning chains justify 50 to 150-plus because users wait on multi-turn loops where every second compounds, and ultra-high-interactivity serving beyond that is its own engineering discipline with disaggregation and speculative decoding. Batch and offline pipelines have no interactivity floor at all and should buy the far end of the curve, where cost per token is lowest.',
          'Segmenting traffic by tier is the mature pattern: premium interactive traffic on low-latency recipes, background summarization on saturated batch capacity, each priced from its own point on the frontier rather than one blended average.',
        ],
      },
      {
        heading: 'Comparing hardware honestly',
        paragraphs: [
          'Fix the interactivity, then compare tokens per GPU and cost per million tokens across chips and engines at that fixed target. Rankings genuinely change along the curve: rack-scale disaggregated systems shine at strict targets, while high-memory single nodes often win the loose-target end per dollar. The dashboard’s fixed-tier readouts (30, 50, 75, 100 tokens per second) exist so those comparisons stay matched.',
        ],
      },
    ],
    faq: [
      {
        question: 'What is interactivity in LLM benchmarks?',
        answer:
          'Tokens per second delivered per user, the steady-state generation speed one request experiences. It is the x-axis of serving Pareto frontiers: total per-GPU throughput on the y-axis falls as the per-user target rises, and every deployment implicitly chooses a point on that curve.',
      },
      {
        question: 'How much does stricter latency cost?',
        answer:
          'Several-fold is normal: pushing from a relaxed batch regime to 100 tokens per second per user can cut per-GPU throughput by 3 to 10x on the same hardware, raising cost per token proportionally. That multiplier is the real price of premium responsiveness.',
      },
      {
        question: 'What is a good tokens-per-second target for chat?',
        answer:
          'Around 20 to 50 tokens per second per user: comfortably above human reading speed with smooth streaming. Paying for more rarely improves perceived chat quality, while agents and reasoning products have legitimate reasons to buy 100-plus.',
      },
    ],
    keywords: [
      'LLM throughput vs latency',
      'interactivity target LLM',
      'tokens per second per user',
      'batch size latency tradeoff',
      'LLM serving Pareto frontier',
      'iso-interactivity comparison',
      'LLM latency optimization',
      'inference batching tradeoff',
    ],
    relatedGuideSlugs: [
      'what-is-a-good-tokens-per-second',
      'llm-inference-cost-per-million-tokens',
      'speculative-decoding-in-production',
      'how-to-benchmark-llm-inference',
    ],
    relatedChipSlugs: ['b200', 'gb200-nvl72', 'mi355x', 'h200'],
    relatedGlossarySlugs: [
      'interactivity',
      'pareto-frontier',
      'iso-interactivity',
      'batching',
      'time-per-output-token',
    ],
    articleSlugs: [INFERENCEMAX, TILERT, INFERENCEX_V2],
  },
  {
    slug: 'how-to-benchmark-llm-inference',
    title: 'How to Benchmark LLM Inference: Methodology That Holds Up',
    category: 'Benchmarking methodology',
    description:
      'How to benchmark LLM inference credibly: full concurrency sweeps, iso-interactivity comparison, warmed caches, matched precision, and continuous re-measurement.',
    quickAnswer:
      'A credible LLM inference benchmark fixes the model, sequence shape and precision, sweeps concurrency to trace the full throughput-versus-interactivity frontier, warms caches before measuring, and reports configuration completely enough to reproduce. Single-point results are the cardinal sin: every serious comparison happens at matched interactivity. And because engines improve weekly, a benchmark is a time series, not a report.',
    sections: [
      {
        heading: 'The core methodology',
        paragraphs: [
          'Hold the workload constant: same model checkpoint, same input and output sequence lengths, same precision recipe on every system under test, or the comparison is between workloads, not systems. Then sweep concurrency from single-request to saturation, recording per-user interactivity and per-GPU throughput at each step: the resulting Pareto frontier is the benchmark result. Warm up first, since compilation, cache population and memory allocators distort cold measurements.',
          'Report everything that moves the number: engine version, parallelism strategy, KV precision, speculative settings, and hardware topology. InferenceX publishes exact configurations and logs for every run because a benchmark you cannot reproduce is an anecdote.',
        ],
      },
      {
        heading: 'The mistakes that invalidate results',
        paragraphs: [
          'Comparing at different interactivity is the classic: one system quoted at batch saturation versus another at moderate load produces a meaningless ratio. Other invalidators include mismatched precision (FP4 versus FP8 is a precision comparison, not a hardware one), unstated prefix-cache hits inflating prefill numbers, tiny fixed batches that never saturate large chips, and benchmarking one moment of fast-moving software: MI355X DeepSeek throughput moved 110x in 26 days, so publication-day numbers describe history, not the present.',
          'Agentic traffic adds another layer: fixed-sequence sweeps miss KV working-set pressure, prefix reuse and bursty tool-call timing entirely, which is why AgentX replays real session structure with deterministic synthetic tokens instead of independent requests.',
        ],
      },
      {
        heading: 'Benchmarking as infrastructure',
        paragraphs: [
          'The durable answer to software velocity is continuous measurement: rerun the full matrix on every engine release, keep history so regressions surface, and publish methodology so results survive scrutiny. That is InferenceX’s design: daily automated sweeps across models, chips, engines and precisions, with every claim traceable to a dated run and configuration.',
        ],
      },
    ],
    faq: [
      {
        question: 'What metrics should an LLM inference benchmark report?',
        answer:
          'Per-GPU throughput across a concurrency sweep, per-user interactivity, time-to-first-token, cost per million tokens at stated rates, and energy per token where measurable, each tied to a complete configuration. Any single number without its interactivity condition is unusable.',
      },
      {
        question: 'How long should benchmark runs be?',
        answer:
          'Long enough to pass warmup and reach steady state at each concurrency step, typically minutes per point rather than seconds. Cold-start artifacts, compilation and cache population routinely distort short runs by large factors.',
      },
      {
        question: 'Why do published benchmarks disagree so often?',
        answer:
          'Different interactivity points, precisions, sequence shapes, engine versions and cache conditions, usually undisclosed. Two honest measurements of the same hardware can differ several-fold through configuration alone, which is why full-disclosure methodology and matched comparisons matter more than the numbers.',
      },
    ],
    keywords: [
      'how to benchmark LLM inference',
      'LLM benchmark methodology',
      'inference benchmarking guide',
      'GPU benchmark best practices',
      'LLM performance testing',
      'concurrency sweep benchmark',
      'reproducible AI benchmarks',
      'inference benchmark mistakes',
    ],
    relatedGuideSlugs: [
      'llm-throughput-vs-latency',
      'what-is-a-good-tokens-per-second',
      'best-gpu-for-llm-inference',
      'how-to-choose-an-llm-serving-engine',
    ],
    relatedChipSlugs: ['b200', 'mi355x', 'h100'],
    relatedGlossarySlugs: [
      'pareto-frontier',
      'iso-interactivity',
      'warmup',
      'concurrency',
      'closed-loop-benchmark',
    ],
    articleSlugs: [INFERENCEMAX, AGENT_BENCHMARK, MI355X_DSV4, INFERENCEX_V2],
  },
  {
    slug: 'what-is-a-good-tokens-per-second',
    title: 'What Is a Good Tokens per Second for LLM Inference?',
    category: 'Benchmarking methodology',
    description:
      'What counts as good tokens per second: per-user speed targets for chat, agents and batch work, per-GPU throughput ranges on current hardware, and how to read the two together.',
    quickAnswer:
      'Separate the two meanings first: per-user tokens per second is an experience target, where 20 to 50 satisfies chat, 50 to 150 suits coding agents, and batch work needs none, while per-GPU tokens per second is an economics number that ranges from hundreds to tens of thousands depending on model size, chip and how strict the per-user target is. A good number is one measured at your model, your hardware and your interactivity, against the live frontier.',
    sections: [
      {
        heading: 'Per-user speed: what feels fast',
        paragraphs: [
          'Humans read 5 to 15 tokens per second, so 20 to 50 tokens per second per user streams comfortably ahead of reading for chat. Reasoning models and coding agents change the calculus: users wait on whole chains and multi-turn loops rather than reading along, so 50 to 150-plus per user is the norm InferenceX observes as serving targets for agentic products, and ultra-high-interactivity serving in the several-hundreds exists for latency-critical products willing to pay for it.',
          'Time-to-first-token matters alongside steady-state speed: a response that streams fast but starts after ten seconds still feels broken, which is why benchmarks report TTFT separately from per-token cadence.',
        ],
      },
      {
        heading: 'Per-GPU throughput: what the hardware should deliver',
        paragraphs: [
          'Per-GPU output spans orders of magnitude legitimately. A frontier trillion-parameter MoE served at strict interactivity might produce hundreds to a few thousand tokens per second per GPU, while the same chip on a small dense model at relaxed targets produces tens of thousands. Chip, engine, precision and parallelism each move the figure: measured recipes have shifted it 1.8x in one engine release and 3x from rack-scale wide expert parallelism at matched settings.',
          'So there is no universal good number, but there is always a current best number for your exact configuration, and that is what a live Pareto frontier gives you: if your deployment sits meaningfully below the measured frontier at your interactivity, the gap is recoverable performance.',
        ],
      },
      {
        heading: 'Using the two numbers together',
        paragraphs: [
          'Set the per-user target from product needs, read achievable per-GPU throughput at that target off the live benchmarks for your candidate hardware, and divide demand by it for fleet size. Then track your production ratio against the frontier over time, since engine releases raise the ceiling monthly, and a fleet that never re-tunes quietly falls to a fraction of the throughput its hardware now supports.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is 50 tokens per second fast for an LLM?',
        answer:
          'Per user, yes for chat: it is several times human reading speed and streams smoothly. For coding agents it is a reasonable floor rather than fast, and per GPU it would be very poor for any modern chip, which shows why the per-user and per-GPU meanings must never be mixed.',
      },
      {
        question: 'How many tokens per second does a modern GPU produce?',
        answer:
          'From hundreds to tens of thousands per GPU depending on model size, precision, engine and the per-user latency target, spanning two orders of magnitude on the same silicon. The live dashboards publish measured values per configuration, which beats any static answer.',
      },
      {
        question: 'Why does my deployment produce fewer tokens per second than benchmarks?',
        answer:
          'Usually stricter effective latency, lower concurrency than saturation, older engine versions, or unwarmed caches. Compare your configuration against the matching benchmark recipe line by line: the frontier is reproducible, and gaps almost always trace to a named setting.',
      },
    ],
    keywords: [
      'good tokens per second LLM',
      'tokens per second benchmark',
      'LLM speed comparison',
      'tokens per second per user',
      'GPU tokens per second',
      'LLM generation speed',
      'how fast should LLM be',
      'token throughput target',
    ],
    relatedGuideSlugs: [
      'llm-throughput-vs-latency',
      'how-to-benchmark-llm-inference',
      'best-gpu-for-llm-inference',
      'speculative-decoding-in-production',
    ],
    relatedChipSlugs: ['b200', 'h200', 'mi355x'],
    relatedGlossarySlugs: [
      'interactivity',
      'throughput',
      'time-to-first-token',
      'time-per-output-token',
      'e2e-normalized-interactivity',
    ],
    articleSlugs: [INFERENCEMAX, TILERT, AGENTX_GLM_SGLANG, SGLANG_056],
  },
] as const satisfies readonly GuideEntry[];

export type GuideSlug = (typeof entries)[number]['slug'];

export function getAllGuides(): readonly GuideEntry[] {
  return entries;
}

export function getGuide(slug: string): GuideEntry | undefined {
  return entries.find((entry) => entry.slug === slug);
}

/** Related guides in the order listed on the entry; unknown slugs throw in tests. */
export function getRelatedGuides(entry: GuideEntry): readonly GuideEntry[] {
  return entry.relatedGuideSlugs.flatMap((slug) => {
    const related = getGuide(slug);
    return related ? [related] : [];
  });
}

/** Previous/next guide in catalog order, for footer navigation on detail pages. */
export function getAdjacentGuides(slug: string): {
  previous: GuideEntry | undefined;
  next: GuideEntry | undefined;
} {
  const index = entries.findIndex((entry) => entry.slug === slug);
  if (index === -1) return { previous: undefined, next: undefined };
  return {
    previous: index > 0 ? entries[index - 1] : undefined,
    next: index < entries.length - 1 ? entries[index + 1] : undefined,
  };
}

/** Guides grouped by category in GUIDE_CATEGORIES order, for the index page. */
export function getGuidesByCategory(): readonly {
  category: GuideCategory;
  guides: readonly GuideEntry[];
}[] {
  return GUIDE_CATEGORIES.map((category) => ({
    category,
    guides: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.guides.length > 0);
}
