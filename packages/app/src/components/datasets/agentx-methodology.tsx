import { Card } from '@/components/ui/card';

type Locale = 'en' | 'zh';

const CONTENT = {
  en: {
    eyebrow: 'AgentX v1.0 methodology',
    title: 'Agentic Benchmark Datasets',
    intro:
      'AgentX replays the workload shape of real Claude Code sessions, not their private text. Each benchmark request is reconstructed from anonymized trace metadata so the serving system sees the original context growth, prefix reuse, subagent branching, and request timing as closely as client-visible data allows.',
    processTitle: 'How an AgentX run is built',
    steps: [
      {
        title: 'Capture',
        description:
          'An opt-in HTTP proxy records request and response timing, token counts, conversation IDs, and subagent IDs as sessions run.',
      },
      {
        title: 'Anonymize',
        description:
          'Original prompts, source code, tool arguments, and tool results are removed. Inputs become session-scoped chained hashes in 64-token blocks, preserving matching prefixes without revealing content.',
      },
      {
        title: 'Reconstruct',
        description:
          'AIPerf fills those blocks with deterministic synthetic coding and tool-use tokens, then rebuilds each session as a directed acyclic graph (DAG) of main-agent turns, parallel subagents, auxiliary requests, and inter-turn tool time.',
      },
      {
        title: 'Replay and measure',
        description:
          'A seeded warmup establishes cache state before each configuration is profiled for one hour across a sweep of concurrent clients. Per-replay cache-bust markers stop unrelated sessions from sharing prefixes.',
      },
    ],
    datasetTitle: 'What is in the v1.0 dataset',
    datasetIntro:
      'AgentX v1.0 uses 393 Claude Code sessions selected from an internal, opt-in trace corpus. Eligible sessions contain at least 20 requests, use Claude Code 2.1.139 or newer, and have no more than 10 concurrent subagents. Processing removes duplicate requests, client-specific security-monitor and title-generation calls, and reconstructed inputs above 990k tokens.',
    profileLabel: 'v1.0 trace profile',
    stats: [
      { value: '393', label: 'sessions' },
      { value: '142k', label: 'median input tokens / request' },
      { value: '444', label: 'median output tokens / request' },
      { value: '44%', label: 'sessions with subagents' },
    ],
    controlsTitle: 'Controls that keep comparisons meaningful',
    controls: [
      {
        title: 'Steady-state start',
        description:
          'A fixed seed selects a point 25–75% through each conversation. Primer requests and 10 additional warmup requests per replay lane materialize KV cache before profiling begins.',
      },
      {
        title: 'Deterministic replay',
        description:
          'The seed fixes conversation sampling, starting points, and synthetic content. Reported metrics cover only the one-hour profiling window, not warmup.',
      },
      {
        title: 'Speculative decoding',
        description:
          'Because synthetic tokens can distort draft-token acceptance, AgentX forces an acceptance length measured with SPEED-Bench for each model, speculator, draft length, and thinking-mode combination.',
      },
      {
        title: 'DRAM offload',
        description:
          'Servers without standardized DRAM are capped at 3 TB. Standard GB200 NVL72, GB300 NVL72, and TPUv7 systems use installed capacity, and every configuration may access only the share proportional to its GPU allocation.',
      },
    ],
    readingTitle: 'How to read AgentX results',
    reading:
      'Concurrency means concurrent agent clients, not a fixed request batch. Because AgentX is closed loop, faster configurations complete more requests and can encounter a slightly different workload mix; this variation is most visible at low concurrency. Read throughput together with time to first token (TTFT) and interactivity rather than treating any one latency statistic as the complete result.',
    qualityNote:
      'Synthetic content preserves workload behavior; AgentX measures serving-system performance, not model answer quality.',
    limitsTitle: 'Reconstruction boundaries',
    limits:
      'The client cannot observe provider-side chat templates, proprietary tokenizers, server tools, encrypted reasoning content, or the exact token expansion of images and documents. AgentX uses deterministic placeholders and model-specific padding to approximate those hidden inputs. The benchmark is designed to preserve request lengths, timing, conversation topology, and KV-reuse patterns—not to reproduce private conversations verbatim.',
    variantsTitle: 'Dataset variants',
    variants: [
      {
        title: 'full',
        description: 'The complete AgentX v1.0 replay set, including contexts up to 1M tokens.',
      },
      {
        title: '256k',
        description:
          'A context-limited variant for models and inference engines configured with a maximum context of 256k tokens.',
      },
    ],
  },
  zh: {
    eyebrow: 'AgentX v1.0 方法论',
    title: 'Agentic 基准测试数据集',
    intro:
      'AgentX 回放的是真实 Claude Code 会话的工作负载形态，而非其中的私有原文。每个基准测试请求都根据匿名化 trace 元数据重建，使推理系统在客户端可观测信息范围内，尽可能复现原始上下文增长、prefix 复用、subagent 分支和请求节奏。',
    processTitle: 'AgentX 如何构建一次回放',
    steps: [
      {
        title: '采集',
        description:
          '参与者主动启用 HTTP 代理后，代理会在会话运行期间记录请求与响应时间、token 数、conversation ID 和 subagent ID。',
      },
      {
        title: '匿名化',
        description:
          '原始 prompt、源代码、tool argument 和 tool result 均会移除。Input 按 64-token block 转换为会话内串联 hash，在不暴露内容的前提下保留相同 prefix。',
      },
      {
        title: '重建',
        description:
          'AIPerf 使用确定性的合成编码与 tool-use token 填充这些 block，再把每个会话重建为有向无环图（DAG），涵盖主 agent 轮次、并行 subagent、辅助请求以及轮次间的 tool 执行时间。',
      },
      {
        title: '回放与测量',
        description:
          '每种配置先通过固定 seed 的 warmup 建立 cache 状态，随后在不同并发客户端数量下进行一小时 profiling。每次回放使用独立的 cache-bust 标记，防止无关会话意外共享 prefix。',
      },
    ],
    datasetTitle: 'v1.0 数据集包含什么',
    datasetIntro:
      'AgentX v1.0 从内部自愿参与的 trace 语料中筛选出 393 个 Claude Code 会话。入选会话至少包含 20 个请求，Claude Code 版本不低于 2.1.139，并且同时运行的 subagent 不超过 10 个。后处理还会移除重复请求、Claude Code 特有的安全监控与标题生成请求，以及重建后 input 超过 990k token 的请求。',
    profileLabel: 'v1.0 trace 概况',
    stats: [
      { value: '393', label: '个会话' },
      { value: '142k', label: '单请求 input token 中位数' },
      { value: '444', label: '单请求 output token 中位数' },
      { value: '44%', label: '包含 subagent 的会话' },
    ],
    controlsTitle: '保证结果可比性的控制措施',
    controls: [
      {
        title: '从稳态开始',
        description:
          '固定 seed 会在每段会话 25%–75% 的位置选择起点。Primer 请求和每条回放 lane 额外 10 个 warmup 请求会在 profiling 前建立 KV cache。',
      },
      {
        title: '确定性回放',
        description:
          'Seed 固定会话采样、起点和合成内容。对外报告的指标只覆盖一小时 profiling 窗口，不包含 warmup。',
      },
      {
        title: 'Speculative decoding',
        description:
          '合成 token 可能扭曲 draft token 的接受情况，因此 AgentX 会针对每组 model、speculator、draft length 和 thinking mode，使用 SPEED-Bench 测得并固定 acceptance length。',
      },
      {
        title: 'DRAM offload',
        description:
          '没有标准化 DRAM 配置的服务器上限为 3 TB；GB200 NVL72、GB300 NVL72 和 TPUv7 等标准化系统使用装机容量。每种配置只能按其 GPU 占比使用对应的 DRAM。',
      },
    ],
    readingTitle: '如何解读 AgentX 结果',
    reading:
      '这里的 concurrency 表示同时运行的 agent 客户端数量，而不是固定 request batch。AgentX 是 closed-loop 基准测试：更快的配置会完成更多请求，因此遇到的工作负载组合可能略有不同，低并发时这种波动更明显。解读结果时应同时考虑吞吐量、首 token 延迟（TTFT）和 interactivity，不能用单一 latency 指标概括整体表现。',
    qualityNote: '合成内容用于保留工作负载行为；AgentX 衡量的是推理系统性能，而不是模型回答质量。',
    limitsTitle: '重建范围与限制',
    limits:
      '客户端无法观测服务端 chat template、专有 tokenizer、服务端 tool、加密的 reasoning 内容，也无法精确得知图片和文档最终展开成多少 token。AgentX 使用确定性 placeholder 和针对不同模型校准的 padding 来近似这些隐藏输入。基准测试的目标是保留请求长度、时间关系、对话拓扑和 KV 复用模式，而不是逐字还原私有会话。',
    variantsTitle: '数据集变体',
    variants: [
      {
        title: 'full',
        description: '完整的 AgentX v1.0 回放集，包含最高 1M token 的上下文。',
      },
      {
        title: '256k',
        description: '面向最大上下文配置为 256k token 的模型与推理引擎的限制版。',
      },
    ],
  },
} as const;

