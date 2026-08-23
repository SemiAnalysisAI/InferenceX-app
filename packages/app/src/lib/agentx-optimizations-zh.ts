/**
 * Simplified Chinese port of `agentx-optimizations.ts`.
 *
 * Translations are keyed by framework slug and section id, and carry only the
 * prose: PR references, figure assets, and link targets come from the English
 * registry, so a PR list can never drift between the two languages.
 * `agentx-optimizations.test.ts` fails if a section, highlight, paragraph, or
 * link here does not line up with its English counterpart.
 */

import {
  AGENTX_OPTIMIZATION_FRAMEWORKS,
  OPTIMIZATIONS_OVERVIEW,
  type OptimizationFigureCopy,
  type OptimizationFramework,
  type OptimizationLayer,
  type OptimizationSection,
  type OptimizationsOverview,
} from './agentx-optimizations';
import type { Locale } from './i18n';

interface SectionTranslation {
  heading: string;
  paragraphs: readonly string[];
  figure?: OptimizationFigureCopy;
  /** Link labels, in the same order as the English section's `links`. */
  links?: readonly string[];
}

interface FrameworkTranslation {
  summary: string;
  lead: string;
  /** Highlight labels, in order. The values stay in English (units, numbers). */
  highlights: readonly string[];
  sections: Readonly<Record<string, SectionTranslation>>;
}

const OVERVIEW_ZH = {
  eyebrow: 'AgentX 的行业影响',
  title: '面向智能体负载的优化',
  lead: 'AgentX 推出后的最初几个月，最有价值的成果并非开源数据集，而是 AgentX 合作伙伴提交的 50 多个上游 PR。这些改动以 AgentX 为北极星，面向真实智能体负载进行优化。',
  intro: [
    'AgentX 回放的是真实智能体流量，因此它衡量的远不止 prefill 与 decode 内核本身，而是端到端的完整链路：KV cache 生命周期、混合注意力（hybrid attention）cache 正确性、CPU KV offload、传输进度、路由亲和性、增量 tokenization、请求序列化以及调度器记账。这些开销每一项都是生产环境智能体部署已经在付的成本，而单轮 8k/1k 场景一项也测不出来。',
    'SemiAnalysis 与 AMD 软件团队多年协作、推动其软件开发方式现代化，下面的许多工作正是这一协作的成果，它们让 AMD 开源栈在智能体负载上更接近一流水平。',
  ],
  highlights: ['上游 PR', '上游项目', '涉及的栈层级', '作为北极星的 trace'],
  frameworksTitle: '按项目查看优化',
  frameworksIntro:
    '下面每个页面汇总一个项目中由 AgentX 驱动的工作，并按其所处的栈层级归类。文中标注为 open 的改动只是已提出、尚未合入，不代表上游当前行为。',
  sections: {
    ecosystem: {
      heading: '分布式推理生态简介',
      paragraphs: [
        '智能体推理是系统级问题，而不是单纯的芯片或内核问题。当分布式系统需要处理数十万个智能体请求时，请求调度与 KV cache 管理就不再只是记账工作，而会实实在在地影响性能。例如 subagent 会产生突发式的 KV cache 访问模式，若不加优化，就会把主 agent 的 cache 挤掉。',
        '在栈的最上层，router（有时也称 frontend）把请求分发给各个 worker。当服务端启用数据并行注意力（data-parallel attention）时，每个 DP rank 都有独立的 KV cache，因此请求会按 consistent hashing 等策略路由：同一会话或同一 subagent 的请求按其唯一 ID 落到同一个 rank，而不是把所有 cache 都搅乱。',
        '大多数路由策略在不同实现之间差别不大。有些 router 是独立组件，例如 vLLM router 和 llm-d router；有些则集成在引擎内部，例如 SGLang model gateway 和 ATOM Mesh。',
        '完成路由后，请求进入 vLLM、SGLang 等推理引擎的调度器。引擎负责执行推理并通过 API 返回结果，同时提供接口把引擎内部的 KV cache 接到外部 KV cache 管理器上——这正是该生态可插拔的原因：一个 cache 管理器可以对接多种引擎。',
        '当前 AgentX 结果所用的简单部署方式，是让 Mooncake 与 vLLM 运行在同一节点上。每个 vLLM worker 内嵌一个 Mooncake Store 客户端，并贡献一部分主机 DRAM 给外部 KV cache 池。vLLM 通过 MooncakeStoreConnector 接口访问这个池：把可复用的 KV block 载入 GPU 显存，并把新计算出的 block 写回主机内存。Mooncake Store 负责放置与淘汰策略，Mooncake Transfer Engine 负责在 GPU 与 CPU 内存之间实际搬运数据。',
        '不同的 KV cache 管理器会使用不同的传输引擎，在内存层级之间或机器之间（例如 prefill 与 decode worker 之间）搬运字节。一套部署可以用 Mooncake Store 把可复用的 KV block offload 到主机 DRAM，同时用 NIXL 把请求专属的 KV 直接从 prefill GPU 传给 decode GPU；在支持的环境下 NIXL 会走 UCX 与 GPUDirect RDMA。多条 KV 管理与传输路径可以在同一个推理引擎中共存。',
        '整个生态由许多独立组件构成：推理引擎、router、KV cache 管理器、数据传输库以及集群控制器。NVIDIA Dynamo、llm-d、AMD Infera 等平台把其中若干组合打包成完整发行版，提供彼此兼容的容器镜像、connector、部署清单和编排逻辑。最终交付的通常是一组协同工作的容器，而不是单一的巨型服务。',
      ],
      figure: {
        alt: '分布式推理栈的五层示意图：路由/前端层、推理引擎、KV cache 管理层、数据搬运层，以及加速器与分层存储。',
        caption:
          '分布式推理栈。每一层都有多个可互换的实现，Dynamo、llm-d、AMD Infera 等平台会把其中若干组合打包成一套发行版。',
      },
      links: [
        'Consistent hash 路由策略',
        'vLLM router',
        'llm-d router',
        'SGLang model gateway',
        'ATOM Mesh',
        'Mooncake Transfer Engine',
      ],
    },
    other: {
      heading: '其他优化：day-zero 支持与正确性',
      paragraphs: [
        '各项目页面汇总的工作主要针对长上下文开销：prefix 必须活下来、hybrid cache 必须保持正确、传输必须跟得上。这一节的改动性质不同，它们属于 day-zero 支持与正确性缺陷——它们让一个请求彻底失败的程度，和百万 token 会话遇到的问题一样严重。',
        'MiniMax-M3 检验了这些 ROCm 工作能否累积成 day-zero 就绪能力，Advancing AI 一文直接给出了对比：AMD 首个公开的 disaggregated 配方 MI355X FP4 在 1 月才登陆 InferenceX，比 NVIDIA 晚了数月；而 M3 FP4 disaggregation 在 day zero 就已就位。相比 DeepSeek-R1 时期需要数月才追平，这是明显进步。day-zero 路径上有三个 vLLM 修复，且都属于正确性问题而非性能问题。',
        '首先被卡住的是 disaggregation。NixlConnector 的握手逻辑假设 SPLIT 区域的 block_len 会随 prefill 与 decode 的 TP 比例缩放，但 block_len 实际取决于每个 rank 的 KV head 数量。M3 只有 4 个 KV head，因此 TP4 prefill 搭配 TP8 decode 时，两侧都被 GQA 限制为每 rank 一个 head，两个长度相等，而断言却要求相差两倍。握手因此被拒绝，KV 完全没有传输，decode 只能从零重新生成，gsm8k 得分为 0。改为按真实 head 比例校验后问题解决。',
        '另外两个问题源于平台差异。M3 的稀疏注意力后端在所有 E4M3 配置下都把按字节存储的 FP8 cache 读作 float8_e4m3fn，但 gfx942 的平台 dtype 是 e4m3fnuz；两种编码并不相同，因此 K 和 V 在进入内核前就已被改变，而且 prefill 与 decode 的 wrapper 也漏掉了 FP8 检查中的 FNUZ 类型。改为按平台 dtype 解释 cache 视图后，两处一并修复。此外，M3 的 NVIDIA 与 AMD 模型实现位于不同文件，只有 NVIDIA 版实现了 EAGLE3 接口，导致 ROCm 上的 speculative decoding 在引擎初始化时就以 model-does-not-support 报错退出。把 AMD 版补齐到同等能力后恢复正常，MI355X 的 gsm8k 与未启用 EAGLE3 的 MI355X 运行以及 B200 结果一致。',
        'TensorRT-LLM 页面覆盖了 M3 中与长上下文直接相关的工作：disaggregated KV 传输中的 descriptor 爆炸、context graph 捕获、稀疏 block stride、autotuner 候选集，以及必须从候选池中移除的错误 split-K MoE tactic。',
      ],
      links: ['Can AMD break the CUDA moat? — Advancing AI'],
    },
    'what-activates-this': {
      heading: 'AgentX 测试矩阵激活了什么',
      paragraphs: [
        '本地 AgentX 矩阵同时包含会话感知或 KV 感知路由、长度多变的长对话历史、MTP、hybrid attention、聚合式与 disaggregated 部署，以及跨越 HBM 容量悬崖的并发扫描；既有全部驻留 GPU 的对比，也有通过 vLLM SimpleCPU、Mooncake、LMCache 和 SGLang HiCache 进行的 CPU DRAM offload。正是这种组合激活了上面这些上游工作。',
        '旧的固定序列矩阵通常只创建一个 prompt、执行一次 prefill、解码固定长度的续写，然后丢弃请求。因此它无法衡量 cache 跨轮次的存活、重复 tokenization、会话亲和性、cache 事件流量、offload 抖动、调度器停顿期间的传输进度，以及长生命周期的归属记账。',
        '允许的优化策略把 CPU KV offload 视为可选项。厂商可以使用 vLLM connector、LMCache、SGLang HiCache、Mooncake、Dynamo KVBM 或其他 CPU DRAM connector；如果关闭 offload 能得到更好的延迟与吞吐量组合，也可以关闭。NVMe offload 暂缓。CPU DRAM 必须按所用 GPU 比例缩放，其中非标准化 DRAM 系统上限为 3 TB；标准化 DRAM 系统没有硬性上限，但同样遵守比例规则。本地生成器目前对所有 runner 一律套用 3 TB 上限，因此尚未实现标准化 DRAM 的例外条款。',
        '新增的优化面并不只是"更长的注意力"，而是不断增长的会话状态在保存、搬运、路由、重建和反复处理过程中的全部开销。AgentX 把这些成本放大到足以推动 vLLM、SGLang、TensorRT-LLM、ATOM、AITER、Dynamo 和 LMCache 做出通用的上游改动。对 NIXL 与 Mooncake 的直接检索没有发现此处之外带 AgentX 标记的运行时 PR，因此它们的影响仍通过上述引擎 connector 改动体现。',
      ],
      links: ['所有提及 AgentX 的上游 PR'],
    },
  } as Readonly<Record<string, SectionTranslation>>,
  layerLabels: {
    engine: '推理引擎',
    router: 'Router 与编排',
    'kv-cache': 'KV cache 层',
    kernels: '内核',
    transfer: '传输引擎',
  } as Readonly<Record<OptimizationLayer, string>>,
  ui: {
    backToAgentX: '← 返回 AgentX',
    backToOverview: '← 全部 AgentX 优化',
    prsLabel: '上游 PR',
    referencesLabel: '参考链接',
    readMore: '查看优化详情',
    onThisPage: '本页目录',
    allProjects: '其他项目',
    figureCta: '查看原始分辨率图片',
    prSearch: '检索全部 AgentX 相关 PR',
  },
};

