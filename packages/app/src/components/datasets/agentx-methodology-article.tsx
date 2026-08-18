import Image from 'next/image';

import { AgentXMethodologyLink } from './agentx-methodology-link';

type Locale = 'en' | 'zh';

const ASSET_ROOT = '/images/agentx-methodology';

const FIGURE_ASSETS = {
  corpus: { src: `${ASSET_ROOT}/corpus-scale.png`, width: 2048, height: 965 },
  hashRatio: { src: `${ASSET_ROOT}/hash-token-ratio.png`, width: 2048, height: 1799 },
  traceRecord: { src: `${ASSET_ROOT}/weka-trace-record.png`, width: 1812, height: 2048 },
  requestDistributions: {
    src: `${ASSET_ROOT}/request-distributions.png`,
    width: 2048,
    height: 2004,
  },
  subagentDistributions: {
    src: `${ASSET_ROOT}/subagent-distributions.png`,
    width: 2048,
    height: 1390,
  },
  replayLinear: { src: `${ASSET_ROOT}/replay-linear.png`, width: 2048, height: 1169 },
  replaySingle: {
    src: `${ASSET_ROOT}/replay-single-subagent.png`,
    width: 2048,
    height: 1729,
  },
  replayTwo: {
    src: `${ASSET_ROOT}/replay-two-subagents.png`,
    width: 1920,
    height: 2048,
  },
  replayMulti: {
    src: `${ASSET_ROOT}/replay-multi-subagent.png`,
    width: 1677,
    height: 2048,
  },
  queueDepth: { src: `${ASSET_ROOT}/request-queue-depth.png`, width: 1360, height: 612 },
  pareto: { src: `${ASSET_ROOT}/pareto-b200-minimax-m3.png`, width: 2048, height: 1167 },
  warmup: { src: `${ASSET_ROOT}/warmup-snapshot.png`, width: 2048, height: 1322 },
  warmupCache: { src: `${ASSET_ROOT}/warmup-cache-sources.png`, width: 2048, height: 895 },
  profilingCache: {
    src: `${ASSET_ROOT}/profiling-cache-sources.png`,
    width: 2048,
    height: 897,
  },
  acceptanceControls: {
    src: `${ASSET_ROOT}/engine-acceptance-controls.png`,
    width: 2048,
    height: 1376,
  },
  goldenAl: { src: `${ASSET_ROOT}/golden-acceptance-length.png`, width: 747, height: 662 },
} as const;

