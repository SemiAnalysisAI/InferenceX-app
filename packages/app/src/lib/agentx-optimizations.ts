/**
 * AgentX industry impact — the upstream optimization work that AgentX traces
 * drove across inference engines, routers, KV-cache layers, and kernels.
 *
 * English content lives here; the Simplified Chinese port is a 1:1 mirror in
 * `agentx-optimizations-zh.ts`, keyed by the same slugs and section ids.
 * `agentx-optimizations.test.ts` enforces that the two stay structurally
 * identical, so a section added here without a translation fails CI.
 *
 * Every claim links to the upstream pull request it came from. Sections list
 * PRs as `{ repo, number }` rather than prose links so the reference survives
 * translation unchanged — a PR number is an identifier, not copy.
 */

/** Where a project sits in the serving stack; drives the index-page grouping. */
export const OPTIMIZATION_LAYERS = ['engine', 'router', 'kv-cache', 'kernels', 'transfer'] as const;

export type OptimizationLayer = (typeof OPTIMIZATION_LAYERS)[number];

/** Upstream repositories referenced by this page, with their display names. */
export const PR_REPOS = {
  'vllm-project/vllm': 'vLLM',
  'sgl-project/sglang': 'SGLang',
  'NVIDIA/TensorRT-LLM': 'TensorRT-LLM',
  'ROCm/ATOM': 'ATOM',
  'ROCm/aiter': 'AITER',
  'ai-dynamo/dynamo': 'Dynamo',
  'LMCache/LMCache': 'LMCache',
  'kvcache-ai/Mooncake': 'Mooncake',
} as const;

export type PrRepo = keyof typeof PR_REPOS;

export interface UpstreamPr {
  repo: PrRepo;
  number: number;
}

export function prUrl(pr: UpstreamPr): string {
  return `https://github.com/${pr.repo}/pull/${pr.number}`;
}

export function prLabel(pr: UpstreamPr): string {
  return `${PR_REPOS[pr.repo]} #${pr.number}`;
}

/** Figures exported from the source deck, served from /public. */
export const OPTIMIZATION_FIGURES = {
  servingStack: {
    src: '/images/agentx-optimizations/serving-stack.png',
    width: 1814,
    height: 2048,
  },
  vllmSelectiveRetention: {
    src: '/images/agentx-optimizations/vllm-selective-retention.png',
    width: 2048,
    height: 632,
  },
  vllmConnectorLayer: {
    src: '/images/agentx-optimizations/vllm-connector-layer.png',
    width: 2048,
    height: 837,
  },
  sglangHiCacheAsymmetry: {
    src: '/images/agentx-optimizations/sglang-hicache-asymmetry.png',
    width: 2048,
    height: 720,
  },
  sglangRadixStaging: {
    src: '/images/agentx-optimizations/sglang-radix-staging.png',
    width: 2048,
    height: 544,
  },
  trtllmPipelinedTransfer: {
    src: '/images/agentx-optimizations/trtllm-pipelined-transfer.png',
    width: 2048,
    height: 769,
  },
  atomPrefixPromotion: {
    src: '/images/agentx-optimizations/atom-prefix-promotion.png',
    width: 2048,
    height: 420,
  },
  aiter64BitOffsets: {
    src: '/images/agentx-optimizations/aiter-64bit-offsets.png',
    width: 1408,
    height: 1046,
  },
  dynamoOwnershipTable: {
    src: '/images/agentx-optimizations/dynamo-ownership-table.png',
    width: 2048,
    height: 576,
  },
  lmcacheTiers: {
    src: '/images/agentx-optimizations/lmcache-tiers.png',
    width: 2048,
    height: 638,
  },
} as const;

export type OptimizationFigureKey = keyof typeof OPTIMIZATION_FIGURES;

export interface OptimizationFigureCopy {
  alt: string;
  caption: string;
}

export interface ReferenceLink {
  label: string;
  href: string;
}

export interface OptimizationSection {
  /** Stable anchor id, used for in-page navigation and as the translation key. */
  id: string;
  heading: string;
  paragraphs: readonly string[];
  figure?: { key: OptimizationFigureKey } & OptimizationFigureCopy;
  prs?: readonly UpstreamPr[];
  links?: readonly ReferenceLink[];
}

export interface OptimizationHighlight {
  value: string;
  label: string;
}

export interface OptimizationFramework {
  /** URL segment: /agentx/optimizations/<slug>. */
  slug: string;
  /** Product name — never translated. */
  name: string;
  layer: OptimizationLayer;
  /** One-line description used on the index card and in page metadata. */
  summary: string;
  /** Intro rendered above the first section on the detail page. */
  lead: string;
  highlights: readonly OptimizationHighlight[];
  sections: readonly OptimizationSection[];
}

export interface OptimizationsOverview {
  eyebrow: string;
  title: string;
  lead: string;
  intro: readonly string[];
  highlights: readonly OptimizationHighlight[];
  frameworksTitle: string;
  frameworksIntro: string;
  sections: readonly OptimizationSection[];
  layerLabels: Readonly<Record<OptimizationLayer, string>>;
  /** Shared UI strings for both the index and the detail pages. */
  ui: {
    backToAgentX: string;
    backToOverview: string;
    prsLabel: string;
    referencesLabel: string;
    readMore: string;
    onThisPage: string;
    allProjects: string;
    figureCta: string;
    prSearch: string;
  };
}