const FRAMEWORKS_ZH: Readonly<Record<string, FrameworkTranslation>> = {
  vllm: {
    summary:
      '混合注意力 prefix 保留、面向 hybrid 模型的 CPU KV offload，以及收窄后的 store 与 load 路径。',
    lead: '我们与来自 Inferact、Red Hat、NVIDIA 和 AMD 的 vLLM maintainer 一起，以 AgentX 的真实回放器为北极星开展工作，相关修复均已合入上游，其中大部分可以直接迁移到生产环境。',
    highlights: [
      '1M 上下文下的 prefix cache 命中率',
      'hybrid CPU offload 带来的输出吞吐量提升',
      '平均端到端延迟下降',
    ],
    sections: {
      'hybrid-prefix-caching': {
        heading: '混合注意力 prefix caching',
        paragraphs: [
          'vLLM 改进了 hybrid attention 的 prefix caching，使短生命周期的 sliding-window 分配不再挤掉有价值的长上下文 checkpoint。选择性保留（selective retention）会保住稀疏的回放边界，在 14 个并发请求、上下文最长 100 万 token 的条件下，报告 prefix cache 命中率超过 95%。',
          '同样的可达性策略也应用到了 Mooncake，并移除了不可达的 sliding-window 查找。更早的后续工作还停止 offload 那些永远不会被复用的 sliding-window block，并把 speculative lookahead block 保留在被保住的 prefix 内。',
        ],
        figure: {
          alt: '前后对比示意图：未做保留时每个 sliding-window 尾部都会被释放，整个 prefix 必须重算；采用选择性保留后少量 checkpoint 得以存活，prefix 仍可复用。',
          caption:
            '改动前没有任何 window 尾部存活，因此没有位置可恢复，full-attention KV 虽然驻留但无法使用；采用选择性保留后少量尾部得以保留，prefix cache 命中率超过 95%。',
        },
      },
      'cpu-offload': {
        heading: '面向 hybrid 模型的 CPU KV offload',
        paragraphs: [
          '高并发智能体负载必须依赖 offload，而 AgentX 推动的工作让 CPU KV offload 从只支持统一 full-attention 模型，扩展到可用于 hybrid 模型。这一区别很关键：统一模型每个 token 只有一种 KV 布局，connector 用单一 block 几何形状就能描述要保存什么；hybrid 模型同时携带多个 cache group，形状与生命周期各不相同，而假设单一布局的 connector 无法表达某个 block 属于哪一组。结果就是，最需要 offload 的长会话模型反而用不了 offload。',
          '通用的 SimpleCPU connector 最先落地，随后在 ROCm 上启用，并进一步扩展到 DeepSeek-V4 的 hybrid attention：与 prefix 超出 HBM 后直接重算相比，报告输出吞吐量提高 81.7%、平均端到端延迟降低 46.6%。Mooncake 也获得了等价的 hybrid 内存分配支持。',
        ],
      },
      'store-path': {
        heading: '收窄 store 路径',
        paragraphs: [
          '在真实负载上做 profiling 后发现，offload 一旦能跑通，开销就转移到了 store 路径上——写得太多、也太频繁。三条规则收窄了它。',
          '现在，若已有相同内容的传输在途，就跳过这次 store，于是共享同一 prefix 的并发会话只需付一次代价，而不是各付一次；store 只覆盖新生成的 KV 区间，因此延长历史的会话只写增量，而不是每轮重写整个 prefix；store 也不再取决于相同 block 是否仍在 HBM 中，因此已经排定的工作不会因为底下发生淘汰而被丢弃。',
        ],
        figure: {
          alt: 'vLLM connector 层位于 GPU HBM 与 CPU DRAM 池之间的示意图，标注了相关 connector PR 以及收窄写入的三条 store 侧规则。',
          caption:
            '位于 GPU HBM 与 CPU DRAM 池之间的 connector 层。store 侧规则会跳过在途的重复传输、只写新生成的 KV，并与 block 是否仍在 HBM 解耦；调度器侧的查找则改为异步。',
        },
      },
      'load-path': {
        heading: '把查找移出关键路径',
        paragraphs: [
          'load 路径需要单独调优，因为查找发生在每一次调度决策上，而不只是在真正搬运数据时。把调度器路径中的查找改为异步，可以让 connector 离开单步执行的关键路径，一个 step 不必等待 CPU 侧 cache 查询就能开始接纳新工作。',
          '此后，紧凑的零拷贝查找 key、接收侧并行加载，以及预先构建的 Mooncake key 字符串，进一步消除了残留的 CPU 与传输开销。',
        ],
      },
      correctness: {
        heading: '长生命周期 hybrid 状态下的正确性与记账',
        paragraphs: [
          '长生命周期的 hybrid 状态还带来了一批固定形状请求很少触及的正确性与记账修复。vLLM 现在按 hybrid cache group 分别发出 cache 事件，正确处理分布式 context 下 store 的 stride，并在分布式 context 与 prefill 下正确计算查找 prefix；相关的 context-parallel 记账改动则让 cache 归属与分片后的 token 区间对齐。',
          'Speculative 状态现在会在合并后的 Mooncake group 之间以及 SimpleCPU coordinator 中正确传递，避免多轮复用的 cache 悄悄丢失 EAGLE 状态。',
        ],
      },
      'rocm-decode': {
        heading: 'ROCm：cache 层之下',
        paragraphs: [
          '在 ROCm 侧，近期工作继续深入到 cache 层以下，那里的开销是按层而非按请求计的。当 prefix 能够存活并及时到达之后，剩下的就是 decode 步骤本身；而一次会话中要执行数千次的 decode，会为每一次可以避免的拷贝、每一个不匹配的内核付出代价。三个仍为 open 的改动针对的正是这一层。',
          '一个 Kimi-K3 改动把 KDA decode 结果直接写入该层的输出 buffer，为每个 KDA 层省去一次设备内拷贝；单看收益很小，但它会在每个解码 token 的每一层上重复发生。第二个改动用 AITER 的 sparse-MLA decode 内核替代通用路径，报告 AgentX 输出吞吐量提升 5.22%，token 间延迟大幅下降。',
          '第三个改动很好地说明了"测量形状"有多重要：配套改动把 full-graph 注意力投影切换到调优过的 AITER GEMM，在低并发固定序列上取得 2.3% 的提升。内核级改动可以在统一形状上给出干净的收益，却在智能体 trace 上被 cache 与调度波动淹没。',
        ],
      },
    },
  },
  sglang: {
    summary:
      'Sliding-window 分配、HiCache 混合 offload、以 runtime scalar 传入上下文长度，以及 cache 感知的 DP 路由。',
    lead: '我们与来自 RadixArk、Meta、NVIDIA 和 AMD 的 SGLang maintainer 合作，在 AgentX 计划推动下完成了一批面向智能体负载的优化，这些改动同样显著提升了生产环境的推理服务表现。',
    highlights: [
      '并发 384 下的输出吞吐量提升',
      '同一改动带来的平均 TTFT 下降',
      'staging 修复后正确命中的 needle 数（此前为 2/128）',
    ],
    sections: {
      'sliding-window': {
        heading: 'Sliding-window 分配',
        paragraphs: [
          'SGLang 的 sliding-window 工作处理的冲突与 vLLM 的保留策略相同，只是从分配器一侧入手。window 页与 prefix 页取自同一个池，而 window 是更贪婪的消费者：它不断翻新，prefix 却长期不动，于是在压力下这种临时分配会挤掉本应长期保留的部分。',
          '三种设计从不同角度解决该问题。其一，在页面离开 window 时就主动释放，而不是等淘汰压力来找它们，让失效的 window 状态不再争抢它已经用不上的页面。其二，把 compute lock 限制在单个 window 内，从而限定一个在途请求最多能钉住多少池空间。其三，清除已失去价值的陈旧 full-KV 条目。',
          '与之并列的 ROCm ring-cache 修复属于正确性而非容量问题：ring buffer 的设计本身就会复用槽位，而复用一个旧内容仍被引用的槽位，得到的是错误输出而不是变慢的输出。这些问题在单个 8k prompt 上完全看不出来——window 永远不会绕过 prefix，池也不会有竞争；但在多轮 hybrid 会话中，它们决定了昂贵的 full-attention 历史在下一轮是否还在。',
        ],
      },
      hicache: {
        heading: 'HiCache offload',
        paragraphs: [
          'HiCache 是 SGLang 内置的一流 offload 机制。它面对的 hybrid 问题与 vLLM connector 相同，但解法是一种不对称设计：offload full-attention cache，而在回载时重建较短的 sliding-window 尾部。只有昂贵的那一半值得跨总线搬运，便宜的一半重建比取回更快。在 AMD 上，分阶段写回让这种搬运不会阻塞引擎。',
          '剩下的缺口是 recurrent 状态——它无法像 window 尾部那样由相邻 token 重建。FlashInfer 的 GDN checkpoint 让它得以参与 prefix 复用，在 92.4% cache 命中率下把吞吐量从 47,771 提升到 53,004 tok/s/GPU。',
        ],
        figure: {
          alt: '示意图展示三类状态从 GPU HBM 到 CPU DRAM 的处理方式：full-attention KV 按字节 offload，sliding-window 尾部不搬运、在加载时重建，recurrent 状态则做 checkpoint。',
          caption:
            'HiCache 的不对称设计。full-attention KV 体积大且无法重建，因此跨总线搬运；window 尾部重建成本低，所以留在原地；recurrent 状态虽小却无法重建，因此以 checkpoint 形式保存。',
        },
      },
      'variable-length': {
        heading: '长度多变的流量对内核流水线意味着什么',
        paragraphs: [
          '与生产流量一样，AgentX 会话的上下文长度连续变化。如果运行时天真地按长度做特化，几乎每来一个请求就要编译一个新内核。SGLang maintainer 的解决办法是把上下文长度作为 runtime scalar 传入，从而收敛为一次编译：AgentX 并发 384 下输出吞吐量提升 26.75%，平均 TTFT 降低 36.25%——收益来自消除编译，而不是把计算做得更快。',
          '同理，移除每步一次的 device-to-host 序列长度同步，也消除了一个 decode 气泡；这个气泡的唯一成因，就是 host 想知道一个设备端早已掌握的长度。',
        ],
      },
      routing: {
        heading: 'Cache 感知的数据并行路由',
        paragraphs: [
          '当请求不带任何可复用历史（例如某个 subagent 刚启动）时，发给哪个 worker 都行，唯一值得考虑的就是负载均衡；但当它带着上兆字节的已缓存 prefix 时，把它发给一个并不持有该 prefix 的空闲 worker 就是昂贵选择，router 必须知道状态究竟在哪里。',
          'SGLang 加入了 DP cache affinity，让会话粘在持有其 cache 的 rank 上。同一批工作还实现了 DP 感知的 prefill 与 decode 路由，使 disaggregated 部署的两侧做出一致决策，并把 cache 均衡作为路由信号，避免亲和性退化成单个热点 worker。router 只能依据它被告知的信息行动，因此 hybrid cache 事件也变得 radix cache 感知与 sliding-window 感知。',
        ],
      },
      speculative: {
        heading: 'Speculative decoding',
        paragraphs: [
          'Speculative decoding 需要特别关注，因为 MTP 会引入第二份、体量更小的每请求状态，而它必须与主 cache 一样在各种情况下存活。SGLang 修复了 disaggregated 部署中的 draft window 传输，使该状态完整跨越 prefill 到 decode 的边界；为高并发在线 decode 增加了 overlap 调度；移除了一处无实际作用的 EAGLE 重归一化；并避免了 EAGLE prefill 期间的 host 同步。',
          '仍为 open 的 resource-lease 调度工作与数据并行 graph metadata 修复延续同一方向：当请求可能被撤回并恢复、而不是一路跑完时，让 overlap 依然安全。',
        ],
      },
      staging: {
        heading: '异构 disaggregation 下的 prefix 感知 staging',
        paragraphs: [
          '异构的 prefill 与 decode 拓扑需要 prefix 感知的 staging，而这正是 prefix caching 与 disaggregation 相互冲突之处。当两侧分片方式不同时，KV 无法作为一条连续流拷贝过去，必须按传输网格切分，并在 decode 侧期望的偏移处重新拼装。prefix 命中会让这件事更难而不是更容易，因为 prefill worker 此时只发送未命中的剩余部分，decode 侧却仍然期望得到一份完整、位置正确的 cache。staging buffer 中的 radix cache 支持会按该网格切分已缓存的发送内容，并散布到正确的 decode 偏移上。',
          '它修复的是一个正确性问题。一项 127,500 token 的共享 prefix 测试，从 128 根 needle 只答对 2 根变为 128 根全对，说明此前 cache 一直悄悄落在错误位置——而吞吐量基准测试只会把它记成一次又快又自信的错误回答。相应的 AgentX 对比还把单用户输出吞吐量中位数提高了 9.61%，而每 GPU 总吞吐量几乎不变。',
          '同一条线上仍有 open 的工作：UMBP 中的多池 DeepSeek-V4 支持、经由 MoRI 承载的统一 KV HiSparse 状态，以及在 decode 未产生可见内容就终止时保留 prefill 侧持有的 token。HiSparse 相关工作应被理解为长上下文的容量与正确性使能，而不是高并发下的吞吐量收益——它目前还不是。',
        ],
        figure: {
          alt: 'staging buffer 索引的前后对比：改动前未命中的剩余部分覆盖到 prefix 所在的错误行；改动后它被放到 decode 侧已持有 prefix 之后的正确偏移上。',
          caption:
            '改动前 staging 索引从 0 开始计数，忽略 decode 侧已经持有的内容，于是剩余部分覆盖了 prefix；采用 radix 感知 staging 后，已缓存的发送按传输网格切分，并散布到正确的 decode 偏移上。',
        },
      },
    },
  },
  'tensorrt-llm': {
    summary:
      '边界感知的增量 tokenization、disaggregated KV 的 descriptor 合并，以及调度器生命周期修复。',
    lead: 'TensorRT-LLM 的 AgentX 工作从前端开始——那里有一项只因负载是多轮才存在的开销——随后沿着请求路径深入到传输粒度、内核选择与调度器生命周期。',
    highlights: [
      '每轮 tokenization 平均耗时',
      '并发 5 时请求关键路径 KV 的 p99',
      'context graph 带来的单用户输出吞吐量提升',
    ],
    sections: {
      'incremental-tokenization': {
        heading: '边界感知的增量 tokenization',
        paragraphs: [
          '对话每一轮都会把完整历史再加一点新内容重新发送一遍，而朴素实现会把这些内容整体重新 tokenize。按千字节计算 tokenization 很便宜，但当同样的 100,000 个 token 每轮都被重新处理一次时，代价就变得难以承受。',
          '看上去显而易见的修法——只 tokenize 新增的后缀——却错在一个容易被忽视的地方：BPE 并非与位置无关。token 可能跨接缝合并，因此在边界处切分文本再把两段 token 序列拼接，可能得到与整体 tokenize 不同的序列，从而悄悄偏离 prefix cache 所依据的序列。',
          'TensorRT-LLM 实现了边界感知的增量 tokenization：先找到渲染文本的公共前缀，回退一个完整 token 以便重新计算任何跨接缝的合并，再从该处只对变化的后缀做 tokenize。在 Qwen3.5 的 AgentX trace 上，它在全部 1,087 次转换中都与完整 tokenize 结果一致——正确性是被验证的，而不是被假设的——平均处理时间从 185.1 ms 降到 11.3 ms。固定的 8k/1k 请求没有上一轮渲染结果可复用，因此完全体现不出这一点。',
          '相关地，chat template 渲染被移入输入处理线程池，长模板不再让主请求循环排在它后面串行等待。',
        ],
      },
      'disaggregated-kv': {
        heading: 'Disaggregated KV 搬运与 descriptor 粒度',
        paragraphs: [
          'MiniMax-M3 的工作聚焦于 disaggregated KV 搬运，那里的问题出在粒度上。当 prefill 与 decode 对 head 布局理解不一致时，一个逻辑请求的 KV 就不再是少数几块大的连续区域，而变成数千个带 stride 的小片段，每一片都会生成自己的传输 descriptor。搬运的字节数没变，爆炸的是每个 descriptor 的开销，而且恰恰在最需要关注的长 prompt 上最严重。',
          '修正后的多池映射与分块 NIXL bounce 路径把这些碎片通过一块有界可复用的 arena 合并起来，以一次额外的 staging 拷贝换取数量级更少的 descriptor。AgentX 诊断显示：并发 5 时请求关键路径 KV 的 p99 从 26.74 秒降到 125 ms，并发 40 时从 10.15 秒降到 288 ms。',
          '非阻塞的 context 传输轮询保护同一条路径：即使调度停顿，也能及时回收已完成的传输，打破"已完成的 KV block 仍被钉住、导致无法接纳新请求"的反馈回路。另有一个 draft cache 传输提案已关闭且未合入，不应算作 TensorRT-LLM 已交付的行为。',
        ],
      },
      'execution-paths': {
        heading: '面向不规则长上下文的执行路径',
        paragraphs: [
          'TensorRT-LLM 还把不规则的长上下文工作迁移到更高效的执行路径上。面向 MiniMax-M3 的 context graph producer 捕获稳定的稀疏 producer，同时让依赖请求的注意力保持 eager 执行，在其 AgentX 测试中单用户输出吞吐量提升 12.58%。另有一个仍为 open 的原生 KV 事件生成改动，减少了 KV 感知路由路径上的内存分配与格式转换开销。',
        ],
      },
      'kernel-selection': {
        heading: '内核选择与调度器生命周期',
        paragraphs: [
          'AgentX 还暴露出只有在规模和持续时间上去之后才会出现的内核选择与调度器生命周期问题。其中两个关乎"选中了哪个内核"。MiniMax-M3 为 MXFP8 autotuning 增加了 CuTeDSL 候选，扩大候选集后，在低并发聚合点上每 GPU 输出吞吐量提升约 7% 到 10%。反方向的例子是：TensorRT-LLM 在错误的 split-K MoE tactic 导致七次 AgentX 运行中有五次崩溃后禁用了它们，之后七次对照运行无一崩溃。一个又快又错的 tactic 比单纯慢的更糟，而 autotuner 只要不把它从候选池中剔除，就会兴高采烈地选中它。',
          '另外两个属于生命周期缺陷，这类问题是长时间运行（而非大规模运行）的典型失败模式。序列槽位余量与一致的按槽位索引的 buffer 尺寸，处理的是"一个请求即将完成、另一个刚被接纳、两者同时需要槽位"的短暂重叠——持续的到达与离开会不断撞上这个窗口，而固定批次永远撞不到。后续的 attention 数据并行 dummy request 修复，让九个 Qwen3.5 disaggregated 单元保持存活，而此前多数单元几分钟内就会失败：这正是"能跑完基准测试的配置"与"能撑过一次会话的配置"之间的差别。',
        ],
      },
      'pipelined-transfer': {
        heading: '面向超长 prompt 的流水线 KV 传输',
        paragraphs: [
          '两个仍为 open 的传输改动针对超长的 disaggregated prompt，它们放在一起还说明了一个修复如何制造出下一个瓶颈。在默认安排下，decode worker 必须等整段 prompt 完成 prefill 并传输完毕才能开始，于是两个昂贵阶段前后串行，尽管第一个阶段本可以增量产出。流水线 KV 传输会在每个 prefill 分块完成时就开始发送，让传输与 prefill 计算重叠，只有最后一个分块留在关键路径上。',
          '该改动使分块处理变得频繁，从而暴露出原本只做一次的工作。其后续改动改为只取当前分块所属的 block ID，而不是每次都取整段 prompt 的 block 列表。对于切成 1,024 token 分块的 128,000 token prompt，这就是"构建一次 4,096 条目的列表"与"为每个层组重建 128 次"的差别——一项随 prompt 总长增长的按分块开销，正好会吃掉流水线刚刚换来的收益。',
        ],
        figure: {
          alt: '时间线示意图：改动前四个 prefill 分块全部完成后才整体传输 prompt，decode 随后才开始；改动后每个完成的分块边传输边计算下一块，decode 更早开始。',
          caption:
            '改动前 prefill 与传输前后串行，decode 要等两者都完成；采用流水线传输后，每个完成的分块在下一块计算期间发送，只有最后一个分块位于关键路径上。',
        },
      },
    },
  },
  atom: {
    summary:
      '稀疏 checkpoint 保留、recurrent 状态 checkpoint、CPU offload 归属管理，以及长 prefill 并行。',
    lead: 'AMD 的 ATOM 引擎当初是为单轮负载设计的，而不是面向真实世界的多轮智能体生产流量，因此支持长上下文多轮负载需要对核心引擎及其内核做大量改动。相比 vLLM 与 SGLang，ATOM 在智能体负载上仍有很长的路要走，而 AgentX 正是其重构的真实北极星目标。',
    highlights: [
      '并发 48 下的 prefix 命中率',
      'sliding-window 关卡处的丢弃率',
      '采用分块 PP prefill 后的 TTFT 中位数',
    ],
    sections: {
      'sparse-checkpoints': {
        heading: '稀疏 checkpoint 保留',
        paragraphs: [
          'ATOM 为 DeepSeek-V4 的分页 sliding-window attention 实现了稀疏 checkpoint 保留，这说明该问题属于负载本身的性质，而不是某个代码库特有的。已合入的实现会保住选定的 window 尾部，使分支与回放请求能够在有意义的边界处恢复。',
          '它的测量把两种效应清楚地区分开：在同一条 AgentX trace、并发 48 的条件下，实际 prefix 命中率从 5.6% 升到 96.45%，sliding-window 关卡处的丢弃率从 91.35% 降到 0.16%。后一个数字正是前一个数字背后的机制——十次 prefix 匹配里有九次被找到后又因缺少 window 尾部而被丢弃，也就是说 cache 并不是没命中，而是命中后被否决了。',
        ],
      },
      'cache-manager': {
        heading: '必须先落地的 cache 管理器修复',
        paragraphs: [
          '在上述效果能够被测量之前，还有两个更早的 cache 管理器修复必须先合入；它们都是"cache 自报健康却什么也没做"的典型例子。其一，避免 free pool 命中破坏共享的 cache 条目；其二是一处 deferred-output 修复，它在默认调度模式下恢复了 prefix hash，使重复的长 prompt 从零缓存 token 变为可复用每一个完整的 prefix block。',
          '另有一个改动让命中 prefix 的 prefill 继续走优化过的 sink attention 内核，而不是回退到通用路径，使得一次 cache 命中不会悄悄抵消掉它节省的一部分开销。',
        ],
      },
      'recurrent-state': {
        heading: 'Recurrent 状态 checkpoint',
        paragraphs: [
          'Hybrid 模型还携带 recurrent 或 compressor 状态，它与普通 KV 有一个决定性差异：无法由周围的 token 重建。window 尾部可以由相邻上下文重算，但 recurrent 状态是此前全部内容累积的结果，一旦丢弃，唯一的办法就是重放整个序列。',
          'ATOM 为这份每请求状态引入了内容寻址的 checkpoint 生命周期，让已生成的轮次留下可复用的恢复点，而无需为它们单独预留一块受保护的 cache。在一次测试中，某个请求复用了 512 个已生成 token，只需计算两个 token 的后缀。',
          '调优细节与特性本身同样重要。无条件发布 checkpoint 会在零命中流量上损失 17.5% 吞吐量——这是所有不会再回来的会话为那些会回来的会话付出的代价。按 token 间隔发布 checkpoint 避免了这项惩罚，且固定 1k/1k 的吞吐量变化仍在测量噪声范围内；这正是关键的安全性质：一个面向智能体复用的特性，不应向永远用不到它的负载收税。',
        ],
      },
      'cpu-path': {
        heading: 'CPU offload 路径：归属与索引位置',
        paragraphs: [
          'ATOM 与 AgentX 相关的 CPU 路径，首先要看 offload 本身是否划算。独立运行的 LMCache offload 从 CPU 重新载入 32,000 token 的 prefix 约需 0.32 秒，而重算约需 2.5 秒，相差八倍。这说明在这种上下文长度下跨总线搬运是值得的，而在短 prompt 上并不成立。',
          '路径的其余部分关乎归属与索引位置，而不是带宽。ATOM 移植了 vLLM 的多 connector 设计，使 prefill worker 可以同时把 KV 发给远端 decode worker 并把同一 prefix 保存到 CPU，且在两个消费方都完成之前不释放这些 block。同一批 block 有两个独立读者，这是单轮流量永远不会出现的情形。',
          '把恢复回来的 block 重新提升进 GPU prefix 索引，修复的是一种更隐蔽的浪费：如果不这样做，从 CPU 载入的 prefix 用过之后并不会被登记为常驻，于是下一轮又要跨总线取一次同样的热点 prefix，为一份其实已在 HBM 中的 cache 反复付出传输代价。后续工作一并修复了异步保存顺序、packed KV 几何布局、非对齐交接以及远端请求记账，在两轮共 2,638 个请求的验证中消除了重载损坏。这个缺陷只有在同一批 block 被反复保存、淘汰、恢复许多次时才会显现。',
        ],
        figure: {
          alt: '流程示意图：从 CPU DRAM 恢复到 GPU block 的 prefix，要么被移出 GPU prefix 索引（导致下一轮再次取回），要么被提升进索引（下一轮直接在 HBM 命中）。',
          caption:
            '重新载入 32,000 token 的 prefix 约需 0.32 秒，而重算约需 2.5 秒。把恢复回来的 block 提升进 GPU prefix 索引，才能让下一轮不必再付一次传输开销。',
        },
      },
      routing: {
        heading: 'ATOM Mesh 中的 cache 感知路由',
        paragraphs: [
          '分布式路径在另一个代码库里重演了 SGLang 与 Dynamo 已经展示过的规律：路由必须知道状态在哪里。ATOM 的 router ATOM Mesh 是 SGLang router 的一个精简 fork，砍掉了大部分特性——其中就包括后来发现必不可少的 cache 感知路由。',
          'ATOM 因此补上了面向 cache 感知 router 的 KV 生命周期事件（router 首先要能知道状态在哪）、多节点的 prefill 与 decode 路由，以及会话粘性的数据并行路由。这套粘性策略是一个值得明说的双向折中：会话会回到持有其状态且健康的 worker，但空闲的绑定关系会过期，从而避免为早已离开的会话长期牺牲集群均衡。',
        ],
      },
      disaggregation: {
        heading: 'Disaggregation 必须搬运模型真正保留的东西',
        paragraphs: [
          'Disaggregation 必须搬运模型真正保留的状态，而它并不总是一份统一的 cache。DeepSeek-V4 会传输其 FP8 与 BF16 混合布局的两个 buffer；EAGLE disaggregation 则在目标 cache 之外一并搬运 draft 模型独立的 KV cache——这正是 TensorRT-LLM 与 SGLang 各自也必须解决的"第二份 cache"问题。',
          '远端 KV 的准入与背压机制补上了最后一环：阻止 decode 侧接受超出其安全恢复能力的挂起传输，这相当于 disaggregated 形态下的"接下自己完不成的活"。',
        ],
      },
      'long-prefill': {
        heading: '面向长 prefill 的并行',
        paragraphs: [
          '长 prefill 会用到固定 8k prompt 难以充分锻炼的并行能力，因为 8k 本身可切分的余地有限，TTFT 也已经很短。Prefill context parallelism（PCP）把 DeepSeek-V4 的 query token 切分到多张 GPU 上，报告平均首 token 时间降低 35% 到 43%，在 64,000 token 输入下总吞吐量提升最高约 49%——这种收益随输入长度增长，而不是随 batch size 增长。',
          '要在实践中可用，它还必须与会话依赖的其他机制共存，因此 decode context parallelism 被改造为兼容 prefix caching、chunked prefill 与 FP8 KV，随后又扩展到 MTP。无法与 prefix cache 共存的并行策略，只会用一种长上下文收益换掉另一种。',
          '分块流水线并行 prefill 从内存一侧解决同一问题，用流式的层级交接取代反复的张量并行集合通信。它在高负载下的 GLM-5.2 结果是本节中最完整的一组：输出吞吐量翻倍，首 token 时间中位数从 28.6 秒降到 8.7 秒，每张 prefill GPU 可容纳的 KV block 数量提升到 3.68 倍。最后这个数字应当最先看，因为每张 prefill GPU 的容量决定了在部署撞上 HBM 悬崖之前，可以同时承载多少个长会话。',
        ],
      },
    },
  },
  aiter: {
    summary: 'Context-parallel 进程组、面向大 cache 池的 64 位寻址，以及常驻式 MLA decode 内核。',
    lead: 'ATOM、AMD vLLM 与 AMD SGLang 的长上下文执行都依赖与之匹配的底层 AITER 内核，因为引擎层的并行策略只有在内核能够表达时才是真实可用的。',
    highlights: [
      '加宽行索引后可覆盖的 token 数',
      '超过 4 GB 的池所需的寻址位宽',
      '可避免静默访问错误行的行数量级',
    ],
    sections: {
      'context-parallel': {
        heading: 'Context-parallel 进程组',
        paragraphs: [
          'Prefill 的 context-parallel 进程组提供了 prefill context parallelism 所需的额外 query 分片维度，同时把融合内核的行索引加宽到可支持 131,000 token 以上的 prompt。Decode context parallelism（DCP）则把 KV 切分到已有的张量并行 GPU 上，使更长的序列或更大的 batch 无需在每个 rank 上复制整份 cache 就能容纳。',
        ],
      },
      'address-width': {
        heading: '地址位宽：短请求几乎永远碰不到的失败',
        paragraphs: [
          '大 cache 暴露出一类短固定请求基本碰不到的失败：地址位宽。在单个 cache 池跨过边界之前，32 位偏移完全够用；一旦越界，运算就会回绕，内核会访问到错误的行，而且不会抛出任何错误。',
          'AITER 为超过 4 GB 的 batch prefill 增加了运行时 64 位分发，为超过 2 GB 的场景提供 64 位 MLA 偏移，并在 DeepSeek-V4 的统一 cache 路径中全面采用 64 位寻址——最后一项避免了在约 1.5 亿行的池中静默读写到错误的行。',
        ],
        figure: {
          alt: '约 1.5 亿行的统一 KV 池的两幅对比图：使用 32 位偏移时，超过 4 GB 的访问会回绕到另一行；使用 64 位偏移时，访问到的正是目标行。',
          caption:
            '在单个 cache 池跨过 4 GB 之前，32 位偏移都够用；一旦越界，运算回绕，内核就会读写到另一行，并且不会报错。',
        },
      },
      'persistent-mla': {
        heading: '面向常见 head 打包方式的常驻 MLA decode',
        paragraphs: [
          'DeepSeek-V4 的 decode 还获得了面向 64 head 与 128 head MTP 打包方式的常驻 MLA 内核。这两种 head 数量正是普通解码与 speculative 验证实际产生的形态，因此引擎在常见形状上获得了专门的长上下文路径，而不是把它们当作某个为短上下文编写的内核的附带变体。这与前面 vLLM 选择 AITER sparse-MLA 内核的论点相同：在长上下文下，通用路径不是一种小幅妥协，而根本就是错误的内核。',
        ],
      },
    },
  },
  dynamo: {
    summary:
      '批量化 KV 匹配、以 request lease 表示归属、更廉价的 router 状态，以及更精简的请求平面。',
    lead: 'NVIDIA 提交的相当一部分结果使用 Dynamo 推理编排与 router 系统。它的 AgentX 系列工作说明：当引擎内核变快之后，分布式服务层本身可能成为瓶颈。router 的工作量正比于活跃 prefix 的数量与长度，而不是生成的 token 数，因此大量长期存在、彼此重叠的长会话对它造成的压力，是固定形状流量永远制造不出来的。',
    highlights: [
      '并发 512 下输出吞吐量中位数提升',
      '采用 request lease 后 AgentX 回放耗时下降（vLLM 后端）',
      '前端每秒请求数',
    ],
    sections: {
      'routing-cost': {
        heading: '每次路由决策的成本',
        paragraphs: [
          '第一批 PR 降低了单次路由决策的成本：减少查找热路径上的工作、去掉冗余的后缀失效操作，最后把 KV 匹配、注册、归属登记与终止解引用批量化，报告在并发 512 下输出吞吐量中位数提升 22.2%。批量化在这里奏效的原因与它在引擎中奏效的原因一样：单项开销已经压过了单项本身。',
        ],
      },
      ownership: {
        heading: '归属关系如何表示',
        paragraphs: [
          '第二批 PR 改变了归属关系的表示方式，这才是底层更难的问题。每个缓存 block 都需要归属到依赖它的请求上，才能做到"仍在使用时不释放、所有人用完后不再钉住"。当成千上万个并发会话共享彼此重叠的 prefix 时，这套记账本身的开销就变得可观。',
          'Dynamo 从共享 block 链，转向 arena 级别的归属计数，最终采用按后端划分的 request lease，每一步都把被跟踪的单位变粗。lease 设计让 vLLM 后端的 AgentX 回放耗时降低 23.71%、SGLang 降低 22.02%，同时降低了峰值内存——这说明问题出在此前的表示方式上，而不是流量本身。',
        ],
        figure: {
          alt: 'block 归属关系的前后对比：改动前每个 block 各自持有引用计数、请求指向它用到的每一个 block；改动后计数集中在一张带行号、时间戳与父行的表中，每个请求只保留一个书签。',
          caption:
            '归属表示的前后对比。计数从各个 block 中移出、集中到一张表里，请求只需保留一个书签，而不必引用它触及的每一个 block。',
        },
      },
      'router-state': {
        heading: '曾经很小的 router 状态',
        paragraphs: [
          '后续的 router profiling 又消除了一批形态相同的开销：某个周期性扫描或全量重算之所以此前可以接受，只是因为活跃状态一直很小。分桶式过期清理取代了正比于全部被跟踪对象的扫描，让高churn 的 AgentX 吞吐量提升 13.7%。仅处理增量的后缀清理只处理发生变化的部分，在同一时间窗口内多吸收约 28 倍的写入与删除事件。压缩 prompt 路径把前端 CPU 占用降低 35.3%，并显著改善尾部首 token 时间——这很重要，因为该负载的 prompt 既长又高度重复。过载状态现在也改为增量跟踪而非重新计算。',
          '有一项路由改动是有意的取舍，而非纯粹的收益：Dynamo 现在可以把进行中的 decode 请求计入路由评分，于是一个已经承担长时间 decode 的 worker，会显得比其队列深度所暗示的更"贵"。在其报告的调参点上，这改善了 AgentX 延迟中位数，代价是少量吞吐量——只有当请求会长时间占用 worker 时，这种权衡才会显现出来。',
        ],
      },
      'request-plane': {
        heading: '请求平面',
        paragraphs: [
          '接下来优化的是请求平面，因为智能体 trace 并不是"一个请求、一个响应"。它会发出大量内容高度雷同的相关请求，并把每个 token 作为独立帧流式返回，因此序列化与拷贝是按轮次、按 token 付出的，而不是只付一次。改用 MessagePack 请求负载在其 AgentX 测试中把吞吐量提高 8.1%、平均首 token 时间降低 9.7%；直接的 Python 转码则彻底去掉了该路径上的中间值树。',
          '随后是一系列"去掉一次拷贝"而非"把某步做快"的改动：不再拷贝 MessagePack 事件负载、不再拷贝收到的 ZeroMQ 帧、不再为每个 token 承担完整的 token 间延迟指标开销；chat 流式热路径也因同样理由被缩短。单看这些都平淡无奇，但乘上每个并发会话的每个流式 token，它们决定了前端每秒能承载多少请求。',
        ],
      },
      profiling: {
        heading: '与数据搬运毫无关系的开销',
        paragraphs: [
          '高并发 profiling 随后发现了一批与搬运数据毫无关系的开销。静态日志过滤器移除了一处共享的 span matcher 锁——这是竞争点问题而非流量问题——使报告中的前端吞吐量从每秒 932 个请求提升到 1,133 个。更简单的位置式 radix 分桶在 32 worker 的运行中把 mocker 的峰值内存降低了 5.51 GiB。',
          '还有一个仍为 open 的改动，把 detokenization 指标改为每个响应汇总一次，而不是在每个流式分块上更新累计计数器，在其对照诊断 profile 中把前端 CPU 时间大约减半。这是该类问题最清楚的例子：单次调用的埋点很便宜，但按每个 token 调用一次就变得难以承受。',
        ],
      },
    },
  },
  lmcache: {
    summary:
      '分块的外部 cache 加载、hybrid group 存储优化、AMD Instinct 支持，以及 DCP 感知的 offload。',
    lead: 'LMCache 是一个开源 KV cache 层，位于 vLLM 等推理引擎之下，按 prefix hash 为 key，把可复用的 KV chunk 存放在 CPU DRAM、本地 NVMe 以及 Mooncake、Redis、S3 等远端后端上。它可以作为 vLLM 原生 offload connector 的替代方案。',
    highlights: [
      '旧路径死锁前后完成的请求数对比',
      'hybrid group 每 token 存储量的下降幅度',
      'MI350X 上通过的 KV 传输内核测试',
    ],
    sections: {
      'chunked-loading': {
        heading: '分块的外部 cache 加载',
        paragraphs: [
          'LMCache 的多进程路径针对智能体场景下 cache 搬运的规模与形态做了修改，起点是一种不是"变慢"而是"卡死"的失败：当大量上下文超过 100,000 token 的请求各自在开始前就为整次加载预留 block 时，池会被一群全都在等待、没有一个在推进的请求耗尽。',
          '分块的外部 cache 加载改为按分块预留，于是各次加载可以交错进行并逐步排空。在并发 32 的验证中，旧路径在第 28 个请求处死锁，新路径完成了 120 个请求；并发 48 时即使 KV 池已占用 98.5%，运行依然继续。',
        ],
        figure: {
          alt: '示意图：多个 vLLM 实例之上共享一个 LMCache 层，包含 CPU DRAM、经 GDS 访问的本地 NVMe 以及远端存储层，后到的请求可以在另一个实例上读到先前写入的内容。',
          caption:
            'LMCache 作为按 hash 寻址的 KV 层位于所有实例之下，横跨 CPU DRAM、本地 NVMe 与远端存储，因此后到的请求即使落在另一个实例上，也能读到先前写入的内容。',
        },
      },
      'moving-less': {
        heading: '搬得更少，也更少挡路',
        paragraphs: [
          '其余改动的目标是减少搬运量以及运行时的干扰。只存储 DeepSeek-V4 hybrid group 中真正有用的部分，把每 token 的存储量降低了近二十倍；sliding-window 预取现在只加载仍然有效的 window，而不是那些永远不会被读取的 window 状态——这与 vLLM 在 offload 上采用的可达性论证相同，只是从存储一侧切入。',
          '随后，按对象组只做一次原生传输调用，消除了 staging 拷贝与内核启动之间反复的 Python 锁交接；这类开销正比于片段数量，而不是其中的字节数。',
        ],
      },
      'lock-accounting': {
        heading: 'Open：hybrid 锁记账',
        paragraphs: [
          '当前有两个 LMCache 改动与 AgentX 特别相关，但都仍为 open。hybrid 锁记账修复防止一个请求释放掉另一个请求在共享 sliding-window 或 recurrent 状态 chunk 上的读锁。要复现它需要三个条件同时成立：多个请求共享同一批 chunk、记账按持有者而非按 chunk 进行、并且淘汰确实开始发生。',
          '开启 DRAM offload 的长时间 Kimi-K3 运行同时满足了这三点，产生了数万条告警、损坏的生成结果，并在淘汰开始后最终导致 GPU 崩溃。只要不是长时间、共享且内存吃紧的运行，这个缺陷就一直潜伏。',
        ],
      },
      'amd-enablement': {
        heading: 'AMD Instinct 支持',
        paragraphs: [
          '另一条并行的工作线让上述能力在 AMD Instinct 硬件上真正可用。CacheBlend 的非 prefix 复用依赖仅支持 CUDA 的 FlashInfer，因此一个 Triton block-sparse 注意力后端重新实现了它需要的三个内核：带 CSR 索引并输出 log-sum-exp 的 block-sparse attention、causal prefill，以及基于 log-sum-exp 的输出融合；在检测到 ROCm 或缺少 FlashInfer 时会自动切换到这些实现。ROCm Dockerfile 则对齐了 CUDA 的构建与轻量镜像。一个 AMD hipFile 后端扩展了此前只能通过 NVIDIA cuFile 访问存储的 GDS L1 slab 文件层：它通过 ctypes 绑定 ROCm 的 hipFile，并按 torch.version.hip 分发，cuFile 路径保持不变。',
          '最后的缺口是分发方式。CUDA 用户安装预编译 wheel，AMD 用户却要从源码构建。我们与 AMD 一起发布了预编译的 gfx942 与 gfx950 wheel 来补上这一环：它可以装入上游镜像，并在 MI350X 上通过全部 56 项 KV 传输内核测试；它发布到 GitHub release 而非 PyPI，因此直接执行 pip install lmcache 仍会安装 CUDA 版本。一个单行的后续修复把 bind mount 进来的仓库标记为 git safe directory——这个问题只在 CI 中出现，因为容器以 root 身份运行在 runner 所有的检出目录上，setup.py 中的版本探测会拒绝读取它。',
        ],
      },
      'dcp-offload': {
        heading: 'DCP 感知的 CPU offload',
        paragraphs: [
          'DCP 感知的 CPU offload 解决了两个在长上下文下必须同时启用的特性之间的直接冲突。启用 decode context parallelism 后，每个 rank 只持有 KV 的一个 stride，因此单个 rank 能保存的内容并不构成可用的 prefix。修复方案在保存前汇集这些带 stride 的分片，并在加载后重新分发。如果不这样做，启用 context parallelism 就会悄悄让 CPU cache 命中失效，而失效的恰恰是催生这两个特性的长 prefix。其验证记录了超过 30,000 次 CPU 命中事件，单个请求的加载量可达数十万 token。',
        ],
      },
    },
  },
  mooncake: {
    summary:
      '通过 HIP dmabuf 在 ROCm 上实现 GPU-direct RDMA，并提供已发布的 ROCm wheel 与发版流程。',
    lead: 'Mooncake 承载着 Moonshot 的 Kimi 生产流量以及多家实验室的生产流量，同时也是 disaggregated vLLM 与 SGLang 配置底层的传输引擎。直到最近，它在 AMD 上的支持既缺少 RDMA 注册，也缺少可直接安装的软件包。',
    highlights: [
      'ROCm 上的 GPU-direct RDMA 路径',
      '同一个架构无关 wheel 覆盖的目标',
      '按 tag 触发的发布矩阵',
    ],
    sections: {
      'rdma-registration': {
        heading: 'ROCm 上的 GPU-direct RDMA 注册',
        paragraphs: [
          '在 NVIDIA 上，为 RDMA 注册 GPU 显存要么使用 nvidia-peermem 内核模块，要么导出 dmabuf 文件描述符。AMD 没有 nvidia-peermem 的对应物，因此 GPU-direct RDMA 完全没有可走的路径，部署只能退回到通过主机 DRAM 中转 KV。',
          '一个 HIP dmabuf 注册分支补上了与现有 CUDA dmabuf 路径对应的实现：改用 ROCm 导出，而不是调用 CUDA 的 handle 接口，并且会先解析出真实的分配基址，因为带缓存的分配器会把张量打包在一块更大分配内部的某个偏移处。主机内存仍然直接注册。',
        ],
      },
      packaging: {
        heading: '装不上的支持不算支持',
        paragraphs: [
          'Mooncake 发布了 CUDA 与 MUSA 的 wheel，却没有 ROCm 包，因此 AMD 用户只能在每个镜像里从源码构建引擎。ROCm wheel、CI 与发版流程把 mooncake-transfer-engine-rocm 一并发布到 PyPI。这条工作线来自 AMD 工程师 Andy Luo，他在用 AgentX 自测（dogfooding）智能体负载时注意到：在 ROCm 上从源码构建 Mooncake 并不是一流的使用体验。',
          '该传输引擎没有设备端内核，也不依赖 torch，因此一个架构无关的 wheel 即可覆盖 gfx942 与 gfx950；ROCm 运行时在加载时绑定而非随包分发，这意味着同一个 wheel 在上游 vLLM ROCm 镜像与 SGLang ROCm 镜像中都可直接使用。验证覆盖了完整的交叉组合：MI300X 与 MI355X，各自在 vllm/vllm-openai-rocm 与 lmsysorg/sglang 下运行 master 二进制及带数据校验的 HIP buffer 传输测试。该 PR 还增加了按 tag 触发、覆盖 Python 3.10 到 3.13 的发布流程。',
          '一个仍为 open 的后续改动增加了自托管的双节点 MI350X 外部 prefill 与 decode 环境，让 ROCm 的 disaggregated 路径在真实硬件上被实际执行，而不只是通过编译。综合这些工作，AMD 上的 AgentX 运行现在可以直接从已发布产物把传输引擎与 KV cache 层装进标准上游镜像，并在 GPU 显存与网络之间直接搬运 KV。',
        ],
        links: ['PyPI 上的 mooncake-transfer-engine'],
      },
    },
  },
};