export function AgentXMethodology({ locale }: { locale: Locale }) {
  const t = CONTENT[locale];

  return (
    <Card className="overflow-hidden p-0" data-testid="agentx-methodology">
      <header className="border-b border-border/60 bg-muted/20 px-5 py-5 sm:px-6">
        <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
          {t.eyebrow}
        </p>
        <h1 className="text-xl font-semibold text-foreground">{t.title}</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{t.intro}</p>
      </header>

      <div className="space-y-8 px-5 py-6 sm:px-6">
        <section aria-labelledby="agentx-process-title">
          <h2 id="agentx-process-title" className="mb-3 text-base font-semibold text-foreground">
            {t.processTitle}
          </h2>
          <ol className="grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 sm:grid-cols-2">
            {t.steps.map((step, index) => (
              <li key={step.title} className="bg-card p-4" data-testid="agentx-methodology-step">
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-primary">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="agentx-dataset-title">
          <h2 id="agentx-dataset-title" className="mb-2 text-base font-semibold text-foreground">
            {t.datasetTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{t.datasetIntro}</p>
          <div className="mt-4 border-y border-border/70 py-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t.profileLabel}
            </p>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
              {t.stats.map((stat) => (
                <div key={stat.label}>
                  <dd className="font-mono text-lg font-semibold tabular-nums text-foreground">
                    {stat.value}
                  </dd>
                  <dt className="mt-0.5 text-xs leading-5 text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="agentx-controls-title">
          <h2 id="agentx-controls-title" className="mb-3 text-base font-semibold text-foreground">
            {t.controlsTitle}
          </h2>
          <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {t.controls.map((control) => (
              <div key={control.title} className="border-l border-border pl-3">
                <dt className="text-sm font-semibold text-foreground">{control.title}</dt>
                <dd className="mt-1 text-sm leading-6 text-muted-foreground">
                  {control.description}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="agentx-reading-title">
          <h2 id="agentx-reading-title" className="mb-2 text-base font-semibold text-foreground">
            {t.readingTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{t.reading}</p>
          <p className="mt-3 border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm font-medium leading-6 text-foreground">
            {t.qualityNote}
          </p>
        </section>

        <section aria-labelledby="agentx-limits-title">
          <h2 id="agentx-limits-title" className="mb-2 text-base font-semibold text-foreground">
            {t.limitsTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{t.limits}</p>
        </section>

        <section aria-labelledby="agentx-variants-title">
          <h2 id="agentx-variants-title" className="mb-2 text-base font-semibold text-foreground">
            {t.variantsTitle}
          </h2>
          <ul className="space-y-1.5 text-sm leading-6 text-muted-foreground">
            {t.variants.map((variant) => (
              <li key={variant.title}>
                <strong className="font-semibold text-foreground">{variant.title}</strong> —{' '}
                {variant.description}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Card>
  );
}