const CONTENT = {
  en: {
    eyebrow: 'Field guide / AI infrastructure',
    title: 'AgentX methodology',
    lead: 'AgentX converts opt-in Claude Code proxy traces into deterministic AIPerf workloads. This page documents how collection metadata becomes a replay and which controls define a valid benchmark result.',
    facts: [
      { value: '393', label: 'published sessions' },
      { value: '64', label: 'tokens per hash block' },
      { value: '1 hour', label: 'profiling window' },
      { value: '25–75%', label: 'seeded start range' },
    ],
    collectionTitle: 'Dataset collection',
    collectionParagraphs: [
      'Participants opt in to an HTTP proxy that records request arrival and completion times, input and output token counts, conversation IDs, and subagent IDs. The published corpus does not contain prompts, source code, tool arguments, or tool results.',
      'The proxy represents each input as session-scoped chained hashes in 64-token blocks. Matching block IDs preserve shared prefixes within a session. AIPerf replaces the blocks with deterministic synthetic coding and tool-use tokens before replay.',
      'The client cannot see provider-side chat templates, proprietary tokenizers, server tools, encrypted reasoning content, or the exact token expansion of images and documents. Model-specific padding and deterministic placeholders approximate those fields. The placeholders and padding do not contain original prompts, code, or tool payloads.',
    ],
    datasetTitle: 'The v1.0 dataset',
    datasetParagraphs: [
      'The v1.0 release contains 393 sessions built on June 21, 2026. Each selected session has at least 20 requests, uses Claude Code 2.1.139 or newer, and has no more than 10 concurrent subagents. Processing removes exact duplicates, short classifier calls used for security monitoring or title generation, and requests whose reconstructed input exceeds 990k tokens.',
      'The full variant retains contexts up to 1M tokens. The 256k variant removes requests above its cap while retaining the relative timing and subagent overlap of the requests that remain. Both use the WEKA trace format consumed by AIPerf.',
    ],
    replayTitle: 'From trace to replay graph',
    replayParagraphs: [
      'AIPerf converts each trace into a directed acyclic graph (DAG). Main-agent requests form a linear chain. Subagent requests form separate chains that spawn after an eligible parent request and join before the next dependent main-agent request. One-off auxiliary requests can run without a join edge.',
      'The trace contains request timestamps and observed branch IDs, not the tool-level event that caused each branch. Replay therefore preserves recorded ordering, branch overlap, and inter-turn delays without claiming a provider-internal causal history.',
    ],
    measurementTitle: 'Concurrency and reported metrics',
    measurementParagraphs: [
      'Concurrency is the number of live agent clients. It is not a fixed HTTP request batch because one client can fan out into several subagent requests. The server can have more in-flight requests than the configured client concurrency.',
      'AgentX runs closed loop: a client submits its next eligible request after dependencies complete. Faster systems progress farther through their sampled sessions during the same hour, so the exact request mix can vary, especially at low concurrency. Results should report throughput with time to first token (TTFT) and interactivity. A single latency value does not describe the run.',
    ],
    warmupTitle: 'Warmup, timing, and determinism',
    warmupParagraphs: [
      'A fixed seed selects each replay start uniformly from 25% to 75% of the recorded session duration. A max_tokens=1 primer materializes the active main-agent and subagent prefixes. Each replay lane then completes 10 additional warmup requests before the measurement barrier opens.',
      'Only the following one-hour profiling window contributes reported metrics. The seed fixes session sampling, start points, and synthetic payloads. A unique cache-bust marker is added to each recycled play so unrelated replays cannot accumulate a shared prefix.',
    ],
    acceptanceTitle: 'Synthetic payloads and speculative decoding',
    acceptanceParagraphs: [
      'Synthetic tokens preserve input length and prefix structure, but their draft-token acceptance does not match natural model output. AgentX therefore uses a measured acceptance length from the coding category of SPEED-Bench for each model, speculative method, draft length, and thinking mode.',
      'The serving engines expose a forced-acceptance control, and InferenceX records the selected values in versioned golden acceptance-length files. This separates serving-system performance from acceptance variation caused by the synthetic payload. AgentX does not evaluate model answer quality.',
    ],
    dramTitle: 'DRAM offload rules',
    dramParagraphs: [
      'KV-cache offload changes the capacity available to long-running sessions. Servers without a standardized DRAM configuration are capped at 3 TB. Standard GB200 NVL72, GB300 NVL72, and TPUv7 systems may use their installed capacity.',
      'A benchmark configuration can access only the fraction of host DRAM proportional to its GPU allocation. This prevents a small GPU partition from claiming the memory budget of the entire server.',
    ],
    limitsTitle: 'Scope and reproducibility',
    limits:
      'The replay preserves client-visible request lengths, timing, branch structure, and KV-prefix reuse. It cannot reproduce provider-hidden transformations or the semantic content of the original session. Use the published corpus and locked scenario settings when comparing systems.',
    sourcesTitle: 'Primary sources',
    sources: [
      { label: 'AgentX v1.0 full dataset', target: 'dataset-full' },
      { label: 'AgentX v1.0 256k dataset', target: 'dataset-256k' },
      { label: 'AIPerf WEKA trace replay guide', target: 'aiperf-weka' },
      { label: 'SPEED-Bench paper', target: 'speed-bench' },
      { label: 'SGLang forced acceptance control', target: 'sglang-pr' },
      { label: 'TensorRT-LLM forced acceptance control', target: 'trtllm-pr' },
      { label: 'vLLM synthetic acceptance control', target: 'vllm-pr' },
      { label: 'ATOM synthetic acceptance control', target: 'atom-pr' },
      { label: 'InferenceX golden acceptance-length values', target: 'golden-al' },
    ],
    figures: {
      corpus: {
        alt: 'Corpus dashboard showing 8,271 sessions, 3.41 million requests, 613.27 billion tokens, 99% cache-hit rate, and token-source shares.',
        caption:
          'Corpus snapshot used during dataset selection. The displayed cost is a list-price estimate for this snapshot; it is not a benchmark output.',
      },
      hashRatio: {
        alt: 'Median reconstructed-hash-token to provider-token ratio by sequence length, overall and split by model.',
        caption:
          'Across 135,282 requests from 393 sessions, the median reconstructed/provider token ratio is 1.004. Shaded bands report p25–p75, not a per-request bound.',
      },
      traceRecord: {
        alt: 'Annotated AgentX trace JSON showing session ID, 64-token hash blocks, request timing, input and output counts, and a subagent group.',
        caption:
          'An abridged WEKA record. Block IDs are local to one session; repeated IDs identify the prompt prefix shared by later requests.',
      },
      requestDistributions: {
        alt: 'Log-scale distributions for inter-turn latency, input sequence length, and output sequence length in the v1.0 dataset.',
        caption:
          'Request distributions in the published v1.0 corpus. The median request has 142,016 input tokens and 444 output tokens.',
      },
      subagentDistributions: {
        alt: 'Distributions of subagent wall-clock duration and number of subagent groups per session.',
        caption:
          'The 175 sessions with subagents contain 1,697 groups. Median group duration is 2.27 minutes, and the median participating session has four groups.',
      },
      replayLinear: {
        alt: 'A linear four-request trace converted from recorded timing into a replay dependency chain.',
        caption:
          'A session without subagents becomes a linear dependency chain with recorded inter-turn delays.',
      },
      replaySingle: {
        alt: 'A main-agent trace with one two-request subagent converted into a dependency graph with a join gate.',
        caption:
          'One subagent branch spawns after the first main request and joins before the next dependent main request.',
      },
      replayTwo: {
        alt: 'Two parallel subagents joining the main agent and a one-off auxiliary request that does not rejoin.',
        caption:
          'Parallel subagents share a join gate. The auxiliary request runs independently and has no join edge.',
      },
      replayMulti: {
        alt: 'Four parallel subagents grouped by two join points, plus an auxiliary request, shown as a replay dependency graph.',
        caption:
          'Multiple subagent groups retain their separate join points, while the auxiliary branch remains detached.',
      },
      queueDepth: {
        alt: 'Request queue depth over about one hour, separating running, waiting, and total requests for a concurrent AgentX replay.',
        caption:
          'A 50-client replay produces a changing number of running and waiting HTTP requests as session graphs fan out and join.',
      },
      pareto: {
        alt: 'B200 vLLM MiniMax-M3 throughput per chip versus p90 interactivity curve across client concurrency levels.',
        caption:
          'Each labeled point is a client-concurrency setting. Higher concurrency raises throughput while reducing per-client interactivity.',
      },
      warmup: {
        alt: 'Four replay trajectories showing seeded 25–75% warmup points and primer requests for active main-agent and subagent streams.',
        caption:
          'The fixed seed chooses t* within the shaded 25–75% interval. Primers establish the active prefix state before profiling.',
      },
      warmupCache: {
        alt: 'Warmup prompt-token share shifting from cache misses toward HBM cache hits over roughly one minute.',
        caption:
          'Warmup begins with cache misses, then materializes enough prefix state for most prompt tokens to hit HBM.',
      },
      profilingCache: {
        alt: 'One-hour profiling prompt-token share dominated by HBM cache hits after the initial seconds.',
        caption:
          'The measured hour starts after warmup. HBM cache hits dominate the prompt-token source throughout the window.',
      },
      acceptanceControls: {
        alt: 'Merged SGLang, TensorRT-LLM, vLLM, and ATOM pull requests adding forced speculative-decoding acceptance controls.',
        caption:
          'Merged engine changes expose the controls required to apply the same acceptance assumption across serving stacks.',
      },
      goldenAl: {
        alt: 'InferenceX golden acceptance-length YAML for DeepSeek-V4-Pro, listing values by speculative-token count and thinking mode.',
        caption:
          'A versioned golden acceptance-length file records the SPEED-Bench measurement used for each draft length and thinking mode.',
      },
    },
  },
  zh: {
    eyebrow: 'Field guide / AI infrastructure',
    title: 'AgentX 方法论',
    lead: 'AgentX 将自愿采集的 Claude Code 代理 trace 转换为确定性的 AIPerf 工作负载。本页说明采集元数据如何生成回放，以及有效基准测试结果所遵循的控制规则。',
    facts: [
      { value: '393', label: '个公开会话' },
      { value: '64', label: '每个 hash block 的 token 数' },
      { value: '1 小时', label: 'profiling 窗口' },
      { value: '25–75%', label: '固定 seed 起点范围' },
    ],
    collectionTitle: '数据采集',
    collectionParagraphs: [
      '参与者主动启用 HTTP 代理后，代理会记录请求到达与完成时间、input 和 output token 数、conversation ID 与 subagent ID。公开语料不包含 prompt、源代码、tool argument 或 tool result。',
      '代理以 64-token block 为单位，将每段 input 表示为会话内串联 hash。同一会话中相同的 block ID 会保留共享 prefix。回放前，AIPerf 会使用确定性的合成编码与 tool-use token 替换这些 block。',
      '客户端无法看到服务端 chat template、专有 tokenizer、服务端 tool、加密的 reasoning 内容，也无法精确得知图片和文档最终展开成多少 token。AgentX 使用针对模型校准的 padding 和确定性 placeholder 处理这些字段；其中不包含原始 prompt、代码或 tool payload。',
    ],
    datasetTitle: 'v1.0 数据集',
    datasetParagraphs: [
      'v1.0 于 2026 年 6 月 21 日构建，共包含 393 个会话。每个入选会话至少有 20 个请求，Claude Code 版本不低于 2.1.139，并且同时运行的 subagent 不超过 10 个。处理流程会移除完全重复的请求、用于安全监控或标题生成的短 classifier 调用，以及重建后 input 超过 990k token 的请求。',
      'full 变体保留最高 1M token 的上下文。256k 变体会移除超过上限的请求，同时保留其余请求的相对时间与 subagent 重叠关系。两者均采用 AIPerf 可读取的 WEKA trace 格式。',
    ],
    replayTitle: '从 trace 到回放图',
    replayParagraphs: [
      'AIPerf 将每条 trace 转换为有向无环图（DAG）。主 agent 请求形成线性链；subagent 请求形成独立链，在符合条件的父请求完成后启动，并在下一个依赖它的主 agent 请求前汇合。一次性辅助请求可以在没有 join edge 的情况下运行。',
      'Trace 记录请求时间戳和可观测的分支 ID，但不记录触发分支的 tool 级事件。回放会保留请求顺序、分支重叠与轮次间延迟，但不会推断服务端内部因果关系。',
    ],
    measurementTitle: 'Concurrency 与结果指标',
    measurementParagraphs: [
      'Concurrency 表示同时运行的 agent 客户端数量，不是固定的 HTTP request batch。一个客户端可能展开为多个 subagent 请求，因此服务器上的瞬时请求数可以高于配置的客户端 concurrency。',
      'AgentX 采用 closed-loop 模式：依赖满足后，客户端才提交下一个可执行请求。更快的系统会在同一小时内推进到采样会话的更后位置，因此实际请求组合可能略有不同，低并发时尤为明显。报告结果时应同时给出吞吐量、首 token 延迟（TTFT）和 interactivity；单一 latency 值无法描述完整运行。',
    ],
    warmupTitle: 'Warmup、计时与确定性',
    warmupParagraphs: [
      '固定 seed 会在每段会话记录时长的 25% 至 75% 区间内均匀选择回放起点。随后使用 max_tokens=1 的 primer 建立当前主 agent 与 subagent 的 prefix，再让每条回放 lane 完成 10 个额外 warmup 请求，最后才开启测量 barrier。',
      '对外指标只统计随后一小时的 profiling 窗口。Seed 会固定会话采样、起点和合成 payload。每次循环使用唯一的 cache-bust 标记，避免无关回放逐步形成共享 prefix。',
    ],
    acceptanceTitle: '合成 payload 与 speculative decoding',
    acceptanceParagraphs: [
      '合成 token 会保留 input 长度和 prefix 结构，但其 draft token 接受情况与自然模型输出不同。因此，AgentX 会针对每组模型、speculative 方法、draft length 与 thinking mode，使用 SPEED-Bench 编码类别测得的 acceptance length。',
      '推理引擎提供强制 acceptance 控制，InferenceX 则把选定值记录在带版本的 golden acceptance-length 文件中。这样可以把推理系统性能与合成 payload 引起的 acceptance 波动分开。AgentX 不评估模型回答质量。',
    ],
    dramTitle: 'DRAM offload 规则',
    dramParagraphs: [
      'KV cache offload 会改变长会话可用的容量。没有标准化 DRAM 配置的服务器上限为 3 TB；GB200 NVL72、GB300 NVL72 和 TPUv7 等标准化系统可使用实际装机容量。',
      '每种基准测试配置只能按其 GPU 占比使用对应的 host DRAM，避免较小的 GPU 分区占用整台服务器的内存预算。',
    ],
    limitsTitle: '适用范围与复现',
    limits:
      '回放会保留客户端可见的请求长度、时间关系、分支结构和 KV prefix 复用，但无法复现服务端隐藏转换或原始会话的语义内容。比较不同系统时，应使用公开语料和锁定的场景配置。',
    sourcesTitle: '主要来源',
    sources: [
      { label: 'AgentX v1.0 full 数据集', target: 'dataset-full' },
      { label: 'AgentX v1.0 256k 数据集', target: 'dataset-256k' },
      { label: 'AIPerf WEKA trace 回放指南', target: 'aiperf-weka' },
      { label: 'SPEED-Bench 论文', target: 'speed-bench' },
      { label: 'SGLang 强制 acceptance 控制', target: 'sglang-pr' },
      { label: 'TensorRT-LLM 强制 acceptance 控制', target: 'trtllm-pr' },
      { label: 'vLLM 合成 acceptance 控制', target: 'vllm-pr' },
      { label: 'ATOM 合成 acceptance 控制', target: 'atom-pr' },
      { label: 'InferenceX golden acceptance-length 数值', target: 'golden-al' },
    ],
    figures: {
      corpus: {
        alt: '语料仪表板显示 8,271 个会话、341 万个请求、6132.7 亿 token、99% cache-hit rate 及 token 来源占比。',
        caption:
          '筛选数据集时使用的语料快照。图中的费用按该快照和公开 API 标价估算，并非基准测试输出指标。',
      },
      hashRatio: {
        alt: '按序列长度展示重建 hash token 与服务商 token 数的中位比值，并分别给出整体和各模型结果。',
        caption:
          '393 个会话的 135,282 个请求中，重建 token 数与服务商 token 数之比的中位数为 1.004。阴影表示 p25–p75 区间，不代表每个请求都有固定误差上限。',
      },
      traceRecord: {
        alt: '带注释的 AgentX trace JSON，包含 session ID、64-token hash block、请求时间、input 和 output 数量及一个 subagent group。',
        caption:
          '一条删节后的 WEKA 记录。Block ID 只在单个会话内有效；重复 ID 表示后续请求共享的 prompt prefix。',
      },
      requestDistributions: {
        alt: 'v1.0 数据集中轮次间延迟、input sequence length 与 output sequence length 的对数分布。',
        caption:
          'v1.0 公开语料的请求分布。单请求 input token 中位数为 142,016，output token 中位数为 444。',
      },
      subagentDistributions: {
        alt: 'Subagent wall-clock duration 以及每个会话中 subagent group 数量的分布。',
        caption:
          '175 个包含 subagent 的会话共有 1,697 个 group。Group 时长中位数为 2.27 分钟；这些会话的 group 数中位数为 4。',
      },
      replayLinear: {
        alt: '线性四请求 trace 根据记录时间转换为回放依赖链。',
        caption: '不含 subagent 的会话会转换为线性依赖链，并保留记录中的轮次间延迟。',
      },
      replaySingle: {
        alt: '一个包含双请求 subagent 的主 agent trace 被转换为带 join gate 的依赖图。',
        caption:
          'Subagent 分支在第一个主请求后启动，并在下一个依赖它的主请求前通过 join gate 汇合。',
      },
      replayTwo: {
        alt: '两个并行 subagent 汇合到主 agent，另有一个不会汇合的一次性辅助请求。',
        caption: '并行 subagent 共享 join gate；辅助请求独立运行，不带 join edge。',
      },
      replayMulti: {
        alt: '四个并行 subagent 按两个 join point 分组，并带有辅助请求的回放依赖图。',
        caption: '多个 subagent group 保留各自的 join point，辅助分支仍保持独立。',
      },
      queueDepth: {
        alt: '约一小时内的请求队列深度，分别显示并发 AgentX 回放中的 running、waiting 与 total request。',
        caption:
          '在 50 个客户端的回放中，会话图持续展开和汇合，running 与 waiting HTTP 请求数也随之变化。',
      },
      pareto: {
        alt: 'B200 vLLM MiniMax-M3 在不同客户端 concurrency 下的单 Chip 吞吐量与 p90 interactivity 曲线。',
        caption:
          '每个标记点对应一种客户端 concurrency。提高 concurrency 会增加吞吐量，同时降低每个客户端的 interactivity。',
      },
      warmup: {
        alt: '四条回放轨迹，显示固定 seed 的 25–75% warmup 起点，以及主 agent 和 subagent 活跃流的 primer 请求。',
        caption:
          '固定 seed 在阴影所示的 25–75% 区间选择 t*；primer 会在 profiling 前建立活跃 prefix 状态。',
      },
      warmupCache: {
        alt: '约一分钟内，warmup prompt token 来源从 cache miss 转向 HBM cache hit。',
        caption:
          'Warmup 初期以 cache miss 为主，随后建立 prefix 状态，使大部分 prompt token 命中 HBM。',
      },
      profilingCache: {
        alt: '一小时 profiling 中，初始几秒后 prompt token 来源以 HBM cache hit 为主。',
        caption:
          '测量窗口在 warmup 后开始，整个 profiling 小时内 prompt token 来源主要为 HBM cache hit。',
      },
      acceptanceControls: {
        alt: 'SGLang、TensorRT-LLM、vLLM 与 ATOM 中加入强制 speculative-decoding acceptance 控制的已合并 PR。',
        caption:
          '这些已合并的推理引擎变更提供所需控制，使不同 serving stack 可以采用相同的 acceptance 假设。',
      },
      goldenAl: {
        alt: 'InferenceX DeepSeek-V4-Pro golden acceptance-length YAML，按 speculative-token 数量和 thinking mode 列出数值。',
        caption:
          '带版本的 golden acceptance-length 文件记录每种 draft length 与 thinking mode 所使用的 SPEED-Bench 测量值。',
      },
    },
  },
} as const;

