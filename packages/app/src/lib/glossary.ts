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
      'InferenceX compares infrastructure perf/$ at matched interactivity and names the TCO inputs used. Ratios should not be carried across different model, sequence-length, precision, or latency regimes. Cost per million tokens and the total, input, and output infrastructure purchasing-power axes express those TCO economics.',
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
    aliases: ['tokens per $1 TCO', 'tokens per ¥1 TCO'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Tokens per dollar asks how many tokens one dollar of infrastructure spend can produce under the cost basis named on the chart.',
    definition:
      'Total tokens per dollar divides total tokens produced per chip-hour by the modeled all-in infrastructure cost per chip-hour.',
    explanation:
      'The Hyperscaler ownership, Neocloud ownership, and three-year rental variants use their corresponding TCO hourly rates. Historical Trends interpolates the matching total, input, or output throughput and then applies the hourly-cost multiplier.',
    significance:
      'The metric measures hardware and software cost efficiency, so comparisons must use the same model, workload, interactivity target, token type, and infrastructure cost basis.',
    benchmarkContext:
      'InferenceX exposes separate total-token axes for Hyperscaler ownership, Neocloud ownership, and three-year rental costs. The Hyperscaler ownership axis is the dashboard default y-axis. Token Revenue per GPU Hour is the separate metric that uses normalized or OpenRouter token sale prices.',
    measurement: { label: 'Typical unit', value: 'tokens per $1 TCO (tok/$)' },
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
  {
    slug: 'goodput',
    term: 'Goodput',
    aliases: ['SLO-constrained throughput', 'useful throughput'],
    category: 'Benchmark metrics',
    plainEnglish:
      'Goodput counts only the work that meets your latency target, so a fast-looking system that misses deadlines gets no credit for it.',
    definition:
      'Goodput is the portion of throughput that satisfies a stated service level objective, such as a time to first token bound or a minimum tokens per second per user.',
    explanation:
      'Raw throughput rewards a server for finishing requests no matter how slowly each user was served. Goodput applies a filter first: a request only counts if it met the latency or interactivity constraint the operator promised. Two systems with identical throughput can have very different goodput once a deadline is applied, because one may hold latency flat under load while the other lets queueing push every request past the bound.',
    significance:
      'Capacity planning that ignores goodput overbuys or oversells. An operator who quotes peak throughput but serves half of it within the SLO needs twice the fleet they modeled. Goodput is the number that connects a benchmark curve to how many real users a deployment can actually carry.',
    benchmarkContext:
      'InferenceX publishes full throughput versus interactivity Pareto frontiers rather than a single goodput number, which lets readers apply their own SLO. Reading the frontier at a fixed interactivity tier, as the TCO calculator does, is exactly a goodput measurement at that tier.',
    relatedTerms: [
      'service-level-objective',
      'throughput',
      'interactivity',
      'iso-interactivity',
      'tail-latency',
    ],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2],
  },
  {
    slug: 'model-flops-utilization',
    term: 'Model FLOPs utilization',
    abbreviation: 'MFU',
    aliases: ['MFU', 'model bandwidth utilization', 'MBU'],
    category: 'Benchmark metrics',
    plainEnglish:
      'MFU compares the useful math a model actually performed against the maximum the chip could theoretically perform, giving an efficiency percentage.',
    definition:
      'Model FLOPs utilization is the ratio of the floating point operations a model logically requires to the peak operations the hardware could deliver in the same wall clock time.',
    explanation:
      'Peak TFLOP/s figures assume every tensor core is busy every cycle, which never happens in serving. Kernel launch gaps, memory stalls, communication waits, and imperfect batching all leave compute idle. MFU folds all of that into one number. Decode is usually memory bound, so decode MFU is naturally low, and the bandwidth analog MBU is often the more honest efficiency measure for token generation.',
    significance:
      'MFU separates hardware capability from software maturity. A chip with enormous peak FLOPs but weak kernels can lose to a slower chip that keeps its units fed. Rising MFU on fixed hardware is the signature of software progress, which is where most inference performance gains come from.',
    benchmarkContext:
      'InferenceX tracks delivered tokens per chip over time rather than reporting MFU directly, and the repeated pattern of large gains on unchanged hardware, such as order of magnitude improvements within weeks of a model release, is utilization being recovered by better software.',
    relatedTerms: ['arithmetic-intensity', 'roofline', 'memory-bandwidth', 'throughput'],
    articleSlugs: [MI355X_DSV4, DEEPSEEK_V4, INFERENCEX_V2],
  },
  {
    slug: 'memory-bound-vs-compute-bound',
    term: 'Memory bound vs compute bound',
    aliases: ['bandwidth bound', 'compute limited'],
    category: 'Benchmark metrics',
    plainEnglish:
      'A workload is compute bound when the math units are the bottleneck and memory bound when waiting on data movement is the bottleneck.',
    definition:
      'A kernel is compute bound when its runtime is set by arithmetic throughput and memory bound when its runtime is set by how fast operands move between memory and the compute units.',
    explanation:
      'Every kernel has an arithmetic intensity, the ratio of operations to bytes touched. If that ratio is below the hardware balance point, the memory system saturates before the math units do. LLM prefill runs large matrix multiplies with high intensity and tends to be compute bound, while decode reads the entire working set of weights and KV cache to produce one token per request and is usually memory bound.',
    significance:
      'The binding resource decides which hardware spec matters. Memory bound decode explains why HBM capacity and bandwidth headline every accelerator launch, why quantization speeds up decode by shrinking bytes moved, and why a chip with modest FLOPs but fast memory can win interactive serving.',
    benchmarkContext:
      'InferenceX sweeps concurrency, which walks a system between regimes: low concurrency decode is bandwidth limited while high concurrency batching pushes toward compute limits. The shape of each throughput versus interactivity curve reflects where that transition happens for a given recipe.',
    relatedTerms: [
      'arithmetic-intensity',
      'roofline',
      'memory-bandwidth',
      'high-bandwidth-memory',
      'decode',
    ],
    articleSlugs: [INFERENCEX_V2, TILERT],
  },
  {
    slug: 'gpu-utilization',
    term: 'GPU utilization',
    aliases: ['chip utilization', 'accelerator utilization'],
    category: 'Benchmark metrics',
    plainEnglish:
      'GPU utilization measures how busy an accelerator is, though the common percentage from monitoring tools can look high while real efficiency stays low.',
    definition:
      'GPU utilization is the share of time or capability an accelerator spends doing useful work, reported anywhere from coarse busy percentages to strict measures like model FLOPs utilization.',
    explanation:
      'The utilization number in basic monitoring tools only says a kernel was resident, not that it used the chip well. A kernel occupying one compute unit still reads as busy. Stricter measures compare delivered arithmetic or bandwidth against hardware peaks. In serving, utilization is also shaped by traffic: idle gaps between requests, low concurrency, and tool call pauses in agent sessions all leave paid-for silicon idle.',
    significance:
      'Fleet economics hinge on utilization. The gap between a well batched, well scheduled deployment and a naive one is often several times the cost per token on identical hardware, which is why serving software and request routing get as much attention as the chips themselves.',
    benchmarkContext:
      'InferenceX benchmarks report delivered throughput per chip at each interactivity level rather than a utilization percentage, so utilization differences between engines, precisions, and parallelism plans show up directly as separation between curves on the same hardware.',
    relatedTerms: [
      'model-flops-utilization',
      'batching',
      'concurrency',
      'throughput',
      'total-cost-of-ownership',
    ],
    articleSlugs: [INFERENCEMAX, AGENTIC_WORKLOADS],
  },
  {
    slug: 'continuous-batching',
    term: 'Continuous batching',
    aliases: ['in-flight batching', 'dynamic batching', 'iteration-level scheduling'],
    category: 'Serving',
    plainEnglish:
      'Continuous batching lets new requests join a running batch the moment old ones finish, instead of waiting for the whole batch to complete.',
    definition:
      'Continuous batching is a scheduling technique that admits and retires requests at every generation step, keeping the batch full as individual sequences finish at different times.',
    explanation:
      'Static batching waits to collect a group of requests, runs them together, and returns them together, so a batch runs as long as its slowest member. Because LLM outputs vary wildly in length, that wastes enormous capacity. Continuous batching reforms the batch every iteration: a sequence that emits its final token leaves immediately and a queued request takes its slot at the next step, so the accelerator stays saturated.',
    significance:
      'This is one of the foundational optimizations of modern LLM serving and a large part of why open source engines displaced naive deployment. It multiplies throughput at a given latency and pairs naturally with paged KV cache memory, which makes slot reuse cheap.',
    benchmarkContext:
      'Every engine InferenceX benchmarks, including vLLM, SGLang, and TensorRT-LLM, uses continuous batching. Concurrency sweeps measure how well each scheduler holds interactivity as the batch fills, which is where implementation differences between engines become visible.',
    relatedTerms: ['batching', 'concurrency', 'paged-attention', 'inference-engine', 'throughput'],
    articleSlugs: [INFERENCEMAX, SGLANG_056],
  },
  {
    slug: 'paged-attention',
    term: 'PagedAttention',
    aliases: ['paged KV cache', 'KV cache paging'],
    category: 'Serving',
    plainEnglish:
      'PagedAttention stores the KV cache in small fixed size blocks, like virtual memory pages, so cache memory is not wasted on unused space.',
    definition:
      'PagedAttention is a KV cache management technique that allocates cache in fixed size blocks addressed through a mapping table, rather than reserving one contiguous region per request.',
    explanation:
      'Contiguous per-request allocation must reserve space for the longest possible output, and most of that reservation is never used. Paging borrows the operating system playbook: cache blocks are allocated on demand as a sequence grows, freed the moment it ends, and shared between sequences with a common prefix through copy on write. Fragmentation drops to near zero, so far more sequences fit in the same HBM.',
    significance:
      'Introduced by vLLM, this idea unlocked the batch sizes that make continuous batching pay off and became standard across serving engines. Effective KV capacity, not raw memory size, is what bounds concurrency for long context and agentic workloads.',
    benchmarkContext:
      'All engines in InferenceX recipes manage KV memory in paged or block based form. High concurrency points on long context scenarios such as AgentX are only reachable because paging keeps cache waste small as hundreds of sessions grow and shrink.',
    relatedTerms: ['kv-cache', 'kv-cache-manager', 'continuous-batching', 'prefix-caching', 'vllm'],
    articleSlugs: [AGENT_BENCHMARK, INFERENCEMAX],
  },
  {
    slug: 'radix-attention',
    term: 'RadixAttention',
    aliases: ['radix tree cache', 'radix prefix cache'],
    category: 'Serving',
    plainEnglish:
      'RadixAttention keeps completed KV cache in a radix tree keyed by token content, so any new request can reuse the longest matching prefix.',
    definition:
      'RadixAttention is a prefix caching design from SGLang that retains KV cache entries in a radix tree after requests finish, enabling automatic reuse across requests that share token prefixes.',
    explanation:
      'A radix tree indexes cached segments by their token content, so lookup finds the longest previously computed prefix of an incoming request in one walk. Reuse is automatic and cross request: multi turn chats, system prompts shared by many users, and agent branches that fork from a common history all hit the same cached nodes. An eviction policy such as least recently used bounds the memory the tree holds.',
    significance:
      'Prefix reuse converts redundant prefill compute into cache hits, and in agent traffic where each turn resends a growing history the savings can dominate end to end cost. Making reuse structural rather than opt in is a large part of why SGLang performs well on such workloads.',
    benchmarkContext:
      'InferenceX AgentX traces preserve real shared prefix structure between turns and subagent branches, so engines with strong radix style reuse show materially better time to first token and throughput on the agentic scenario than the fixed sequence scenarios would predict.',
    relatedTerms: [
      'prefix-caching',
      'prefix-cache-hit-rate',
      'kv-cache',
      'sglang',
      'agentic-inference',
    ],
    articleSlugs: [AGENT_BENCHMARK, AGENTX_QWEN_SGLANG],
  },
  {
    slug: 'draft-model',
    term: 'Draft model',
    aliases: ['draft head', 'speculator'],
    category: 'Serving',
    plainEnglish:
      'A draft model is the small fast model in speculative decoding that guesses several upcoming tokens for the large model to verify in one pass.',
    definition:
      'A draft model is the lightweight proposal component of speculative decoding, producing candidate token sequences that the target model verifies in a single batched forward pass.',
    explanation:
      'Drafts take several forms: a separate small model from the same family, extra prediction heads trained onto the target model as in EAGLE style methods, or the multi token prediction heads some models ship with. The draft races ahead a few tokens cheaply, the target checks all of them at once, and accepted tokens are emitted together. Rejection falls back to the target model output, so results match the target distribution.',
    significance:
      'Draft quality sets acceptance length, and acceptance length sets the speedup. A well matched draft can multiply decode speed at low batch sizes, while a mismatched or overly aggressive draft wastes verify compute and can even slow serving under load.',
    benchmarkContext:
      'InferenceX records the speculative method and acceptance length behind each result and publishes golden acceptance length distributions for reproduction, because an unrealistic acceptance rate is a classic way a benchmark number stops describing production behavior.',
    relatedTerms: [
      'speculative-decoding',
      'eagle',
      'multi-token-prediction',
      'acceptance-length',
      'decode',
    ],
    articleSlugs: [SGLANG_056, GB300_DSV4],
  },
  {
    slug: 'offline-inference',
    term: 'Offline inference',
    aliases: ['batch inference', 'offline batch serving'],
    category: 'Serving',
    plainEnglish:
      'Offline inference processes a large pile of requests with no user waiting, so the only goal is maximum tokens per dollar, not latency.',
    definition:
      'Offline inference is model serving without an interactive deadline, where requests are processed in bulk and the objective is total throughput and cost rather than per-user latency.',
    explanation:
      'Synthetic data generation, document processing, embedding backfills, and evaluation sweeps do not care when any individual request returns. That frees the scheduler to run the largest batches the memory allows, order requests to maximize prefix reuse, and hold the accelerator at its throughput limit. Online serving lives at the opposite end of the same tradeoff, sacrificing throughput to keep every user above an interactivity floor.',
    significance:
      'The same hardware can differ by multiples in tokens per dollar between offline and tight latency operation, so quoting a single price per million tokens without stating the operating point is close to meaningless. Fleets often split into latency tiers for this reason.',
    benchmarkContext:
      'The right edge of an InferenceX throughput versus interactivity curve, where batch size is maximal and per-user speed is lowest, approximates offline operation. Reading one curve at both edges shows the full online to offline cost range for a recipe.',
    relatedTerms: [
      'throughput',
      'interactivity',
      'batching',
      'cost-per-million-tokens',
      'pareto-frontier',
    ],
    articleSlugs: [INFERENCEMAX, B200_MINIMAX],
  },
  {
    slug: 'context-window',
    term: 'Context window',
    aliases: ['context length', 'max sequence length', 'long context'],
    category: 'Model architecture',
    plainEnglish:
      'The context window is the maximum number of tokens a model can consider at once, covering both the input and everything generated so far.',
    definition:
      'The context window is the maximum sequence length a model supports, bounding the combined token count of prompt, conversation history, retrieved material, and generated output.',
    explanation:
      'Attention lets every token reference earlier tokens, and the KV cache holds state for all of them, so a longer window costs memory and compute that grow with length. Position encoding schemes and training length set the usable window, while serving stacks must budget KV capacity for it. Modern frontier models advertise windows of hundreds of thousands of tokens, but throughput and interactivity degrade as sequences approach those limits.',
    significance:
      'Long context is what makes coding agents, retrieval heavy pipelines, and document analysis workloads possible, and it is also what makes them expensive to serve. Architectural responses such as sliding window layers, latent attention, and linear attention exist mainly to bend the cost curve of the window.',
    benchmarkContext:
      'InferenceX covers the window from both directions: fixed sequence scenarios pin input and output lengths such as 8K in and 1K out, while AgentX replays sessions whose contexts grow turn by turn toward realistic agent working sets.',
    relatedTerms: [
      'kv-cache',
      'input-output-sequence-length',
      'sliding-window-attention',
      'linear-attention',
      'agentic-coding-workload',
    ],
    articleSlugs: [AGENTIC_WORKLOADS, KIMI_K3],
  },
  {
    slug: 'grouped-query-attention',
    term: 'Grouped-query attention',
    abbreviation: 'GQA',
    aliases: ['GQA', 'multi-query attention', 'MQA'],
    category: 'Model architecture',
    plainEnglish:
      'Grouped-query attention lets several query heads share one set of key and value heads, shrinking the KV cache without giving up much quality.',
    definition:
      'Grouped-query attention is an attention variant where query heads are divided into groups that each share a single key and value head, reducing KV cache size and bandwidth per token.',
    explanation:
      'Standard multi-head attention stores keys and values for every head, so cache size scales with head count. Multi-query attention collapses all heads onto one KV pair, which is maximally cheap but can hurt quality. GQA sits between the two: a model might serve 64 query heads from 8 KV heads, cutting cache size eight fold. Because decode is dominated by reading the KV cache, the saving translates directly into faster token generation.',
    significance:
      'GQA became the default attention layout for dense open models because it attacks the memory side of decode where serving is actually bound. It also set the stage for more aggressive KV compression schemes such as multi-head latent attention.',
    benchmarkContext:
      'Attention layout is fixed by each model architecture, so GQA shows up in InferenceX through model level differences in KV bytes per token, which shape achievable concurrency and interactivity on identical hardware and engine versions.',
    relatedTerms: [
      'kv-cache',
      'multi-head-latent-attention',
      'decode',
      'memory-bandwidth',
      'kv-cache-quantization',
    ],
    articleSlugs: [INFERENCEX_V2, AGENT_BENCHMARK],
  },
  {
    slug: 'active-parameters',
    term: 'Active parameters',
    aliases: ['activated parameters', 'active params'],
    category: 'Model architecture',
    plainEnglish:
      'Active parameters are the weights a mixture of experts model actually uses for each token, a small slice of its much larger total size.',
    definition:
      'Active parameters are the subset of a sparse model, its shared layers plus the experts its router selects, that participate in computing any single token.',
    explanation:
      'A mixture of experts model might hold a trillion total parameters while routing each token through only a few tens of billions. Compute per token scales with the active count, which is why sparse frontier models can be affordable to run. Memory tells a different story: every expert must sit in HBM ready to be selected, so capacity requirements and parallelism plans follow total parameters even though arithmetic follows active ones.',
    significance:
      'The total versus active split explains most modern serving economics. It is why trillion parameter models are deployable at all, why expert parallelism across many chips exists, and why comparing models by total parameter count says little about their serving cost.',
    benchmarkContext:
      'The MoE models InferenceX benchmarks, including the DeepSeek, Kimi, Qwen, and MiniMax families, all have low active to total ratios, and their recipes spread experts across nodes precisely because total parameters set the memory bill.',
    relatedTerms: [
      'mixture-of-experts',
      'expert-parallelism',
      'wide-expert-parallelism',
      'high-bandwidth-memory',
    ],
    articleSlugs: [DEEPSEEK_V4, KIMI_K3],
  },
  {
    slug: 'dense-model',
    term: 'Dense model',
    aliases: ['dense transformer', 'dense LLM'],
    category: 'Model architecture',
    plainEnglish:
      'A dense model applies every one of its parameters to every token it processes, unlike sparse models that route tokens to a few experts.',
    definition:
      'A dense model is a neural network in which all weights participate in every forward pass, so compute per token scales directly with total parameter count.',
    explanation:
      'Dense transformers are the simpler design: every layer processes every token with all of its weights. That makes their behavior predictable, their parallelism straightforward, and their quality per parameter strong, but serving cost grows linearly with size. Mixture of experts models break that link by activating a fraction of their weights per token, which is why the largest frontier models are sparse while small and mid size models often stay dense.',
    significance:
      'The dense versus sparse choice drives serving strategy. Dense models fit on fewer chips and avoid expert routing complexity, while sparse models buy more quality per unit of compute at the price of much larger memory footprints and heavier cross chip communication.',
    benchmarkContext:
      'InferenceX coverage centers on the large sparse models operators actually deploy at the frontier, and dense baselines such as Llama class models provide contrast in how tensor parallelism and memory pressure behave without expert routing.',
    relatedTerms: ['mixture-of-experts', 'active-parameters', 'tensor-parallelism', 'quantization'],
    articleSlugs: [INFERENCEMAX, INFERENCEX_V2],
  },
  {
    slug: 'reasoning-model',
    term: 'Reasoning model',
    aliases: ['thinking model', 'test-time compute', 'chain-of-thought model'],
    category: 'Model architecture',
    plainEnglish:
      'A reasoning model generates long hidden chains of thought before answering, trading extra output tokens for better results on hard problems.',
    definition:
      'A reasoning model is an LLM trained to spend additional generated tokens working through a problem, producing extended intermediate reasoning before or alongside its final answer.',
    explanation:
      'Instead of scaling only training compute, reasoning models scale test time compute: they think in tokens. A single math or coding query can trigger thousands of tokens of internal deliberation, so output lengths explode relative to chat models. For serving, that shifts load heavily toward decode, inflates KV cache residency per request, and makes tokens per second per user the metric that decides whether a hard query answers in seconds or minutes.',
    significance:
      'Reasoning turned inference into the scaling frontier: capability now improves by spending more at serving time, which multiplies demand for decode throughput. It reshaped hardware priorities toward memory bandwidth and interconnect, and it is a core reason agentic workloads dominate current benchmark design.',
    benchmarkContext:
      'The frontier models InferenceX benchmarks are reasoning capable, and its scenarios reflect their traffic: long generations in fixed sequence tests and full agent sessions in AgentX, where deliberation and tool use interleave over many turns.',
    relatedTerms: ['decode', 'interactivity', 'agentic-inference', 'kv-cache', 'throughput'],
    articleSlugs: [AGENTIC_WORKLOADS, GB200_R1],
  },
  {
    slug: 'tokenization',
    term: 'Tokenization',
    aliases: ['tokenizer', 'token', 'byte pair encoding', 'BPE'],
    category: 'Model architecture',
    plainEnglish:
      'Tokenization splits text into the sub word units a model actually reads and writes, and every performance and price number is quoted in them.',
    definition:
      'Tokenization is the conversion between text and the discrete token IDs a model processes, using a fixed vocabulary learned with methods such as byte pair encoding.',
    explanation:
      'A tokenizer maps common words to single tokens and rarer strings to several, with English averaging very roughly four characters per token. Vocabularies differ between model families, so identical text can produce meaningfully different token counts across models. Everything downstream is denominated in tokens: context windows, KV cache size, throughput, latency per token, and price per million tokens all count these units, not characters or words.',
    significance:
      'Token efficiency is a hidden price lever, since a model that needs fewer tokens for the same content is cheaper at an identical per token rate. Comparing providers or benchmarks without normalizing for tokenizer differences quietly distorts cost and speed conclusions.',
    benchmarkContext:
      'InferenceX metrics are token denominated, and its AgentX traces replace original text with deterministic synthetic tokens while preserving per turn token counts, so replayed sessions stress serving systems with the same token arithmetic as the source workload.',
    relatedTerms: ['throughput', 'cost-per-million-tokens', 'context-window', 'trace-replay'],
    articleSlugs: [AGENT_BENCHMARK, INFERENCEMAX],
  },
  {
    slug: 'sequence-parallelism',
    term: 'Sequence parallelism',
    aliases: ['sequence parallel', 'SP'],
    category: 'Parallelism',
    plainEnglish:
      'Sequence parallelism splits a single long sequence across chips, so the tokens of one request are processed by several accelerators at once.',
    definition:
      'Sequence parallelism is a strategy that partitions the token dimension of a sequence across devices, dividing activation memory and attention work for very long inputs.',
    explanation:
      'Tensor parallelism splits weights, while sequence parallelism splits the sequence itself: each chip holds a slice of the tokens and the associated activations and KV state. Attention then needs communication, since queries on one chip must meet keys and values on others, which ring style attention algorithms overlap with compute. In inference the closely related context parallel approach is what makes prefill of contexts with hundreds of thousands of tokens tractable.',
    significance:
      'Sequence style partitioning is the answer when one request, not the batch, is too large: a single million token prefill can exceed the memory and time budget of any one chip. It converts context length from a hard wall into a scaling dimension, at the price of interconnect traffic.',
    benchmarkContext:
      'InferenceX records the full parallelism plan of each recipe, and long context agentic scenarios are where sequence and context partitioning choices, together with interconnect quality, visibly separate systems with similar single chip specifications.',
    relatedTerms: [
      'context-parallelism',
      'tensor-parallelism',
      'context-window',
      'prefill',
      'nvlink',
    ],
    articleSlugs: [AGENT_BENCHMARK, VR_RUBIN],
  },
  {
    slug: 'all-gather',
    term: 'All-gather',
    aliases: ['allgather', 'gather collective'],
    category: 'Parallelism',
    plainEnglish:
      'All-gather is a group communication step where every chip ends up holding the combined data that started out split across all of them.',
    definition:
      'All-gather is a collective operation in which each participating device contributes its shard and every device receives the concatenation of all shards.',
    explanation:
      'Sharded execution constantly needs to reassemble full tensors: weight shards before a matrix multiply in some tensor parallel layouts, or per device activations before an operation that needs the whole hidden state. All-gather moves each shard to every rank, typically over a ring or tree schedule, and its cost grows with tensor size and the number of participants. It is the inverse companion of reduce-scatter, and the two composed together form an all-reduce.',
    significance:
      'Together with all-reduce and all-to-all, all-gather is one of the handful of collectives that decide whether a parallelism plan scales. Its latency sits on the critical path of every layer that uses it, which is why scale up bandwidth between chips is so heavily marketed.',
    benchmarkContext:
      'Every multi chip recipe InferenceX benchmarks exercises collectives through its parallelism plan, and the CollectiveX workstream measures operations like this directly across vendors so communication behavior can be compared outside full model runs.',
    relatedTerms: [
      'all-reduce',
      'reduce-scatter',
      'tensor-parallelism',
      'nvlink',
      'scale-up-vs-scale-out',
    ],
    articleSlugs: [VR_RUBIN, INFERENCEX_V2],
  },
  {
    slug: 'reduce-scatter',
    term: 'Reduce-scatter',
    aliases: ['reduce scatter collective'],
    category: 'Parallelism',
    plainEnglish:
      'Reduce-scatter sums matching data from every chip and leaves each chip holding just its own slice of the combined result.',
    definition:
      'Reduce-scatter is a collective operation that element wise reduces tensors contributed by all devices and distributes the reduced result in shards, one shard per device.',
    explanation:
      'When every rank computes a partial result for the same tensor, the partials must be summed. Reduce-scatter does the summation and hands each rank only the slice it will need next, avoiding the waste of giving everyone the full reduced tensor. An all-reduce is exactly a reduce-scatter followed by an all-gather, so schedulers choose between the fused and split forms depending on what the next operation actually consumes.',
    significance:
      'Using reduce-scatter instead of a full all-reduce halves the data each rank must receive when only a shard is needed, which matters at NVL72 scale where collective traffic competes with the model itself for interconnect bandwidth. Overlap of these collectives with compute is a defining quality of mature serving stacks.',
    benchmarkContext:
      'InferenceX recipes with tensor parallel sharding trigger reduction collectives in every transformer layer, and CollectiveX exists precisely to publish cross vendor measurements of these primitives at the message sizes inference actually uses.',
    relatedTerms: ['all-reduce', 'all-gather', 'tensor-parallelism', 'nvlink'],
    articleSlugs: [VR_RUBIN, GB200_KIMI],
  },
  {
    slug: 'infiniband',
    term: 'InfiniBand',
    abbreviation: 'IB',
    aliases: ['IB', 'InfiniBand networking', 'NDR InfiniBand'],
    category: 'Hardware',
    plainEnglish:
      'InfiniBand is a high speed, low latency network fabric that connects servers in AI clusters, carrying traffic between nodes that NVLink cannot reach.',
    definition:
      'InfiniBand is a switched network fabric with native RDMA support, used as the scale out interconnect between nodes in most large NVIDIA based AI clusters.',
    explanation:
      'Inside a node or rack, chips talk over scale up links such as NVLink. Beyond that boundary, traffic crosses the scale out network, where InfiniBand competes with RDMA capable Ethernet. InfiniBand offers microsecond scale latency, hundreds of gigabits per second per link in current generations, and in network reduction features such as SHARP. Multi node inference, disaggregated prefill and decode, and wide expert parallelism all place their cross node collectives and KV transfers on this fabric.',
    significance:
      'Once a model spans nodes, the network joins the compute as a first order performance component. Fabric choice shapes cluster cost and vendor lock in, and the InfiniBand versus Ethernet contest is one of the central competitive battles in AI infrastructure.',
    benchmarkContext:
      'InferenceX multi node recipes, including disaggregated and rack scale results, run over the scale out fabric of the host cluster, and recipe metadata records the interconnect because it materially affects reproducibility of cross node numbers.',
    relatedTerms: [
      'rdma',
      'nvlink',
      'scale-up-vs-scale-out',
      'disaggregated-inference',
      'wide-expert-parallelism',
    ],
    articleSlugs: [GB200_R1, VR_RUBIN],
  },
  {
    slug: 'rdma',
    term: 'Remote direct memory access',
    abbreviation: 'RDMA',
    aliases: ['RDMA', 'RoCE', 'GPUDirect RDMA'],
    category: 'Hardware',
    plainEnglish:
      'RDMA lets one machine read or write the memory of another directly over the network, without either CPU copying data along the way.',
    definition:
      'Remote direct memory access is a networking capability where the network adapter moves data straight between the memories of two machines, bypassing operating system and CPU copy overhead.',
    explanation:
      'A conventional network stack copies data through kernel buffers on both ends, burning CPU cycles and latency. RDMA adapters transfer directly between registered memory regions, and GPUDirect extends this so adapters write straight into accelerator HBM. InfiniBand has RDMA built in, while RoCE carries the same verbs over Ethernet. Collective libraries such as NCCL and RCCL, and KV cache transfer paths in disaggregated serving, are built on these primitives.',
    significance:
      'RDMA is the floor the whole distributed AI stack stands on: without it, cross node collectives and cache transfers would bottleneck on CPUs long before saturating the links. The RoCE variant is what allows Ethernet based clusters to compete with InfiniBand at lower cost.',
    benchmarkContext:
      'Every InferenceX multi node result depends on RDMA transports underneath its collectives and, for disaggregated recipes, underneath prefill to decode KV movement, so transport maturity is part of what separates otherwise similar cluster results.',
    relatedTerms: [
      'infiniband',
      'nvlink',
      'disaggregated-inference',
      'kv-cache',
      'scale-up-vs-scale-out',
    ],
    articleSlugs: [GB200_R1, AGENTX_DSV4_GB200_GB300],
  },
  {
    slug: 'ualink',
    term: 'UALink',
    aliases: ['Ultra Accelerator Link', 'UALoE'],
    category: 'Hardware',
    plainEnglish:
      'UALink is an open industry standard for the fast scale up links between accelerators in a rack, the ecosystem answer to NVLink.',
    definition:
      'UALink is an open interconnect specification for accelerator to accelerator scale up communication, letting many chips in a rack share memory traffic at switch fabric speeds.',
    explanation:
      'NVLink proved that a rack of chips joined by a low latency memory semantic fabric can behave like one giant accelerator, but it is proprietary. The UALink consortium defines an open equivalent so vendors beyond NVIDIA can build rack scale domains. UALink over Ethernet, shortened to UALoE, runs the protocol over Ethernet switching. AMD Helios generation racks adopt this path to form 72 chip scale up domains comparable in structure to NVL72.',
    significance:
      'Scale up domain size increasingly decides serving architecture, since wide expert parallelism and disaggregation want dozens of chips within one fast fabric. An open standard determines whether rack scale inference stays a single vendor advantage or becomes an ecosystem capability.',
    benchmarkContext:
      'InferenceX lists UALoE72 class systems such as AMD MI455X racks alongside NVL72 systems in its hardware coverage, so rack scale fabrics can be compared head to head on identical model workloads as they reach the market.',
    relatedTerms: ['nvlink', 'nvl72', 'scale-up-vs-scale-out', 'wide-expert-parallelism'],
    articleSlugs: [VR_RUBIN, AGENTX_V3],
  },
  {
    slug: 'tdp',
    term: 'Thermal design power',
    abbreviation: 'TDP',
    aliases: ['TDP', 'board power', 'all-in power'],
    category: 'Hardware',
    plainEnglish:
      'TDP is the sustained power a chip is designed to draw and shed as heat, the headline wattage on every accelerator spec sheet.',
    definition:
      'Thermal design power is the maximum sustained power envelope a chip is engineered to operate within, which its cooling system must dissipate continuously.',
    explanation:
      'Modern accelerators run around or above the kilowatt mark per chip, and a full rack system multiplies that into six figures of watts. TDP alone also undersells the true bill: memory, networking, CPUs, power conversion losses, and cooling overhead stack on top, which is why all in power per chip is meaningfully higher than the chip TDP. Datacenter capacity is sold in megawatts, so these envelopes translate directly into how many accelerators a site can host.',
    significance:
      'Power has become the binding constraint of AI buildout, ahead of capital in many markets. Rising per chip TDP forced the shift to liquid cooling and made performance per watt, not just performance per dollar, a primary axis for comparing silicon generations.',
    benchmarkContext:
      'InferenceX derives energy per token and tokens per megawatt using per chip all in power figures that include cooling and infrastructure overhead above TDP, and the PowerX workstream is extending this from rated figures toward measured draw during runs.',
    relatedTerms: ['energy-per-token', 'tokens-per-megawatt', 'pue', 'total-cost-of-ownership'],
    articleSlugs: [INFERENCEX_V2, VR_RUBIN],
  },
  {
    slug: 'pue',
    term: 'Power usage effectiveness',
    abbreviation: 'PUE',
    aliases: ['PUE', 'datacenter efficiency ratio'],
    category: 'Hardware',
    plainEnglish:
      'PUE measures how much total datacenter power is consumed for every watt that actually reaches the computing equipment inside it.',
    definition:
      'Power usage effectiveness is the ratio of total facility power to IT equipment power, where a value of 1.0 would mean every watt goes to computing.',
    explanation:
      'Cooling, power conversion, and facility systems consume energy on top of the servers themselves. A PUE of 1.5 means half again as much power is spent on overhead as on IT load, while modern hyperscale AI facilities push toward 1.1 and below with liquid cooling and high efficiency distribution. Because AI campuses are sized in hundreds of megawatts, small PUE differences move enormous absolute energy and cost figures.',
    significance:
      'PUE links chip level efficiency to facility economics: every watt a chip draws is multiplied by PUE at the utility meter. As power availability gates AI buildout, facility efficiency became part of the competitive calculus alongside silicon and software.',
    benchmarkContext:
      'The all in power figures behind InferenceX energy per token and tokens per megawatt metrics incorporate facility overhead consistent with modern AI datacenter PUE, so its cost and energy comparisons reflect delivered facility economics rather than bare chip wattage.',
    relatedTerms: ['tdp', 'energy-per-token', 'tokens-per-megawatt', 'total-cost-of-ownership'],
    articleSlugs: [INFERENCEX_V2, INFERENCEMAX],
  },
  {
    slug: 'int8',
    term: 'INT8',
    aliases: ['8-bit integer quantization', 'W8A8'],
    category: 'Numerical precision',
    plainEnglish:
      'INT8 stores numbers as 8 bit integers with a scale factor, halving memory versus 16 bit formats and doubling math rates on supporting hardware.',
    definition:
      'INT8 is an 8 bit integer numerical format used with per tensor or per channel scale factors to represent model weights and activations in quantized inference.',
    explanation:
      'Integer quantization maps floating point values onto 256 evenly spaced levels via a scale, and sometimes a zero point. Uniform spacing handles outliers poorly, so techniques such as SmoothQuant migrate activation outliers into weights before quantizing both sides, in the W8A8 pattern. On older accelerator generations INT8 was the primary fast path below 16 bits, while newer chips add FP8, whose exponent gives it a wider dynamic range at the same bit width.',
    significance:
      'INT8 defined the first mainstream wave of LLM quantization and remains relevant on hardware without floating point 8 bit support. The INT8 versus FP8 contrast also illustrates the core quantization tradeoff between uniform precision and dynamic range.',
    benchmarkContext:
      'InferenceX labels every result with its precision, and its comparison families exist because format changes moved curves so much. Modern recipes on Blackwell and MI350 class hardware favor FP8 and FP4 paths, with integer formats appearing in specific weight quantized configurations.',
    relatedTerms: ['quantization', 'fp8', 'int4', 'weight-only-quantization', 'bf16'],
    articleSlugs: [B200_KIMI, INFERENCEMAX],
  },
  {
    slug: 'weight-only-quantization',
    term: 'Weight-only quantization',
    aliases: ['W4A16', 'AWQ', 'GPTQ'],
    category: 'Numerical precision',
    plainEnglish:
      'Weight-only quantization compresses just the stored model weights to low precision while the math still runs in higher precision formats.',
    definition:
      'Weight-only quantization stores model weights in a low bit format such as 4 bit integers while keeping activations and arithmetic at higher precision, as in the W4A16 pattern.',
    explanation:
      'Weights are static and can be carefully quantized offline with methods such as GPTQ and AWQ, which choose scales and orderings that minimize quality loss. Activations are dynamic and harder to compress, so leaving them at 16 bits sidesteps their outlier problem. At serve time the kernel dequantizes weights on the fly, so memory traffic shrinks even though the multiply accumulate math itself does not get faster.',
    significance:
      'Because decode is memory bound, cutting weight bytes directly speeds up token generation and lets larger models fit on fewer chips. Weight-only methods made large open models runnable on modest hardware and remain the standard recipe when activation quantization would cost too much quality.',
    benchmarkContext:
      'InferenceX distinguishes weight-only configurations from full low precision paths in its precision labels, since a W4A16 recipe and an NVFP4 recipe make very different claims about which hardware units and bandwidth budgets produced a curve.',
    relatedTerms: ['quantization', 'int4', 'int8', 'kv-cache-quantization', 'memory-bandwidth'],
    articleSlugs: [B200_KIMI, MI355X_KIMI],
  },
  {
    slug: 'block-scaling',
    term: 'Block scaling',
    aliases: ['microscaling', 'MX formats', 'block floating point'],
    category: 'Numerical precision',
    plainEnglish:
      'Block scaling gives each small group of low precision numbers its own shared scale factor, recovering range that tiny formats lack on their own.',
    definition:
      'Block scaling is a quantization structure where values are stored in a very low bit format and each fixed size block of them shares one higher precision scale factor.',
    explanation:
      'A 4 bit number can represent only a handful of distinct magnitudes, far too few to span the dynamic range of model tensors. Grouping values into blocks of around 16 or 32 elements and attaching a shared scale lets each block center the format on its own magnitude. The MX standard formats such as MXFP4 and MXFP8 use power of two scales, while NVFP4 uses FP8 scales over 16 element blocks for finer granularity.',
    significance:
      'Block scaling is the enabling idea behind the FP4 generation of inference: without per block scales, 4 bit floating point would be unusable for frontier models. Scale format and block size choices are now genuine differentiators between hardware vendors and quantization recipes.',
    benchmarkContext:
      'The NVFP4 and MXFP4 results across InferenceX Blackwell and MI355X coverage are block scaled formats, and the compare-precision family exists largely to show what these recipes give up or gain against FP8 baselines on identical hardware.',
    relatedTerms: ['nvfp4', 'mxfp4', 'fp4', 'fp8', 'quantization'],
    articleSlugs: [B200_GLM5, GB300_DSV4],
  },
  {
    slug: 'flash-attention',
    term: 'FlashAttention',
    aliases: ['flash attention kernel', 'fused attention'],
    category: 'Software',
    plainEnglish:
      'FlashAttention computes exact attention in fast on-chip memory tiles, avoiding the huge intermediate matrix that made attention slow and memory hungry.',
    definition:
      'FlashAttention is an attention algorithm that tiles the computation through on-chip SRAM and rescales results incrementally, producing exact attention without materializing the full score matrix in HBM.',
    explanation:
      'Naive attention writes a score matrix that grows with the square of sequence length to main memory and reads it back, so bandwidth rather than arithmetic sets its speed. FlashAttention fuses the whole computation into one kernel that streams blocks of keys and values through on-chip memory, using an online softmax to keep results exact. Successive versions and vendor implementations extend the idea to new hardware generations, head layouts, and inference specific decode paths.',
    significance:
      'This kernel family is what made long context practical, turning attention from the dominant cost of long sequences into one manageable component. It is also the canonical example of how a single well engineered kernel can shift performance across the entire industry.',
    benchmarkContext:
      'Every serving engine InferenceX benchmarks relies on fused attention kernels descended from this line, through libraries such as FlashInfer on NVIDIA hardware and AITER on AMD, and kernel improvements there routinely move published curves without any hardware change.',
    relatedTerms: ['flashinfer', 'aiter', 'memory-bandwidth', 'context-window', 'kernel-fusion'],
    articleSlugs: [SGLANG_056, MI355X_QWEN],
  },
  {
    slug: 'triton',
    term: 'Triton',
    aliases: ['OpenAI Triton', 'Triton kernel language'],
    category: 'Software',
    plainEnglish:
      'Triton is a Python-based language for writing custom accelerator kernels, letting ML engineers get near hand-tuned speed without writing low level code.',
    definition:
      'Triton is an open source kernel programming language and compiler that lets developers write high performance accelerator kernels in Python-like code, portable across vendors that maintain backends.',
    explanation:
      'Writing peak performance kernels traditionally requires vendor specific expertise in CUDA or assembly level tuning. Triton raises the abstraction: the developer writes block level programs and the compiler handles memory coalescing, tiling, and scheduling. NVIDIA, AMD, and other vendors maintain backends, so one kernel source can target multiple architectures. Serving engines use it for fused operations, quantization paths, and MoE kernels where no vendor library fits. The name collides with NVIDIA Triton Inference Server, a separate model serving product.',
    significance:
      'Triton lowered the barrier between model researchers and hardware performance, and its cross vendor backends are strategically important because kernels written in it are not locked to one chip family. How well a vendor runs the Triton ecosystem has become part of its software story.',
    benchmarkContext:
      'Engines in InferenceX recipes ship substantial Triton kernel inventories alongside CUDA, CUTLASS, and AITER code, so compiler and backend maturity is one of the quiet forces behind curve movement between engine versions on both NVIDIA and AMD systems.',
    relatedTerms: ['cuda', 'rocm', 'kernel-fusion', 'inference-engine', 'gemm'],
    articleSlugs: [MI355X_DSV4, INFERENCEX_V2],
  },
  {
    slug: 'cutlass',
    term: 'CUTLASS',
    aliases: ['CUDA templates for linear algebra', 'CuTe'],
    category: 'Software',
    plainEnglish:
      'CUTLASS is an NVIDIA template library that provides the building blocks for writing matrix multiply kernels that approach peak hardware speed.',
    definition:
      'CUTLASS is an open source NVIDIA library of composable C++ templates for building GEMM and related kernels that target tensor cores across GPU generations.',
    explanation:
      'Peak matrix multiply performance demands precise choreography of tensor core instructions, shared memory movement, and asynchronous pipelines, and it changes with every architecture. CUTLASS packages that choreography as composable pieces, with its CuTe layer describing data layouts, so kernel authors assemble near peak GEMMs and fuse epilogues such as bias, activation, or quantization scaling instead of starting from scratch. Much of the high performance kernel work in serving engines builds on it directly.',
    significance:
      'CUTLASS is where NVIDIA teaches the ecosystem to use each new tensor core generation, including the FP4 and FP8 paths on Blackwell. The speed at which its patterns propagate into engines is a real component of how quickly new silicon reaches its advertised performance.',
    benchmarkContext:
      'The GEMM and attention kernels behind InferenceX results on NVIDIA hardware lean heavily on CUTLASS derived code, and version bumps of these libraries inside engine images are a recurring source of day over day curve movement the platform tracks.',
    relatedTerms: ['cuda', 'gemm', 'kernel-fusion', 'flashinfer', 'nvfp4'],
    articleSlugs: [SGLANG_056, GB300_DSV4],
  },
  {
    slug: 'nccl',
    term: 'NCCL',
    abbreviation: 'NCCL',
    aliases: ['NVIDIA Collective Communications Library', 'RCCL'],
    category: 'Software',
    plainEnglish:
      'NCCL is the NVIDIA library that moves data between chips during collective operations, with RCCL as its AMD counterpart.',
    definition:
      'NCCL is the NVIDIA collective communications library implementing operations such as all-reduce, all-gather, and all-to-all across GPUs, over NVLink within nodes and RDMA fabrics between them.',
    explanation:
      'Frameworks do not talk to interconnects directly; they call a collectives library that discovers the topology and picks algorithms and channel schedules for each message size. NCCL handles that for NVIDIA systems, and AMD maintains RCCL with a matching interface for ROCm platforms. Tuning is fabric specific: ring versus tree algorithms, protocol thresholds, and channel counts all shift with topology, which is why the same model can communicate very differently on two clusters.',
    significance:
      'Every multi chip inference and training job stands on this layer, and a collectives regression can silently tax an entire fleet. Interface compatibility between NCCL and RCCL is also load bearing for portability, since engines can target one collectives API across vendors.',
    benchmarkContext:
      'InferenceX multi chip recipes exercise these libraries in every tensor parallel and expert parallel layer, and CollectiveX measures the underlying collective performance directly across vendors at inference relevant message sizes, separating fabric behavior from model behavior.',
    relatedTerms: ['all-reduce', 'all-gather', 'all-to-all', 'nvlink', 'rdma'],
    articleSlugs: [GB200_KIMI, VR_RUBIN],
  },
  {
    slug: 'gemm',
    term: 'GEMM',
    abbreviation: 'GEMM',
    aliases: ['general matrix multiply', 'matrix multiplication kernel'],
    category: 'Software',
    plainEnglish:
      'GEMM is the general matrix multiply operation, the single computation that consumes most of the arithmetic in training and serving neural networks.',
    definition:
      'GEMM is the general matrix to matrix multiply routine, the core primitive that linear layers, attention projections, and expert computations in neural networks reduce to.',
    explanation:
      'Transformers are mostly stacks of linear transformations, so serving a model means executing enormous numbers of matrix multiplies. Tensor cores exist specifically to accelerate them, and peak TFLOP/s specifications are quoted for these dense operations. Shape determines efficiency: prefill produces large square-ish multiplies that saturate compute, while decode produces skinny ones that are bandwidth bound. MoE adds grouped GEMMs, where many small expert multiplies are batched into one efficient launch.',
    significance:
      'GEMM efficiency is the substrate of every performance claim in the industry. The gap between delivered and peak GEMM throughput at real serving shapes, especially the thin matrices of decode, explains much of why spec sheet ratios fail to predict benchmark rankings.',
    benchmarkContext:
      'Behind every InferenceX curve sits a stack of GEMM kernels from libraries such as CUTLASS, hipBLASLt, and Triton generated code, and quantized recipes ultimately stand on how well each vendor executes low precision GEMMs at the shapes its scheduler produces.',
    relatedTerms: [
      'cutlass',
      'arithmetic-intensity',
      'memory-bound-vs-compute-bound',
      'mixture-of-experts',
      'triton',
    ],
    articleSlugs: [INFERENCEX_V2, MI355X_GLM5],
  },
  {
    slug: 'kernel-fusion',
    term: 'Kernel fusion',
    aliases: ['fused kernels', 'operator fusion'],
    category: 'Software',
    plainEnglish:
      'Kernel fusion merges several small chip operations into one, so intermediate data stays in fast memory instead of bouncing through HBM.',
    definition:
      'Kernel fusion combines multiple consecutive operations into a single kernel launch, keeping intermediate results in registers or on-chip memory rather than writing them to main memory between steps.',
    explanation:
      'An unfused sequence like matrix multiply, bias add, and activation writes its intermediate tensor to HBM after each step and reads it back for the next. Fusing them into one kernel eliminates those round trips and the launch overhead between them. Fusion happens by hand in libraries, through template epilogues in CUTLASS style code, and automatically in compilers such as torch.compile and Triton based stacks. FlashAttention is the most famous single example of the idea.',
    significance:
      'In memory bound inference, removing intermediate traffic is worth more than raw arithmetic improvements, so fusion is one of the most reliable levers engines have. A large share of version over version engine speedups reduces to more aggressive or better targeted fusion.',
    benchmarkContext:
      'InferenceX recipes pin engine images whose fusion inventories differ by version and by hardware backend, which is a recurring reason day over day tracking shows curves moving on unchanged silicon as fused kernels land for new models and precisions.',
    relatedTerms: [
      'flash-attention',
      'cuda-graphs',
      'gemm',
      'memory-bandwidth',
      'inference-engine',
    ],
    articleSlugs: [MI355X_KIMI, SGLANG_056],
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
