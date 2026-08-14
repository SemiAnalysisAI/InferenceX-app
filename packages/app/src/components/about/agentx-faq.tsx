import Link from 'next/link';

import { Card } from '@/components/ui/card';

type Locale = 'en' | 'zh';

interface Section {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  code?: string;
}

const SOURCE_URL =
  'https://docs.nvidia.com/aiperf/aiperf/benchmark-modes/semi-analysis-agent-x-how-the-benchmark-works-faq';
const UPSTREAM_URL = 'https://github.com/ai-dynamo/aiperf/blob/main/docs/tutorials/agentx-mvp.md';
const REPOSITORY_URL = 'https://github.com/ai-dynamo/aiperf';

const CONTENT: Record<
  Locale,
  {
    title: string;
    intro: string[];
    sections: Section[];
    creditsTitle: string;
    adapted: string;
    authority: string;
    sourceLabel: string;
    upstreamLabel: string;
    repositoryLabel: string;
    thanks: string;
  }
> = {
  en: {
    title: 'AgentX: How the Benchmark Works',
    intro: [
      'AgentX measures inference the way a coding agent actually uses a model: long, multi-turn sessions with shared prefixes, pauses between turns, parallel subagents, and repeated KV-cache reuse. It is a scenario in AIPerf built around public agentic-coding traces and a fixed replay recipe, so results from different serving stacks can be compared on the same workload.',
      "This FAQ explains the benchmark's operating model, the settings that protect comparability, and the deployment details most likely to affect a run.",
    ],
    sections: [
      {
        title: 'What does AgentX measure?',
        paragraphs: [
          'Traditional load tests often send unrelated single-turn prompts at a fixed request rate. AgentX instead keeps a configurable number of complete session trees alive. A root coding conversation may spawn child conversations, wait for them, and resume after they finish. Each turn carries the accumulated message history, creating the long shared prefixes and bursty fan-out seen in real agent systems.',
          'The prompt text is synthesized, but the workload shape comes from recorded sessions: input and output lengths, prefix-sharing relationships, subagent topology, and inter-turn timing. This preserves the parts that matter to schedulers, routers, and prefix caches without replaying private user content.',
        ],
      },
      {
        title: 'Where does the workload come from?',
        paragraphs: [
          'The scenario uses SemiAnalysis public Weka-format agentic-coding trace corpora. For reproducible comparisons, choose a date-pinned corpus rather than the rolling alias. A _256k variant removes individual requests above the 256K-token range and is the better match for servers with a context window around that size.',
          'The short semianalysis_cc_traces_weka name is the legacy corpus without subagents. Use a dated corpus or a with_subagents alias when you want AgentX fan-out behavior.',
        ],
      },
      {
        title: 'What does the scenario lock?',
        paragraphs: [
          'Passing --scenario inferencex-agentx-mvp selects agentic replay and enforces the settings that define a comparable run:',
        ],
        bullets: [
          'Streaming is enabled so time to first token (TTFT) and inter-token latency (ITL) can be measured.',
          'ignore_eos:true makes the server generate the requested output length instead of stopping early.',
          'Recorded per-turn delays remain intact; only globally idle time is capped at 10 seconds.',
          'first_turn_prefix cache busting gives every replayed conversation a unique first-turn marker, preventing artificial cross-session cache hits while retaining reuse inside a session.',
          'A valid run lasts at least 900 seconds; the default is 1,800 seconds.',
          'Warmup primes a deep prefix before profiling begins.',
          'A random seed is always present and recorded in the artifacts.',
        ],
        code: undefined,
      },
      {
        title: 'What is the minimal command?',
        paragraphs: [
          'Replace the URL, model, corpus, and concurrency with values for your deployment. AIPerf fills in the scenario defaults and writes results under ./artifacts/. Pin --random-seed for exact replay sampling and reconstructed-dataset cache reuse. Add --tokenizer when the served model name is not a resolvable Hugging Face tokenizer.',
        ],
        code: `aiperf profile \\
  --scenario inferencex-agentx-mvp \\
  --url http://localhost:8000 \\
  --model YOUR_MODEL \\
  --endpoint-type chat \\
  --public-dataset semianalysis_cc_traces_weka_062126 \\
  --concurrency 256`,
      },
      {
        title: 'Why does AgentX use streaming chat completions?',
        paragraphs: [
          'The recorded workload is represented as multi-turn message arrays, which map naturally to an OpenAI-compatible chat-completions endpoint. Streaming exposes first-token and token-to-token timing; a non-streaming response cannot provide those core latency measurements.',
          "--use-server-token-count changes only metric accounting. It trusts the server's usage fields when local tokenization differs because of a tokenizer revision or invisible chat-template overhead. It does not change prompt construction.",
        ],
      },
      {
        title: 'What does concurrency mean?',
        paragraphs: [
          'Concurrency is the number of live session trees, not the number of in-flight HTTP requests. A session can fan out into several child conversations, so instantaneous request concurrency may exceed the configured value.',
          'There is intentionally no request-rate control in this scenario. Offered load is produced by the number of active sessions together with their recorded think times and fan-out patterns. This makes --concurrency the primary load dial.',
        ],
      },
      {
        title: 'Why can the first run take so long?',
        paragraphs: [
          'Before traffic starts, AIPerf downloads the corpus and reconstructs it into tokenized, cache-aware conversation trees. The result is stored in a memory-mapped disk cache. With the same corpus, tokenizer, reconstruction settings, entry count, and random seed, later runs can restore that prepared dataset in seconds.',
          'For a cold run, raise both configuration timeouts together. The visible run then proceeds through dataset configuration, warmup, timed profiling, and drain/export. Benchmark duration covers only profiling, so total wall time is longer.',
        ],
        code: `export AIPERF_DATASET_CONFIGURATION_TIMEOUT=1800
export AIPERF_SERVICE_PROFILE_CONFIGURE_TIMEOUT=1800`,
      },
      {
        title: 'Can I run a short smoke test?',
        paragraphs: [
          'A valid run cannot be shorter than 900 seconds. For a cheap but valid check, use low concurrency and keep the 900-second minimum. --num-dataset-entries reduces reconstruction work, but changes the workload and should not be used for a result you plan to compare or submit.',
          'For a minutes-long connectivity test, use --unsafe-override with a short duration and accept the invalid stamp. Keeping the full corpus and pinning the random seed lets the subsequent valid run reuse the reconstructed dataset cache.',
        ],
      },
      {
        title: 'How do I know the load generator is not the bottleneck?',
        paragraphs: [
          'AIPerf distributes work across worker processes and reports worker health every two seconds. Treat the high-CPU warning as a saturation signal: add client cores or another load-generator host before trusting the result.',
          "For deeper diagnosis, --show-trace-timing separates time waiting for a free pooled client connection from time waiting on the server's first byte. Healthy worker CPU and little connection-pool blocking are strong evidence that the measured limit is server-side.",
        ],
      },
      {
        title: 'Why do connection resets appear partway through a run?',
        paragraphs: [
          'Client and server keep-alive settings may disagree. If AIPerf retains an idle pooled connection longer than the server keeps it open, the client may reuse a closed socket. Set the client keep-alive below the server value. This often appears during paced profiling rather than warmup because warmup connections do not remain idle as long.',
        ],
        code: 'export AIPERF_HTTP_KEEPALIVE_TIMEOUT=4',
      },
      {
        title: 'How should multi-replica routing work?',
        paragraphs: [
          "Conversation-aware routing is essential when a router fronts several replicas. If turns from one conversation land on different workers, prefix-cache reuse collapses and the benchmark measures routing scatter rather than the serving stack's cache capability.",
          'AIPerf assigns a stable correlation ID to each conversation; subagents receive their own stable IDs. These controls are not scenario-locked because they change request placement rather than request content.',
        ],
        bullets: [
          'Prefix-aware routing matches message history against cached prefixes. SGLang Model Gateway provides cache_aware; Dynamo provides KV-aware routing with --router-mode kv.',
          "Sticky routing maps the AIPerf correlation ID to a router session header. AIPerf supports SGLang's X-SMG-Routing-Key, Dynamo session headers, and a generic X-Session-ID integration.",
        ],
      },
      {
        title: 'Which metrics should I inspect?',
        paragraphs: [
          'AgentX reports TTFT, ITL, end-to-end latency, output throughput, and error rates alongside prefix-cache behavior, context overflow, session and subagent execution, worker saturation, and scenario compliance.',
          'Always check submission_valid before comparing runs. Excessive context overflow, cancellation, unsafe overrides, or other scenario violations can invalidate an otherwise complete artifact.',
        ],
      },
      {
        title: 'Practical rules of thumb',
        bullets: [
          "Match the corpus to the server's context window; prefer the _256k corpus for a roughly 256K server.",
          'Use date-pinned corpora and a pinned random seed for comparisons.',
          'Keep cache busting enabled. Disabling it inflates cache-hit results when traces recycle.',
          'Preserve recorded timing. Compressing individual trace delays changes cache-TTL behavior and session overlap.',
          'Monitor client CPU and connection-pool wait time before calling a result server-bound.',
          'Use conversation-aware routing for every multi-replica deployment.',
          'Do not interpret synthesized prompt prose; the benchmark preserves token and cache structure, not semantic content.',
        ],
      },
    ],
    creditsTitle: 'Credits and further reading',
    adapted:
      'Adapted from the AIPerf AgentX documentation. The upstream source is maintained by NVIDIA and licensed under Apache-2.0.',
    authority:
      "AgentX is a SemiAnalysis InferenceX benchmark implemented with AIPerf. AIPerf's documentation and implementation are the authoritative references for the current CLI, scenario locks, environment variables, and artifact schema.",
    sourceLabel: 'SemiAnalysis AgentX: How the Benchmark Works (FAQ) — Nvidia AIPerf documentation',
    upstreamLabel: 'AgentX MVP tutorial source — ai-dynamo/aiperf',
    repositoryLabel: 'Nvidia AIPerf repository',
    thanks:
      'Thanks to the AIPerf team for implementing and documenting the scenario, and to Callan Fox and Weka for the underlying agentic-coding trace work.',
  },
  zh: {
    title: 'AgentX：基准测试如何工作',
    intro: [
      'AgentX 按照编码智能体实际使用模型的方式衡量推理性能：长程多轮会话、共享前缀、轮次间停顿、并行子智能体以及持续的 KV cache 复用。它是 AIPerf 中的一套场景，基于公开的智能体编码轨迹与固定回放规则，使不同服务栈的结果能够在同一工作负载下进行比较。',
      '这份 FAQ 介绍基准测试的运行机制、保障可比性的配置，以及最容易影响测试结果的部署细节。',
    ],
    sections: [
      {
        title: 'AgentX 衡量什么？',
        paragraphs: [
          '传统负载测试通常以固定请求速率发送互不相关的单轮 prompt。AgentX 则维持指定数量的完整会话树。根编码会话可以创建子会话、等待子会话结束，再继续执行。每一轮都会携带累计的消息历史，从而重现真实智能体系统中的长共享前缀与突发式 fan-out。',
          'Prompt 文本是合成的，但工作负载形态来自真实会话记录：输入与输出长度、前缀共享关系、子智能体拓扑以及轮次间时间间隔。这样既不会回放用户的私密内容，又保留了对调度器、路由器和 prefix cache 真正重要的特征。',
        ],
      },
      {
        title: '工作负载来自哪里？',
        paragraphs: [
          '该场景使用 SemiAnalysis 公开的 Weka 格式智能体编码轨迹语料。需要进行可复现比较时，应选择带日期的固定语料，而不是滚动更新的别名。_256k 变体会移除超过 256K token 范围的单个请求，更适合上下文窗口约为 256K 的服务器。',
          '简短名称 semianalysis_cc_traces_weka 指向不含子智能体的旧版语料。若要测试 AgentX 的 fan-out 行为，请使用带日期的语料或 with_subagents 别名。',
        ],
      },
      {
        title: '场景锁定了哪些配置？',
        paragraphs: [
          '传入 --scenario inferencex-agentx-mvp 会选择智能体回放模式，并强制执行决定结果可比性的配置：',
        ],
        bullets: [
          '开启 streaming，以便测量首 token 延迟（TTFT）和 token 间延迟（ITL）。',
          'ignore_eos:true 要求服务器生成指定长度的输出，而不是提前停止。',
          '保留原始轮次间延迟；仅将整个系统的全局空闲时间限制在 10 秒以内。',
          'first_turn_prefix cache busting 为每次回放的会话加入唯一首轮标记，避免虚假的跨会话 cache hit，同时保留会话内部的 cache 复用。',
          '有效测试至少运行 900 秒，默认运行 1,800 秒。',
          '正式测量前通过 warmup 预热深层前缀。',
          '每次运行都有随机种子，并记录在产物中。',
        ],
      },
      {
        title: '最简运行命令是什么？',
        paragraphs: [
          '请根据部署替换 URL、模型、语料和 concurrency。AIPerf 会补齐场景默认值，并将结果写入 ./artifacts/。固定 --random-seed 可精确复现采样并复用重建后的数据集 cache；当模型名称无法解析为 Hugging Face tokenizer 时，请额外传入 --tokenizer。',
        ],
        code: `aiperf profile \\
  --scenario inferencex-agentx-mvp \\
  --url http://localhost:8000 \\
  --model YOUR_MODEL \\
  --endpoint-type chat \\
  --public-dataset semianalysis_cc_traces_weka_062126 \\
  --concurrency 256`,
      },
      {
        title: '为什么 AgentX 使用 streaming chat completions？',
        paragraphs: [
          '记录的工作负载由多轮消息数组表示，与 OpenAI 兼容的 chat-completions endpoint 自然匹配。Streaming 可以观测首 token 和 token 间时序；非 streaming 响应无法提供这些核心延迟指标。',
          '--use-server-token-count 只改变指标统计方式。当本地 tokenizer 因版本差异或客户端不可见的 chat template 开销而与服务器不一致时，该 flag 会采用服务器返回的 usage 字段，不会改变 prompt 构造。',
        ],
      },
      {
        title: 'Concurrency 表示什么？',
        paragraphs: [
          'Concurrency 表示同时存活的会话树数量，而不是正在进行的 HTTP 请求数。一个会话可能 fan-out 为多个子会话，因此瞬时请求并发数可以高于配置值。',
          '该场景有意不提供请求速率控制。负载由活跃会话数量、记录的思考时间以及 fan-out 模式共同产生，因此 --concurrency 是主要负载调节项。',
        ],
      },
      {
        title: '为什么第一次运行可能很久？',
        paragraphs: [
          '发送流量前，AIPerf 会下载语料，并将其重建为完成 token 化且带有 cache 结构的会话树。结果会存入 memory-mapped 磁盘 cache。只要语料、tokenizer、重建配置、条目数量和随机种子相同，后续测试通常可以在数秒内恢复准备好的数据集。',
          '冷启动时应同时提高两个配置超时。随后依次执行数据集配置、warmup、定时 profiling 和 drain/export。Benchmark duration 仅覆盖 profiling，因此总耗时会更长。',
        ],
        code: `export AIPERF_DATASET_CONFIGURATION_TIMEOUT=1800
export AIPERF_SERVICE_PROFILE_CONFIGURE_TIMEOUT=1800`,
      },
      {
        title: '可以先跑一个短 smoke test 吗？',
        paragraphs: [
          '有效测试不能短于 900 秒。低成本有效检查可以降低 concurrency，但仍需保留 900 秒下限。--num-dataset-entries 能减少重建工作量，但会改变工作负载，不应将这种结果用于正式比较或提交。',
          '如需在几分钟内检查连通性，可配合短 duration 使用 --unsafe-override，并接受 invalid 标记。保留完整语料并固定随机种子，可让后续有效测试复用重建后的数据集 cache。',
        ],
      },
      {
        title: '如何确认负载生成器不是瓶颈？',
        paragraphs: [
          'AIPerf 会将工作分配到多个 worker process，并每两秒上报健康状态。应将高 CPU 警告视为客户端饱和信号；在信任结果前，需要增加客户端 CPU core 或负载生成器主机。',
          '--show-trace-timing 可以区分等待连接池中空闲连接的时间与等待服务器返回首字节的时间。Worker CPU 正常且连接池阻塞很少，才有充分依据认为瓶颈位于服务器端。',
        ],
      },
      {
        title: '为什么运行中途会出现 connection reset？',
        paragraphs: [
          '客户端与服务器的 keep-alive 配置可能不一致。如果 AIPerf 保留空闲连接的时间比服务器更长，客户端可能复用已经关闭的 socket。应将客户端 keep-alive 设置为低于服务器值。该问题通常出现在 profiling 阶段，因为 warmup 连接的空闲时间较短。',
        ],
        code: 'export AIPERF_HTTP_KEEPALIVE_TIMEOUT=4',
      },
      {
        title: '多 replica 应如何路由？',
        paragraphs: [
          '当路由器连接多个 replica 时，必须使用会话感知路由。如果同一会话的各轮落在不同 worker 上，prefix cache 复用会大幅下降，基准测试最终衡量的是路由分散程度，而不是服务栈的 cache 能力。',
          'AIPerf 会为每个会话分配稳定的 correlation ID；子智能体则拥有各自的稳定 ID。这些配置改变请求落点而非请求内容，因此不会被场景锁定。',
        ],
        bullets: [
          '前缀感知路由根据消息历史匹配已缓存的前缀。SGLang Model Gateway 提供 cache_aware，Dynamo 通过 --router-mode kv 提供 KV-aware routing。',
          'Sticky routing 将 AIPerf correlation ID 映射到路由器 session header，可对接 SGLang 的 X-SMG-Routing-Key、Dynamo session header 和通用 X-Session-ID。',
        ],
      },
      {
        title: '应重点查看哪些指标？',
        paragraphs: [
          'AgentX 会报告 TTFT、ITL、端到端延迟、输出吞吐量和错误率，同时提供 prefix cache 行为、上下文溢出、会话与子智能体执行、worker 饱和状态以及场景合规性。',
          '比较测试前必须检查 submission_valid。上下文溢出率过高、测试被取消、使用 unsafe override 或其他场景违规，都可能使一个已经生成完整产物的测试失效。',
        ],
      },
      {
        title: '实用原则',
        bullets: [
          '让语料与服务器上下文窗口匹配；约 256K 的服务器优先使用 _256k 语料。',
          '正式比较使用带日期的固定语料和固定随机种子。',
          '保持 cache busting 开启；关闭后，循环使用轨迹会夸大 cache-hit 结果。',
          '保留记录的时序；压缩单条轨迹的延迟会改变 cache TTL 行为和会话重叠程度。',
          '在判断结果受服务器限制前，先监控客户端 CPU 和连接池等待时间。',
          '所有多 replica 部署都应使用会话感知路由。',
          '不要解读合成 prompt 的语义；基准测试保留的是 token 与 cache 结构，而非文本含义。',
        ],
      },
    ],
    creditsTitle: '致谢与延伸阅读',
    adapted: '本文改编自 AIPerf AgentX 文档。上游源文件由 NVIDIA 维护，并采用 Apache-2.0 许可证。',
    authority:
      'AgentX 是使用 AIPerf 实现的 SemiAnalysis InferenceX 基准测试。关于当前 CLI、场景锁定规则、环境变量和产物 schema，请以 AIPerf 的文档与实现为准。',
    sourceLabel: 'SemiAnalysis AgentX：基准测试如何工作（FAQ）— Nvidia AIPerf 文档',
    upstreamLabel: 'AgentX MVP 教程源文件 — ai-dynamo/aiperf',
    repositoryLabel: 'Nvidia AIPerf repository',
    thanks:
      '感谢 AIPerf 团队实现并记录这一场景，也感谢 Callan Fox 与 Weka 为底层智能体编码轨迹所做的工作。',
  },
};