export const OPTIMIZATIONS_OVERVIEW: OptimizationsOverview = {
  eyebrow: 'AgentX industry impact',
  title: 'Optimizations for Agentic Workloads',
  lead: 'The most useful thing AgentX produced in its first months was not the open-source datasets. It was 50+ upstream pull requests from AgentX partners, optimizing real-world agentic workloads with AgentX as the north star.',
  intro: [
    'AgentX replays real agentic traffic, so it benchmarks more than raw prefill and decode kernels. It exercises the whole path end to end: KV-cache lifecycle, hybrid-attention cache correctness, CPU KV offload, transfer progress, routing affinity, incremental tokenization, request serialization, and scheduler bookkeeping. Every one of those costs is already paid by every production agentic deployment, and none of them is visible in a single-turn 8k/1k scenario.',
    'SemiAnalysis has also worked with AMD software development over several years to modernize their development principles. Much of the work below is the result, and it moves AMD open source closer to first-class support for agentic workloads.',
  ],
  highlights: [
    { value: '50+', label: 'upstream PRs' },
    { value: '8', label: 'upstream projects' },
    { value: '5', label: 'layers of the stack' },
    { value: 'AgentX', label: 'the north star trace' },
  ],
  frameworksTitle: 'Optimizations by project',
  frameworksIntro:
    'Each page collects the AgentX-driven work in one project, grouped by the part of the stack it touches. Changes described as open are proposed but not merged, and are not shipped behavior.',
  sections: [
    {
      id: 'ecosystem',
      heading: 'A brief introduction to the distributed inference ecosystem',
      paragraphs: [
        'Agentic inference is a system-wide problem rather than a chip or kernel problem. Once a distributed system handles hundreds of thousands of agentic requests, request scheduling and KV-cache management stop being bookkeeping and start having legitimate performance implications. Subagents, for example, produce bursty KV-cache patterns that will evict the main agent’s cache if nothing prevents it.',
        'At the top of the stack, routers — sometimes called frontends — send requests to workers. When a server runs data-parallel attention there is a separate KV cache per DP rank, so requests are routed under policies such as consistent hashing, where every request in the same session or subagent follows its unique ID to the same rank rather than thrashing all of them.',
        'Most routing policies do not differ much between implementations. Some routers are separate components, such as the vLLM router and the llm-d router; others are integrated into the engine, such as the SGLang model gateway and ATOM Mesh.',
        'After routing, a request reaches the scheduler of an inference engine such as vLLM or SGLang. The engine performs the inference and returns the result over an API. Each engine also exposes an interface connecting its internal KV cache to external KV-cache managers, which is what makes the ecosystem pluggable: one cache manager can integrate with many engines.',
        'The simple deployment used in the current AgentX results runs Mooncake alongside vLLM on the same node. Each vLLM worker embeds a Mooncake Store client and contributes part of host DRAM to the external KV-cache pool. vLLM reaches that pool through the MooncakeStoreConnector interface, which loads reusable KV blocks into GPU memory and saves newly computed blocks back to host memory. Mooncake Store handles placement and eviction; Mooncake Transfer Engine moves the bytes between GPU and CPU memory.',
        'Different KV-cache managers use different transfer engines to move bytes between memory tiers or machines, such as between prefill and decode workers. A deployment can use Mooncake Store to offload reusable KV blocks to host DRAM while simultaneously using NIXL to move request-specific KV directly from prefill GPUs to decode GPUs, with NIXL using UCX and GPUDirect RDMA where supported. Multiple KV-management and transfer paths can coexist inside one inference engine.',
        'The ecosystem is made of many independent components: inference engines, routers, KV-cache managers, data-transfer libraries, and cluster controllers. Platforms such as NVIDIA Dynamo, llm-d, and AMD Infera package selected combinations into complete distributions, publishing compatible container images, connectors, deployment manifests, and orchestration logic. The result is usually a set of coordinated containers rather than one monolithic service.',
      ],
      figure: {
        key: 'servingStack',
        alt: 'Five-layer diagram of the distributed inference stack: routing and frontend layer, inference engines, KV-cache management layer, data movement layer, and accelerators with tiered storage.',
        caption:
          'The distributed inference stack. Each layer has several interchangeable implementations, and platforms such as Dynamo, llm-d, and AMD Infera package selected combinations into one distribution.',
      },
      links: [
        {
          label: 'Consistent-hash routing policy',
          href: 'https://github.com/vllm-project/router/blob/main/src/policies/consistent_hash.rs',
        },
        { label: 'vLLM router', href: 'https://github.com/vllm-project/router' },
        { label: 'llm-d router', href: 'https://github.com/llm-d/llm-d-router' },
        {
          label: 'SGLang model gateway',
          href: 'https://github.com/sgl-project/sglang/tree/main/sgl-model-gateway',
        },
        { label: 'ATOM Mesh', href: 'https://github.com/ROCm/ATOM/tree/main/atom/mesh' },
        {
          label: 'Mooncake Transfer Engine',
          href: 'https://github.com/kvcache-ai/Mooncake/tree/main/mooncake-transfer-engine',
        },
      ],
    },
    {
      id: 'other',
      heading: 'Other optimizations: day-zero enablement and correctness',
      paragraphs: [
        'The work collected on the project pages addresses long-context cost: a prefix that has to survive, a hybrid cache that has to stay correct, a transfer that has to keep up. The changes here are different in kind. They are day-zero enablement and correctness bugs, and they break a request exactly as badly as a million-token session does.',
        'MiniMax-M3 tested whether the ROCm work compounds into day-zero readiness, and the Advancing AI writeup draws the comparison directly: AMD’s first public disaggregated recipe, MI355X FP4, reached InferenceX in January, months behind NVIDIA, while M3 FP4 disaggregation landed on day zero. That is a marked improvement on the DeepSeek-R1 period, when parity took months. Three vLLM fixes sat on the day-zero path, and each was a correctness failure rather than a performance one.',
        'Disaggregation was blocked first. NixlConnector’s handshake asserted that the SPLIT-region block_len scales with the prefill-to-decode TP ratio, but block_len follows per-rank KV heads. M3 has 4 KV heads, so a TP4 prefill paired with a TP8 decode is GQA-capped to one head per rank on both sides, and the two lengths are equal where the assertion demanded a factor of two. The handshake was rejected, no KV moved, decode regenerated everything from scratch, and gsm8k scored 0. Validating against the actual head ratio fixed it.',
        'The other two were platform splits. M3’s sparse-attention backend read the byte-backed FP8 cache as float8_e4m3fn for every E4M3 configuration, but gfx942’s platform dtype is e4m3fnuz. The two encodings differ, so K and V were altered before the kernels consumed them, and the prefill and decode wrappers had also omitted the FNUZ types from their FP8 checks. Using the platform dtype for the cache view fixed both halves. Separately, M3 ships as separate NVIDIA and AMD model files and only the NVIDIA one implemented the EAGLE3 interface, so speculative decoding aborted at engine init on ROCm with a model-does-not-support error. Bringing the AMD model to parity restored it, with MI355X gsm8k matching both the non-EAGLE3 MI355X run and B200.',
        'The TensorRT-LLM page covers the M3 work that is long-context specific: descriptor explosion in disaggregated KV transfer, context graph capture, sparse block strides, autotuner candidates, and the corrupt split-K MoE tactics that had to be removed from the pool.',
      ],
      prs: [
        { repo: 'vllm-project/vllm', number: 45879 },
        { repo: 'vllm-project/vllm', number: 45720 },
        { repo: 'vllm-project/vllm', number: 45546 },
      ],
      links: [
        {
          label: 'Can AMD break the CUDA moat? — Advancing AI',
          href: 'https://newsletter.semianalysis.com/p/can-amd-break-the-cuda-moat-amd-advancing',
        },
      ],
    },
    {
      id: 'what-activates-this',
      heading: 'What the AgentX matrix activates',
      paragraphs: [
        'The local AgentX matrix combines session-aware or KV-aware routing, long and variable conversation histories, MTP, hybrid attention, aggregated and disaggregated serving, and concurrency sweeps that cross the HBM capacity cliff. It includes GPU-resident comparisons as well as CPU DRAM offload through vLLM SimpleCPU, Mooncake, LMCache, and SGLang HiCache. That combination is what activates the upstream work above.',
        'The old fixed-sequence matrix usually creates one prompt, performs one prefill, decodes one fixed continuation, and discards the request. It therefore does not measure cache survival across turns, repeated tokenization, session affinity, cache-event traffic, offload churn, transfer progress during scheduler stalls, or long-lived ownership bookkeeping.',
        'The allowed optimization policy treats CPU KV offload as optional. A vendor may use vLLM connectors, LMCache, SGLang HiCache, Mooncake, Dynamo KVBM, or another CPU DRAM connector — or disable offload when the resulting latency and throughput point is better. NVMe offload is deferred. CPU DRAM must scale with the fraction of GPUs used, including the 3 TB cap for systems without standardized DRAM. Systems with standardized DRAM have no hard cap but keep the same proportionality rule; the local generator currently applies the 3 TB cap to every runner, so it does not yet implement the standardized-DRAM exception.',
        'The net new optimization surface is not simply longer attention. It is the preservation, movement, routing, reconstruction, and repeated processing of a growing session state. AgentX made those costs large enough to drive generic upstream changes across vLLM, SGLang, TensorRT-LLM, ATOM, AITER, Dynamo, and LMCache. Direct searches of NIXL and Mooncake did not identify additional AgentX-tagged runtime PRs beyond those listed here, so their effects remain represented through the engine connector changes.',
      ],
      links: [
        {
          label: 'Every upstream PR mentioning AgentX',
          href: 'https://github.com/search?q=agentx&type=pullrequests&s=created&o=desc',
        },
      ],
    },
  ],
  layerLabels: {
    engine: 'Inference engine',
    router: 'Router and orchestration',
    'kv-cache': 'KV-cache layer',
    kernels: 'Kernels',
    transfer: 'Transfer engine',
  },
  ui: {
    backToAgentX: '← Back to AgentX',
    backToOverview: '← All AgentX optimizations',
    prsLabel: 'Upstream pull requests',
    referencesLabel: 'References',
    readMore: 'Read the optimizations',
    onThisPage: 'On this page',
    allProjects: 'Other projects',
    figureCta: 'View full-resolution image',
    prSearch: 'Search every AgentX pull request',
  },
};