const SOURCE_HREFS = {
  'dataset-full': 'https://huggingface.co/datasets/semianalysisai/cc-traces-weka-062126',
  'dataset-256k': 'https://huggingface.co/datasets/semianalysisai/cc-traces-weka-062126-256k',
  'aiperf-weka': 'https://github.com/ai-dynamo/aiperf/blob/main/docs/tutorials/weka-trace.md',
  'speed-bench': 'https://arxiv.org/abs/2604.09557',
  'sglang-pr': 'https://github.com/sgl-project/sglang/pull/10771',
  'trtllm-pr': 'https://github.com/NVIDIA/TensorRT-LLM/pull/9371',
  'vllm-pr': 'https://github.com/vllm-project/vllm/pull/40662',
  'atom-pr': 'https://github.com/ROCm/ATOM/pull/1850',
  'golden-al':
    'https://github.com/SemiAnalysisAI/InferenceX/blob/main/golden_al_distribution/dsv4_mtp.yaml',
} as const;

type FigureKey = keyof typeof FIGURE_ASSETS;
interface FigureCopy {
  alt: string;
  caption: string;
}

function MethodFigure({ figure, copy }: { figure: FigureKey; copy: FigureCopy }) {
  const asset = FIGURE_ASSETS[figure];
  return (
    <figure
      className="my-7 overflow-hidden rounded-xl border border-border/70 bg-card"
      data-testid={`agentx-methodology-figure-${figure}`}
    >
      <Image
        src={asset.src}
        alt={copy.alt}
        width={asset.width}
        height={asset.height}
        sizes="(max-width: 768px) 100vw, 1152px"
        className="h-auto w-full"
      />
      <figcaption className="border-t border-border/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
        {copy.caption}
      </figcaption>
    </figure>
  );
}