export function AgentXFaq({ locale }: { locale: Locale }) {
  const content = CONTENT[locale];

  return (
    <section id="agentx" className="scroll-mt-24">
      <Card>
        <h2 className="text-lg font-semibold mb-2">{content.title}</h2>
        {content.intro.map((paragraph) => (
          <p key={paragraph} className="text-muted-foreground mb-3">
            {paragraph}
          </p>
        ))}

        <div className="mt-6 space-y-6">
          {content.sections.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold mb-2">{section.title}</h3>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="text-sm text-muted-foreground mb-2 last:mb-0">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-2 ml-5 list-disc space-y-1 text-sm text-muted-foreground">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
              {section.code && (
                <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/40 p-4 text-xs">
                  <code>{section.code}</code>
                </pre>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <h3 className="font-semibold mb-2">{content.creditsTitle}</h3>
          <p className="text-sm italic text-muted-foreground mb-2">{content.adapted}</p>
          <p className="text-sm text-muted-foreground mb-3">{content.authority}</p>
          <ul className="ml-5 list-disc space-y-1 text-sm">
            <li>
              <Link
                className="text-brand hover:underline"
                href={SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {content.sourceLabel}
              </Link>
            </li>
            <li>
              <Link
                className="text-brand hover:underline"
                href={UPSTREAM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {content.upstreamLabel}
              </Link>
            </li>
            <li>
              <Link
                className="text-brand hover:underline"
                href={REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {content.repositoryLabel}
              </Link>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground mt-3">{content.thanks}</p>
        </div>
      </Card>
    </section>
  );
}