const FRAMEWORKS: readonly OptimizationFramework[] = [
  {
    slug: 'vllm',
    name: 'vLLM',
    layer: 'engine',
    summary:
      'Hybrid-attention prefix retention, CPU KV offload for hybrid models, and a narrowed store and load path.',
    lead: 'Working alongside vLLM maintainers from Inferact, Red Hat, NVIDIA, and AMD, we used AgentX’s realistic replayer as a north star. The resulting fixes landed upstream, and most of them transfer directly to production.',
    highlights: [
      { value: '>95%', label: 'prefix-cache hit rate at 1M context' },
      { value: '+81.7%', label: 'output throughput with hybrid CPU offload' },
      { value: '−46.6%', label: 'mean end-to-end latency' },
    ],
    sections: [
      {
        id: 'hybrid-prefix-caching',
        heading: 'Hybrid-attention prefix caching',
        paragraphs: [
          'vLLM improved hybrid-attention prefix caching so short-lived sliding-window allocations do not evict useful long-context checkpoints. Selective retention preserves sparse replay boundaries and reported a prefix-cache hit rate above 95% with fourteen concurrent requests and contexts up to one million tokens.',
          'The same reachability policy was applied to Mooncake, and unreachable sliding-window lookups were removed. Earlier follow-up work also stopped offloading sliding-window blocks that could never be reused, and kept the speculative lookahead block inside the retained prefix.',
        ],
        figure: {
          key: 'vllmSelectiveRetention',
          alt: 'Before and after diagram: without retention every sliding-window tail is freed and the whole prefix must be recomputed; with selective retention a few checkpoints survive so the prefix stays reusable.',
          caption:
            'Before, no window tail survives, so no position is resumable and the full-attention KV is resident but unusable. After selective retention, a few tails survive and the prefix-cache hit rate exceeds 95%.',
        },
        prs: [
          { repo: 'vllm-project/vllm', number: 43447 },
          { repo: 'vllm-project/vllm', number: 44774 },
          { repo: 'vllm-project/vllm', number: 45444 },
          { repo: 'vllm-project/vllm', number: 42258 },
          { repo: 'vllm-project/vllm', number: 44082 },
        ],
      },
      {
        id: 'cpu-offload',
        heading: 'CPU KV offload for hybrid models',
        paragraphs: [
          'Highly concurrent agentic workloads require offload, and AgentX drove the work that made CPU KV offload usable for hybrid models rather than only for uniform full-attention models. The distinction matters: a uniform model has one KV layout per token, so a connector can describe what to save with a single block geometry. A hybrid model carries several cache groups at once, each with a different shape and a different lifetime, and a connector that assumes one uniform layout cannot express which group a given block belongs to. Offload was therefore unavailable for exactly the models whose long sessions needed it most.',
          'The general SimpleCPU connector came first, was enabled on ROCm, and was then extended to DeepSeek-V4 hybrid attention, which reported 81.7% higher output throughput and 46.6% lower mean end-to-end latency against recomputing the prefix once it no longer fits in HBM. Mooncake gained the equivalent hybrid-memory allocation support.',
        ],
        prs: [
          { repo: 'vllm-project/vllm', number: 37160 },
          { repo: 'vllm-project/vllm', number: 40549 },
          { repo: 'vllm-project/vllm', number: 42296 },
          { repo: 'vllm-project/vllm', number: 42828 },
        ],
      },
      {
        id: 'store-path',
        heading: 'Narrowing the store path',
        paragraphs: [
          'Profiling realistic workloads showed that once offload worked at all, the cost moved to the store path, which was writing too much and too often. Three rules narrowed it.',
          'A store is now skipped while an identical transfer is already in flight, so concurrent sessions sharing a prefix pay for it once rather than once each. A store covers only newly generated KV ranges, so a session that extends its history writes the delta instead of rewriting the whole prefix every turn. And a store no longer depends on whether the same blocks still sit in HBM, so work already scheduled is not discarded when an eviction lands underneath it.',
        ],
        figure: {
          key: 'vllmConnectorLayer',
          alt: 'Diagram of the vLLM connector layer between GPU HBM and a CPU DRAM pool, listing the connector PRs and the three store-side rules that narrow writes.',
          caption:
            'The connector layer between GPU HBM and the CPU DRAM pool. Store-side rules skip in-flight duplicates, write only newly generated KV, and decouple the store from whether the blocks still sit in HBM; the scheduler-side lookup is asynchronous.',
        },
        prs: [
          { repo: 'vllm-project/vllm', number: 41289 },
          { repo: 'vllm-project/vllm', number: 46412 },
          { repo: 'vllm-project/vllm', number: 46906 },
        ],
      },
      {
        id: 'load-path',
        heading: 'Keeping lookups off the critical path',
        paragraphs: [
          'The load path was tuned separately, because lookups happen on every scheduling decision rather than only when data actually moves. Making lookups asynchronous in the scheduler path keeps the connector off the step’s critical path, so a step no longer waits on CPU-side cache queries before it can admit work.',
          'Compact zero-copy lookup keys, parallel receive-side loading, and prebuilt Mooncake key strings then removed the CPU and transport overhead that remained.',
        ],
        prs: [
          { repo: 'vllm-project/vllm', number: 45659 },
          { repo: 'vllm-project/vllm', number: 45969 },
          { repo: 'vllm-project/vllm', number: 45971 },
          { repo: 'vllm-project/vllm', number: 46188 },
        ],
      },
      {
        id: 'correctness',
        heading: 'Correctness and accounting under long-lived hybrid state',
        paragraphs: [
          'Long-lived hybrid state forced correctness and accounting fixes that fixed-shape requests rarely reach. vLLM now emits cache events per hybrid cache group, strides distributed-context stores correctly, and computes lookup prefixes correctly under distributed context and prefill. A related context-parallel accounting change aligns cache ownership with sharded token ranges.',
          'Speculative state is now propagated across merged Mooncake groups and through the SimpleCPU coordinator, which prevents the repeated-turn cache from silently losing EAGLE state.',
        ],
        prs: [
          { repo: 'vllm-project/vllm', number: 44103 },
          { repo: 'vllm-project/vllm', number: 45371 },
          { repo: 'vllm-project/vllm', number: 46855 },
          { repo: 'vllm-project/vllm', number: 45340 },
          { repo: 'vllm-project/vllm', number: 49069 },
          { repo: 'vllm-project/vllm', number: 49071 },
        ],
      },
      {
        id: 'rocm-decode',
        heading: 'ROCm: below the cache layer',
        paragraphs: [
          'On the ROCm side the recent work continues below the cache layer, where the remaining cost is per-layer rather than per-request. Once the prefix survives and arrives on time, what is left is the decode step itself, and a decode step that runs thousands of times per session pays for every avoidable copy and every mismatched kernel. Three open changes attack that layer.',
          'A Kimi-K3 change writes KDA decode results directly into the layer output buffer, removing one device copy per KDA layer; the saving is small in isolation and repeated for every layer of every decoded token. A second change selects an AITER sparse-MLA decode kernel in place of the generic path, and reported 5.22% higher AgentX output throughput with substantially lower inter-token latency.',
          'The third is a useful illustration of how much the measurement shape matters. A companion change routes full-graph attention projections through tuned AITER GEMMs and reached a 2.3% gain on fixed sequences at low concurrency. A kernel-level change can show a clean gain on uniform shapes and then be swamped, on an agentic trace, by the cache and scheduling variance the trace introduces.',
        ],
        prs: [
          { repo: 'vllm-project/vllm', number: 51183 },
          { repo: 'vllm-project/vllm', number: 51714 },
          { repo: 'vllm-project/vllm', number: 51713 },
        ],
      },
    ],
  },
  {
    slug: 'sglang',
    name: 'SGLang',
    layer: 'engine',
    summary:
      'Sliding-window allocation, HiCache hybrid offload, runtime-scalar context length, and cache-aware DP routing.',
    lead: 'Working alongside SGLang maintainers from RadixArk, Meta, NVIDIA, and AMD, the AgentX initiative drove optimizations for agentic workloads that also improve production serving substantially.',
    highlights: [
      { value: '+26.75%', label: 'output throughput at concurrency 384' },
      { value: '−36.25%', label: 'mean TTFT from the same change' },
      { value: '128/128', label: 'needles correct after the staging fix, from 2/128' },
    ],
    sections: [
      {
        id: 'sliding-window',
        heading: 'Sliding-window allocation',
        paragraphs: [
          'SGLang’s sliding-window work addresses the same conflict as vLLM’s retention policy, but from the allocator side. Window pages and prefix pages are drawn from one pool, and the window is the greedier consumer: it turns over constantly while the prefix sits still, so under pressure the transient allocation displaces the durable one.',
          'Three designs attack that from different angles. One proactively frees pages as they leave the window rather than waiting for eviction pressure to find them, so dead window state stops competing for pages it can no longer use. Another caps compute locks to a single window, bounding how much of the pool an in-flight request can hold pinned at once. A third removes stale full-KV entries that outlive their usefulness.',
          'Alongside those, the ROCm ring-cache fix is a correctness change rather than a capacity change: a ring buffer reuses slots by construction, and reusing one whose old contents are still referenced yields wrong output rather than slow output. None of this is visible on a single 8k prompt, where the window never laps the prefix and the pool is never contended. On a multi-turn hybrid session, these changes decide whether the expensive full-attention history is still there on the next turn.',
        ],
        prs: [
          { repo: 'sgl-project/sglang', number: 26907 },
          { repo: 'sgl-project/sglang', number: 27210 },
          { repo: 'sgl-project/sglang', number: 29369 },
          { repo: 'sgl-project/sglang', number: 30339 },
        ],
      },
      {
        id: 'hicache',
        heading: 'HiCache offload',
        paragraphs: [
          'HiCache is SGLang’s first-class in-tree offloading mechanism. It faced the same hybrid problem vLLM’s connectors did, and solved it with an asymmetry: offload the full-attention cache and reconstruct the short sliding-window tail on the way back. Only the expensive half is worth moving across the bus, and the cheap half can be rebuilt faster than it can be fetched. On AMD, staged write-back keeps that movement from blocking the engine while it happens.',
          'Recurrent state was the remaining gap, because it cannot be rebuilt from neighbouring tokens the way a window tail can. FlashInfer GDN checkpoints let it participate in prefix reuse at all, and raised throughput from 47,771 to 53,004 tok/s/GPU at a 92.4% cache-hit rate.',
        ],
        figure: {
          key: 'sglangHiCacheAsymmetry',
          alt: 'Diagram showing three kinds of state crossing from GPU HBM to CPU DRAM: full-attention KV is offloaded byte for byte, the sliding-window tail is not moved and is rebuilt on load, and recurrent state is checkpointed.',
          caption:
            'HiCache’s asymmetry. Full-attention KV is large and not reconstructible, so it crosses the bus; the window tail is cheap to rebuild and stays behind; recurrent state is small but cannot be reconstructed, so it is checkpointed.',
        },
        prs: [
          { repo: 'sgl-project/sglang', number: 29417 },
          { repo: 'sgl-project/sglang', number: 28534 },
          { repo: 'sgl-project/sglang', number: 29735 },
        ],
      },
      {
        id: 'variable-length',
        heading: 'What variable-length traffic does to a kernel pipeline',
        paragraphs: [
          'Like production traffic, AgentX sessions arrive at continuously varying context lengths. A naive runtime that specializes on length will compile a fresh kernel for nearly every request it sees. SGLang maintainers solved this by passing context length as a runtime scalar, collapsing that into one compilation, and improved AgentX output throughput at concurrency 384 by 26.75% and mean TTFT by 36.25% — by removing compilation, not by computing anything faster.',
          'In the same spirit, removing a per-step device-to-host sequence-length synchronization eliminates a decode bubble that exists only because the host wanted to know a length the device already had.',
        ],
        prs: [
          { repo: 'sgl-project/sglang', number: 30255 },
          { repo: 'sgl-project/sglang', number: 30365 },
        ],
      },
      {
        id: 'routing',
        heading: 'Cache-aware data-parallel routing',
        paragraphs: [
          'When a request carries no reusable history, such as the start of a subagent, any worker will do and load balancing is the only question worth asking. When it carries a megabyte of cached prefix, sending it to an idle worker that does not hold that prefix is the expensive choice, and the router needs to know where the state already lives.',
          'SGLang added DP cache affinity so a session is sticky to the rank holding its cache. The same work implements DP-aware prefill and decode routing so both halves of a disaggregated deployment make that decision consistently, and adds cache balance as a routing signal so affinity does not degenerate into one hot worker. A router can only act on what it is told, so hybrid cache events also became radix-cache aware and sliding-window aware.',
        ],
        prs: [
          { repo: 'sgl-project/sglang', number: 26091 },
          { repo: 'sgl-project/sglang', number: 26245 },
          { repo: 'sgl-project/sglang', number: 26293 },
          { repo: 'sgl-project/sglang', number: 26387 },
          { repo: 'sgl-project/sglang', number: 26579 },
        ],
      },
      {
        id: 'speculative',
        heading: 'Speculative decoding',
        paragraphs: [
          'Speculative decoding receives special attention, because MTP adds a second, smaller piece of per-request state that has to survive everything the main cache survives. SGLang fixed draft-window transfer in disaggregated serving so that state crosses the prefill-to-decode boundary intact, added overlap scheduling for high-concurrency online decoding, removed a no-op EAGLE renormalization, and avoided host synchronizations during EAGLE prefill.',
          'The open resource-lease scheduling work and the data-parallel graph-metadata fix continue the same effort: making overlap safe when requests can be retracted and resumed rather than simply run to completion.',
        ],
        prs: [
          { repo: 'sgl-project/sglang', number: 30461 },
          { repo: 'sgl-project/sglang', number: 30497 },
          { repo: 'sgl-project/sglang', number: 31294 },
          { repo: 'sgl-project/sglang', number: 33662 },
          { repo: 'sgl-project/sglang', number: 32042 },
          { repo: 'sgl-project/sglang', number: 32196 },
        ],
      },
      {
        id: 'staging',
        heading: 'Prefix-aware staging in heterogeneous disaggregation',
        paragraphs: [
          'Heterogeneous prefill and decode topologies need prefix-aware staging, and this is where prefix caching and disaggregation interact badly. When the two sides are not sharded identically, KV cannot be copied across as one contiguous stream; it has to be split on a transfer grid and reassembled at the offsets the decode side expects. A prefix hit makes that harder, not easier, because the prefill worker now sends only the uncached remainder while the decode side still expects a complete, correctly positioned cache. Radix-cache support in the staging buffer splits cached sends on that grid and scatters them at the correct decode offsets.',
          'The failure this fixes is a correctness failure. A 127,500-token shared-prefix test went from 2 correct needles out of 128 to 128 out of 128, meaning the cache had been silently landing in the wrong places — which a throughput benchmark would have scored as a fast, confident, wrong answer. The AgentX comparison additionally raised median per-user output throughput by 9.61% at nearly unchanged total throughput per GPU.',
          'Open work continues along the same seam: multi-pool DeepSeek-V4 support in UMBP, unified-KV HiSparse state carried over MoRI, and preserving the prefill-owned token when decode terminates without visible content. The HiSparse work should be read as a capacity and correctness enabler for long contexts rather than as a throughput win at high concurrency, which it is not yet.',
        ],
        figure: {
          key: 'sglangRadixStaging',
          alt: 'Before and after diagram of staging-buffer indexing: before, the uncached remainder lands on top of the prefix at the wrong rows; after, it is placed at the offsets after the prefix the decode side already holds.',
          caption:
            'Before, the staging index counts from zero and ignores what the decode side already holds, so the remainder overwrites the prefix. After radix-aware staging, cached sends are split on the transfer grid and scattered at the correct decode offsets.',
        },
        prs: [
          { repo: 'sgl-project/sglang', number: 30545 },
          { repo: 'sgl-project/sglang', number: 30762 },
          { repo: 'sgl-project/sglang', number: 32368 },
          { repo: 'sgl-project/sglang', number: 34216 },
        ],
      },
    ],
  },
  {
    slug: 'tensorrt-llm',
    name: 'TensorRT-LLM',
    layer: 'engine',
    summary:
      'Boundary-aware incremental tokenization, disaggregated KV descriptor coalescing, and scheduler-lifetime fixes.',
    lead: 'TensorRT-LLM’s AgentX work starts at the frontend, with a cost that exists only because the workload is multi-turn, and then follows the request down into transfer granularity, kernel selection, and scheduler lifetime.',
    highlights: [
      { value: '185.1 ms → 11.3 ms', label: 'mean tokenization time per turn' },
      { value: '26.74 s → 125 ms', label: 'request-critical KV p99 at concurrency 5' },
      { value: '+12.58%', label: 'per-user output throughput from context graphs' },
    ],
    sections: [
      {
        id: 'incremental-tokenization',
        heading: 'Boundary-aware incremental tokenization',
        paragraphs: [
          'Every turn of a conversation re-sends the entire history plus a little more, and the naive implementation re-tokenizes all of it. Tokenization is cheap per kilobyte and ruinous when the same 100,000 tokens are tokenized again on every turn.',
          'The obvious fix — tokenize only the new suffix — is wrong in a way that is easy to miss, because byte-pair encoding is not position-independent. Tokens can merge across the join, so splitting the text at the boundary and concatenating the two token sequences can produce a different sequence than tokenizing the whole string, which quietly diverges from the sequence the prefix cache was built against.',
          'TensorRT-LLM implements boundary-aware incremental tokenization, which finds the rendered-text common prefix, rolls back one complete token so any merge that spans the join is recomputed, and tokenizes only the changed suffix from there. On the Qwen3.5 AgentX trace it matched full tokenization on all 1,087 transitions — the correctness claim tested rather than assumed — and reduced mean processing time from 185.1 ms to 11.3 ms. A fixed 8k/1k request has no prior rendered turn to reuse, so none of this appears there.',
          'Relatedly, chat-template rendering moved into the input-processing pool, so a long template no longer serializes the main request loop behind it.',
        ],
        prs: [
          { repo: 'NVIDIA/TensorRT-LLM', number: 17462 },
          { repo: 'NVIDIA/TensorRT-LLM', number: 16231 },
        ],
      },
      {
        id: 'disaggregated-kv',
        heading: 'Disaggregated KV movement and descriptor granularity',
        paragraphs: [
          'The MiniMax-M3 work focuses on disaggregated KV movement, where the failure is one of granularity. When prefill and decode do not agree on head layout, the KV for one logical request stops being a few large contiguous regions and becomes thousands of small strided pieces, each of which turns into its own transfer descriptor. The bytes moved are unchanged; the per-descriptor overhead is what explodes, and it explodes worst on exactly the long prompts that matter.',
          'Corrected multi-pool mapping and a chunked NIXL bounce path coalesce those pieces through a bounded reusable arena, trading an extra staging copy for orders of magnitude fewer descriptors. The AgentX diagnostic reduced request-critical KV p99 from 26.74 seconds to 125 ms at concurrency five, and from 10.15 seconds to 288 ms at concurrency forty.',
          'Nonblocking context-transfer polling protects the same path by reaping completed transfers even when scheduling stalls, breaking a feedback loop in which finished KV blocks stay pinned and prevent new admissions. A separate draft-cache transfer proposal was closed without merge and should not be counted as shipped TensorRT-LLM behavior.',
        ],
        prs: [
          { repo: 'NVIDIA/TensorRT-LLM', number: 17518 },
          { repo: 'NVIDIA/TensorRT-LLM', number: 17428 },
        ],
      },
      {
        id: 'execution-paths',
        heading: 'Execution paths for irregular long context',
        paragraphs: [
          'TensorRT-LLM also moved irregular long-context work onto more efficient execution paths. Context graph producers for MiniMax-M3 capture stable sparse producers while leaving request-dependent attention eager, and per-user output throughput improved by 12.58% in its AgentX test. An open native KV-event production change reduces allocation and conversion work on the KV-aware routing path.',
        ],
        prs: [
          { repo: 'NVIDIA/TensorRT-LLM', number: 17473 },
          { repo: 'NVIDIA/TensorRT-LLM', number: 16876 },
        ],
      },
      {
        id: 'kernel-selection',
        heading: 'Kernel selection and scheduler lifetime',
        paragraphs: [
          'AgentX also exposed kernel-selection and scheduler-lifetime failures that only appear at scale and duration. Two are about which kernel gets picked. MiniMax-M3 added CuTeDSL choices to MXFP8 autotuning, widening the candidate set and improving output throughput per GPU by roughly 7 to 10% at low-concurrency aggregated points. In the opposite direction, TensorRT-LLM disabled corrupt split-K MoE tactics after they crashed five of seven AgentX runs, with no crashes in seven matched runs afterwards. A tactic that is fast and wrong is worse than one that is merely slow, and an autotuner will select it enthusiastically unless it is removed from the pool.',
          'The other two are lifetime bugs, which are the characteristic failure of long runs rather than large ones. Sequence-slot headroom and consistent slot-indexed buffer sizing handle the transient overlap where a completing request and a newly admitted one both need a slot — a window that a steady stream of arrivals and departures hits constantly and a fixed batch never hits at all. A later attention-data-parallel dummy-request fix kept nine Qwen3.5 disaggregated cells alive where most earlier cells had failed within minutes: the difference between a configuration that benchmarks and one that survives a session.',
        ],
        prs: [
          { repo: 'NVIDIA/TensorRT-LLM', number: 17316 },
          { repo: 'NVIDIA/TensorRT-LLM', number: 17105 },
          { repo: 'NVIDIA/TensorRT-LLM', number: 16279 },
          { repo: 'NVIDIA/TensorRT-LLM', number: 17278 },
        ],
      },
      {
        id: 'pipelined-transfer',
        heading: 'Pipelined KV transfer for very long prompts',
        paragraphs: [
          'Two open transfer changes target very long disaggregated prompts, and together they show how a fix can create the next bottleneck. In the default arrangement a decode worker cannot start until the entire prompt has been prefilled and then transferred, so two expensive phases run back to back even though the first produces its output incrementally. Pipelined KV transfer begins sending each completed prefill chunk as it lands, so transfer overlaps prefill compute and only the final chunk is on the critical path.',
          'That change makes chunk handling frequent, which exposes work that used to happen once. Its follow-up retrieves only the block IDs belonging to the current chunk rather than the whole prompt’s block list each time. For a 128,000-token prompt split into 1,024-token chunks, that is the difference between building a 4,096-entry list once and rebuilding it 128 times for every layer group — a per-chunk cost that scales with total prompt length, which is exactly the shape that eats the gain the pipelining just bought.',
        ],
        figure: {
          key: 'trtllmPipelinedTransfer',
          alt: 'Timeline diagram: before, four prefill chunks complete and then the entire prompt is transferred before decode starts; after, each finished chunk is transferred while the next is computed, so decode starts earlier.',
          caption:
            'Before, prefill and transfer run back to back and decode waits for both. With pipelined transfer each finished chunk is sent while the next is computed, so only the final chunk sits on the critical path.',
        },
        prs: [
          { repo: 'NVIDIA/TensorRT-LLM', number: 15727 },
          { repo: 'NVIDIA/TensorRT-LLM', number: 17526 },
        ],
      },
    ],
  },
  {
    slug: 'atom',
    name: 'AMD ATOM',
    layer: 'engine',
    summary:
      'Sparse checkpoint retention, recurrent-state checkpoints, CPU offload ownership, and long-prefill parallelism.',
    lead: 'AMD’s ATOM engine was designed for single-turn workloads rather than real-world multi-turn agentic production traffic, so supporting long-context multi-turn work required changes to the core engine and its kernels. ATOM still has a long way to go relative to where vLLM and SGLang are, and AgentX is the realistic north star for its refactor.',
    highlights: [
      { value: '5.6% → 96.45%', label: 'prefix hit rate at concurrency 48' },
      { value: '91.35% → 0.16%', label: 'losses at the sliding-window gate' },
      { value: '28.6 s → 8.7 s', label: 'median TTFT with chunked PP prefill' },
    ],
    sections: [
      {
        id: 'sparse-checkpoints',
        heading: 'Sparse checkpoint retention',
        paragraphs: [
          'ATOM implemented sparse checkpoint retention for DeepSeek-V4 paged sliding-window attention, which shows the problem is a property of the workload rather than of any one codebase. The merged implementation keeps selected window tails alive so branch and replay requests can resume at useful boundaries.',
          'Its measurements separate the two effects cleanly: on the same AgentX trace at concurrency 48, the actual prefix hit rate rose from 5.6% to 96.45%, and losses at the sliding-window gate fell from 91.35% to 0.16%. The second number is the mechanism behind the first. Nine out of ten prefix matches were being found and then discarded for want of a window tail, so the cache was not missing — it was being overruled.',
        ],
        prs: [{ repo: 'ROCm/ATOM', number: 1640 }],
      },
      {
        id: 'cache-manager',
        heading: 'Cache-manager fixes that had to land first',
        paragraphs: [
          'Two earlier cache-manager fixes had to land before any of that could be measured, and both are worth noting as examples of a cache that reports itself healthy while doing nothing. One stopped free-pool hits from destroying shared cache entries. The other, a deferred-output fix, restored prefix hashing in the default scheduler mode and moved repeated long prompts from zero cached tokens to reuse of every complete prefix block.',
          'A separate change lets prefix-hit prefill stay on the optimized sink attention kernel rather than falling back to the generic path, so a cache hit does not quietly cost part of what it saves.',
        ],
        prs: [
          { repo: 'ROCm/ATOM', number: 902 },
          { repo: 'ROCm/ATOM', number: 939 },
          { repo: 'ROCm/ATOM', number: 1345 },
        ],
      },
      {
        id: 'recurrent-state',
        heading: 'Recurrent-state checkpoints',
        paragraphs: [
          'Hybrid models also carry a recurrent or compressor state, which differs from ordinary KV in one decisive way: it cannot be reconstructed from the tokens around it. A window tail can be recomputed from neighbouring context, but recurrent state is the accumulated result of everything that came before, so if it is dropped the only way back is to replay the sequence.',
          'ATOM gave this per-request state a content-addressed checkpoint lifecycle, letting generated turns leave reusable resume points without reserving a separate protected cache for them. In one test a request reused 512 generated tokens and computed only a two-token suffix.',
          'The tuning detail matters as much as the feature. Publishing a checkpoint unconditionally cost 17.5% throughput on zero-hit traffic — the price paid by every session that never comes back, in order to help the ones that do. Spacing checkpoints by token interval avoided that penalty, and fixed 1k/1k throughput stayed within measurement noise, which is the relevant safety property: a feature aimed at agentic reuse should not tax workloads that will never use it.',
        ],
        prs: [{ repo: 'ROCm/ATOM', number: 1771 }],
      },
      {
        id: 'cpu-path',
        heading: 'The CPU offload path: ownership and index placement',
        paragraphs: [
          'ATOM’s AgentX-relevant CPU path starts from the arithmetic that justifies offload at all. Standalone LMCache offload reloads a 32,000-token prefix from CPU in about 0.32 seconds against roughly 2.5 seconds to recompute it, an eight-fold margin. That makes crossing the bus worth doing at these context lengths, and it would not hold for a short prompt.',
          'The rest of the path is about ownership and index placement rather than bandwidth. ATOM copied vLLM’s multi-connector design, which lets a prefill worker send KV to a remote decode worker and save the same prefix to CPU at once, without freeing the blocks until both consumers are finished. Two independent readers of the same blocks is a situation single-turn traffic never produces.',
          'Promoting restored blocks back into the GPU prefix index fixes a subtler waste: without it, a prefix loaded from CPU is used and then not registered as resident, so the next turn fetches the same hot prefix across the bus again, paying the transfer repeatedly for a cache that was already in HBM. Follow-up work fixed asynchronous save ordering, packed-KV geometry, unaligned handoffs, and remote request accounting together, eliminating reload corruption across a two-round, 2,638-request validation. That bug surfaces only when the same blocks are saved, evicted, and restored many times over.',
        ],
        figure: {
          key: 'atomPrefixPromotion',
          alt: 'Flow diagram: a prefix restored from CPU DRAM into GPU blocks is either dropped from the GPU prefix index, so the next turn fetches it again, or promoted into the index so the next turn hits in HBM.',
          caption:
            'Reloading a 32,000-token prefix costs about 0.32 s against roughly 2.5 s to recompute it. Promoting restored blocks into the GPU prefix index is what stops the next turn paying that transfer again.',
        },
        prs: [
          { repo: 'ROCm/ATOM', number: 1318 },
          { repo: 'ROCm/ATOM', number: 1406 },
          { repo: 'ROCm/ATOM', number: 1725 },
          { repo: 'ROCm/ATOM', number: 1807 },
        ],
      },
      {
        id: 'routing',
        heading: 'Cache-aware routing in ATOM Mesh',
        paragraphs: [
          'The distributed path repeats, in a different codebase, the pattern already visible in SGLang and Dynamo: routing has to know where state lives. ATOM’s router, ATOM Mesh, is a fork of SGLang’s router with most features removed — including SGLang’s cache-aware routing, which it turned out to need.',
          'ATOM gained KV lifecycle events for cache-aware routers so the router can know where state lives at all, multi-node prefill and decode routing, and session-sticky data-parallel routing. The sticky policy is a two-sided compromise worth stating explicitly: a conversation returns to the healthy worker that owns its state, but idle assignments expire so that stickiness does not permanently unbalance the cluster on behalf of sessions that have gone away.',
        ],
        prs: [
          { repo: 'ROCm/ATOM', number: 869 },
          { repo: 'ROCm/ATOM', number: 919 },
          { repo: 'ROCm/ATOM', number: 1699 },
        ],
      },
      {
        id: 'disaggregation',
        heading: 'Disaggregation has to move whatever the model keeps',
        paragraphs: [
          'Disaggregation has to move whatever the model actually keeps, which is not always one uniform cache. DeepSeek-V4 transfers both buffers of its mixed FP8 and BF16 cache layout, and EAGLE disaggregation moves the draft model’s independent KV cache alongside the target cache — the same second-cache problem TensorRT-LLM and SGLang each had to solve.',
          'Remote-KV admission and backpressure closes the loop by stopping the decode side from accepting more parked transfers than it can safely resume, which is the disaggregated form of accepting work you cannot finish.',
        ],
        prs: [
          { repo: 'ROCm/ATOM', number: 1737 },
          { repo: 'ROCm/ATOM', number: 1331 },
          { repo: 'ROCm/ATOM', number: 1647 },
        ],
      },
      {
        id: 'long-prefill',
        heading: 'Parallelism for long prefill',
        paragraphs: [
          'Long prefill receives parallelism that a fixed 8k prompt does not strongly exercise, because at 8k there is little to divide and TTFT is already short. Prefill context parallelism (PCP) splits DeepSeek-V4 query tokens across GPUs and reported 35 to 43% lower mean time to first token, with total throughput gains of up to about 49% at a 64,000-token input — a gain that grows with input length rather than with batch size.',
          'Making that usable in practice required it to compose with everything else a session relies on, so decode context parallelism was made compatible with prefix caching, chunked prefill, and FP8 KV, and then extended to MTP. Parallelism that cannot coexist with the prefix cache would trade one long-context win for another.',
          'Chunked pipeline-parallel prefill attacks the same problem from the memory side, replacing repeated tensor-parallel collectives with streamed layer-stage handoffs. Its GLM-5.2 result at high load is the most complete in this section: output throughput doubled, median time to first token fell from 28.6 seconds to 8.7 seconds, and each prefill GPU held 3.68 times as many KV blocks. That last figure is the one to read first, because capacity per prefill GPU decides how many long sessions can be in flight before the deployment hits the HBM cliff at all.',
        ],
        prs: [
          { repo: 'ROCm/ATOM', number: 1220 },
          { repo: 'ROCm/ATOM', number: 1701 },
          { repo: 'ROCm/ATOM', number: 1746 },
          { repo: 'ROCm/ATOM', number: 1552 },
        ],
      },
    ],
  },
  {
    slug: 'aiter',
    name: 'ROCm AITER',
    layer: 'kernels',
    summary:
      'Context-parallel process groups, 64-bit addressing for large cache pools, and persistent MLA decode kernels.',
    lead: 'Long-context execution in ATOM, AMD vLLM, and AMD SGLang depends on matching lower-level AITER kernels, because a parallelism strategy at the engine layer is only real if the kernels can express it.',
    highlights: [
      { value: '>131k', label: 'tokens covered by widened row indexing' },
      { value: '64-bit', label: 'addressing for pools above 4 GB' },
      { value: '~150M', label: 'rows protected from silent wrong-row access' },
    ],
    sections: [
      {
        id: 'context-parallel',
        heading: 'Context-parallel process groups',
        paragraphs: [
          'Prefill context-parallel process groups provide the extra query-sharding dimension that prefill context parallelism needs, and also widen fused-kernel row indexing for prompts above 131,000 tokens. Decode context parallelism (DCP) shards KV across the tensor-parallel GPUs already present, so a longer sequence or a larger batch fits without replicating the whole cache on every rank.',
        ],
        prs: [
          { repo: 'ROCm/aiter', number: 3728 },
          { repo: 'ROCm/aiter', number: 3267 },
        ],
      },
      {
        id: 'address-width',
        heading: 'Address width: a failure short requests never reach',
        paragraphs: [
          'Large caches exposed a class of failure that short fixed requests essentially never reach: address width. A 32-bit offset is entirely adequate until a single cache pool crosses the boundary, at which point the arithmetic wraps and the kernel addresses the wrong row without any error being raised.',
          'AITER added runtime 64-bit dispatch for batch prefill above 4 GB, 64-bit MLA offsets above 2 GB, and 64-bit addressing throughout DeepSeek-V4’s unified cache paths — the last preventing silent reads and writes to the wrong row in pools of roughly 150 million rows.',
        ],
        figure: {
          key: 'aiter64BitOffsets',
          alt: 'Two panels of a unified KV pool of about 150 million rows: with 32-bit offsets an access past 4 GB wraps to a different row; with 64-bit offsets the addressed row is the intended one.',
          caption:
            'A 32-bit offset is adequate until one cache pool crosses 4 GB, at which point the arithmetic wraps and the kernel reads or writes a different row without raising an error.',
        },
        prs: [
          { repo: 'ROCm/aiter', number: 2893 },
          { repo: 'ROCm/aiter', number: 4474 },
          { repo: 'ROCm/aiter', number: 4680 },
        ],
      },
      {
        id: 'persistent-mla',
        heading: 'Persistent MLA decode for common head packings',
        paragraphs: [
          'DeepSeek-V4 decode also gained a persistent MLA kernel for 64-head and 128-head MTP packings. Those two head counts are what ordinary decoding and speculative verification actually produce, so this gives the engine a dedicated long-context path for its common shapes instead of treating them as incidental variants of a kernel written for short contexts. It is the same argument as the vLLM AITER sparse-MLA selection: at long context the generic path is not a modest compromise, it is the wrong kernel.',
        ],
        prs: [{ repo: 'ROCm/aiter', number: 3459 }],
      },
    ],
  },
  {
    slug: 'dynamo',
    name: 'NVIDIA Dynamo',
    layer: 'router',
    summary:
      'Batched KV matching, request-lease ownership, cheaper router state, and a leaner request plane.',
    lead: 'A good part of the NVIDIA submission uses the Dynamo inference orchestration and router system. Its AgentX series shows that the distributed serving layer can become the bottleneck once engine kernels improve: the router’s work is proportional to the number and length of live prefixes rather than to the number of tokens generated, so many long, overlapping, long-lived sessions load it in a way fixed-shape traffic never does.',
    highlights: [
      { value: '+22.2%', label: 'median output throughput at concurrency 512' },
      { value: '−23.71%', label: 'AgentX replay time with request leases (vLLM)' },
      { value: '932 → 1,133', label: 'frontend requests per second' },
    ],
    sections: [
      {
        id: 'routing-cost',
        heading: 'The cost of each routing decision',
        paragraphs: [
          'The first series of pull requests reduced the cost of each routing decision: less work on the lookup hot path, no redundant suffix invalidation, and finally batched KV matching, registration, ownership, and terminal dereferences, which reported a 22.2% median output-throughput gain at concurrency 512. Batching helps here for the same reason it helps in an engine: the per-item overhead was dominating the item.',
        ],
        prs: [
          { repo: 'ai-dynamo/dynamo', number: 10540 },
          { repo: 'ai-dynamo/dynamo', number: 10836 },
          { repo: 'ai-dynamo/dynamo', number: 11095 },
        ],
      },
      {
        id: 'ownership',
        heading: 'How ownership is represented',
        paragraphs: [
          'The second series changed how ownership is represented, which is the harder problem underneath. Every cached block needs to be attributed to the requests relying on it, so it is not freed while still in use and not pinned after everyone has finished. With thousands of concurrent sessions sharing overlapping prefixes, the bookkeeping itself becomes significant.',
          'Dynamo moved from shared block chains to arena-level ownership counts and finally to backend-specific request leases, each step coarsening the unit being tracked. The lease design reduced AgentX replay time by 23.71% for the vLLM backend and 22.02% for SGLang, and lowered peak memory at the same time — a sign that the previous representation was the problem rather than the traffic.',
        ],
        figure: {
          key: 'dynamoOwnershipTable',
          alt: 'Before and after diagram of block ownership: before, each block holds its own reference counter and requests point at every block they use; after, ownership counts live in one table with rows, stamps, and parent rows, and each request keeps a bookmark.',
          caption:
            'Ownership representation, before and after. Counts move out of the individual blocks and into one table, so a request keeps a bookmark rather than a reference to every block it touches.',
        },
        prs: [
          { repo: 'ai-dynamo/dynamo', number: 11503 },
          { repo: 'ai-dynamo/dynamo', number: 11508 },
          { repo: 'ai-dynamo/dynamo', number: 12329 },
        ],
      },
      {
        id: 'router-state',
        heading: 'Router state that used to be small',
        paragraphs: [
          'Further router profiles removed costs with the same shape, where a periodic sweep or a full recomputation had been acceptable only because live state used to be small. Bucketed expiry pruning replaced a scan proportional to everything tracked and improved high-churn AgentX throughput by 13.7%. Delta-only suffix cleanup processes only what changed and absorbed about 28 times as many store and remove events in the same window. Compressed prompt paths cut frontend CPU by 35.3% and materially improved tail time to first token, which matters because prompts in this workload are long and largely repeated. Overload state is now tracked incrementally rather than recomputed.',
          'One routing change is a deliberate trade rather than a pure win. Dynamo can now charge active decode requests in its routing score, so a worker already committed to long-running decodes looks more expensive than its queue depth alone suggests. That improved median AgentX latency at a small throughput cost in the reported tuning point — the kind of choice that only becomes visible when requests occupy a worker for a long time.',
        ],
        prs: [
          { repo: 'ai-dynamo/dynamo', number: 10521 },
          { repo: 'ai-dynamo/dynamo', number: 10676 },
          { repo: 'ai-dynamo/dynamo', number: 11644 },
          { repo: 'ai-dynamo/dynamo', number: 10645 },
          { repo: 'ai-dynamo/dynamo', number: 12158 },
        ],
      },
      {
        id: 'request-plane',
        heading: 'The request plane',
        paragraphs: [
          'The request plane was optimized next, because an agentic trace does not send one request and one response. It sends many related requests carrying largely identical prompts, and streams every token back as its own frame, so serialization and copying are paid per turn and per token rather than once. Switching to MessagePack request payloads improved throughput by 8.1% and reduced average time to first token by 9.7% in its AgentX test, and direct Python transcoding removed an intermediate value tree from that path entirely.',
          'What followed is a sequence of changes that all remove a copy rather than speed one up: not copying MessagePack event payloads, not copying received ZeroMQ frames, and not paying full inter-token-latency metrics overhead on every token. The chat streaming hot path was shortened for the same reason. Individually these are unremarkable; multiplied by every streamed token of every concurrent session, they determine how many requests per second a frontend can sustain.',
        ],
        prs: [
          { repo: 'ai-dynamo/dynamo', number: 10437 },
          { repo: 'ai-dynamo/dynamo', number: 11104 },
          { repo: 'ai-dynamo/dynamo', number: 11539 },
          { repo: 'ai-dynamo/dynamo', number: 11574 },
          { repo: 'ai-dynamo/dynamo', number: 11569 },
          { repo: 'ai-dynamo/dynamo', number: 10433 },
        ],
      },
      {
        id: 'profiling',
        heading: 'Costs that had nothing to do with moving data',
        paragraphs: [
          'High-concurrency profiling then found costs that had nothing to do with moving data. Static logging filters removed a shared span-matcher lock — a contention point rather than a volume problem — and raised reported frontend throughput from 932 to 1,133 requests per second. Simpler positional radix buckets reduced peak memory in the mocker by 5.51 GiB in a 32-worker run.',
          'An open change flushes detokenization metrics once per response rather than updating cumulative counters on every streamed chunk, approximately halving frontend CPU time in its matched diagnostic profile. That last one is the clearest example of the category: the instrumentation was cheap per call and ruinous at one call per token.',
        ],
        prs: [
          { repo: 'ai-dynamo/dynamo', number: 11820 },
          { repo: 'ai-dynamo/dynamo', number: 12161 },
          { repo: 'ai-dynamo/dynamo', number: 12999 },
        ],
      },
    ],
  },
  {
    slug: 'lmcache',
    name: 'LMCache',
    layer: 'kv-cache',
    summary:
      'Chunked external-cache loading, hybrid-group storage, AMD Instinct enablement, and DCP-aware offload.',
    lead: 'LMCache is an open-source KV-cache layer that sits under inference engines such as vLLM, storing reusable KV chunks keyed by prefix hash across CPU DRAM, local NVMe, and remote backends including Mooncake, Redis, and S3. It can be used as an alternative to vLLM’s native offloading connectors.',
    highlights: [
      { value: '120 vs 28', label: 'requests completed before the old path deadlocked' },
      { value: '~20×', label: 'less storage per token for hybrid groups' },
      { value: '56/56', label: 'KV-transfer kernel tests passing on MI350X' },
    ],
    sections: [
      {
        id: 'chunked-loading',
        heading: 'Chunked external-cache loading',
        paragraphs: [
          'LMCache’s multiprocess path was changed for the volume and shape of agentic cache movement, beginning with a failure that is not a slowdown but a stop. When each of many requests with contexts above 100,000 tokens reserves the blocks for its whole load before starting, the pool is exhausted by requests that are all waiting and none progressing.',
          'Chunked external-cache loading reserves per chunk instead, so loads interleave and drain. At concurrency 32 the validation completed 120 requests where the old path deadlocked after 28, and concurrency 48 kept running with the KV pool 98.5% full.',
        ],
        figure: {
          key: 'lmcacheTiers',
          alt: 'Diagram of several vLLM instances above a shared LMCache layer with CPU DRAM, local NVMe through GDS, and a remote store tier, where a later request on another instance reads what an earlier one wrote.',
          caption:
            'LMCache sits under every instance as a hash-addressed KV layer across CPU DRAM, local NVMe, and a remote store, so a later request on a different instance can read what an earlier one wrote.',
        },
        prs: [{ repo: 'LMCache/LMCache', number: 3382 }],
      },
      {
        id: 'moving-less',
        heading: 'Moving less, and getting out of the way',
        paragraphs: [
          'The other changes reduce how much is moved and how often the runtime gets in the way. Storing only the useful portions of DeepSeek-V4’s hybrid groups cut storage per token by almost twenty times, and sliding-window prefetch now loads only the live window rather than window state that will never be read — the same reachability argument vLLM applied to offload, approached from the storage side.',
          'One native transfer call per object group then removes repeated Python lock handoffs across staging copies and kernel launches, which is overhead proportional to the number of pieces rather than to the bytes in them.',
        ],
        prs: [
          { repo: 'LMCache/LMCache', number: 3635 },
          { repo: 'LMCache/LMCache', number: 3869 },
          { repo: 'LMCache/LMCache', number: 3908 },
        ],
      },
      {
        id: 'lock-accounting',
        heading: 'Open: hybrid lock accounting',
        paragraphs: [
          'Two current LMCache changes are especially specific to AgentX but remain open. The hybrid lock-accounting fix stops one request from releasing another request’s read locks on shared sliding-window or recurrent-state chunks. Reproducing it requires three things at once: several requests must share the same chunks, the accounting must be per-chunk rather than per-holder, and eviction must actually start.',
          'Sustained Kimi-K3 runs with DRAM offload supplied all three and produced tens of thousands of warnings, corrupt generations, and eventually GPU crashes once eviction began. Anything short of a long, shared, memory-pressured run leaves the bug dormant.',
        ],
        prs: [{ repo: 'LMCache/LMCache', number: 4524 }],
      },
      {
        id: 'amd-enablement',
        heading: 'AMD Instinct enablement',
        paragraphs: [
          'A parallel line of work made all of the above reachable on AMD Instinct hardware. CacheBlend’s non-prefix reuse depended on FlashInfer, which is CUDA-only, so a Triton block-sparse attention backend reimplements the three kernels it needs: block-sparse attention with CSR indices and log-sum-exp output, causal prefill, and log-sum-exp output blending. It then routes to them automatically when ROCm is detected or FlashInfer is missing. ROCm Dockerfiles mirror the CUDA build and lightweight images. An AMD hipFile backend extends the GDS L1 slab-file tier, which reached storage only through NVIDIA cuFile, by binding ROCm’s hipFile through ctypes and dispatching on torch.version.hip; the cuFile path is unchanged.',
          'Distribution was the remaining gap. CUDA users installed a prebuilt wheel while AMD users built from source. We worked with AMD to publish a prebuilt gfx942 and gfx950 wheel that closes it: it installs into the upstream image and passes all 56 KV-transfer kernel tests on MI350X, and it publishes to a GitHub release rather than PyPI so a plain pip install lmcache stays the CUDA build. A one-line follow-up marks the bind-mounted repository as a git safe directory, which only fails in CI because the container runs as root over a runner-owned checkout and the version introspection in setup.py refuses to read it.',
        ],
        prs: [
          { repo: 'LMCache/LMCache', number: 3092 },
          { repo: 'LMCache/LMCache', number: 3101 },
          { repo: 'LMCache/LMCache', number: 3843 },
          { repo: 'LMCache/LMCache', number: 4273 },
          { repo: 'LMCache/LMCache', number: 4363 },
        ],
      },
      {
        id: 'dcp-offload',
        heading: 'DCP-aware CPU offload',
        paragraphs: [
          'DCP-aware CPU offload resolves a straightforward incompatibility between two features that long contexts make mandatory together. With decode context parallelism enabled, each rank holds only a stride of the KV, so what any one rank could save is not a usable prefix. The fix gathers the strided shards before saving and redistributes them after loading. Without it, enabling context parallelism silently disables CPU cache hits for exactly the long prefixes that motivated both features. Its validation recorded more than 30,000 CPU hit events, with single-request loads reaching hundreds of thousands of tokens.',
        ],
        prs: [{ repo: 'LMCache/LMCache', number: 3561 }],
      },
    ],
  },
  {
    slug: 'mooncake',
    name: 'Mooncake',
    layer: 'transfer',
    summary:
      'GPU-direct RDMA on ROCm through HIP dmabuf, plus a published ROCm wheel and release path.',
    lead: 'Mooncake serves Moonshot’s Kimi production traffic along with production traffic at many labs, and is a transfer engine underneath disaggregated vLLM and SGLang configurations. Until recently its AMD support stopped short of both RDMA registration and installable packages.',
    highlights: [
      { value: 'HIP dmabuf', label: 'GPU-direct RDMA path on ROCm' },
      { value: 'gfx942 + gfx950', label: 'covered by one architecture-agnostic wheel' },
      { value: 'Python 3.10–3.13', label: 'tag-triggered publish matrix' },
    ],
    sections: [
      {
        id: 'rdma-registration',
        heading: 'GPU-direct RDMA registration on ROCm',
        paragraphs: [
          'Registering GPU memory for RDMA on NVIDIA uses either the nvidia-peermem kernel module or an exported dmabuf file descriptor. AMD has no nvidia-peermem equivalent, so GPU-direct RDMA had no path at all and deployments fell back to staging KV through host DRAM.',
          'A HIP dmabuf registration branch adds the mirror of the existing CUDA dmabuf path, exporting through ROCm instead of the CUDA handle call, and resolving the true allocation base first because caching allocators pack tensors at an offset inside a larger allocation. Host memory still registers directly.',
        ],
        prs: [{ repo: 'kvcache-ai/Mooncake', number: 2225 }],
      },
      {
        id: 'packaging',
        heading: 'Support that cannot be installed is not support',
        paragraphs: [
          'Mooncake published CUDA and MUSA wheels but no ROCm package, so AMD users built the engine from source inside every image. A ROCm wheel, CI, and release path publishes mooncake-transfer-engine-rocm to PyPI alongside them. This workstream came from Andy Luo, an AMD engineer, who noticed the pattern while dogfooding agentic workloads with AgentX: building Mooncake from source is not a first-class ROCm experience.',
          'The transfer engine has no device kernels and does not depend on torch, so one architecture-agnostic wheel covers gfx942 and gfx950, and the ROCm runtime is bound at load time rather than vendored — which means the same wheel works unmodified in both the upstream vLLM ROCm image and the SGLang ROCm image. That was verified as a full cross product: MI300X and MI355X, each under vllm/vllm-openai-rocm and lmsysorg/sglang, running the master binary and a HIP buffer transfer test with data verification. The pull request adds a tag-triggered publish across Python 3.10 through 3.13.',
          'An open follow-up adds a self-hosted two-node MI350X external prefill and decode tier so the ROCm disaggregated path is exercised on real hardware rather than only compiled. Together these mean an AMD AgentX run can now install the transfer engine and the KV-cache layer from published artifacts, into stock upstream images, and move KV directly between GPU memory and the fabric.',
        ],
        prs: [
          { repo: 'kvcache-ai/Mooncake', number: 3184 },
          { repo: 'kvcache-ai/Mooncake', number: 3338 },
        ],
        links: [
          {
            label: 'mooncake-transfer-engine on PyPI',
            href: 'https://pypi.org/project/mooncake-transfer-engine/',
          },
        ],
      },
    ],
  },
];

export const AGENTX_OPTIMIZATION_FRAMEWORKS = FRAMEWORKS;

export const AGENTX_OPTIMIZATION_SLUGS: readonly string[] = FRAMEWORKS.map(
  (framework) => framework.slug,
);

export function getOptimizationFramework(slug: string): OptimizationFramework | undefined {
  return FRAMEWORKS.find((framework) => framework.slug === slug);
}

/** Total distinct upstream PRs referenced, used in the index-page copy. */
export function countReferencedPrs(): number {
  const seen = new Set<string>();
  for (const section of OPTIMIZATIONS_OVERVIEW.sections) {
    for (const pr of section.prs ?? []) seen.add(prUrl(pr));
  }
  for (const framework of FRAMEWORKS) {
    for (const section of framework.sections) {
      for (const pr of section.prs ?? []) seen.add(prUrl(pr));
    }
  }
  return seen.size;
}