function localizeSection(
  section: OptimizationSection,
  zh: SectionTranslation,
): OptimizationSection {
  return {
    ...section,
    heading: zh.heading,
    paragraphs: zh.paragraphs,
    figure: section.figure && zh.figure ? { ...section.figure, ...zh.figure } : section.figure,
    links: section.links?.map((link, index) => ({
      ...link,
      label: zh.links?.[index] ?? link.label,
    })),
  };
}

/** The overview content for a locale, with English structure and localized prose. */
export function getOptimizationsOverview(locale: Locale): OptimizationsOverview {
  if (locale === 'en') return OPTIMIZATIONS_OVERVIEW;
  return {
    ...OPTIMIZATIONS_OVERVIEW,
    eyebrow: OVERVIEW_ZH.eyebrow,
    title: OVERVIEW_ZH.title,
    lead: OVERVIEW_ZH.lead,
    intro: OVERVIEW_ZH.intro,
    highlights: OPTIMIZATIONS_OVERVIEW.highlights.map((highlight, index) => ({
      ...highlight,
      label: OVERVIEW_ZH.highlights[index] ?? highlight.label,
    })),
    frameworksTitle: OVERVIEW_ZH.frameworksTitle,
    frameworksIntro: OVERVIEW_ZH.frameworksIntro,
    sections: OPTIMIZATIONS_OVERVIEW.sections.map((section) => {
      const zh = OVERVIEW_ZH.sections[section.id];
      return zh ? localizeSection(section, zh) : section;
    }),
    layerLabels: OVERVIEW_ZH.layerLabels,
    ui: OVERVIEW_ZH.ui,
  };
}

/** One framework's content for a locale. */
export function getLocalizedFramework(
  framework: OptimizationFramework,
  locale: Locale,
): OptimizationFramework {
  if (locale === 'en') return framework;
  const zh = FRAMEWORKS_ZH[framework.slug];
  if (!zh) return framework;
  return {
    ...framework,
    summary: zh.summary,
    lead: zh.lead,
    highlights: framework.highlights.map((highlight, index) => ({
      ...highlight,
      label: zh.highlights[index] ?? highlight.label,
    })),
    sections: framework.sections.map((section) => {
      const sectionZh = zh.sections[section.id];
      return sectionZh ? localizeSection(section, sectionZh) : section;
    }),
  };
}

/** Every framework for a locale, in registry order. */
export function getLocalizedFrameworks(locale: Locale): readonly OptimizationFramework[] {
  return AGENTX_OPTIMIZATION_FRAMEWORKS.map((framework) =>
    getLocalizedFramework(framework, locale),
  );
}

/** Exported for the parity test, which walks the same keys the resolvers read. */
export const OPTIMIZATIONS_ZH_INTERNALS = { OVERVIEW_ZH, FRAMEWORKS_ZH };