function Paragraphs({ items }: { items: readonly string[] }) {
  return (
    <div className="space-y-4 text-base leading-7 text-muted-foreground">
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-4 scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

export function AgentXMethodologyArticle({ locale }: { locale: Locale }) {
  const t = CONTENT[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <article data-testid="agentx-methodology-article">
      <header className="border-b border-border/70 pb-8">
        <AgentXMethodologyLink
          href={`${prefix}/agentx`}
          analyticsEvent="agentx_methodology_returned"
          analyticsTarget="overview"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {locale === 'zh' ? '← 返回 AgentX' : '← Back to AgentX'}
        </AgentXMethodologyLink>
        <p className="mt-8 font-mono text-xs font-semibold tracking-[0.2em] text-brand uppercase">
          {t.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t.title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{t.lead}</p>
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 lg:grid-cols-4">
          {t.facts.map((fact) => (
            <div key={fact.label} className="bg-card px-4 py-5">
              <dd className="font-mono text-xl font-semibold tabular-nums text-foreground">
                {fact.value}
              </dd>
              <dt className="mt-1 text-sm leading-5 text-muted-foreground">{fact.label}</dt>
            </div>
          ))}
        </dl>
      </header>

      <div className="py-10">
        <section aria-labelledby="collection">
          <SectionHeading id="collection">{t.collectionTitle}</SectionHeading>
          <Paragraphs items={t.collectionParagraphs} />
          <MethodFigure figure="corpus" copy={t.figures.corpus} />
          <MethodFigure figure="hashRatio" copy={t.figures.hashRatio} />
        </section>

        <section aria-labelledby="dataset" className="mt-14">
          <SectionHeading id="dataset">{t.datasetTitle}</SectionHeading>
          <Paragraphs items={t.datasetParagraphs} />
          <MethodFigure figure="traceRecord" copy={t.figures.traceRecord} />
          <MethodFigure figure="requestDistributions" copy={t.figures.requestDistributions} />
          <MethodFigure figure="subagentDistributions" copy={t.figures.subagentDistributions} />
        </section>

        <section aria-labelledby="replay" className="mt-14">
          <SectionHeading id="replay">{t.replayTitle}</SectionHeading>
          <Paragraphs items={t.replayParagraphs} />
          <MethodFigure figure="replayLinear" copy={t.figures.replayLinear} />
          <MethodFigure figure="replaySingle" copy={t.figures.replaySingle} />
          <MethodFigure figure="replayTwo" copy={t.figures.replayTwo} />
          <MethodFigure figure="replayMulti" copy={t.figures.replayMulti} />
        </section>

        <section aria-labelledby="measurement" className="mt-14">
          <SectionHeading id="measurement">{t.measurementTitle}</SectionHeading>
          <Paragraphs items={t.measurementParagraphs} />
          <MethodFigure figure="queueDepth" copy={t.figures.queueDepth} />
          <MethodFigure figure="pareto" copy={t.figures.pareto} />
        </section>

        <section aria-labelledby="warmup" className="mt-14">
          <SectionHeading id="warmup">{t.warmupTitle}</SectionHeading>
          <Paragraphs items={t.warmupParagraphs} />
          <MethodFigure figure="warmup" copy={t.figures.warmup} />
          <div className="grid gap-6 lg:grid-cols-2">
            <MethodFigure figure="warmupCache" copy={t.figures.warmupCache} />
            <MethodFigure figure="profilingCache" copy={t.figures.profilingCache} />
          </div>
        </section>

        <section aria-labelledby="acceptance" className="mt-14">
          <SectionHeading id="acceptance">{t.acceptanceTitle}</SectionHeading>
          <Paragraphs items={t.acceptanceParagraphs} />
          <MethodFigure figure="acceptanceControls" copy={t.figures.acceptanceControls} />
          <div className="mx-auto max-w-xl">
            <MethodFigure figure="goldenAl" copy={t.figures.goldenAl} />
          </div>
        </section>

        <section aria-labelledby="dram" className="mt-14">
          <SectionHeading id="dram">{t.dramTitle}</SectionHeading>
          <Paragraphs items={t.dramParagraphs} />
        </section>

        <section aria-labelledby="scope" className="mt-14 border-t border-border/70 pt-10">
          <SectionHeading id="scope">{t.limitsTitle}</SectionHeading>
          <p className="text-base leading-7 text-muted-foreground">{t.limits}</p>
          <h3 className="mt-8 text-base font-semibold text-foreground">{t.sourcesTitle}</h3>
          <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {t.sources.map((source) => (
              <li key={source.target}>
                <AgentXMethodologyLink
                  href={SOURCE_HREFS[source.target]}
                  analyticsEvent="agentx_methodology_source_opened"
                  analyticsTarget={source.target}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm leading-6 text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  {source.label} ↗
                </AgentXMethodologyLink>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}
