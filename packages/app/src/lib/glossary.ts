export const GLOSSARY_CATEGORIES = [
  'Benchmark metrics',
  'Serving',
  'Parallelism',
  'Hardware',
  'Numerical precision',
  'Model architecture',
  'Software',
] as const;

export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export interface GlossaryEntry {
  slug: string;
  term: string;
  abbreviation?: string;
  aliases?: readonly string[];
  category: GlossaryCategory;
  plainEnglish: string;
  definition: string;
  explanation: string;
  significance: string;
  benchmarkContext: string;
  measurement?: {
    label: string;
    value: string;
  };
  relatedTerms: readonly string[];
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

const entries = [
  {
    slug: 'ai-inference',
    term: 'AI inference',
    aliases: ['LLM inference', 'model serving'],
    category: 'Serving',
    plainEnglish:
      'You give a trained model something new, such as a prompt, image, or audio. It uses what it learned to produce an answer.',
    definition:
      'AI inference is the process of running a trained model on new input to produce an output. For a large language model, that usually means processing a prompt and generating tokens.',
    explanation:
      'Training changes model weights; inference uses those weights. A production inference system wraps the model in a serving engine that schedules requests, manages memory, batches work, and runs kernels on one or more accelerators. Performance can vary with the surrounding software and hardware stack.',
    significance:
      'Inference performance depends on the system around the model. User experience depends on latency and interactivity, while operator economics depend on throughput, utilization, power, and hardware cost. Optimizing one dimension can make another worse.',
    benchmarkContext:
      'InferenceX benchmarks complete serving recipes because peak chip specifications alone cannot describe serving performance. Each curve captures a model, engine, numerical precision, parallelism strategy, GPU system, sequence length, and concurrency sweep.',
    relatedTerms: ['inference-engine', 'prefill', 'decode', 'throughput', 'interactivity'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2],
  },
  {
    slug: 'inference-engine',
    term: 'Inference engine',
    aliases: ['serving engine', 'LLM serving framework'],
    category: 'Serving',
    plainEnglish:
      'The inference engine is the traffic controller behind an AI service: it keeps incoming requests moving and makes sure the GPUs do the right work at the right time.',
    definition:
      'An inference engine is the software runtime that turns model weights and incoming requests into generated outputs on accelerators.',
    explanation:
      'The engine owns request scheduling, batching, KV-cache allocation, distributed execution, kernel selection, and token sampling. vLLM, SGLang, and TensorRT-LLM can run the same model on the same GPU yet produce different curves because their schedulers, kernels, and distributed strategies differ.',
    significance:
      'Engine version and configuration can matter as much as GPU choice. A scheduler change, a fused attention kernel, or a corrected model-specific path can move throughput several-fold without any hardware change.',
    benchmarkContext:
      'InferenceX records the engine and container image as part of each reproducible recipe. Historical views are therefore useful for separating software gains from silicon gains.',
    relatedTerms: ['ai-inference', 'vllm', 'sglang', 'tensorrt-llm', 'nvidia-dynamo'],
    articleSlugs: [SGLANG_056, MI355X_KIMI, INFERENCEX_V2],
  },
  {
    slug: 'throughput',
    term: 'Throughput',
    aliases: ['token throughput', 'aggregate throughput'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Throughput is how much total work the system gets done each second across everyone using it.',
    definition:
      'Throughput is the total rate at which an inference system produces tokens across all active requests.',
    explanation:
      'InferenceX commonly normalizes throughput as tokens per second per GPU so systems of different sizes can be compared. Higher batching or concurrency often raises aggregate throughput because weight reads and compute are amortized across more requests, but individual users may receive tokens more slowly.',
    significance:
      'Maximum throughput captures only one operating point. A system can lead in tokens per second while operating at interactivity too low for a real-time product. The useful comparison is throughput at a latency or interactivity target appropriate to the workload.',
    benchmarkContext:
      'On an InferenceX chart, throughput is read together with interactivity across the full concurrency sweep. The Pareto frontier removes operating points that are worse on both axes.',
    measurement: { label: 'Typical unit', value: 'tokens/second/GPU (tok/s/GPU)' },
    relatedTerms: ['interactivity', 'concurrency', 'pareto-frontier', 'iso-interactivity'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, SGLANG_056],
  },
  {
    slug: 'interactivity',
    term: 'Interactivity',
    aliases: ['generation speed', 'per-user token rate'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Interactivity is how quickly one person sees new words appear after the model starts answering.',
    definition:
      'Interactivity is the rate at which an individual user receives generated tokens during the decode phase.',
    explanation:
      'It is the reciprocal of time per output token when expressed in compatible units. A response at 50 tokens per second per user emits a new token about every 20 milliseconds after generation begins. Interactivity describes streaming responsiveness, not the delay before the first token.',
    significance:
      'Different products need different operating points. Voice and interactive coding demand high token rates, while offline summarization can trade interactivity for much more aggregate throughput. Comparing hardware at unmatched interactivity can therefore produce a misleading winner.',
    benchmarkContext:
      'InferenceX plots tokens per second per user against throughput or cost. Iso-interactivity tables interpolate each system’s Pareto frontier at the same token rate so the comparison holds user experience constant.',
    measurement: { label: 'Typical unit', value: 'tokens/second/user (tok/s/user)' },
    relatedTerms: ['time-per-output-token', 'throughput', 'iso-interactivity', 'latency'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, MI355X_KIMI],
  },
  {
    slug: 'latency',
    term: 'Latency',
    aliases: ['response latency', 'inference latency'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Latency is how long you wait. For a streamed answer, that includes both the wait before it starts and the pauses between later words.',
    definition:
      'Latency is elapsed time experienced by a request. In streaming LLM serving it must be decomposed because waiting for the first token and waiting between later tokens are different behaviors.',
    explanation:
      'Time to first token captures queueing and prefill delay. Time per output token captures decode cadence after streaming starts. End-to-end latency also depends on output length, so a single aggregate latency number can hide the part users actually notice.',
    significance:
      'Low latency can require smaller batches or more parallel resources, which may reduce hardware utilization and increase cost. Good serving design chooses a latency service level and then maximizes throughput within it.',
    benchmarkContext:
      'InferenceX exposes workload shape and concurrency alongside interactivity. This keeps a high-throughput batch point from being mistaken for a low-latency serving point.',
    relatedTerms: ['time-to-first-token', 'time-per-output-token', 'interactivity', 'concurrency'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2],
  },
  {
    slug: 'time-to-first-token',
    term: 'Time to first token',
    abbreviation: 'TTFT',
    category: 'Benchmark metrics',
    plainEnglish:
      'TTFT is the “thinking…” pause between sending your prompt and seeing the first piece of the answer.',
    definition:
      'Time to first token is the delay from submitting a request until the first generated token is returned.',
    explanation:
      'TTFT includes queueing, prompt processing, and any routing or KV-cache transfer before decode begins. Longer prompts generally increase prefill work, while overloaded schedulers can add queueing even when the model computation itself is unchanged.',
    significance:
      'Users interpret TTFT as how quickly the system begins responding. A system can stream tokens quickly after startup yet still feel slow if requests wait in a queue or prefill competes with decode work.',
    benchmarkContext:
      'Read TTFT alongside input sequence length, concurrency, and whether prefill is disaggregated. Those details explain why two recipes with similar decode interactivity may begin responses at different speeds.',
    measurement: { label: 'Typical unit', value: 'milliseconds or seconds' },
    relatedTerms: ['prefill', 'latency', 'time-per-output-token', 'disaggregated-inference'],
    articleSlugs: [INFERENCEX_V2, INFERENCEMAX],
  },
  {
    slug: 'time-per-output-token',
    term: 'Time per output token',
    abbreviation: 'TPOT',
    aliases: ['inter-token latency', 'ITL'],
    category: 'Benchmark metrics',
    plainEnglish:
      'TPOT is the gap between each new piece of a streamed answer. Smaller gaps make the response feel faster and smoother.',
    definition:
      'Time per output token is the average delay between generated tokens after the first token has arrived.',
    explanation:
      'TPOT measures the decode cadence of a streaming response. Ignoring unit conversion, it is the inverse of per-user token rate: 20 ms per token corresponds to about 50 tokens per second per user.',
    significance:
      'TPOT isolates the part of latency that controls how fluid a streamed answer feels. It normally worsens as more requests share the system, even while aggregate throughput rises.',
    benchmarkContext:
      'InferenceX often presents the reciprocal measure, tok/s/user, because higher is visually better. Recipe tables may include TPOT directly, especially when comparing scheduler or kernel changes at matched concurrency.',
    measurement: { label: 'Relationship', value: 'interactivity ≈ 1000 / TPOT(ms)' },
    relatedTerms: ['interactivity', 'time-to-first-token', 'decode', 'concurrency'],
    articleSlugs: [INFERENCEX_V2, SGLANG_056, MI355X_GLM5],
  },
  {
    slug: 'concurrency',
    term: 'Concurrency',
    aliases: ['concurrent requests', 'batch concurrency'],
    category: 'Benchmark metrics',
    plainEnglish: 'Concurrency is how many people or requests the system is serving at once.',
    definition:
      'Concurrency is the number of requests being served at the same time during a benchmark or deployment.',
    explanation:
      'Raising concurrency gives the scheduler more work to batch, which can improve accelerator utilization and aggregate throughput. The tradeoff is that each request receives a smaller share of compute and memory bandwidth, so interactivity usually falls.',
    significance:
      'A single concurrency value reveals only one operating point. Production traffic changes over time, and a recipe that looks best at low concurrency may be overtaken when batches become large or communication begins to dominate.',
    benchmarkContext:
      'InferenceX sweeps concurrency to build a throughput-interactivity curve. Labels on the curve identify the request count behind each point and expose where a configuration saturates or collapses.',
    relatedTerms: ['throughput', 'interactivity', 'batching', 'pareto-frontier'],
    articleSlugs: [SGLANG_056, GB200_KIMI, MI355X_QWEN],
  },
  {
    slug: 'batching',
    term: 'Batching',
    aliases: ['continuous batching', 'dynamic batching'],
    category: 'Serving',
    plainEnglish:
      'Batching is like putting several passengers on one bus: the GPU handles multiple requests together so each trip does more useful work.',
    definition:
      'Batching groups work from multiple requests so an accelerator can process their tokens together.',
    explanation:
      'Large matrix operations use GPUs more efficiently than many tiny operations. Modern serving engines continuously add and remove sequences as requests arrive and finish, without waiting for a fixed batch to complete. The resulting batch shape changes throughout prefill and decode.',
    significance:
      'Batching creates the core throughput-latency tradeoff. Larger effective batches amortize weight reads and launch overhead but generally increase the time between tokens for each user.',
    benchmarkContext:
      'Concurrency supplies work to the batcher. Parallelism, sequence lengths, request completion, and scheduler policy determine the effective batch observed by the GPU.',
    relatedTerms: ['concurrency', 'throughput', 'decode', 'interactivity'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, SGLANG_056],
  },
  {
    slug: 'pareto-frontier',
    term: 'Pareto frontier',
    aliases: ['performance frontier', 'Pareto-optimal curve'],
    category: 'Benchmark metrics',
    plainEnglish:
      'The Pareto frontier is the line of best available tradeoffs. Each point remains viable because improving one dimension would require giving up ground on another.',
    definition:
      'A Pareto frontier contains the operating points for which no other measured point is better on both compared dimensions.',
    explanation:
      'For throughput versus interactivity, a point is dominated if another point serves more total tokens and also streams faster to each user. Removing dominated points leaves the efficient boundary of the measured configurations.',
    significance:
      'The frontier prevents noisy or poorly tuned points from distorting comparisons and makes the real tradeoff visible. There is still no universal winner along the curve: the best point depends on the user’s minimum interactivity or maximum cost target.',
    benchmarkContext:
      'InferenceX connects Pareto-optimal points from a concurrency and configuration sweep. Iso-interactivity comparisons interpolate along those frontiers because direct comparisons of arbitrary raw points can mislead.',
    relatedTerms: ['throughput', 'interactivity', 'iso-interactivity', 'concurrency'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, MI355X_GLM5],
  },
  {
    slug: 'iso-interactivity',
    term: 'Iso-interactivity',
    aliases: ['matched interactivity', 'equal token rate'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Iso-interactivity compares systems while users see words appear at the same speed. This provides an apples-to-apples view of the hardware behind the experience.',
    definition: 'Iso-interactivity means comparing systems at the same per-user generation rate.',
    explanation:
      'Benchmark runs rarely land at identical tok/s/user values because each recipe has different concurrency points. An iso-interactivity comparison interpolates each Pareto frontier at a shared target and then compares throughput, cost, or efficiency there.',
    significance:
      'Holding user experience constant avoids a common benchmark error: declaring a high-throughput system faster when it reaches that throughput only by serving every request more slowly.',
    benchmarkContext:
      'InferenceX articles use iso-interactivity tables for hardware, precision, and software comparisons. Values outside a measured frontier are marked unreachable and are not extrapolated beyond observed data.',
    relatedTerms: ['interactivity', 'pareto-frontier', 'throughput', 'performance-per-dollar'],
    articleSlugs: [B200_GLM5, B200_MINIMAX, B200_KIMI, GB300_DSV4],
  },
  {
    slug: 'input-output-sequence-length',
    term: 'Input and output sequence length',
    abbreviation: 'ISL / OSL',
    aliases: ['prompt length', 'generation length', '8K/1K'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Input length is how much the model reads; output length is how much it writes. “8K/1K” means a long prompt followed by a shorter answer.',
    definition:
      'Input sequence length is the number of prompt tokens supplied to the model; output sequence length is the number of tokens generated in response.',
    explanation:
      'The pair defines the workload shape. An 8K/1K test uses roughly 8,192 input tokens and generates 1,024 output tokens. Long inputs increase prefill work and KV-cache size, while long outputs spend more time in the autoregressive decode loop.',
    significance:
      'Results from different sequence lengths are not interchangeable. A configuration tuned for short chat prompts can rank differently on long-context summarization or reasoning because compute, memory capacity, and bandwidth pressure shift.',
    benchmarkContext:
      'InferenceX includes ISL and OSL in chart labels and recipe descriptions. Compare systems on the same workload shape before attributing a difference to hardware or software.',
    relatedTerms: ['prefill', 'decode', 'kv-cache', 'time-to-first-token'],
    articleSlugs: [INFERENCEMAX, B200_GLM5, GB300_DSV4],
  },
  {
    slug: 'cost-per-million-tokens',
    term: 'Cost per million tokens',
    aliases: ['$/M tokens', 'token cost'],
    category: 'Benchmark metrics',
    plainEnglish:
      'This is the estimated infrastructure bill for producing one million tokens, the chunks of text an AI model reads and writes.',
    definition:
      'Cost per million tokens estimates the infrastructure cost of producing one million tokens at a measured operating point.',
    explanation:
      'InferenceX derives the metric from hourly total cost of ownership and measured token throughput. It may be reported for total tokens or separated into input and output tokens, so the denominator must be checked before comparing values.',
    significance:
      'Workload shape, interactivity, utilization, cache behavior, and cost assumptions determine whether two values are comparable. A low-throughput offline point and a high-interactivity endpoint represent different operating regimes.',
    benchmarkContext:
      'Cost curves use the same concurrency sweep as throughput curves. At iso-interactivity, lower $/M means the system delivers the same streaming experience with less modeled infrastructure cost.',
    measurement: {
      label: 'InferenceX form',
      value: '$/M = TCO($/GPU-hour) × 1,000,000 / (3600 × tok/s/GPU)',
    },
    relatedTerms: [
      'total-cost-of-ownership',
      'throughput',
      'iso-interactivity',
      'performance-per-dollar',
    ],
    articleSlugs: [INFERENCEX_V2, B200_KIMI, B200_GLM5, GB300_DSV4],
  },
  {
    slug: 'performance-per-dollar',
    term: 'Performance per dollar',
    aliases: ['perf/$', 'cost efficiency'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Performance per dollar measures how much useful AI output the system produces for each dollar spent running it.',
    definition:
      'Performance per dollar expresses how much measured inference work a system delivers for a unit of modeled cost.',
    explanation:
      'For a fixed workload and interactivity target, performance per dollar is the inverse of cost per token. A 2× perf/$ advantage means the system can produce about twice as many comparable tokens for the same infrastructure spend.',
    significance:
      'Peak chip FLOPS account for only part of serving economics. Memory, networking, software maturity, numerical precision, and achievable utilization all affect the measured output behind the ratio.',
    benchmarkContext:
      'InferenceX compares perf/$ at matched interactivity and names the TCO inputs used. Ratios should not be carried across different model, sequence-length, precision, or latency regimes.',
    relatedTerms: [
      'cost-per-million-tokens',
      'total-cost-of-ownership',
      'iso-interactivity',
      'throughput',
    ],
    articleSlugs: [B200_GLM5, B200_MINIMAX, B200_KIMI, MI355X_GLM5],
  },
  {
    slug: 'total-cost-of-ownership',
    term: 'Total cost of ownership',
    abbreviation: 'TCO',
    category: 'Benchmark metrics',
    plainEnglish:
      'TCO covers the hardware purchase plus the cost of powering, cooling, networking, and operating it over time.',
    definition:
      'Total cost of ownership is an all-in estimate of the cost to provision and operate computing infrastructure over its useful life.',
    explanation:
      'A GPU’s purchase price is only one input. TCO models can include host systems, networking, power delivery, cooling, facilities, financing, depreciation, maintenance, and expected utilization, then normalize the result to cost per GPU-hour.',
    significance:
      'Using TCO instead of list price makes cross-system economics more realistic, especially for rack-scale products whose networking and power infrastructure differ. The result remains a model and should be read with its assumptions.',
    benchmarkContext:
      'InferenceX combines SemiAnalysis AI Cloud TCO inputs with observed tok/s/GPU. This separates hourly system cost from the software and workload behavior that determines how many tokens that hour produces.',
    relatedTerms: [
      'cost-per-million-tokens',
      'performance-per-dollar',
      'tokens-per-megawatt',
      'throughput',
    ],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, GB200_R1],
  },
  {
    slug: 'tokens-per-megawatt',
    term: 'Tokens per megawatt',
    aliases: ['tokens per MW', 'power-normalized throughput'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Tokens per megawatt asks how much AI output a data center can produce from a fixed amount of available power.',
    definition:
      'Tokens per megawatt measures useful inference throughput relative to a data center power budget.',
    explanation:
      'InferenceX uses all-in provisioned utility power, including overhead for power delivery and cooling. Chip thermal design power covers only the accelerator, so it is less useful for facility-level capacity planning.',
    significance:
      'Power availability is often the binding constraint on new AI deployments. A system that produces more tokens per provisioned megawatt can serve more demand from the same utility allocation even if its individual accelerators draw more power.',
    benchmarkContext:
      'Compare tokens/MW at the same model, workload shape, precision, and interactivity. Otherwise a high-throughput low-interactivity point can appear efficient while failing the target user experience.',
    measurement: { label: 'Typical unit', value: 'tokens/second per provisioned utility MW' },
    relatedTerms: [
      'throughput',
      'interactivity',
      'total-cost-of-ownership',
      'performance-per-dollar',
    ],
    articleSlugs: [INFERENCEMAX, DEEPSEEK_V4],
  },
  {
    slug: 'prefill',
    term: 'Prefill',
    aliases: ['prompt processing', 'context encoding'],
    category: 'Serving',
    plainEnglish:
      'Prefill is the model reading and understanding your prompt before it begins writing the answer.',
    definition:
      'Prefill is the first inference phase, in which the model processes the input prompt and populates the KV cache before generation begins.',
    explanation:
      'Prompt tokens can be processed in parallel, producing large matrix operations that are usually compute intensive. Prefill cost grows with input length and contributes heavily to time to first token.',
    significance:
      'Prefill has a different resource profile from decode. When both share the same workers, large prompt jobs can interrupt decode batches and make streaming latency less predictable.',
    benchmarkContext:
      'Disaggregated recipes place prefill on a separately sized GPU pool. When reading a result, check the prefill tensor parallelism, GPU count, input length, and whether KV state must cross a network before decode.',
    relatedTerms: ['decode', 'kv-cache', 'time-to-first-token', 'disaggregated-inference'],
    articleSlugs: [INFERENCEX_V2, GB300_DSV4, GB200_KIMI],
  },
  {
    slug: 'decode',
    term: 'Decode',
    aliases: ['autoregressive generation', 'token generation'],
    category: 'Serving',
    plainEnglish:
      'Decode is the model writing its answer one token at a time after it has read the prompt.',
    definition:
      'Decode is the inference phase that generates output tokens autoregressively, normally one accepted token per sequence per model step.',
    explanation:
      'Each new token depends on preceding tokens, which limits parallelism across time. The model repeatedly reads weights and the sequence’s KV cache, making decode especially sensitive to memory bandwidth, batching, and communication.',
    significance:
      'Decode controls streaming interactivity and often dominates the cost of long outputs. Techniques such as speculative decoding, MTP, quantization, and wide expert parallelism aim to reduce the work or time required per accepted token.',
    benchmarkContext:
      'InferenceX decode performance appears as tok/s/user and aggregate tok/s/GPU across concurrency. Output sequence length, batch shape, precision, and parallelism must match for a fair comparison.',
    relatedTerms: ['prefill', 'time-per-output-token', 'kv-cache', 'speculative-decoding'],
    articleSlugs: [INFERENCEX_V2, GB300_DSV4, SGLANG_056],
  },
  {
    slug: 'kv-cache',
    term: 'KV cache',
    aliases: ['key-value cache', 'attention cache'],
    category: 'Serving',
    plainEnglish:
      'The KV cache is the model’s working memory for the current conversation. It keeps useful notes and avoids rereading everything for every new token.',
    definition:
      'The KV cache stores attention key and value states for tokens already processed, allowing each decode step to reuse them.',
    explanation:
      'The cache grows with sequence length, batch size, layer count, and the number and width of stored attention heads. During decode it is repeatedly read from accelerator memory, so both capacity and bandwidth matter.',
    significance:
      'KV-cache pressure limits concurrency and long-context serving. Cache quantization, paged allocation, latent attention, prefix reuse, and disaggregated transfer systems all target its capacity or movement cost.',
    benchmarkContext:
      'InferenceX disables prefix caching for random-data comparisons unless a recipe states otherwise. That keeps unrelated requests from receiving artificial cache hits and makes raw serving stacks easier to compare.',
    relatedTerms: [
      'prefill',
      'decode',
      'prefix-caching',
      'multi-head-latent-attention',
      'high-bandwidth-memory',
    ],
    articleSlugs: [INFERENCEX_V2, MI355X_KIMI, SGLANG_056],
  },
  {
    slug: 'prefix-caching',
    term: 'Prefix caching',
    aliases: ['prompt caching', 'automatic prefix caching'],
    category: 'Serving',
    plainEnglish:
      'Prefix caching remembers the work for a repeated beginning, such as the same system prompt, so the model can skip that work next time.',
    definition:
      'Prefix caching reuses KV-cache state when multiple requests begin with the same token sequence.',
    explanation:
      'A repeated system prompt, shared document, or common conversation prefix can reuse cached states. A cache hit can reduce prompt computation and time to first token.',
    significance:
      'Production workloads with repeated prefixes may outperform synthetic random-token benchmarks. The benefit depends on hit rate, cache capacity, eviction policy, and whether requests route to workers that hold the needed state.',
    benchmarkContext:
      'InferenceX generally disables prefix caching on random datasets to isolate full prompt processing from cache policy. Treat benchmark cost as a no-hit baseline unless the recipe says otherwise.',
    relatedTerms: ['kv-cache', 'prefill', 'time-to-first-token', 'nvidia-dynamo'],
    articleSlugs: [INFERENCEX_V2, GB200_KIMI],
  },
  {
    slug: 'disaggregated-inference',
    term: 'Disaggregated inference',
    abbreviation: 'PD disaggregation',
    aliases: ['disaggregated prefill', 'disagg'],
    category: 'Serving',
    plainEnglish:
      'Disaggregated inference gives prompt reading and answer writing to separate GPU teams, so each team can be tuned for its own job.',
    definition:
      'Disaggregated inference runs prefill and decode on separate worker pools and transfers request state between them.',
    explanation:
      'Prefill is usually compute heavy, while decode is often memory-bandwidth and communication heavy. Separating them lets each pool use different GPU counts, parallelism, batch policy, and scaling behavior instead of compromising on one shared configuration.',
    significance:
      'Disaggregation can isolate decode from prompt spikes and improve throughput or service-level predictability. It also adds routing and KV-transfer overhead, so weak networking or immature kernels can make it slower than aggregated serving.',
    benchmarkContext:
      'A disagg label identifies the serving layout, not its performance. Judge it from the prefill and decode world sizes, TP/EP layout, framework, network domain, and the interactivity range where its frontier leads.',
    relatedTerms: ['prefill', 'decode', 'kv-cache', 'nvidia-dynamo', 'wide-expert-parallelism'],
    articleSlugs: [INFERENCEX_V2, GB200_R1, GB300_DSV4, GB200_KIMI],
  },
  {
    slug: 'speculative-decoding',
    term: 'Speculative decoding',
    aliases: ['spec decode', 'draft-and-verify decoding'],
    category: 'Serving',
    plainEnglish:
      'Speculative decoding lets a cheaper helper draft several tokens ahead, then asks the full model to approve them together instead of generating each one separately.',
    definition:
      'Speculative decoding proposes several future tokens cheaply and verifies them together with the target model, reducing the number of expensive serial decode steps.',
    explanation:
      'A draft model or built-in prediction heads generate candidates. The target model evaluates those candidates in a batched verification pass and accepts the valid prefix without changing the target distribution when the algorithm is implemented exactly.',
    significance:
      'The speedup depends on how many draft tokens are accepted and on the cost of drafting and verification. Dense and MoE models can behave differently because verifying several positions may activate more expert weights.',
    benchmarkContext:
      'Compare speculative recipes at realistic acceptance rates and verify model quality. InferenceX distinguishes MTP-enabled and disabled curves because the benefit changes across concurrency and interactivity.',
    relatedTerms: ['multi-token-prediction', 'decode', 'batching', 'mixture-of-experts'],
    articleSlugs: [INFERENCEX_V2, DEEPSEEK_V4, B200_GLM5],
  },
  {
    slug: 'multi-token-prediction',
    term: 'Multi-token prediction',
    abbreviation: 'MTP',
    aliases: ['multi-token prediction heads'],
    category: 'Serving',
    plainEnglish:
      'MTP lets the model guess several upcoming tokens at once and then verify them, reducing the number of slow one-token-at-a-time steps.',
    definition:
      'Multi-token prediction uses auxiliary heads trained with the model to propose multiple future tokens for speculative verification.',
    explanation:
      'Unlike a separate draft model, MTP proposals come from the target model’s own representation. This can improve proposal alignment and simplify deployment, but it requires a checkpoint trained with compatible MTP modules and engine support for the verification path.',
    significance:
      'MTP can exchange otherwise underused compute for fewer memory-bound decode steps. Gains are largest when draft acceptance is high and verification fits into available compute; at large batches the extra work may provide less benefit.',
    benchmarkContext:
      'InferenceX reports MTP as a recipe dimension. Acceptance rate or acceptance length, workload distribution, numerical quality checks, and matched interactivity all matter when translating a benchmark gain to production.',
    relatedTerms: ['speculative-decoding', 'decode', 'interactivity', 'eagle'],
    articleSlugs: [INFERENCEX_V2, DEEPSEEK_V4, B200_GLM5, MI355X_GLM5],
  },
  {
    slug: 'eagle',
    term: 'EAGLE',
    aliases: ['EAGLE speculative decoding', 'EAGLE-3'],
    category: 'Serving',
    plainEnglish:
      'EAGLE is a particular way to draft several likely next tokens for the main model to check, which can make answers stream faster.',
    definition:
      'EAGLE is a family of speculative-decoding methods that predicts draft continuations from features associated with the target language model and then verifies them with the target model.',
    explanation:
      'Serving frameworks expose EAGLE through settings such as the number of speculative steps, draft tokens, and candidate width. Model checkpoints and draft components must match the engine implementation.',
    significance:
      'EAGLE can raise accepted tokens per target-model step, but its result is workload dependent. Acceptance behavior, draft overhead, model architecture, and batch size determine whether the extra path improves end-to-end serving.',
    benchmarkContext:
      'Some InferenceX curves label the feature MTP because the model supplies multi-token heads while the engine uses EAGLE-style speculative plumbing. The recipe flags and checkpoint details identify the exact implementation.',
    relatedTerms: ['speculative-decoding', 'multi-token-prediction', 'decode', 'sglang'],
    articleSlugs: [B200_GLM5, DEEPSEEK_V4],
  },
  {
    slug: 'tensor-parallelism',
    term: 'Tensor parallelism',
    abbreviation: 'TP',
    category: 'Parallelism',
    plainEnglish:
      'Tensor parallelism splits one large calculation across several GPUs so they solve it together.',
    definition:
      'Tensor parallelism shards individual tensor operations and model weight matrices across multiple accelerators.',
    explanation:
      'Each layer executes cooperatively across ranks. Partial results must be combined with collective communication, commonly all-reduce operations after parallel matrix multiplications.',
    significance:
      'TP lets a model fit across devices and can improve low-batch interactivity by pooling compute and memory bandwidth. Communication occurs frequently, so scaling eventually runs into the bandwidth and latency of the interconnect.',
    benchmarkContext:
      'InferenceX recipe labels such as TP=4 or TP=8 state how many ranks participate in each tensor-parallel group. Compare TP together with EP, DP, node count, and network domain.',
    relatedTerms: ['expert-parallelism', 'data-parallelism', 'all-reduce', 'nvlink'],
    articleSlugs: [INFERENCEX_V2, SGLANG_056, MI355X_QWEN],
  },
  {
    slug: 'expert-parallelism',
    term: 'Expert parallelism',
    abbreviation: 'EP',
    category: 'Parallelism',
    plainEnglish:
      'Expert parallelism gives different GPUs different specialist parts of a model, then sends each token to the specialists it needs.',
    definition:
      'Expert parallelism distributes the experts of a mixture-of-experts model across accelerators and routes tokens to the ranks holding their selected experts.',
    explanation:
      'MoE layers activate only a subset of experts for each token. EP exploits that sparsity so every GPU need not store or compute every expert, but it introduces dispatch and combine all-to-all communication around each MoE layer.',
    significance:
      'Wider EP reduces the expert-weight footprint per GPU and can improve decode batching and capacity. Its benefit depends on balanced routing and an interconnect fast enough to move tokens among ranks.',
    benchmarkContext:
      'InferenceX reports EP width as part of distributed recipes. NVL72 systems can keep much wider groups inside the NVLink scale-up domain than conventional eight-GPU nodes.',
    relatedTerms: [
      'mixture-of-experts',
      'wide-expert-parallelism',
      'all-to-all',
      'tensor-parallelism',
    ],
    articleSlugs: [INFERENCEX_V2, GB200_R1, GB200_KIMI],
  },
  {
    slug: 'data-parallelism',
    term: 'Data parallelism',
    abbreviation: 'DP',
    category: 'Parallelism',
    plainEnglish:
      'Data parallelism makes multiple copies of the model and divides incoming work among them, like opening more identical checkout lanes.',
    definition:
      'Data parallelism runs replicated model or layer groups on multiple ranks and distributes requests or tokens among those replicas.',
    explanation:
      'Classic DP duplicates the complete model. In LLM serving, hybrid forms such as data-parallel attention can replicate attention while expert weights use a different sharding strategy. Each replica handles separate work with less per-layer synchronization than TP.',
    significance:
      'DP scales aggregate capacity cleanly when weights fit, but replication consumes memory and repeats weight reads. Load balancing and cache locality determine how evenly the replicas are used.',
    benchmarkContext:
      'Modern MoE deployments combine DP, TP, and EP. Read the DP count together with the other two dimensions.',
    relatedTerms: ['tensor-parallelism', 'expert-parallelism', 'batching', 'mixture-of-experts'],
    articleSlugs: [INFERENCEX_V2, MI355X_DSV4, GB200_KIMI],
  },
  {
    slug: 'wide-expert-parallelism',
    term: 'Wide expert parallelism',
    abbreviation: 'Wide EP',
    category: 'Parallelism',
    plainEnglish:
      'Wide expert parallelism spreads a model’s specialists across many GPUs, giving each GPU less expert data to hold and move.',
    definition:
      'Wide expert parallelism uses a large number of accelerator ranks for the expert-parallel group of a mixture-of-experts model.',
    explanation:
      'Spreading hundreds of experts across more ranks reduces the number of expert weights stored and streamed by each GPU. Tokens from a larger peer group can also form more efficient expert batches, while dispatch and combine traffic grows across the group.',
    significance:
      'Wide EP is most effective inside a high-bandwidth scale-up network. Crossing a slower scale-out fabric can turn the same all-to-all traffic into the bottleneck and erase the memory-side benefit.',
    benchmarkContext:
      'InferenceX uses wide EP in rack-scale disaggregated recipes. Compare the EP width, decode pool size, fabric, and GPU model together.',
    relatedTerms: [
      'expert-parallelism',
      'mixture-of-experts',
      'all-to-all',
      'scale-up-vs-scale-out',
    ],
    articleSlugs: [GB200_KIMI, GB200_R1, INFERENCEX_V2, GB300_DSV4],
  },
  {
    slug: 'all-reduce',
    term: 'All-reduce',
    category: 'Parallelism',
    plainEnglish:
      'All-reduce lets every GPU solve one piece of a calculation, combines those pieces, and gives the combined result back to everyone.',
    definition:
      'All-reduce is a collective communication operation that combines values from every participating rank and returns the reduced result to every rank.',
    explanation:
      'Tensor-parallel layers use all-reduce to assemble partial matrix-operation results. The collective may sum or otherwise reduce values while moving data through an optimized ring, tree, or fabric-specific algorithm.',
    significance:
      'Because TP can require collectives at many layers for every generated token, all-reduce latency and bandwidth set a hard scaling limit. Small decode batches are especially sensitive to fixed communication latency.',
    benchmarkContext:
      'A higher TP width can add compute and memory bandwidth but also expands the collective group. Results must show whether the interconnect turns that larger group into a net gain.',
    relatedTerms: ['tensor-parallelism', 'all-to-all', 'nvlink', 'scale-up-vs-scale-out'],
    articleSlugs: [INFERENCEX_V2],
  },
  {
    slug: 'all-to-all',
    term: 'All-to-all',
    category: 'Parallelism',
    plainEnglish:
      'All-to-all is a coordinated exchange where every GPU sends a different package of data to every other GPU.',
    definition:
      'All-to-all is a collective pattern in which every participating rank sends distinct data to every other rank.',
    explanation:
      'Expert-parallel MoE layers use an all-to-all dispatch to send tokens to their selected experts and another combine operation to return expert outputs. Traffic volume and imbalance depend on token routing.',
    significance:
      'All-to-all is more demanding than simple point-to-point transfers and can become network bound as EP grows. Specialized kernels overlap communication with compute and optimize token packing to keep the fabric busy.',
    benchmarkContext:
      'Rack-scale NVLink can keep wide-EP all-to-all traffic inside the scale-up domain. Multi-node recipes over InfiniBand or RoCE must overcome a much lower per-GPU scale-out bandwidth.',
    relatedTerms: [
      'expert-parallelism',
      'wide-expert-parallelism',
      'all-reduce',
      'scale-up-vs-scale-out',
    ],
    articleSlugs: [GB200_R1, GB200_KIMI, INFERENCEX_V2],
  },
  {
    slug: 'scale-up-vs-scale-out',
    term: 'Scale-up vs. scale-out networking',
    aliases: ['scale-up domain', 'scale-out fabric'],
    category: 'Parallelism',
    plainEnglish:
      'Scale-up is the ultra-fast network inside one tightly connected GPU system. Scale-out is the broader network connecting separate servers or racks.',
    definition:
      'Scale-up networking connects accelerators inside one tightly coupled system, while scale-out networking connects multiple systems or racks into a larger cluster.',
    explanation:
      'Scale-up fabrics such as NVLink offer very high per-GPU bandwidth and low latency for fine-grained collectives. Scale-out fabrics such as InfiniBand or RoCE reach more machines but usually provide much less bandwidth per accelerator.',
    significance:
      'Distributed inference crosses both domains. Frequent TP or EP collectives benefit disproportionately from staying inside scale-up, while coarser request routing and some prefill/decode transfers can tolerate scale-out.',
    benchmarkContext:
      'System topology determines the communication domain. A B200 in an eight-GPU node and a GB200 NVL72 expose related silicon through different scale-up group sizes.',
    relatedTerms: ['nvlink', 'wide-expert-parallelism', 'all-to-all', 'tensor-parallelism'],
    articleSlugs: [INFERENCEX_V2, GB200_R1, GB200_KIMI],
  },
  {
    slug: 'high-bandwidth-memory',
    term: 'High-bandwidth memory',
    abbreviation: 'HBM',
    category: 'Hardware',
    plainEnglish:
      'HBM is the GPU’s small pool of extremely fast nearby memory, where model weights and working data must fit while inference runs.',
    definition:
      'High-bandwidth memory is stacked memory placed close to an accelerator to provide much higher bandwidth than conventional server memory.',
    explanation:
      'HBM stores model weights, activations, workspace, and KV cache. Capacity determines which models, batch sizes, and parallel layouts fit; bandwidth determines how quickly memory-bound kernels can stream that state.',
    significance:
      'LLM decode often reads far more data than it computes per token, making HBM bandwidth a primary performance limit. Extra capacity can also enable a more efficient recipe even when nominal compute remains similar.',
    benchmarkContext:
      'InferenceX hardware comparisons separate HBM capacity from bandwidth. For example, GB300’s larger capacity fits wider prefill/decode layouts than GB200 despite similar bandwidth per GPU.',
    relatedTerms: ['memory-bandwidth', 'decode', 'kv-cache', 'quantization'],
    articleSlugs: [GB300_DSV4, B200_KIMI, MI355X_DSV4],
  },
  {
    slug: 'memory-bandwidth',
    term: 'Memory bandwidth',
    aliases: ['HBM bandwidth'],
    category: 'Hardware',
    plainEnglish:
      'Memory bandwidth is the width of the pipe feeding data to the GPU’s compute units. A wider pipe keeps them from sitting idle.',
    definition:
      'Memory bandwidth is the rate at which data can be transferred between accelerator memory and the compute units.',
    explanation:
      'A kernel is memory-bandwidth bound when moving its required bytes takes longer than performing its arithmetic. LLM decode frequently enters this regime because each step streams model or expert weights and KV-cache state for relatively little new-token computation.',
    significance:
      'A kernel waiting on memory gains little from additional tensor-core FLOPS. Quantization, batching, cache compression, and expert sharding help by reducing bytes moved or amortizing each weight read across more tokens.',
    benchmarkContext:
      'Use the shape of the concurrency curve to infer regime changes carefully: low batches may be launch or bandwidth bound, while large batches can raise arithmetic intensity and approach compute saturation.',
    relatedTerms: ['high-bandwidth-memory', 'decode', 'quantization', 'wide-expert-parallelism'],
    articleSlugs: [B200_KIMI, GB300_DSV4, SGLANG_056],
  },
  {
    slug: 'nvlink',
    term: 'NVLink',
    aliases: ['NVIDIA NVLink'],
    category: 'Hardware',
    plainEnglish:
      'NVLink is NVIDIA’s high-speed highway between GPUs, allowing them to cooperate much faster than over ordinary server networking.',
    definition:
      'NVLink is NVIDIA’s high-bandwidth accelerator interconnect for moving data directly among GPUs within a scale-up domain.',
    explanation:
      'NVSwitch systems connect multiple NVLink endpoints so collectives can span an eight-GPU server or, in NVL72 products, a 72-GPU rack-scale domain. That bandwidth is distinct from the InfiniBand or Ethernet fabric connecting separate systems.',
    significance:
      'Large TP and especially wide-EP groups exchange data at every generated token. Keeping those collectives on NVLink can make a rack-scale recipe faster than a similar GPU count spread across scale-out links.',
    benchmarkContext:
      'InferenceX compares both node-level GPUs and NVL72 systems. Interpret the system topology and parallel group width before attributing the entire result to per-GPU compute.',
    relatedTerms: ['scale-up-vs-scale-out', 'all-to-all', 'all-reduce', 'wide-expert-parallelism'],
    articleSlugs: [GB200_R1, GB200_KIMI, INFERENCEX_V2],
  },
  {
    slug: 'quantization',
    term: 'Quantization',
    aliases: ['low-precision inference', 'weight quantization'],
    category: 'Numerical precision',
    plainEnglish:
      'Quantization stores the model’s numbers with fewer bits, making it smaller and faster to move, usually with a carefully controlled loss of precision.',
    definition:
      'Quantization represents model weights, activations, or cache values with fewer bits than a higher-precision baseline.',
    explanation:
      'Lower precision reduces memory footprint and bytes transferred and can use faster low-precision tensor-core paths. A complete recipe must specify what is quantized, the format, scaling method, kernel support, and any higher-precision operations retained for stability.',
    significance:
      'A nominal format alone says little about speed or quality. Conversion quality, model calibration, outliers, kernel maturity, and hardware support determine the result.',
    benchmarkContext:
      'InferenceX treats precision as a first-class recipe dimension and pairs throughput measurements with accuracy checks. Compare FP8, FP4, NVFP4, MXFP4, and INT4 only when the model, workload, engine, and quality bar are compatible.',
    relatedTerms: ['fp8', 'fp4', 'nvfp4', 'mxfp4', 'high-bandwidth-memory'],
    articleSlugs: [INFERENCEX_V2, B200_KIMI, B200_GLM5, MI355X_DSV4],
  },
  {
    slug: 'fp8',
    term: 'FP8',
    aliases: ['8-bit floating point'],
    category: 'Numerical precision',
    plainEnglish:
      'FP8 is a compact 8-bit way to store and calculate with model numbers, reducing memory use and often speeding up inference.',
    definition:
      'FP8 is a family of eight-bit floating-point formats used to reduce model storage, memory traffic, and compute cost relative to FP16 or BF16.',
    explanation:
      'Common FP8 encodings trade exponent range against mantissa precision. Serving recipes may use FP8 for weights, activations, KV cache, or selected kernels, with scaling metadata and higher-precision accumulation where needed.',
    significance:
      'FP8 is broadly supported on recent NVIDIA and AMD accelerators and often serves as a stable low-precision baseline. Actual performance depends on end-to-end kernel coverage; fallback operations can erase theoretical gains.',
    benchmarkContext:
      'An InferenceX FP8 label covers the complete recipe. The checkpoint filename, engine, attention backend, KV-cache format, GPU generation, and MTP setting can all change the curve.',
    relatedTerms: ['quantization', 'fp4', 'high-bandwidth-memory', 'rocm', 'cuda'],
    articleSlugs: [INFERENCEX_V2, MI355X_GLM5, B200_MINIMAX],
  },
  {
    slug: 'fp4',
    term: 'FP4',
    aliases: ['4-bit floating point'],
    category: 'Numerical precision',
    plainEnglish:
      'FP4 compresses model numbers into just 4 bits. That can make inference much faster and smaller, but leaves less room for numerical detail.',
    definition:
      'FP4 refers to four-bit floating-point formats used for very low-precision model representation and accelerated matrix operations.',
    explanation:
      'Four-bit formats roughly halve weight storage and traffic again relative to FP8, but their tiny value space requires carefully chosen scaling and hardware-specific kernels. The FP4 label covers several concrete formats.',
    significance:
      'For memory-bound LLM inference, reducing weight bytes can deliver large throughput and capacity gains. Model quality and unsupported operations must be checked because aggressive precision reduction can also introduce error or fallback overhead.',
    benchmarkContext:
      'InferenceX identifies concrete recipe formats such as NVFP4 and MXFP4 where possible and validates representative configurations. Each FP4 line still has its own numerical and operational behavior.',
    relatedTerms: ['quantization', 'nvfp4', 'mxfp4', 'fp8', 'memory-bandwidth'],
    articleSlugs: [INFERENCEX_V2, B200_KIMI, MI355X_DSV4, SGLANG_056],
  },
  {
    slug: 'nvfp4',
    term: 'NVFP4',
    aliases: ['NVIDIA FP4'],
    category: 'Numerical precision',
    plainEnglish:
      'NVFP4 is NVIDIA’s Blackwell-optimized version of 4-bit model math, designed to move less data and use the GPU’s fastest low-precision hardware.',
    definition:
      'NVFP4 is NVIDIA’s block-scaled four-bit floating-point quantization format for Blackwell-generation tensor-core inference.',
    explanation:
      'Weights and activations are represented with compact FP4 values plus scaling information for small blocks. The exact checkpoint, scaling recipe, and kernel path determine both model quality and achieved throughput.',
    significance:
      'NVFP4 can reduce weight bandwidth and activate Blackwell FP4 compute paths, which is especially valuable for large MoE decode. The gain appears only when the serving engine supports the model’s attention, routing, and expert kernels end to end.',
    benchmarkContext:
      'InferenceX articles compare NVFP4 with FP8 or INT4 at matched interactivity. Model workload and cost assumptions stay explicit because a precision label alone cannot establish a fair benchmark.',
    relatedTerms: ['fp4', 'quantization', 'fp8', 'memory-bandwidth', 'cuda'],
    articleSlugs: [B200_GLM5, B200_MINIMAX, B200_KIMI, SGLANG_056],
  },
  {
    slug: 'mxfp4',
    term: 'MXFP4',
    aliases: ['microscaling FP4', 'OCP MX FP4'],
    category: 'Numerical precision',
    plainEnglish:
      'MXFP4 is a 4-bit format that gives small groups of numbers their own scale, helping very compact values keep enough useful range.',
    definition:
      'MXFP4 is a microscaling four-bit floating-point format that shares a scale across small blocks of values.',
    explanation:
      'Block-level scaling gives four-bit values a useful local dynamic range while keeping storage and movement compact. Hardware and software must agree on the block layout, scale representation, and supported matrix kernels.',
    significance:
      'MXFP4 is used in AMD and cross-vendor low-precision inference paths. Checkpoint preparation and kernel coverage determine the practical result; bit width alone does not capture it.',
    benchmarkContext:
      'InferenceX records MXFP4 as part of a complete engine and hardware recipe. Comparisons with NVFP4 or FP8 should use the same model, sequence length, quality requirements, and interactivity target.',
    relatedTerms: ['fp4', 'quantization', 'nvfp4', 'rocm', 'memory-bandwidth'],
    articleSlugs: [MI355X_KIMI, INFERENCEX_V2],
  },
  {
    slug: 'mixture-of-experts',
    term: 'Mixture of experts',
    abbreviation: 'MoE',
    aliases: ['sparse MoE'],
    category: 'Model architecture',
    plainEnglish:
      'A mixture-of-experts model is like a large team of specialists: it calls only the few experts best suited to each token instead of using the whole team every time.',
    definition:
      'A mixture-of-experts model contains many feed-forward expert networks but routes each token through only a selected subset.',
    explanation:
      'A router scores experts for each token, and top-k routing activates the chosen experts plus any shared experts. This lets total parameter count grow much larger than the computation used for one token.',
    significance:
      'MoE inference trades arithmetic sparsity for systems complexity. Expert weights still consume memory, routing can become imbalanced, and distributed deployments require all-to-all communication for dispatch and combine.',
    benchmarkContext:
      'InferenceX covers models with hundreds of experts and reports both total and activated parameters where relevant. TP, EP, DP, precision, and network topology determine whether MoE sparsity becomes a real serving advantage.',
    relatedTerms: [
      'expert-parallelism',
      'wide-expert-parallelism',
      'all-to-all',
      'speculative-decoding',
    ],
    articleSlugs: [GB300_DSV4, B200_KIMI, B200_MINIMAX, MI355X_KIMI],
  },
  {
    slug: 'multi-head-latent-attention',
    term: 'Multi-head latent attention',
    abbreviation: 'MLA',
    category: 'Model architecture',
    plainEnglish:
      'MLA compresses the model’s notes about earlier tokens so long conversations use less memory and are cheaper to continue.',
    definition:
      'Multi-head latent attention compresses attention key and value state into a lower-dimensional latent representation to reduce KV-cache size and memory traffic.',
    explanation:
      'Instead of storing full per-head keys and values for every prior token, MLA stores compressed state and reconstructs or consumes the needed representations through model-specific projections. Implementations require specialized attention kernels.',
    significance:
      'Reducing KV-cache bytes increases feasible context length and concurrency and can lower decode bandwidth pressure. Kernel shape support and tensor-parallel layout can still create large performance differences.',
    benchmarkContext:
      'Several DeepSeek-derived models in InferenceX use MLA. Articles track fixes where an attention backend handled one heads-per-rank shape efficiently but failed or fell back on another.',
    relatedTerms: ['kv-cache', 'decode', 'sparse-attention', 'tensor-parallelism'],
    articleSlugs: [MI355X_KIMI, B200_GLM5, MI355X_DSV4, SGLANG_056],
  },
  {
    slug: 'sparse-attention',
    term: 'Sparse attention',
    aliases: ['DeepSeek Sparse Attention', 'DSA'],
    category: 'Model architecture',
    plainEnglish:
      'Sparse attention lets the model look back at only the most useful parts of a long context instead of rereading every earlier token.',
    definition:
      'Sparse attention limits which prior tokens each query attends to instead of computing attention over the entire available context.',
    explanation:
      'The sparsity pattern may select local, compressed, indexed, or learned subsets of the context. This reduces work and memory movement for long sequences, but the model architecture and runtime need matching indexer and attention kernels.',
    significance:
      'Sparse attention can make very long context practical, but theoretical sparsity alone says little about runtime. Index construction, irregular access, kernel fusion, and precision support determine the realized speedup.',
    benchmarkContext:
      'InferenceX tracks model-specific sparse-attention stacks such as DSA on GLM-5 and DeepSeek-V4. Engine versions and backend choices are part of the result because support has changed rapidly.',
    relatedTerms: ['multi-head-latent-attention', 'kv-cache', 'decode', 'inference-engine'],
    articleSlugs: [B200_GLM5, MI355X_DSV4, GB300_DSV4],
  },
  {
    slug: 'cuda',
    term: 'CUDA',
    aliases: ['NVIDIA CUDA'],
    category: 'Software',
    plainEnglish: 'CUDA is NVIDIA’s software toolbox for making programs run on its GPUs.',
    definition:
      'CUDA is NVIDIA’s GPU computing platform, programming model, compiler toolchain, and library ecosystem.',
    explanation:
      'LLM engines use CUDA kernels and libraries for matrix multiplication, attention, collectives, graph capture, memory management, and custom fused operations. Container, driver, CUDA, and GPU architecture versions must be compatible.',
    significance:
      'Serving performance depends on the software above the silicon. New kernels, CUDA Graph usage, compiler specialization, and library releases can move the benchmark curve without changing the GPU.',
    benchmarkContext:
      'InferenceX recipes pin container images and therefore a concrete CUDA stack. Historical comparisons can isolate the effect of an engine image bump on otherwise identical hardware and configuration.',
    relatedTerms: ['inference-engine', 'nvfp4', 'nvlink', 'rocm', 'tensorrt-llm'],
    articleSlugs: [SGLANG_056, B200_GLM5, INFERENCEX_V2],
  },
  {
    slug: 'rocm',
    term: 'ROCm',
    aliases: ['AMD ROCm'],
    category: 'Software',
    plainEnglish:
      'ROCm is AMD’s software toolbox for running AI and other high-performance programs on AMD GPUs.',
    definition:
      'ROCm is AMD’s open GPU computing software platform, including runtimes, compilers, communication libraries, and optimized math and AI kernels.',
    explanation:
      'vLLM and SGLang use ROCm plus AMD-specific libraries and kernel projects to run on Instinct accelerators. Model support depends on compatible attention, MoE, quantization, collective, and graph-execution paths.',
    significance:
      'Software maturity can dominate cross-vendor inference results. Rapid kernel and engine work has produced multi-fold gains on unchanged MI355X hardware, while missing paths can leave strong theoretical silicon underused.',
    benchmarkContext:
      'InferenceX preserves engine versions and run dates so ROCm improvements can be measured over time. A point-in-time comparison should not be generalized to a later software release.',
    relatedTerms: ['inference-engine', 'mxfp4', 'cuda', 'vllm', 'sglang'],
    articleSlugs: [MI355X_KIMI, MI355X_DSV4, MI355X_QWEN, INFERENCEX_V2],
  },
  {
    slug: 'vllm',
    term: 'vLLM',
    category: 'Software',
    plainEnglish:
      'vLLM is open-source software that organizes requests and GPU memory so language models can serve many users efficiently.',
    definition:
      'vLLM is an open-source LLM inference and serving engine focused on high-throughput scheduling, memory-efficient KV-cache management, and broad model and hardware support.',
    explanation:
      'Its runtime coordinates continuous batching, distributed workers, attention backends, quantized kernels, and OpenAI-compatible serving. Production recipes may also run vLLM workers beneath an orchestration layer such as NVIDIA Dynamo.',
    significance:
      'vLLM releases and backend changes can alter performance across the curve. Model-specific MoE kernels, attention dispatch, wide-EP communication, and scheduler paths all contribute to the result.',
    benchmarkContext:
      'InferenceX treats vLLM as one engine option and pins the exact image in each recipe. Engine name alone does not set a fixed performance level, so comparisons must match model, precision, workload, and topology.',
    relatedTerms: ['inference-engine', 'nvidia-dynamo', 'kv-cache', 'sglang', 'rocm'],
    articleSlugs: [MI355X_KIMI, GB200_KIMI, B200_MINIMAX, B200_KIMI],
  },
  {
    slug: 'sglang',
    term: 'SGLang',
    category: 'Software',
    plainEnglish:
      'SGLang is open-source software for serving language models quickly, with scheduling and optimization features for complex AI workloads.',
    definition:
      'SGLang is an open-source serving engine and language-model programming system optimized for high-performance LLM and multimodal inference.',
    explanation:
      'The serving runtime includes continuous batching, prefix-aware scheduling, distributed parallelism, speculative decoding, and multiple attention and MoE kernel backends across NVIDIA and AMD GPUs.',
    significance:
      'SGLang releases and model-specific kernel work can change throughput on the same hardware. Scheduler overhead matters at low concurrency, while attention, MoE, and communication kernels dominate other regions.',
    benchmarkContext:
      'InferenceX continuously reruns pinned SGLang recipes. Version-to-version curves show where a change affects performance across the operating range and reveal regressions or gains hidden by one peak point.',
    relatedTerms: ['inference-engine', 'eagle', 'vllm', 'rocm', 'cuda'],
    articleSlugs: [SGLANG_056, B200_GLM5, MI355X_DSV4, MI355X_GLM5, MI355X_QWEN],
  },
  {
    slug: 'tensorrt-llm',
    term: 'TensorRT-LLM',
    aliases: ['TRT-LLM', 'TRTLLM'],
    category: 'Software',
    plainEnglish:
      'TensorRT-LLM is NVIDIA’s optimized software stack for getting high inference performance from NVIDIA GPUs.',
    definition:
      'TensorRT-LLM is NVIDIA’s inference stack for compiling, optimizing, and serving large language models on NVIDIA GPUs.',
    explanation:
      'It provides NVIDIA-tuned kernels, quantization paths, distributed execution, and model-specific optimizations. It can run as a serving backend and its kernels can also appear inside other engines through integrations.',
    significance:
      'Tight hardware integration can expose Blackwell and NVL72 features quickly, but model support and engine compatibility remain version specific. A TensorRT-LLM label therefore needs a concrete container and recipe.',
    benchmarkContext:
      'InferenceX includes direct TensorRT-LLM and Dynamo TensorRT-LLM configurations and also tracks cases where SGLang or vLLM uses a TRT-LLM-derived kernel backend.',
    relatedTerms: ['inference-engine', 'cuda', 'nvidia-dynamo', 'nvfp4', 'sglang'],
    articleSlugs: [GB200_R1, INFERENCEX_V2, B200_GLM5, B200_MINIMAX],
  },
  {
    slug: 'nvidia-dynamo',
    term: 'NVIDIA Dynamo',
    aliases: ['Dynamo'],
    category: 'Software',
    plainEnglish:
      'NVIDIA Dynamo coordinates many GPU workers. It routes requests, moves model memory, and assigns prompt reading and answer generation to the right pools.',
    definition:
      'NVIDIA Dynamo is a distributed inference framework that orchestrates request routing, worker pools, KV-cache movement, and disaggregated serving.',
    explanation:
      'Dynamo can place prefill and decode on separately scaled pools and use engines such as vLLM or TensorRT-LLM as worker runtimes. Kernels remain inside those engines while Dynamo handles the surrounding data and control paths.',
    significance:
      'Rack-scale performance depends on the single-GPU runtime plus routing, cache transfer, topology awareness, and pool sizing. Together they determine whether wide parallelism and disaggregation improve end-to-end performance.',
    benchmarkContext:
      'Labels such as Dynamo vLLM and Dynamo TRT-LLM identify both layers of the recipe. InferenceX articles specify the prefill/decode topology because two Dynamo configurations can have very different performance.',
    relatedTerms: [
      'disaggregated-inference',
      'vllm',
      'tensorrt-llm',
      'kv-cache',
      'wide-expert-parallelism',
    ],
    articleSlugs: [GB200_R1, GB300_DSV4, GB200_KIMI, INFERENCEX_V2],
  },
] as const satisfies readonly GlossaryEntry[];

export type GlossaryPreview = Pick<
  GlossaryEntry,
  'slug' | 'term' | 'abbreviation' | 'aliases' | 'category' | 'plainEnglish' | 'definition'
>;

const entriesBySlug: Readonly<Record<string, GlossaryEntry>> = Object.fromEntries(
  entries.map((entry) => [entry.slug, entry]),
);

export function getAllGlossaryEntries(): readonly GlossaryEntry[] {
  return entries;
}

export function getGlossaryEntry(slug: string): GlossaryEntry | undefined {
  return entriesBySlug[slug];
}

export function getRelatedGlossaryEntries(entry: GlossaryEntry): GlossaryEntry[] {
  return entry.relatedTerms.flatMap((slug) => {
    const related = entriesBySlug[slug];
    return related ? [related] : [];
  });
}

export function getAdjacentGlossaryEntries(slug: string): {
  previous: GlossaryEntry | null;
  next: GlossaryEntry | null;
} {
  const sorted = entries.toSorted((a, b) => a.term.localeCompare(b.term));
  const index = sorted.findIndex((entry) => entry.slug === slug);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: sorted[index - 1] ?? null,
    next: sorted[index + 1] ?? null,
  };
}
