export const GLOSSARY_CATEGORIES = [
  'Benchmark metrics',
  'Serving',
  'Agentic inference',
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
const VR_RUBIN = 'vera-rubin-nvl72-vs-gb200-nvl72-inference';
const KIMI_K3 = 'kimi-k3-the-manos-the-mythos-the';
const TILERT = 'ultra-high-interactivity-on-nvidia';
const AGENT_BENCHMARK = 'agentic-benchmark-agent-benchmark-guide';
const AGENTIC_WORKLOADS = 'brief-overview-of-agentic-workloads';
const AGENTX_V3 = 'agentx-inferencexv3-does-cuda-moat';
const AGENTX_DSV4_MI355X_B200 = 'deepseek-v4-pro-agentx-mi355x-vs-b200-august';
const AGENTX_DSV4_B200_B300 = 'deepseek-v4-pro-agentx-b200-vs-b300-kv-working-set';
const AGENTX_DSV4_GB200_GB300 = 'deepseek-v4-pro-agentx-gb200-vs-gb300-disagg';
const AGENTX_K3_ATOM = 'kimi-k3-agentx-mi355x-atom-vs-gb300-nvl72';
const AGENTX_M3_TRT = 'minimax-m3-agentx-b300-trtllm-tp2-vs-the-field';
const AGENTX_M3_RACK = 'minimax-m3-agentx-b200-b300-vs-rack-scale';
const AGENTX_QWEN_SGLANG = 'qwen3-5-397b-agentx-nvidia-vs-amd-sglang';
const AGENTX_QWEN_B300 = 'qwen3-5-397b-agentx-b300-fp4-vs-h100';
const AGENTX_GLM_SGLANG = 'glm-5-3-agentx-nvidia-vs-amd-sglang-150-toks';
const AGENTX_GLM_ATOM = 'glm-5-3-agentx-mi355x-atom-vs-gb300-nvl72';
const JALAPENO = 'openai-jalapeno-better-than-nvidia';

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
      'InferenceX benchmarks complete serving recipes because peak chip specifications alone cannot describe serving performance. Each curve captures a model, engine, numerical precision, parallelism strategy, chip system, sequence length, and concurrency sweep.',
    relatedTerms: ['inference-engine', 'prefill', 'decode', 'throughput', 'interactivity'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2],
  },
  {
    slug: 'agentic-inference',
    term: 'Agentic inference',
    aliases: ['AI agent inference', 'agent inference'],
    category: 'Agentic inference',
    plainEnglish:
      'Agentic inference serves an AI system that works through a task over many model requests, often using tools and delegating work along the way.',
    definition:
      'Agentic inference is model serving for agents that maintain state across multiple turns, call tools, reuse growing context, and may run subagents in parallel.',
    explanation:
      'A single agent session can alternate between model requests, tool execution, and waiting periods. Later requests often include much of the earlier conversation, so prefix caching and KV-cache capacity affect both speed and cost. Parallel subagents add branches with their own request timing and context growth.',
    significance:
      'Fixed input and output lengths miss several pressures created by agents. Long shared prefixes change cache behavior, tool delays make traffic bursty, and concurrent branches compete for serving capacity. Hardware and software can rank differently under this request pattern.',
    benchmarkContext:
      'InferenceX uses AgentX to measure agentic inference. Read AgentX results alongside fixed-sequence scenarios because they answer different capacity questions. AgentX reports the behavior of a closed-loop session replay instead of treating every request as an independent batch item.',
    relatedTerms: ['agentx', 'agentic-coding-workload', 'subagent', 'prefix-caching', 'kv-cache'],
    articleSlugs: [AGENTIC_WORKLOADS, AGENT_BENCHMARK, TILERT, VR_RUBIN, INFERENCEX_V2, AGENTX_V3],
  },
  {
    slug: 'agentx',
    term: 'AgentX',
    aliases: ['AgentX benchmark', 'AgentX scenario'],
    category: 'Agentic inference',
    plainEnglish:
      'AgentX is the InferenceX workload for testing how inference systems serve complete long-context, multi-turn coding-agent sessions.',
    definition:
      'AgentX is InferenceX’s agentic inference benchmark scenario, built from workload shapes derived from opt-in coding-agent traces after original content is removed.',
    explanation:
      'AgentX reconstructs session structure with deterministic synthetic tokens. Its replay keeps request lengths, turn timing, shared-prefix growth, tool pauses, and main-agent or subagent dependencies while excluding original prompts, generated code, and tool payloads. The serving stack receives the traffic pattern without receiving the source conversation.',
    significance:
      'Long contexts pressure KV-cache capacity, repeated prefixes reward effective cache reuse, and branch timing tests request scheduling. These effects are small or absent in short, independent requests. The resulting curve describes the complete serving system under agent traffic.',
    benchmarkContext:
      'The Agentic scenario appears by default for models with matching AgentX data. Compare its throughput, latency, and interactivity only with other AgentX runs at compatible settings. Use fixed-sequence scenarios when the target workload is a conventional request stream.',
    relatedTerms: [
      'agentic-inference',
      'agentic-coding-workload',
      'trace-replay',
      'closed-loop-benchmark',
      'subagent',
    ],
    articleSlugs: [AGENTIC_WORKLOADS, AGENT_BENCHMARK, TILERT, VR_RUBIN, AGENTX_V3],
  },
  {
    slug: 'agentic-coding-workload',
    term: 'Agentic coding workload',
    aliases: ['coding-agent workload', 'software-engineering agent workload'],
    category: 'Agentic inference',
    plainEnglish:
      'This is the request pattern created when a coding agent reads a repository, edits code, runs tools, and revisits the model until the task is done.',
    definition:
      'An agentic coding workload is a multi-turn inference workload produced by a software agent that combines model generation with repository inspection, tool calls, code changes, and delegated subtasks.',
    explanation:
      'Request sizes grow as the agent accumulates instructions, files, tool results, and earlier responses. Many turns reuse a large common prefix. Tool execution inserts uneven delays, while subagents can create overlapping request branches. These properties produce a different traffic shape from fixed-length prompt benchmarks.',
    significance:
      'Coding agents can keep a serving system busy for minutes or hours through a chain of dependent calls. Cache policy, scheduler fairness, memory capacity, and tail latency all affect task progress. Peak decode throughput alone cannot describe that behavior.',
    benchmarkContext:
      'AgentX represents this workload with trace-derived request shapes and deterministic synthetic content. It measures inference-system performance. Model coding quality requires a separate evaluation, so quality scores and AgentX serving results answer separate questions.',
    relatedTerms: ['agentic-inference', 'agentx', 'subagent', 'prefix-caching', 'trace-replay'],
    articleSlugs: [AGENTIC_WORKLOADS, AGENT_BENCHMARK, TILERT, VR_RUBIN, INFERENCEX_V2, AGENTX_V3],
  },
  {
    slug: 'trace-replay',
    term: 'Trace replay',
    aliases: ['workload replay', 'session replay'],
    category: 'Agentic inference',
    plainEnglish:
      'Trace replay recreates the timing and shape of recorded sessions so a benchmark sends requests like the original workload.',
    definition:
      'Trace replay is a benchmarking method that converts recorded request relationships, lengths, and timing into a repeatable workload for a system under test.',
    explanation:
      'A replay can preserve a directed graph of main-agent turns, parallel subagent branches, and auxiliary requests. Deterministic synthetic tokens replace private content while retaining token counts and prefix relationships. Recorded gaps between turns reproduce the periods when an agent was using tools or waiting on dependencies.',
    significance:
      'The method captures traffic features that a list of independent prompts cannot express. It also makes repeated hardware and software comparisons possible from the same session shapes. AgentX removes source-conversation content before publishing replay data.',
    benchmarkContext:
      'AgentX replays trace-derived sessions through AIPerf. A fixed seed selects sessions, starting points, and synthetic content. Reported results cover the profiling window after cache warmup, which keeps run-to-run comparisons focused on steady-state serving behavior.',
    relatedTerms: ['agentx', 'closed-loop-benchmark', 'subagent', 'concurrency', 'kv-cache'],
    articleSlugs: [AGENTIC_WORKLOADS, AGENT_BENCHMARK, TILERT, VR_RUBIN, AGENTX_V3],
  },
  {
    slug: 'closed-loop-benchmark',
    term: 'Closed-loop benchmark',
    aliases: ['closed-loop load test', 'closed-loop workload'],
    category: 'Agentic inference',
    plainEnglish:
      'In a closed-loop benchmark, each simulated user waits for one step to finish before sending the next step in that session.',
    definition:
      'A closed-loop benchmark generates new work from each client in response to completion of its previous dependent request, subject to the workload’s recorded delays and branch structure.',
    explanation:
      'Concurrency is the number of active clients or sessions; the simultaneous request count changes over time. Faster systems complete turns sooner and therefore issue more requests during the same profiling period. The exact request mix can vary slightly because progress through each sampled session depends on completion time.',
    significance:
      'This load model resembles interactive agents, where the next action depends on the previous result. Throughput and latency remain coupled: a faster response advances the session and creates later work sooner. Low-concurrency runs can show more sampling variation than large pooled runs.',
    benchmarkContext:
      'AgentX uses closed-loop concurrency. Its concurrency value is the number of agent clients; request batch size changes as the sessions advance. Read throughput, time to first token, and interactivity together.',
    relatedTerms: ['agentx', 'trace-replay', 'concurrency', 'throughput', 'latency'],
    articleSlugs: [AGENT_BENCHMARK, TILERT, INFERENCEX_V2, AGENTX_V3],
  },
  {
    slug: 'subagent',
    term: 'Subagent',
    aliases: ['child agent', 'delegated agent'],
    category: 'Agentic inference',
    plainEnglish:
      'A subagent is an additional agent started by a main agent to handle a smaller piece of the same task, sometimes at the same time as other work.',
    definition:
      'A subagent is a delegated agent execution with its own conversation state and model requests, connected to a parent session through task and dependency relationships.',
    explanation:
      'The main agent can launch one or more subagents and later consume their results. Their requests may overlap with the parent or with each other, creating branches in the session graph. Each branch can grow a separate context while sharing some initial instructions or repository state.',
    significance:
      'Subagents make agent traffic less sequential. A serving stack may receive bursts of long-context requests from one user task, and scheduler decisions affect how quickly branches finish. Aggregate throughput can rise while an individual branch waits longer for service.',
    benchmarkContext:
      'AgentX preserves subagent branches from the trace-derived workload and replays their dependencies. Delegation quality is outside its scope. The benchmark measures how the inference system serves the resulting parallel requests, shared prefixes, and completion timing.',
    relatedTerms: [
      'agentic-inference',
      'agentic-coding-workload',
      'agentx',
      'trace-replay',
      'concurrency',
    ],
    articleSlugs: [AGENTIC_WORKLOADS, TILERT, VR_RUBIN, AGENTX_V3, AGENTX_DSV4_GB200_GB300],
  },
  {
    slug: 'inference-engine',
    term: 'Inference engine',
    aliases: ['serving engine', 'LLM serving framework'],
    category: 'Serving',
    plainEnglish:
      'The inference engine is the traffic controller behind an AI service: it keeps incoming requests moving and makes sure the chips do the right work at the right time.',
    definition:
      'An inference engine is the software runtime that turns model weights and incoming requests into generated outputs on accelerators.',
    explanation:
      'The engine owns request scheduling, batching, KV-cache allocation, distributed execution, kernel selection, and token sampling. vLLM, SGLang, and TensorRT-LLM can run the same model on the same chip yet produce different curves because their schedulers, kernels, and distributed strategies differ.',
    significance:
      'Engine version and configuration can matter as much as chip choice. A scheduler change, a fused attention kernel, or a corrected model-specific path can move throughput several-fold without any hardware change.',
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
      'InferenceX commonly normalizes throughput as tokens per second per chip so systems of different sizes can be compared. Higher batching or concurrency often raises aggregate throughput because weight reads and compute are amortized across more requests, but individual users may receive tokens more slowly.',
    significance:
      'Maximum throughput captures only one operating point. A system can lead in tokens per second while operating at interactivity too low for a real-time product. The useful comparison is throughput at a latency or interactivity target appropriate to the workload.',
    benchmarkContext:
      'On an InferenceX chart, throughput is read together with interactivity across the full concurrency sweep. The Pareto frontier removes operating points that are worse on both axes.',
    measurement: { label: 'Typical unit', value: 'tokens/second/chip (tok/s/chip)' },
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
      'InferenceX plots tokens per second per user against throughput or cost. Iso-interactivity tables interpolate each system’s Pareto frontier at the same token rate so the comparison holds user experience constant. Because this axis ignores the wait before the first token, agentic charts also offer E2E Normalized Interactivity, which folds TTFT into the same unit.',
    measurement: { label: 'Typical unit', value: 'tokens/second/user (tok/s/user)' },
    relatedTerms: [
      'time-per-output-token',
      'throughput',
      'iso-interactivity',
      'e2e-normalized-interactivity',
      'latency',
    ],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, MI355X_KIMI, TILERT],
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
    relatedTerms: ['time-to-first-token', 'time-per-output-token', 'tail-latency', 'interactivity'],
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
    articleSlugs: [INFERENCEX_V2, SGLANG_056, MI355X_GLM5, TILERT],
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
      'Batching is like putting several passengers on one bus: the chip handles multiple requests together so each trip does more useful work.',
    definition:
      'Batching groups work from multiple requests so an accelerator can process their tokens together.',
    explanation:
      'Large matrix operations use chips more efficiently than many tiny operations. Modern serving engines continuously add and remove sequences as requests arrive and finish, without waiting for a fixed batch to complete. The resulting batch shape changes throughout prefill and decode.',
    significance:
      'Batching creates the core throughput-latency tradeoff. Larger effective batches amortize weight reads and launch overhead but generally increase the time between tokens for each user.',
    benchmarkContext:
      'Concurrency supplies work to the batcher. Parallelism, sequence lengths, request completion, and scheduler policy determine the effective batch observed by the chip.',
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
      'InferenceX connects Pareto-optimal points from a concurrency and configuration sweep. Iso-interactivity comparisons interpolate along those frontiers because direct comparisons of arbitrary raw points can mislead. Best-per-SKU views now merge the permitted optimizations into one curve per model, chip SKU, and engine, so adjacent points on a single line may differ in speculative decoding, disaggregation, or KV cache offload. Each point still exposes the exact configuration that produced it.',
    relatedTerms: [
      'throughput',
      'interactivity',
      'iso-interactivity',
      'kv-cache-offload',
      'concurrency',
    ],
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
      'InferenceX articles use iso-interactivity tables for hardware, precision, and software comparisons. Values outside a measured frontier are marked unreachable and are not extrapolated beyond observed data. The frontier is always built on throughput against interactivity; cost per million tokens and joules per token are then derived from the interpolated throughput rather than splined on their own, because each is a per-chip constant divided by that throughput and splining it separately would break the identity between knots.',
    relatedTerms: ['interactivity', 'pareto-frontier', 'throughput', 'performance-per-dollar'],
    articleSlugs: [B200_GLM5, B200_MINIMAX, B200_KIMI, GB300_DSV4, AGENTX_GLM_SGLANG],
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
      'InferenceX includes ISL and OSL in chart labels and recipe descriptions. Compare systems on the same workload shape before attributing a difference to hardware or software. Agentic runs have no single pair to quote: lengths follow a roughly lognormal distribution, so the point detail view plots the fitted distribution and reports percentiles, and a p90 or p99 input can be several times the median.',
    relatedTerms: ['prefill', 'decode', 'kv-cache', 'agentx', 'time-to-first-token'],
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
      value: '$/M = TCO($/chip-hour) × 1,000,000 / (3600 × tok/s/chip)',
    },
    relatedTerms: [
      'total-cost-of-ownership',
      'throughput',
      'iso-interactivity',
      'performance-per-dollar',
    ],
    articleSlugs: [INFERENCEX_V2, B200_KIMI, B200_GLM5, GB300_DSV4, AGENTX_GLM_SGLANG],
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
      'InferenceX compares perf/$ at matched interactivity and names the TCO inputs used. Ratios should not be carried across different model, sequence-length, precision, or latency regimes. The charts express the same economics as tokens per dollar, which reads in the higher-is-better direction and is the default y-axis.',
    relatedTerms: [
      'cost-per-million-tokens',
      'tokens-per-dollar',
      'total-cost-of-ownership',
      'iso-interactivity',
      'throughput',
    ],
    articleSlugs: [B200_GLM5, B200_MINIMAX, B200_KIMI, MI355X_GLM5, AGENTX_DSV4_MI355X_B200],
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
      'A chip’s purchase price is only one input. TCO models can include host systems, networking, power delivery, cooling, facilities, financing, depreciation, maintenance, and expected utilization, then normalize the result to cost per chip-hour.',
    significance:
      'Using TCO instead of list price makes cross-system economics more realistic, especially for rack-scale products whose networking and power infrastructure differ. The result remains a model and should be read with its assumptions.',
    benchmarkContext:
      'InferenceX combines SemiAnalysis AI Cloud TCO inputs with observed tok/s/chip. This separates hourly system cost from the software and workload behavior that determines how many tokens that hour produces.',
    relatedTerms: [
      'cost-per-million-tokens',
      'performance-per-dollar',
      'tokens-per-megawatt',
      'throughput',
    ],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, GB200_R1, VR_RUBIN, JALAPENO],
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
      'Compare tokens/MW at the same model, workload shape, precision, and interactivity. Otherwise a high-throughput low-interactivity point can appear efficient while failing the target user experience. Energy per token expresses the same provisioned budget per unit of output, and InferenceX additionally reports measured accelerator energy where the telemetry is trustworthy.',
    measurement: { label: 'Typical unit', value: 'tokens/second per provisioned utility MW' },
    relatedTerms: [
      'throughput',
      'energy-per-token',
      'interactivity',
      'total-cost-of-ownership',
      'performance-per-dollar',
    ],
    articleSlugs: [INFERENCEMAX, DEEPSEEK_V4, VR_RUBIN, JALAPENO],
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
      'Disaggregated recipes place prefill on a separately sized chip pool. When reading a result, check the prefill tensor parallelism, chip count, input length, and whether KV state must cross a network before decode.',
    relatedTerms: [
      'decode',
      'kv-cache',
      'chunked-prefill',
      'time-to-first-token',
      'arithmetic-intensity',
    ],
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
      'InferenceX decode performance appears as tok/s/user and aggregate tok/s/chip across concurrency. Output sequence length, batch shape, precision, and parallelism must match for a fair comparison.',
    relatedTerms: ['prefill', 'time-per-output-token', 'kv-cache', 'speculative-decoding'],
    articleSlugs: [INFERENCEX_V2, GB300_DSV4, SGLANG_056, TILERT],
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
      'InferenceX disables prefix caching for fixed-sequence comparisons on random data unless a recipe states otherwise, which keeps unrelated requests from receiving artificial cache hits. AgentX is the deliberate exception: its replayed sessions are built to reuse prefixes, so cache capacity, eviction policy, and offload are part of what the scenario measures.',
    relatedTerms: [
      'prefill',
      'decode',
      'prefix-caching',
      'kv-cache-offload',
      'multi-head-latent-attention',
      'high-bandwidth-memory',
    ],
    articleSlugs: [INFERENCEX_V2, MI355X_KIMI, SGLANG_056, KIMI_K3, AGENTX_V3],
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
      'InferenceX disables prefix caching on random fixed-sequence datasets to isolate full prompt processing from cache policy, so treat those numbers as a no-hit baseline. AgentX inverts this: hit rate is a reported quantity there, shown per point alongside the offload tier it was served from, because reuse is the defining property of the workload.',
    relatedTerms: [
      'kv-cache',
      'kv-cache-offload',
      'kv-aware-routing',
      'prefill',
      'time-to-first-token',
      'nvidia-dynamo',
    ],
    articleSlugs: [AGENTIC_WORKLOADS, INFERENCEX_V2, GB200_KIMI, KIMI_K3, AGENTX_V3],
  },
  {
    slug: 'disaggregated-inference',
    term: 'Disaggregated inference',
    abbreviation: 'PD disaggregation',
    aliases: ['disaggregated prefill', 'disagg'],
    category: 'Serving',
    plainEnglish:
      'Disaggregated inference gives prompt reading and answer writing to separate chip teams, so each team can be tuned for its own job.',
    definition:
      'Disaggregated inference runs prefill and decode on separate worker pools and transfers request state between them.',
    explanation:
      'Prefill is usually compute heavy, while decode is often memory-bandwidth and communication heavy. Separating them lets each pool use different chip counts, parallelism, batch policy, and scaling behavior instead of compromising on one shared configuration.',
    significance:
      'Disaggregation can isolate decode from prompt spikes and improve throughput or service-level predictability. It also adds routing and KV-transfer overhead, so weak networking or immature kernels can make it slower than aggregated serving.',
    benchmarkContext:
      'A disagg label identifies the serving layout, not its performance. Judge it from the prefill and decode world sizes, TP/EP layout, framework, network domain, and the interactivity range where its frontier leads.',
    relatedTerms: ['prefill', 'decode', 'kv-cache', 'nvidia-dynamo', 'wide-expert-parallelism'],
    articleSlugs: [
      INFERENCEX_V2,
      GB200_R1,
      GB300_DSV4,
      GB200_KIMI,
      TILERT,
      AGENTX_V3,
      AGENTX_DSV4_GB200_GB300,
      JALAPENO,
    ],
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
      'Fixed-sequence scenarios keep speculative decoding as part of a curve’s identity, so MTP-enabled and disabled recipes plot separately. Agentic curves instead treat it as point-level metadata and merge the points, with the method named in each tooltip, because AgentX reports the best available curve per model, chip SKU, and engine. Since replayed AgentX content is synthetic, a speculator would accept an unrepresentative number of draft tokens, so runs apply an acceptance length collected per model, speculator, draft length, and thinking mode on an external agentic coding dataset.',
    relatedTerms: ['multi-token-prediction', 'acceptance-length', 'decode', 'batching', 'agentx'],
    articleSlugs: [INFERENCEX_V2, DEEPSEEK_V4, B200_GLM5, KIMI_K3, AGENTX_V3],
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
      'Tensor parallelism splits one large calculation across several chips so they solve it together.',
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
      'Expert parallelism gives different chips different specialist parts of a model, then sends each token to the specialists it needs.',
    definition:
      'Expert parallelism distributes the experts of a mixture-of-experts model across accelerators and routes tokens to the ranks holding their selected experts.',
    explanation:
      'MoE layers activate only a subset of experts for each token. EP exploits that sparsity so every chip need not store or compute every expert, but it introduces dispatch and combine all-to-all communication around each MoE layer.',
    significance:
      'Wider EP reduces the expert-weight footprint per chip and can improve decode batching and capacity. Its benefit depends on balanced routing and an interconnect fast enough to move tokens among ranks.',
    benchmarkContext:
      'InferenceX reports EP width as part of distributed recipes. NVL72 systems can keep much wider groups inside the NVLink scale-up domain than conventional eight-chip nodes.',
    relatedTerms: [
      'mixture-of-experts',
      'wide-expert-parallelism',
      'all-to-all',
      'tensor-parallelism',
    ],
    articleSlugs: [INFERENCEX_V2, GB200_R1, GB200_KIMI, KIMI_K3],
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
      'Wide expert parallelism spreads a model’s specialists across many chips, giving each chip less expert data to hold and move.',
    definition:
      'Wide expert parallelism uses a large number of accelerator ranks for the expert-parallel group of a mixture-of-experts model.',
    explanation:
      'Spreading hundreds of experts across more ranks reduces the number of expert weights stored and streamed by each chip. Tokens from a larger peer group can also form more efficient expert batches, while dispatch and combine traffic grows across the group.',
    significance:
      'Wide EP is most effective inside a high-bandwidth scale-up network. Crossing a slower scale-out fabric can turn the same all-to-all traffic into the bottleneck and erase the memory-side benefit.',
    benchmarkContext:
      'InferenceX uses wide EP in rack-scale disaggregated recipes. Compare the EP width, decode pool size, fabric, and chip model together.',
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
      'All-reduce lets every chip solve one piece of a calculation, combines those pieces, and gives the combined result back to everyone.',
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
      'All-to-all is a coordinated exchange where every chip sends a different package of data to every other chip.',
    definition:
      'All-to-all is a collective pattern in which every participating rank sends distinct data to every other rank.',
    explanation:
      'Expert-parallel MoE layers use an all-to-all dispatch to send tokens to their selected experts and another combine operation to return expert outputs. Traffic volume and imbalance depend on token routing.',
    significance:
      'All-to-all is more demanding than simple point-to-point transfers and can become network bound as EP grows. Specialized kernels overlap communication with compute and optimize token packing to keep the fabric busy.',
    benchmarkContext:
      'Rack-scale NVLink can keep wide-EP all-to-all traffic inside the scale-up domain. Multi-node recipes over InfiniBand or RoCE must overcome a much lower per-chip scale-out bandwidth.',
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
      'Scale-up is the ultra-fast network inside one tightly connected chip system. Scale-out is the broader network connecting separate servers or racks.',
    definition:
      'Scale-up networking connects accelerators inside one tightly coupled system, while scale-out networking connects multiple systems or racks into a larger cluster.',
    explanation:
      'Scale-up fabrics such as NVLink offer very high per-chip bandwidth and low latency for fine-grained collectives. Scale-out fabrics such as InfiniBand or RoCE reach more machines but usually provide much less bandwidth per accelerator.',
    significance:
      'Distributed inference crosses both domains. Frequent TP or EP collectives benefit disproportionately from staying inside scale-up, while coarser request routing and some prefill/decode transfers can tolerate scale-out.',
    benchmarkContext:
      'System topology determines the communication domain. A B200 in an eight-chip node and a GB200 NVL72 expose related silicon through different scale-up group sizes.',
    relatedTerms: ['nvlink', 'wide-expert-parallelism', 'all-to-all', 'tensor-parallelism'],
    articleSlugs: [INFERENCEX_V2, GB200_R1, GB200_KIMI, JALAPENO],
  },
  {
    slug: 'high-bandwidth-memory',
    term: 'High-bandwidth memory',
    abbreviation: 'HBM',
    category: 'Hardware',
    plainEnglish:
      'HBM is the chip’s small pool of extremely fast nearby memory, where model weights and working data must fit while inference runs.',
    definition:
      'High-bandwidth memory is stacked memory placed close to an accelerator to provide much higher bandwidth than conventional server memory.',
    explanation:
      'HBM stores model weights, activations, workspace, and KV cache. Capacity determines which models, batch sizes, and parallel layouts fit; bandwidth determines how quickly memory-bound kernels can stream that state.',
    significance:
      'LLM decode often reads far more data than it computes per token, making HBM bandwidth a primary performance limit. Extra capacity can also enable a more efficient recipe even when nominal compute remains similar.',
    benchmarkContext:
      'InferenceX hardware comparisons separate HBM capacity from bandwidth. For example, GB300’s larger capacity fits wider prefill/decode layouts than GB200 despite similar bandwidth per chip.',
    relatedTerms: ['memory-bandwidth', 'decode', 'kv-cache', 'quantization'],
    articleSlugs: [GB300_DSV4, B200_KIMI, MI355X_DSV4, JALAPENO],
  },
  {
    slug: 'memory-bandwidth',
    term: 'Memory bandwidth',
    aliases: ['HBM bandwidth'],
    category: 'Hardware',
    plainEnglish:
      'Memory bandwidth is the width of the pipe feeding data to the chip’s compute units. A wider pipe keeps them from sitting idle.',
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
      'NVLink is NVIDIA’s high-speed highway between chips, allowing them to cooperate much faster than over ordinary server networking.',
    definition:
      'NVLink is NVIDIA’s high-bandwidth accelerator interconnect for moving data directly among chips within a scale-up domain.',
    explanation:
      'NVSwitch systems connect multiple NVLink endpoints so collectives can span an eight-chip server or, in NVL72 products, a 72-chip rack-scale domain. That bandwidth is distinct from the InfiniBand or Ethernet fabric connecting separate systems.',
    significance:
      'Large TP and especially wide-EP groups exchange data at every generated token. Keeping those collectives on NVLink can make a rack-scale recipe faster than a similar chip count spread across scale-out links.',
    benchmarkContext:
      'InferenceX compares both node-level chips and NVL72 systems. Interpret the system topology and parallel group width before attributing the entire result to per-chip compute.',
    relatedTerms: ['scale-up-vs-scale-out', 'all-to-all', 'all-reduce', 'wide-expert-parallelism'],
    articleSlugs: [GB200_R1, GB200_KIMI, INFERENCEX_V2, VR_RUBIN],
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
    relatedTerms: ['fp8', 'fp4', 'int4', 'bf16', 'kv-cache-quantization'],
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
      'An InferenceX FP8 label covers the complete recipe. The checkpoint filename, engine, attention backend, KV-cache format, chip generation, and MTP setting can all change the curve.',
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
    articleSlugs: [INFERENCEX_V2, B200_KIMI, MI355X_DSV4, SGLANG_056, AGENTX_QWEN_B300],
  },
  {
    slug: 'nvfp4',
    term: 'NVFP4',
    aliases: ['NVIDIA FP4'],
    category: 'Numerical precision',
    plainEnglish:
      'NVFP4 is NVIDIA’s Blackwell-optimized version of 4-bit model math, designed to move less data and use the chip’s fastest low-precision hardware.',
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
    articleSlugs: [MI355X_KIMI, INFERENCEX_V2, JALAPENO],
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
    articleSlugs: [GB300_DSV4, B200_KIMI, B200_MINIMAX, MI355X_KIMI, KIMI_K3],
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
    articleSlugs: [MI355X_KIMI, B200_GLM5, MI355X_DSV4, SGLANG_056, KIMI_K3],
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
    articleSlugs: [B200_GLM5, MI355X_DSV4, GB300_DSV4, KIMI_K3],
  },
  {
    slug: 'cuda',
    term: 'CUDA',
    aliases: ['NVIDIA CUDA'],
    category: 'Software',
    plainEnglish: 'CUDA is NVIDIA’s software toolbox for making programs run on its chips.',
    definition:
      'CUDA is NVIDIA’s chip computing platform, programming model, compiler toolchain, and library ecosystem.',
    explanation:
      'LLM engines use CUDA kernels and libraries for matrix multiplication, attention, collectives, graph capture, memory management, and custom fused operations. Container, driver, CUDA, and chip architecture versions must be compatible.',
    significance:
      'Serving performance depends on the software above the silicon. New kernels, CUDA Graph usage, compiler specialization, and library releases can move the benchmark curve without changing the chip.',
    benchmarkContext:
      'InferenceX recipes pin container images and therefore a concrete CUDA stack. Historical comparisons can isolate the effect of an engine image bump on otherwise identical hardware and configuration.',
    relatedTerms: ['inference-engine', 'nvfp4', 'nvlink', 'rocm', 'tensorrt-llm'],
    articleSlugs: [SGLANG_056, B200_GLM5, INFERENCEX_V2, TILERT],
  },
  {
    slug: 'rocm',
    term: 'ROCm',
    aliases: ['AMD ROCm'],
    category: 'Software',
    plainEnglish:
      'ROCm is AMD’s software toolbox for running AI and other high-performance programs on AMD chips.',
    definition:
      'ROCm is AMD’s open chip computing software platform, including runtimes, compilers, communication libraries, and optimized math and AI kernels.',
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
      'vLLM is open-source software that organizes requests and chip memory so language models can serve many users efficiently.',
    definition:
      'vLLM is an open-source LLM inference and serving engine focused on high-throughput scheduling, memory-efficient KV-cache management, and broad model and hardware support.',
    explanation:
      'Its runtime coordinates continuous batching, distributed workers, attention backends, quantized kernels, and OpenAI-compatible serving. Production recipes may also run vLLM workers beneath an orchestration layer such as NVIDIA Dynamo.',
    significance:
      'vLLM releases and backend changes can alter performance across the curve. Model-specific MoE kernels, attention dispatch, wide-EP communication, and scheduler paths all contribute to the result.',
    benchmarkContext:
      'InferenceX treats vLLM as one engine option and pins the exact image in each recipe. Engine name alone does not set a fixed performance level, so comparisons must match model, precision, workload, and topology.',
    relatedTerms: ['inference-engine', 'nvidia-dynamo', 'kv-cache', 'sglang', 'rocm'],
    articleSlugs: [MI355X_KIMI, GB200_KIMI, B200_MINIMAX, B200_KIMI, KIMI_K3, TILERT],
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
      'The serving runtime includes continuous batching, prefix-aware scheduling, distributed parallelism, speculative decoding, and multiple attention and MoE kernel backends across NVIDIA and AMD chips.',
    significance:
      'SGLang releases and model-specific kernel work can change throughput on the same hardware. Scheduler overhead matters at low concurrency, while attention, MoE, and communication kernels dominate other regions.',
    benchmarkContext:
      'InferenceX continuously reruns pinned SGLang recipes. Version-to-version curves show where a change affects performance across the operating range and reveal regressions or gains hidden by one peak point.',
    relatedTerms: ['inference-engine', 'eagle', 'vllm', 'rocm', 'cuda'],
    articleSlugs: [
      SGLANG_056,
      B200_GLM5,
      MI355X_DSV4,
      MI355X_GLM5,
      MI355X_QWEN,
      AGENTX_QWEN_SGLANG,
    ],
  },
  {
    slug: 'tensorrt-llm',
    term: 'TensorRT-LLM',
    aliases: ['TRT-LLM', 'TRTLLM'],
    category: 'Software',
    plainEnglish:
      'TensorRT-LLM is NVIDIA’s optimized software stack for getting high inference performance from NVIDIA chips.',
    definition:
      'TensorRT-LLM is NVIDIA’s inference stack for compiling, optimizing, and serving large language models on NVIDIA chips.',
    explanation:
      'It provides NVIDIA-tuned kernels, quantization paths, distributed execution, and model-specific optimizations. It can run as a serving backend and its kernels can also appear inside other engines through integrations.',
    significance:
      'Tight hardware integration can expose Blackwell and NVL72 features quickly, but model support and engine compatibility remain version specific. A TensorRT-LLM label therefore needs a concrete container and recipe.',
    benchmarkContext:
      'InferenceX includes direct TensorRT-LLM and Dynamo TensorRT-LLM configurations and also tracks cases where SGLang or vLLM uses a TRT-LLM-derived kernel backend.',
    relatedTerms: ['inference-engine', 'cuda', 'nvidia-dynamo', 'nvfp4', 'sglang'],
    articleSlugs: [GB200_R1, INFERENCEX_V2, B200_GLM5, B200_MINIMAX, AGENTX_M3_TRT],
  },
  {
    slug: 'nvidia-dynamo',
    term: 'NVIDIA Dynamo',
    aliases: ['Dynamo'],
    category: 'Software',
    plainEnglish:
      'NVIDIA Dynamo coordinates many chip workers. It routes requests, moves model memory, and assigns prompt reading and answer generation to the right pools.',
    definition:
      'NVIDIA Dynamo is a distributed inference framework that orchestrates request routing, worker pools, KV-cache movement, and disaggregated serving.',
    explanation:
      'Dynamo can place prefill and decode on separately scaled pools and use engines such as vLLM or TensorRT-LLM as worker runtimes. Kernels remain inside those engines while Dynamo handles the surrounding data and control paths.',
    significance:
      'Rack-scale performance depends on the single-chip runtime plus routing, cache transfer, topology awareness, and pool sizing. Together they determine whether wide parallelism and disaggregation improve end-to-end performance.',
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
  {
    slug: 'e2e-normalized-interactivity',
    term: 'E2E Normalized Interactivity',
    aliases: ['normalized interactivity', 'OSL/E2EL'],
    category: 'Benchmark metrics',
    plainEnglish:
      'This metric asks how fast a whole answer arrives, counting the wait before the first word as well as the streaming speed after it.',
    definition:
      'E2E Normalized Interactivity is the effective per-user token rate across a complete request: output tokens divided by end to end latency.',
    explanation:
      'Substituting end to end latency for time to first token plus output length times time per output token gives approximately 1 divided by the sum of inter-token latency and TTFT divided by output tokens. The result is ordinary interactivity plus a penalty proportional to first-token wait. Normalized here means normalized by output length, not scaled to a 0 to 1 score or measured against another system.',
    significance:
      'Interactivity alone rewards a recipe that streams quickly after making the user wait, and TTFT alone rewards one that starts fast and then crawls. Folding both into one number exposes operating points that look strong on a single axis. Short responses feel the TTFT penalty most, because there are fewer tokens to amortize the wait across.',
    benchmarkContext:
      'InferenceX exposes this as an experimental x-axis mode for agentic runs, which is why it needs persisted per-request traces and is unavailable for unofficial-run overlays. It is deliberately imperfect: it penalizes high TTFT heavily and does not capture every nuance of prefill and decode disaggregation, so AgentX submissions still optimize interactivity and TTFT separately.',
    measurement: { label: 'Typical unit', value: 'tokens/second/user (tok/s/user)' },
    relatedTerms: ['interactivity', 'time-to-first-token', 'time-per-output-token', 'latency'],
    articleSlugs: [AGENTX_V3, AGENT_BENCHMARK, AGENTX_GLM_ATOM],
  },
  {
    slug: 'tokens-per-dollar',
    term: 'Tokens per dollar',
    abbreviation: 'tok/$',
    aliases: ['tokens per $1 USD', 'tokens per RMB'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Tokens per dollar asks how many tokens one dollar of infrastructure spend buys, so a bigger number is a cheaper system.',
    definition:
      'Tokens per dollar is the count of tokens a configuration produces for one unit of modeled infrastructure cost, the reciprocal of cost per token.',
    explanation:
      'The figure follows directly from throughput per chip and the modeled cost per chip hour, so it carries the same assumptions as cost per million tokens while reading in the direction most people reason about capacity. InferenceX publishes it for total, input, and output tokens, against each cost basis it models, and in Chinese yuan alongside US dollars.',
    significance:
      'Cost per million tokens and tokens per dollar rank systems identically, but a metric that rises with better hardware sits the same way up as throughput, so a chart mixing the two no longer inverts halfway down the axis. The absolute value depends entirely on the cost model behind it, so it travels only with its stated basis.',
    benchmarkContext:
      'Total tokens per $1 USD is the default y-axis on the InferenceX inference charts. Read it against the TCO row shown above the chart, and compare only within one cost basis: owning at hyperscaler rates, owning at neocloud rates, and three year rental produce different numbers for identical silicon.',
    measurement: { label: 'Typical unit', value: 'tokens per $1 USD (tok/$)' },
    relatedTerms: [
      'cost-per-million-tokens',
      'performance-per-dollar',
      'total-cost-of-ownership',
      'throughput',
    ],
    articleSlugs: [AGENTX_V3, INFERENCEX_V2, B200_GLM5, AGENTX_QWEN_B300],
  },
  {
    slug: 'energy-per-token',
    term: 'Energy per token',
    abbreviation: 'J/token',
    aliases: ['joules per token', 'joules per query'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Energy per token is how much electricity the system spends to produce one token, the power-side counterpart of cost per token.',
    definition:
      'Energy per token is the electrical energy consumed per token produced, reported either from all-in provisioned power or from measured accelerator telemetry.',
    explanation:
      'The two bases answer different questions and are not interchangeable. All-in provisioned figures divide a facility power budget, including power delivery and cooling overhead, by measured token rates. Measured figures come from accelerator telemetry during the run and describe the chips alone. InferenceX also reports measured energy per successful query and average power as a percentage of thermal design power.',
    significance:
      'Power, not capital, is often the binding constraint on new deployments, and a system that produces more tokens per joule serves more demand from the same utility allocation. The percentage of TDP figure separately reveals how hard a recipe actually drives its accelerators, which a token-normalized number alone hides.',
    benchmarkContext:
      'Read the label before comparing: all-in provisioned and measured values differ by the facility overhead between them. InferenceX withholds measured energy where the underlying telemetry is invalid or its scope is ambiguous, so a missing value means the measurement could not be trusted rather than that the run drew no power.',
    measurement: { label: 'Typical unit', value: 'joules per token (J/tok)' },
    relatedTerms: ['tokens-per-megawatt', 'throughput', 'total-cost-of-ownership', 'concurrency'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, AGENTX_V3, JALAPENO],
  },
  {
    slug: 'context-parallelism',
    term: 'Context parallelism',
    abbreviation: 'CP',
    aliases: ['PCP', 'DCP', 'sequence parallelism'],
    category: 'Parallelism',
    plainEnglish:
      'Context parallelism splits one long prompt across several chips so they share the work of reading it and of scanning its stored attention state.',
    definition:
      'Context parallelism shards query tokens across accelerators, in a prefill form known as PCP and a decode form known as DCP.',
    explanation:
      'PCP gives each rank a chunk of the query while keys and values are passed around a ring, which parallelizes the compute-bound prefill and stops one rank absorbing an entire long prompt. DCP shards the KV cache itself, so every rank scans its own slice and the partial attention results merge flash-decode style. Because decode is memory-bandwidth bound, parallel KV reads raise the achievable token rate.',
    significance:
      'Tensor parallelism replicates the full KV cache on each rank and data-parallel attention pins a session to whichever rank owns its shard, so neither scales cleanly as contexts reach hundreds of thousands of tokens. Context parallelism attacks that directly, and its gain grows with input length rather than with batch size.',
    benchmarkContext:
      'InferenceX surfaces DCP and PCP degrees in point tooltips and parallelism labels alongside TP, EP, and DP. Support is uneven across vendors: the technique remains part of the practical CUDA advantage because the AMD attention backends were still listed as unsupported in the vLLM matrix at the time of the AgentX 1.0 results.',
    relatedTerms: ['tensor-parallelism', 'data-parallelism', 'kv-cache', 'prefill', 'decode'],
    articleSlugs: [AGENTX_V3, INFERENCEX_V2, AGENTX_M3_RACK],
  },
  {
    slug: 'kv-cache-offload',
    term: 'KV cache offload',
    aliases: ['CPU offload', 'KV offloading'],
    category: 'Serving',
    plainEnglish:
      'KV cache offload parks attention state the chips cannot hold in host memory, so a long session can be resumed instead of recomputed.',
    definition:
      'KV cache offload moves KV blocks out of accelerator memory into a slower tier, usually host DRAM, and loads them back when a later request reuses that prefix.',
    explanation:
      'Offload is usually a write-through cache: a prefix written to the HBM cache is also written to the slower tier, so it helps most when the offload pool is roughly one and a half to three times HBM capacity. Reloading a long prefix beats recomputing it by a wide margin at agentic context lengths, but the arithmetic reverses for short prompts, where the transfer costs more than the prefill it avoids.',
    significance:
      'Long agentic sessions exceed HBM KV capacity well before they exceed a plausible DRAM budget, so offload decides how many concurrent conversations stay resumable. It also shifts the bottleneck: once prefixes survive, store and load paths, transfer batching, and index bookkeeping become the costs worth optimizing.',
    benchmarkContext:
      'InferenceX rings every point that used KV offload with a dashed halo, whether or not it is Pareto optimal, and the point detail view names the offload type and engine alongside the chip and CPU cache hit rates. Offload is an allowed but optional optimization, so a single curve can mix points with and without it.',
    relatedTerms: ['kv-cache', 'prefix-caching', 'kv-cache-manager', 'high-bandwidth-memory'],
    articleSlugs: [AGENTX_V3, AGENTIC_WORKLOADS, KIMI_K3, AGENTX_DSV4_B200_B300],
  },
  {
    slug: 'kv-cache-manager',
    term: 'KV cache manager',
    aliases: ['Mooncake', 'LMCache', 'HiCache'],
    category: 'Software',
    plainEnglish:
      'A KV cache manager is the component that stores attention state outside the chips and decides what to keep, evict, and fetch back.',
    definition:
      'A KV cache manager is a pluggable layer beneath an inference engine that stores reusable KV blocks across memory tiers and manages their placement, eviction, and transfer.',
    explanation:
      'Engines expose a connector interface, so managers such as Mooncake Store, LMCache, and SGLang HiCache can serve different runtimes. The manager keys blocks by prefix hash and places them in host DRAM, local NVMe, or a remote backend, while a separate transfer engine such as Mooncake Transfer Engine or NIXL performs the byte movement. Several paths can coexist inside one engine.',
    significance:
      'Once a workload reuses prefixes heavily, correctness and accounting in this layer matter as much as kernel speed. Hybrid-attention models make it harder still, because a model carrying several cache groups with different shapes and lifetimes cannot be described by a connector that assumes one uniform block geometry.',
    benchmarkContext:
      'InferenceX records the KV offload backend as run metadata and shows it in the AgentX point detail view. Framework labels name the combination rather than the engine alone, so a recipe reads as Mooncake ATOMesh or MoRI SGLang instead of just its engine.',
    relatedTerms: ['kv-cache-offload', 'kv-cache', 'prefix-caching', 'inference-engine'],
    articleSlugs: [AGENTX_V3, KIMI_K3, INFERENCEX_V2],
  },
  {
    slug: 'kv-aware-routing',
    term: 'KV-aware routing',
    aliases: ['cache-aware routing', 'session affinity'],
    category: 'Serving',
    plainEnglish:
      'KV-aware routing sends a request to the worker that already holds its conversation state, instead of to whichever worker is least busy.',
    definition:
      'KV-aware routing selects a worker using where cached prefix state already resides, rather than on queue depth or load alone.',
    explanation:
      'A request carrying no reusable history can go anywhere, and load balancing is the only question worth asking. A request carrying megabytes of cached prefix is different: sending it to an idle worker that lacks that prefix pays for the whole prompt again. Routers therefore track cache events, hash sessions to consistent workers, and keep data-parallel ranks sticky to the sessions whose state they own.',
    significance:
      'Under data-parallel attention each rank owns a private slice of the cache pool, so a long session landing on the wrong rank recomputes everything and the measured hit rate collapses far below its theoretical ceiling. Affinity alone is not enough either, since unchecked stickiness concentrates load on one hot worker, so cache balance has to enter the routing score.',
    benchmarkContext:
      'Routing sits outside the engine, so InferenceX treats it as part of the recipe: labels such as Dynamo vLLM, llm-d vLLM, and Mooncake ATOMesh name the orchestration layer as well as the runtime. Its cost scales with the number and length of live prefixes rather than with tokens generated, which is why it can become the bottleneck on agentic traffic once kernels improve.',
    relatedTerms: [
      'prefix-caching',
      'nvidia-dynamo',
      'data-parallelism',
      'disaggregated-inference',
    ],
    articleSlugs: [AGENTX_V3, AGENTIC_WORKLOADS, AGENTX_M3_RACK],
  },
  {
    slug: 'tilert',
    term: 'TileRT',
    aliases: ['TileRT engine'],
    category: 'Software',
    plainEnglish:
      'TileRT is an inference runtime built for very fast single-user generation, compiling a model into one resident program instead of many separate kernel launches.',
    definition:
      'TileRT is an inference engine that targets ultra-low-latency serving by abolishing the individual kernel as the unit of execution.',
    explanation:
      'A conventional runtime dispatches a sequence of kernels for every decode step, and at very small batch sizes the launch and scheduling overhead between them dominates the arithmetic. A persistent engine kernel keeps the work resident on the accelerator instead, which is what makes the far-right end of the interactivity axis reachable at all.',
    significance:
      'The high-interactivity corner of the frontier is a different engineering problem from the high-throughput corner, and an engine tuned for one rarely wins the other. Recipes that reach hundreds of tokens per second per user matter for latency-critical products even when their aggregate throughput per chip is unremarkable.',
    benchmarkContext:
      'InferenceX reports TileRT as its own framework label and deliberately retains it in best-per-SKU views, because a curve that only survives where it dominates on throughput would drop the operating points TileRT exists to serve. Compare it at matched interactivity rather than on peak throughput alone.',
    relatedTerms: ['inference-engine', 'interactivity', 'decode', 'sglang'],
    articleSlugs: [TILERT, AGENTX_V3],
  },
  {
    slug: 'recipe',
    term: 'Recipe',
    aliases: ['configuration', 'serving recipe'],
    category: 'Benchmark metrics',
    plainEnglish:
      'A recipe is the complete set of choices behind one curve: which model, engine, image, precision, parallelism, and workload were run.',
    definition:
      'A recipe is the fully specified combination of model, inference engine and container image, numerical precision, parallelism strategy, chip system, and workload that produces one measured curve.',
    explanation:
      'Every point on InferenceX belongs to a recipe, and a concurrency sweep across one recipe traces out its curve. Changing any element produces a different recipe rather than a variation of the same one, which is why an engine image bump is reported as its own result rather than folded into an existing line.',
    significance:
      'Peak chip specifications do not describe serving performance, and the same silicon can differ by multiples across recipes. Naming the whole combination is what makes a claim checkable: a number without its recipe cannot be reproduced or fairly compared against another vendor.',
    benchmarkContext:
      'InferenceX benchmark configs mainly track the published vLLM and SGLang cookbooks on upstream images, so results reflect what users can actually deploy rather than images tuned for the benchmark. Point tooltips expose the recipe behind each point along with links to the run provenance.',
    relatedTerms: ['inference-engine', 'pareto-frontier', 'concurrency', 'quantization'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, AGENTX_V3],
  },
  {
    slug: 'tail-latency',
    term: 'Tail latency',
    aliases: ['p90', 'p99', 'percentile latency'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Tail latency describes the slowest requests rather than the typical one, because the unlucky few are what users actually notice.',
    definition:
      'Tail latency is the latency at a high percentile of the request distribution, such as p90 or p99, rather than the mean or median.',
    explanation:
      'A percentile answers a different question from an average. A p90 of five seconds means one request in ten waited at least that long, and that request may be the one blocking an agent from continuing. Distributions in real serving are heavily skewed, so the mean can sit far below the tail and hide it completely.',
    significance:
      'Capacity planning is usually written against a percentile, not an average, because a service that is fast on average and slow at the tail still fails its users. Optimizations can also improve the mean while worsening the tail, which a single-number summary would report as an unambiguous win.',
    benchmarkContext:
      'InferenceX reports percentile-qualified metrics and labels the percentile on the axis, so p90 TTFT and mean TTFT are never mixed on one comparison. Agentic runs are especially skewed, because end to end latency scales with output length and the longest generations dominate the tail.',
    relatedTerms: ['latency', 'time-to-first-token', 'interactivity', 'concurrency'],
    articleSlugs: [AGENTX_V3, INFERENCEX_V2, AGENT_BENCHMARK],
  },
  {
    slug: 'service-level-objective',
    term: 'Service level objective',
    abbreviation: 'SLO',
    aliases: ['latency target', 'SLA target'],
    category: 'Benchmark metrics',
    plainEnglish:
      'An SLO is the performance promise a deployment has to keep, such as a first token within one second for nine requests in ten.',
    definition:
      'A service level objective is a stated target for a serving metric, usually expressed as a percentile bound on latency or interactivity.',
    explanation:
      'A useful SLO names a metric, a percentile, and a threshold together. Serving capacity is then whatever throughput the system sustains without breaching it, which is a smaller number than peak throughput and the only one an operator can safely provision against.',
    significance:
      'Every point on a throughput curve is reachable, but only part of the curve satisfies a given promise. Two systems can look close on peak throughput and differ sharply in how much of that throughput survives an interactivity or first-token bound.',
    benchmarkContext:
      'InferenceX does not impose one industry SLO, because acceptable targets differ by product: interactive coding needs a high token rate, while batch processing tolerates seconds of first-token delay. Read the frontier at your own threshold instead of comparing peak values.',
    relatedTerms: ['latency', 'tail-latency', 'interactivity', 'iso-interactivity'],
    articleSlugs: [AGENTX_V3, INFERENCEMAX, AGENT_BENCHMARK],
  },
  {
    slug: 'acceptance-length',
    term: 'Acceptance length',
    abbreviation: 'AL',
    aliases: ['acceptance rate', 'draft acceptance'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Acceptance length is how many drafted tokens the full model actually approves per verification step, which is what decides whether speculation pays off.',
    definition:
      'Acceptance length is the average number of speculatively drafted tokens accepted by the target model in one verification pass.',
    explanation:
      'Speculative decoding only saves time when drafts survive verification. An acceptance length near one means the draft and verify machinery ran for nothing, while a high value amortizes one expensive target-model step across several emitted tokens. The value depends on the speculator, the draft length, the model, and the content being generated.',
    significance:
      'Because acceptance depends on content, a benchmark can accidentally decide the result. Synthetic or anonymized text is out of distribution for a speculator trained on real language, so measured acceptance drifts away from what production would see, in either direction.',
    benchmarkContext:
      'AgentX replays anonymized traces filled with synthetic tokens, so it does not let acceptance emerge from that content. Runs instead apply a fixed acceptance length collected per model, speculator, draft length, and thinking mode on an external agentic coding dataset, which keeps the comparison vendor neutral.',
    relatedTerms: ['speculative-decoding', 'multi-token-prediction', 'eagle', 'agentx'],
    articleSlugs: [AGENTX_V3, INFERENCEX_V2, DEEPSEEK_V4],
  },
  {
    slug: 'unofficial-run',
    term: 'Unofficial run',
    aliases: ['unofficial overlay', 'community run'],
    category: 'Benchmark metrics',
    plainEnglish:
      'An unofficial run is a benchmark run that has not been ingested into the published dataset but can still be drawn on top of the charts from its URL.',
    definition:
      'An unofficial run is a CI benchmark run loaded into the dashboard as an overlay from its run identifier, rather than from the published database.',
    explanation:
      'Adding a run identifier to the page URL fetches that run and draws its points, rooflines, and rows alongside the official data in distinct overlay colors. The overlay is a separate rendering path, so it can be toggled per hardware type or dismissed per run without disturbing the official selection underneath.',
    significance:
      'Publishing a result usually lags producing it, and a contributor tuning a recipe needs to see the new curve against the current frontier before anyone decides to ingest it. The overlay makes an in-flight run reviewable without granting it the standing of a published measurement.',
    benchmarkContext:
      'Overlay colors come from a run-index palette rather than the hardware palette, so an overlay is never mistaken for official data. Some views require data that is only persisted for ingested runs, and those views state that overlays are unavailable rather than silently omitting them.',
    relatedTerms: ['recipe', 'pareto-frontier', 'inference-engine', 'agentx'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2],
  },
  {
    slug: 'chunked-prefill',
    term: 'Chunked prefill',
    aliases: ['split prefill', 'piecewise prefill'],
    category: 'Serving',
    plainEnglish:
      'Chunked prefill reads a long prompt in slices instead of all at once, so other users keep receiving tokens while it is being read.',
    definition:
      'Chunked prefill splits prompt processing into fixed-size token chunks that the scheduler interleaves with ongoing decode work.',
    explanation:
      'An unsplit prefill occupies the accelerator for as long as the whole prompt takes, and every user already streaming waits behind it. Splitting the prompt lets the scheduler alternate, so decode continues between chunks. The chunk size is a tuning knob: larger chunks prefill more efficiently, smaller chunks interrupt decode less.',
    significance:
      'The technique converts a first-token problem for one user into a small, steady tax on everyone else, which is usually the better trade. It matters far more as prompts grow, since a single unsplit hundred-thousand-token prefill would stall a deployment outright.',
    benchmarkContext:
      'Chunk size is part of the recipe and can differ across points on the same curve, so a jump in throughput may reflect a retune rather than new hardware. Long agentic prompts make the setting consequential in a way fixed short-prompt scenarios never expose.',
    relatedTerms: ['prefill', 'decode', 'batching', 'time-to-first-token'],
    articleSlugs: [AGENTX_V3, INFERENCEX_V2, SGLANG_056],
  },
  {
    slug: 'roofline',
    term: 'Roofline',
    aliases: ['frontier envelope', 'roofline curve'],
    category: 'Benchmark metrics',
    plainEnglish:
      'On InferenceX a roofline is the outer envelope drawn through the best points of one hardware configuration, showing the edge of what it achieved.',
    definition:
      'A roofline on InferenceX is the Pareto envelope curve drawn per hardware configuration through its non-dominated points for the selected pair of axes.',
    explanation:
      'Which corner counts as best depends on the metrics: throughput against interactivity takes the upper right, while a cost axis is better when lower, so the envelope is anchored at whichever corner the selected metric pair defines. Points with a degenerate x value are excluded from eligibility, though they still render in the show-all view.',
    significance:
      'Reading a cloud of raw points invites cherry-picking, since a badly tuned configuration contributes points that no operator would ever choose. The envelope shows the achievable boundary per system, which is the shape a capacity decision is actually made against.',
    benchmarkContext:
      'This is not the classic roofline model from HPC, which plots attainable FLOPS against arithmetic intensity to expose a compute or memory bound. The dashboard borrows only the picture of an upper bound. Roofline direction is configured per metric, so the same points can produce a different envelope on a different axis.',
    relatedTerms: ['pareto-frontier', 'iso-interactivity', 'throughput', 'recipe'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, B200_GLM5, AGENTX_GLM_ATOM],
  },
  {
    slug: 'arithmetic-intensity',
    term: 'Arithmetic intensity',
    aliases: ['operational intensity', 'compute to memory ratio'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Arithmetic intensity is how much math a computation does per byte it moves, which decides whether the chip or its memory is the limit.',
    definition:
      'Arithmetic intensity is the ratio of arithmetic operations performed to bytes moved between memory and the compute units.',
    explanation:
      'Prefill processes many tokens against one set of weights, so it reuses each loaded byte heavily and is usually compute bound. Decode emits one token per step per sequence and must still read the weights and the KV cache, so it moves a great deal of data for very little arithmetic and is usually memory bandwidth bound.',
    significance:
      'The two phases are limited by different parts of the chip, which is why a specification sheet with impressive peak FLOPS can disappoint on decode and why batching helps: grouping sequences raises intensity by reusing each weight read across more tokens.',
    benchmarkContext:
      'The split explains recurring shapes in the data. Low interactivity points run large batches at high intensity and approach compute limits, while the high interactivity end runs small batches and tracks memory bandwidth, so bandwidth-rich parts often win there despite lower peak throughput.',
    relatedTerms: ['prefill', 'decode', 'memory-bandwidth', 'batching'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, TILERT, JALAPENO],
  },
  {
    slug: 'prefix-cache-hit-rate',
    term: 'Prefix cache hit rate',
    aliases: ['cache hit rate', 'KV reuse rate'],
    category: 'Serving',
    plainEnglish:
      'The hit rate is the share of prompt tokens served from cache instead of being recomputed, which on long sessions is most of the prompt.',
    definition:
      'Prefix cache hit rate is the fraction of input tokens satisfied from cached KV state rather than recomputed during prefill.',
    explanation:
      'A hit rate is only meaningful next to the tier that produced it, since a token served from accelerator memory and one fetched back from host memory cost very differently. It also depends on more than capacity: eviction can discard a prefix that is still wanted, and routing can send a request to a worker that never held it.',
    significance:
      'On multi-turn traffic the hit rate largely determines prefill cost, because each turn resends the whole conversation plus a little more. Once reuse is high, the remaining prefill work is dominated by genuinely new tokens, and the bottleneck moves from computation to cache management.',
    benchmarkContext:
      'The AgentX point view reports hit rate over time, separated by cache tier, alongside the prompt token source breakdown. A run that reports high aggregate throughput on a low hit rate is doing far more prefill work than a well-cached deployment would.',
    relatedTerms: ['prefix-caching', 'kv-cache', 'prefill', 'agentx'],
    articleSlugs: [AGENTX_V3, AGENTIC_WORKLOADS, AGENT_BENCHMARK, AGENTX_DSV4_B200_B300],
  },
  {
    slug: 'warmup',
    term: 'Warmup',
    aliases: ['warmup phase', 'cache priming'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Warmup is the priming pass before measurement starts, so the run is scored on a system in steady state rather than one with an empty cache.',
    definition:
      'Warmup is the phase before the profiling window in which a benchmark primes caches and reaches steady state, and whose requests are excluded from reported results.',
    explanation:
      'A cold system misrepresents production twice over: the cache is empty, and every session starting at turn zero creates a synchronized burst that no real deployment sees. AgentX therefore starts each conversation at a seeded point partway through its history, replays the requests needed to reconstruct that state, then advances each replay lane further before measurement begins.',
    significance:
      'Where the measurement window starts changes the result. Include the priming pass and prefix reuse looks worse than production; skip priming entirely and cache-dependent recipes are scored on a state they would never serve from.',
    benchmarkContext:
      'The AgentX point view separates the two phases, so telemetry can be inspected for either. Warmup requests are capped at a single output token, which is why their output length is about one and their interactivity and decode series are blank: one token has no inter-token latency.',
    relatedTerms: ['prefix-caching', 'agentx', 'trace-replay', 'closed-loop-benchmark'],
    articleSlugs: [AGENTX_V3, AGENT_BENCHMARK, AGENTIC_WORKLOADS],
  },
  {
    slug: 'aiperf',
    term: 'AIPerf',
    aliases: ['replay harness', 'load generator'],
    category: 'Agentic inference',
    plainEnglish:
      'AIPerf is the vendor-neutral client that sends the benchmark traffic, reconstructing recorded agent sessions and timing every request.',
    definition:
      'AIPerf is the open-source HTTP load generation and replay harness that drives AgentX runs against a serving endpoint.',
    explanation:
      'It reconstructs each session as a directed acyclic graph in which nodes are requests and edges carry the delay before a dependent request may be sent. That structure reproduces main-agent turns, parallel subagent branches that join later, one-off auxiliary requests, and the tool-use pauses between turns, none of which a flat list of prompts can express.',
    significance:
      'The client is part of the measurement. A harness that cannot express dependencies would issue an agentic workload as independent requests and erase exactly the burstiness and reuse the scenario exists to test. Keeping it vendor neutral also keeps the load generator from favoring any one serving stack.',
    benchmarkContext:
      'A seed fixes which conversations are sampled, where each starts, and the synthetic content used to fill anonymized blocks, so a rerun of the same recipe replays the same workload. All submissions for a model run the same harness minor version so results stay comparable.',
    relatedTerms: ['trace-replay', 'agentx', 'closed-loop-benchmark', 'subagent'],
    articleSlugs: [AGENTX_V3, AGENT_BENCHMARK, AGENTIC_WORKLOADS],
  },
  {
    slug: 'pipeline-parallelism',
    term: 'Pipeline parallelism',
    abbreviation: 'PP',
    aliases: ['layer parallelism', 'PP'],
    category: 'Parallelism',
    plainEnglish:
      'Pipeline parallelism gives each chip a different slice of the layers, passing activations along the chain instead of splitting each layer.',
    definition:
      'Pipeline parallelism partitions a model by layer across accelerators, so each stage runs its own layers and forwards activations to the next.',
    explanation:
      'Communication is a point to point handoff of activations at stage boundaries, which is far cheaper than the per-layer collectives tensor parallelism requires. The cost is idle time: with one request in flight, every stage but the active one waits, and only a stream of concurrent work keeps the pipeline full.',
    significance:
      'For the largest models this is a capacity technique before it is a speed technique. Some frontier models do not fit in one node at all, and pipeline parallelism is what makes them servable, sometimes as the only option when a competing optimization refuses to compose with anything else.',
    benchmarkContext:
      'InferenceX reports the pipeline degree in point tooltips and parallelism labels alongside TP, EP, and DP, and only when it exceeds one. Composability matters as much as the degree: a stage split that blocks speculative decoding can cost more than the memory it saved.',
    relatedTerms: [
      'tensor-parallelism',
      'expert-parallelism',
      'data-parallelism',
      'high-bandwidth-memory',
    ],
    articleSlugs: [AGENTX_V3, KIMI_K3, INFERENCEX_V2],
  },
  {
    slug: 'dp-attention',
    term: 'Data-parallel attention',
    abbreviation: 'DPA',
    aliases: ['DP attention', 'attention data parallelism'],
    category: 'Parallelism',
    plainEnglish:
      'DP attention gives each rank its own slice of the attention work and its own cache, instead of every rank holding a copy of the same thing.',
    definition:
      'Data-parallel attention replicates attention computation per rank over disjoint sets of sequences, so each rank owns a private share of the KV cache while experts remain shared.',
    explanation:
      'Tensor-parallel attention splits heads and ends up replicating KV state across ranks, which wastes capacity when heads are few. DP attention avoids that duplication by assigning whole sequences to ranks. The ranks still participate together in the MoE collectives, so attention is local while expert dispatch stays global.',
    significance:
      'Because each rank owns a private slice of the pool, placement becomes correctness-adjacent for performance: a long session routed to a rank that does not hold its prefix recomputes everything. Measured hit rates can then land far below the theoretical ceiling for reasons that have nothing to do with cache size.',
    benchmarkContext:
      'InferenceX shows DP attention in the parallelism section of point tooltips. Whether it helps is model dependent, and configurations without it sometimes dominate the frontier when cache locality turns into a routing constraint.',
    relatedTerms: [
      'data-parallelism',
      'tensor-parallelism',
      'kv-cache',
      'mixture-of-experts',
      'prefix-caching',
    ],
    articleSlugs: [AGENTX_V3, INFERENCEX_V2, GB200_KIMI, AGENTX_M3_TRT],
  },
  {
    slug: 'int4',
    term: 'INT4',
    aliases: ['4-bit integer', 'W4A16'],
    category: 'Numerical precision',
    plainEnglish:
      'INT4 stores weights in four-bit integers, shrinking the model enough to move far less memory per token on hardware without native 4-bit floats.',
    definition:
      'INT4 is a four-bit integer format used mainly for weight quantization, typically with a higher-precision scale per group of values.',
    explanation:
      'Integer formats spread their values evenly, unlike floating point, so INT4 depends on grouped scaling factors to track the local range of each block of weights. Activations commonly stay at higher precision, and the matrix multiply dequantizes on the fly, which makes the technique a memory movement optimization more than an arithmetic one.',
    significance:
      'It matters most where 4-bit floating point has no hardware support. On such parts INT4 is the practical route to 4-bit weights, though it usually needs more calibration care than a native format and its accuracy has to be checked rather than assumed.',
    benchmarkContext:
      'InferenceX treats INT4 as its own precision key alongside FP4, FP8, and BF16, and precision is part of the recipe rather than a display option. Compare INT4 against a native FP4 recipe only with the accuracy evaluations in view, since the formats are not interchangeable.',
    relatedTerms: ['quantization', 'fp4', 'fp8', 'memory-bandwidth'],
    articleSlugs: [B200_KIMI, INFERENCEX_V2, MI355X_KIMI],
  },
  {
    slug: 'bf16',
    term: 'BF16',
    aliases: ['bfloat16', 'brain float 16'],
    category: 'Numerical precision',
    plainEnglish:
      'BF16 is the 16-bit format most models are trained in, and serving in it is the accuracy reference the quantized recipes are measured against.',
    definition:
      'BF16 is a 16-bit floating point format with the same exponent range as FP32 and a reduced mantissa, widely used for training and as an unquantized serving baseline.',
    explanation:
      'Keeping the FP32 exponent range makes BF16 tolerant of the value distributions that appear in transformer activations, so conversion rarely needs the scaling machinery narrower formats require. The tradeoff is precision rather than range, and the format is twice the size of FP8 and four times that of a 4-bit format.',
    significance:
      'Its role in a benchmark is usually as a reference point. Weight reads dominate decode, so a BF16 recipe moves far more memory per token than a quantized one and tends to sit lower on the throughput curve while defining the accuracy the others are compared against.',
    benchmarkContext:
      'InferenceX carries BF16 as a precision key and reports peak BF16 dense throughput per accelerator in the specs pages. Quantized recipes are validated with accuracy evaluations rather than assumed lossless, which is what makes a BF16 comparison meaningful.',
    relatedTerms: ['quantization', 'fp8', 'fp4', 'memory-bandwidth'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2, DEEPSEEK_V4],
  },
  {
    slug: 'kv-cache-quantization',
    term: 'KV cache quantization',
    aliases: ['FP8 KV cache', 'quantized KV'],
    category: 'Numerical precision',
    plainEnglish:
      'This stores the conversation cache in a smaller format, so a chip holds more context and reads it back faster during generation.',
    definition:
      'KV cache quantization stores attention key and value states in a reduced-precision format, independently of the precision used for model weights.',
    explanation:
      'Weight precision and cache precision are separate choices, and a recipe can serve FP8 weights with a BF16 cache or the reverse. Halving cache width roughly doubles the tokens that fit in accelerator memory and halves the bytes read per decode step, which is the operation decode spends most of its time on.',
    significance:
      'On long-context serving this often buys more than shrinking the weights, because at high concurrency the cache, not the weights, is what exhausts memory. Accuracy sensitivity differs by model and by which of keys and values is quantized, so it needs evaluation rather than a blanket assumption.',
    benchmarkContext:
      'Cache precision is part of the recipe, and mixed layouts exist in practice: some models keep two cache buffers at different widths, which disaggregated transfer paths then have to move as a pair. Read a memory-capacity claim together with the cache format behind it.',
    relatedTerms: ['kv-cache', 'quantization', 'fp8', 'high-bandwidth-memory'],
    articleSlugs: [INFERENCEX_V2, AGENTX_V3, GB300_DSV4],
  },
  {
    slug: 'sliding-window-attention',
    term: 'Sliding window attention',
    abbreviation: 'SWA',
    aliases: ['local attention', 'windowed attention'],
    category: 'Model architecture',
    plainEnglish:
      'Sliding window attention lets a layer look only at a recent span of tokens, so its cache stops growing once the window is full.',
    definition:
      'Sliding window attention restricts each query to a fixed span of preceding tokens, bounding the KV state a layer must retain.',
    explanation:
      'Because the span is fixed, the cache for such a layer reaches a ceiling instead of growing with the conversation, and older entries fall out as the window advances. Models usually interleave these layers with full-attention layers, so long-range information still has a path through the network while most layers stay cheap.',
    significance:
      'The bounded cost comes with an allocator problem. Window pages turn over constantly while durable prefix pages sit still, and when both are drawn from one pool the transient allocation tends to evict the valuable one, so a long session can lose its expensive full-attention history to short-lived window state.',
    benchmarkContext:
      'These effects appear only on multi-turn traffic. A single short prompt never laps the window or contends for the pool, which is why window-aware eviction, offload, and branch handling show up as AgentX-driven engine work rather than as fixed-sequence results.',
    relatedTerms: ['sparse-attention', 'kv-cache', 'prefix-caching', 'hybrid-attention'],
    articleSlugs: [AGENTX_V3, KIMI_K3, B200_GLM5],
  },
  {
    slug: 'hybrid-attention',
    term: 'Hybrid attention',
    aliases: ['mixed attention', 'hybrid cache model'],
    category: 'Model architecture',
    plainEnglish:
      'A hybrid model mixes attention types across its layers, so its cache is several different kinds of state rather than one uniform block.',
    definition:
      'A hybrid attention model interleaves layers of different attention types, producing multiple KV cache groups with distinct shapes and lifetimes.',
    explanation:
      'A uniform model has one cache layout per token, so a single block geometry describes everything worth saving. A hybrid model does not: full-attention layers, windowed layers, and recurrent or compressor state coexist, each with its own footprint and its own rules about when it can be discarded and whether it can be rebuilt.',
    significance:
      'The distinction is invisible until state has to leave the accelerator. A connector that assumes one uniform layout cannot say which group a block belongs to, so the models with the longest sessions were for a time the ones that could not use offload at all. Recurrent state is the hardest case, since it accumulates everything before it and cannot be recomputed from neighboring tokens.',
    benchmarkContext:
      'Frontier open-weight models in the InferenceX matrix are increasingly hybrid, so engine support for hybrid cache groups is part of what a recipe is measuring. Offload, disaggregated transfer, and prefix reuse each had to be extended per group rather than inherited from the uniform case.',
    relatedTerms: [
      'sliding-window-attention',
      'kv-cache',
      'linear-attention',
      'sparse-attention',
      'prefix-caching',
    ],
    articleSlugs: [AGENTX_V3, KIMI_K3, DEEPSEEK_V4],
  },
  {
    slug: 'linear-attention',
    term: 'Linear attention',
    aliases: ['GatedDeltaNet', 'recurrent attention', 'constant-state attention'],
    category: 'Model architecture',
    plainEnglish:
      'Linear attention keeps a fixed-size running summary instead of every past token, so its memory does not grow as the conversation does.',
    definition:
      'Linear attention replaces the growing key and value cache with a recurrent state of constant size that is updated as tokens arrive.',
    explanation:
      'Standard attention stores state proportional to sequence length and rereads it every step. A linear or gated recurrent layer carries a fixed-size state instead, trading exact recall of every position for bounded memory. Architectures such as GatedDeltaNet apply this on a fraction of layers, leaving full attention elsewhere to preserve precise long-range lookup.',
    significance:
      'For long context the storage saving is substantial, but the state changes what caching means. It cannot be reconstructed from surrounding tokens the way a window tail can, so if it is dropped the only way back is replaying the sequence, and reuse requires an explicit checkpoint mechanism rather than ordinary block reuse.',
    benchmarkContext:
      'InferenceX serves models using these layers, and engine support for checkpointing and transferring recurrent state is part of the recipe. A model can be day-zero servable and still lack reuse of that state, which shows up as unexpectedly high prefill cost on repeated turns.',
    relatedTerms: ['hybrid-attention', 'kv-cache', 'sparse-attention', 'prefill'],
    articleSlugs: [AGENTX_V3, MI355X_QWEN, KIMI_K3, AGENTX_QWEN_SGLANG],
  },
  {
    slug: 'nvl72',
    term: 'NVL72',
    aliases: ['GB200 NVL72', 'GB300 NVL72', 'rack-scale system'],
    category: 'Hardware',
    plainEnglish:
      'NVL72 is a rack where 72 accelerators share one high-speed fabric, so they behave more like a single large machine than a cluster.',
    definition:
      'NVL72 is a rack-scale NVIDIA system that places 72 accelerators in a single NVLink scale-up domain rather than in separate eight-chip nodes.',
    explanation:
      'The dashboard specs record NVLink 5.0 at 900 GB/s per chip unidirectional across a scale-up world size of 72, switched through NVSwitch. A conventional node keeps that bandwidth among eight chips and falls back to slower scale-out networking beyond them, so the difference is not raw speed but how many chips are reachable before the fabric changes character.',
    significance:
      'Techniques whose cost is dominated by collectives change economics inside a large domain. Wide expert parallelism spreads experts across many chips and pays all-to-all traffic for every token, which is tolerable at scale-up bandwidth and often is not across a scale-out fabric.',
    benchmarkContext:
      'A rack-scale advantage is not automatic. Higher cost per chip has to be earned back, and on agentic traffic the orchestration layer can become the bottleneck before the fabric does, so NVL72 configurations sometimes trail eight-chip nodes on TCO-normalized throughput for models that do not exercise wide parallelism.',
    relatedTerms: [
      'nvlink',
      'scale-up-vs-scale-out',
      'wide-expert-parallelism',
      'all-to-all',
      'total-cost-of-ownership',
    ],
    articleSlugs: [GB200_R1, GB300_DSV4, GB200_KIMI, VR_RUBIN, AGENTX_K3_ATOM, JALAPENO],
  },
  {
    slug: 'atom',
    term: 'ATOM',
    aliases: ['AMD ATOM', 'ATOMesh'],
    category: 'Software',
    plainEnglish:
      'ATOM is AMD’s own inference engine, its answer to a vendor runtime rather than an upstream open-source one.',
    definition:
      'ATOM is AMD’s inference engine for Instinct accelerators, positioned as the vendor runtime alongside upstream vLLM and SGLang on ROCm.',
    explanation:
      'It occupies the same role for AMD that a vendor runtime does for NVIDIA: tuned for the vendor’s own hardware and free to move ahead of upstream engines. Its router, ATOMesh, began as a fork of the SGLang router. The engine was built for single-turn serving, so long-context multi-turn support required substantial changes to its cache manager and kernels.',
    significance:
      'A vendor engine can show what silicon is capable of before the open stack catches up, which makes it useful evidence and awkward guidance at the same time. Most labs deploy upstream engines, so a result that exists only under a vendor runtime does not describe what those users will get.',
    benchmarkContext:
      'InferenceX reports ATOM as its own framework label so it is never conflated with a vLLM or SGLang result on the same accelerator. Compare it to other vendor runtimes when asking what the hardware can do, and to upstream engines when asking what a customer can deploy today.',
    relatedTerms: ['inference-engine', 'rocm', 'vllm', 'sglang', 'tensorrt-llm'],
    articleSlugs: [AGENTX_V3, MI355X_DSV4, MI355X_GLM5, AGENTX_DSV4_MI355X_B200, AGENTX_K3_ATOM],
  },
  {
    slug: 'aiter',
    term: 'AITER',
    aliases: ['AMD AITER', 'ROCm kernel library'],
    category: 'Software',
    plainEnglish:
      'AITER is AMD’s tuned kernel library, the layer that decides how fast attention and matrix work actually run on Instinct chips.',
    definition:
      'AITER is AMD’s library of optimized kernels for Instinct accelerators, used by inference engines running on ROCm.',
    explanation:
      'Engines express a strategy; kernels decide whether it is fast. AITER supplies tuned attention, matrix, and fused operations, and an engine dispatches to it in place of a generic path. That dispatch decision is itself tunable, and a kernel that wins on one shape can lose on another, so selection may depend on context length rather than being fixed.',
    significance:
      'A parallelism strategy is only real if the kernels can express it, which is why context parallelism and long-context sparse attention on AMD arrived as kernel work rather than engine work. Very large caches also expose failures short requests never reach, such as address arithmetic that overflows once a pool crosses a size boundary and silently addresses the wrong row.',
    benchmarkContext:
      'The library sits inside the container image a recipe pins, so an AITER improvement can move a curve with no change to the engine version or the hardware. Kernel-level gains measured on uniform shapes do not always survive agentic traces, where cache and scheduling variance can swamp them.',
    relatedTerms: ['rocm', 'inference-engine', 'sparse-attention', 'memory-bandwidth', 'vllm'],
    articleSlugs: [MI355X_KIMI, AGENTX_V3, MI355X_DSV4],
  },
  {
    slug: 'flashinfer',
    term: 'FlashInfer',
    aliases: ['attention kernel library'],
    category: 'Software',
    plainEnglish:
      'FlashInfer is a library of attention kernels that serving engines call instead of writing their own attention implementations.',
    definition:
      'FlashInfer is an open-source library of attention kernels and backends used by inference engines for prefill, decode, and speculative verification.',
    explanation:
      'Attention is where most serving-specific complexity lives: paged caches, variable sequence lengths, grouped query heads, sparsity patterns, and verification of drafted tokens all reshape the kernel. A shared library lets several engines reuse one tuned implementation, and engines select a backend per shape and per hardware target.',
    significance:
      'Because backends are selected rather than fixed, kernel availability becomes a portability question. A feature implemented only for one vendor’s backend leaves the alternative running a generic path, which on long context is not a small compromise but the wrong kernel for the shape.',
    benchmarkContext:
      'The backend in use is part of the recipe, and a change to it can move a curve without any hardware or engine version change. Support for checkpointing recurrent state in these kernels is what allowed hybrid models to participate in prefix reuse at all.',
    relatedTerms: ['inference-engine', 'sparse-attention', 'kv-cache', 'vllm', 'sglang'],
    articleSlugs: [AGENTX_V3, SGLANG_056, INFERENCEX_V2],
  },
  {
    slug: 'cuda-graphs',
    term: 'CUDA graphs',
    aliases: ['graph capture', 'full-graph mode'],
    category: 'Software',
    plainEnglish:
      'CUDA graphs record a whole sequence of chip operations once and replay it as a unit, removing the per-step cost of launching each one.',
    definition:
      'CUDA graph capture records a sequence of kernel launches and their dependencies into a replayable graph, so the sequence is submitted once rather than launched operation by operation.',
    explanation:
      'A decode step issues many small kernels, and at small batch sizes the launch and scheduling overhead between them can rival the arithmetic. Capturing the step removes that per-launch cost. The catch is that a graph is fixed: shapes must be stable, so engines capture per bucket and leave genuinely dynamic work outside the graph.',
    significance:
      'This is a latency optimization more than a throughput one, and it matters most exactly where batches are small and interactivity is high. It also interacts with everything that changes shape, which is why variable-length agentic traffic can defeat a runtime that specializes too eagerly and recompiles for nearly every request it sees.',
    benchmarkContext:
      'Graph usage is part of the engine image a recipe pins, so it can move a curve with no change in hardware. Recipes may capture stable producers while leaving request-dependent attention eager, which is a deliberate compromise between capture coverage and shape flexibility.',
    relatedTerms: ['cuda', 'decode', 'interactivity', 'inference-engine', 'batching'],
    articleSlugs: [AGENTX_V3, TILERT, INFERENCEX_V2],
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
